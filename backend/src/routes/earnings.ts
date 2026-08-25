import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { pool } from "../db/pool.js";

/**
 * @openapi
 * /earnings/workers/me/earnings:
 *   get:
 *     summary: Get worker earnings ledger
 *     tags: [Earnings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *       - name: entryType
 *         in: query
 *         schema: { type: string, enum: [earning, adjustment, payout, refund] }
 *     responses:
 *       200: { description: Earnings ledger with summary }
 * /earnings/workers/me/earnings/summary:
 *   get:
 *     summary: Get earnings summary (week/month/year)
 *     tags: [Earnings]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Earnings summary }
 * /earnings/workers/me/earnings/ledger:
 *   get:
 *     summary: Get full earnings ledger
 *     tags: [Earnings]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Full earnings ledger }
 * /earnings/workers/me/payouts:
 *   get:
 *     summary: Get payout history
 *     tags: [Earnings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Payout history }
 * /earnings/workers/me/payout-account:
 *   put:
 *     summary: Update payout account
 *     tags: [Earnings]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [provider, accountReference], properties: { provider: { type: string }, accountReference: { type: string } } }
 *     responses:
 *       200: { description: Payout account updated }
 *   get:
 *     summary: Get payout account
 *     tags: [Earnings]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Payout account details }
 */

export const earningsRouter = Router();

earningsRouter.get("/workers/me/earnings", requireAuth, async (req, res, next) => {
  try {
    if (req.user!.role !== "worker") { res.status(403).json({ error: "Only workers can access earnings" }); return; }

    const worker = await pool.query(`select id from workers where user_id = $1`, [req.user!.id]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker profile not found" }); return; }

    const page = Math.max(parseInt(String(req.query.page ?? 1)), 1);
    const limit = Math.min(parseInt(String(req.query.limit ?? 50)), 100);
    const offset = (page - 1) * limit;

    const entryType = req.query.entryType as string | undefined;
    const conditions = [`worker_id = $1`];
    const values: unknown[] = [worker.rows[0].id];
    let index = 2;

    if (entryType) { conditions.push(`entry_type = $${index++}`); values.push(entryType); }

    const whereClause = conditions.join(" and ");

    const [ledger, summary] = await Promise.all([
      pool.query(`select * from worker_earnings_ledger where ${whereClause} order by created_at desc limit $${index++} offset $${index}`, [...values, limit, offset]),
      pool.query(`select sum(case when entry_type = 'earning' then amount else 0 end) as total_earnings,
                         sum(case when entry_type = 'payout' then amount else 0 end) as total_payouts,
                         sum(case when entry_type = 'adjustment' then amount else 0 end) as total_adjustments,
                         sum(case when entry_type = 'refund' then amount else 0 end) as total_refunds
                  from worker_earnings_ledger where ${whereClause}`, [...values]),
    ]);

    res.json({
      ledger: ledger.rows,
      summary: summary.rows[0],
      page,
      limit,
    });
  } catch (error) { next(error); }
});

earningsRouter.get("/workers/me/earnings/summary", requireAuth, async (req, res, next) => {
  try {
    if (req.user!.role !== "worker") { res.status(403).json({ error: "Only workers can access earnings" }); return; }

    const worker = await pool.query(`select id from workers where user_id = $1`, [req.user!.id]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker profile not found" }); return; }

    const [thisWeek, thisMonth, thisYear, allTime] = await Promise.all([
      pool.query(`select sum(case when entry_type = 'earning' then amount else 0 end) as earnings,
                         sum(case when entry_type = 'payout' then amount else 0 end) as payouts
                  from worker_earnings_ledger where worker_id = $1 and created_at >= now() - interval '7 days'`, [worker.rows[0].id]),
      pool.query(`select sum(case when entry_type = 'earning' then amount else 0 end) as earnings,
                         sum(case when entry_type = 'payout' then amount else 0 end) as payouts
                  from worker_earnings_ledger where worker_id = $1 and created_at >= now() - interval '30 days'`, [worker.rows[0].id]),
      pool.query(`select sum(case when entry_type = 'earning' then amount else 0 end) as earnings,
                         sum(case when entry_type = 'payout' then amount else 0 end) as payouts
                  from worker_earnings_ledger where worker_id = $1 and created_at >= now() - interval '365 days'`, [worker.rows[0].id]),
      pool.query(`select sum(case when entry_type = 'earning' then amount else 0 end) as earnings,
                         sum(case when entry_type = 'payout' then amount else 0 end) as payouts
                  from worker_earnings_ledger where worker_id = $1`, [worker.rows[0].id]),
    ]);

    res.json({
      thisWeek: thisWeek.rows[0],
      thisMonth: thisMonth.rows[0],
      thisYear: thisYear.rows[0],
      allTime: allTime.rows[0],
    });
  } catch (error) { next(error); }
});

earningsRouter.get("/workers/me/earnings/ledger", requireAuth, async (req, res, next) => {
  try {
    if (req.user!.role !== "worker") { res.status(403).json({ error: "Only workers can access earnings" }); return; }

    const worker = await pool.query(`select id from workers where user_id = $1`, [req.user!.id]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker profile not found" }); return; }

    const result = await pool.query(`select * from worker_earnings_ledger where worker_id = $1 order by created_at asc`, [worker.rows[0].id]);
    res.json({ ledger: result.rows });
  } catch (error) { next(error); }
});

earningsRouter.get("/workers/me/payouts", requireAuth, async (req, res, next) => {
  try {
    if (req.user!.role !== "worker") { res.status(403).json({ error: "Only workers can access payouts" }); return; }

    const worker = await pool.query(`select id from workers where user_id = $1`, [req.user!.id]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker profile not found" }); return; }

    const page = Math.max(parseInt(String(req.query.page ?? 1)), 1);
    const limit = Math.min(parseInt(String(req.query.limit ?? 20)), 100);
    const offset = (page - 1) * limit;

    const result = await pool.query(`select * from worker_earnings_ledger where worker_id = $1 and entry_type = 'payout' order by created_at desc limit $2 offset $3`, [worker.rows[0].id, limit, offset]);
    res.json({ payouts: result.rows, page, limit });
  } catch (error) { next(error); }
});

earningsRouter.put("/workers/me/payout-account", requireAuth, async (req, res, next) => {
  try {
    if (req.user!.role !== "worker") { res.status(403).json({ error: "Only workers can update payout account" }); return; }

    const input = z.object({
      provider: z.string().trim().min(2).max(50),
      accountReference: z.string().trim().min(4).max(200),
    }).parse(req.body);

    const worker = await pool.query(`select id from workers where user_id = $1`, [req.user!.id]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker profile not found" }); return; }

    await pool.query(
      `insert into payout_accounts (worker_id, provider, account_reference) values ($1, $2, $3)
       on conflict (worker_id) do update set provider = $2, account_reference = $3, verified_at = null`,
      [worker.rows[0].id, input.provider, input.accountReference]
    );

    res.json({ message: "Payout account updated" });
  } catch (error) { next(error); }
});

earningsRouter.get("/workers/me/payout-account", requireAuth, async (req, res, next) => {
  try {
    if (req.user!.role !== "worker") { res.status(403).json({ error: "Only workers can access payout account" }); return; }

    const worker = await pool.query(`select id from workers where user_id = $1`, [req.user!.id]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker profile not found" }); return; }

    const result = await pool.query(`select provider, account_reference, verified_at from payout_accounts where worker_id = $1`, [worker.rows[0].id]);
    if (!result.rows[0]) { res.json({ payoutAccount: null }); return; }

    res.json({ payoutAccount: result.rows[0] });
  } catch (error) { next(error); }
});