import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import {
  generateSettlements,
  executePayout,
  previousMonthPeriod,
} from "../services/settlementService.js";

/**
 * Cooperative settlement batches.
 *
 * Previously this router could only ever return an empty list: no code path
 * anywhere inserted into `settlements`, so `POST /:id/process` had nothing to
 * process and the blueprint's `/generate` and `/:id/payout` did not exist.
 *
 * The old `/:id/process` also recomputed the revenue split from
 * `services.base_price` and posted a second `worker_earnings_ledger` row per
 * booking, double-crediting every worker in the batch. Batches now aggregate
 * the invoices `revenueSplit.settleBooking` already issued.
 */

export const settlementsRouter = Router();

settlementsRouter.param("id", rejectNonUuidParam);

const ADMIN_ROLES = ["system_admin", "federation_admin", "society_admin"] as const;

const generateSchema = z.object({
  periodStart: z.string().date().optional(),
  periodEnd: z.string().date().optional(),
  cooperativeId: z.string().uuid().optional(),
});

const payoutSchema = z.object({
  method: z.enum(["bank_transfer", "upi", "neft", "imps", "manual"]),
  reference: z.string().trim().min(3).max(120),
  notes: z.string().trim().max(1000).optional(),
});

async function canAccessFederation(userId: string, cooperativeId: string): Promise<boolean> {
  const result = await pool.query(
    `select 1 from admin_scopes s join cooperatives c on c.id = s.cooperative_id
      where s.user_id = $1 and c.id = $2 and s.federation_id = c.federation_id`,
    [userId, cooperativeId]
  );
  return Boolean(result.rows[0]);
}

async function canAccessCooperative(userId: string, cooperativeId: string): Promise<boolean> {
  const result = await pool.query(
    "select 1 from admin_scopes where user_id = $1 and cooperative_id = $2",
    [userId, cooperativeId]
  );
  return Boolean(result.rows[0]);
}

/** A society admin may only act on their own society; federation admins on theirs. */
async function canAdminister(userId: string, role: string, cooperativeId: string): Promise<boolean> {
  if (role === "system_admin") return true;
  if (role === "federation_admin") return canAccessFederation(userId, cooperativeId);
  if (role === "society_admin") return canAccessCooperative(userId, cooperativeId);
  return false;
}

/**
 * @openapi
 * /settlements:
 *   get:
 *     summary: List cooperative settlement batches
 *     tags: [Settlements]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [draft, processing, completed, paid, failed] }
 *     responses:
 *       200: { description: List of settlements }
 */
settlementsRouter.get("/", requireAuth, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (req.user!.role === "society_admin") {
      const scope = await pool.query("select cooperative_id from admin_scopes where user_id = $1", [req.user!.id]);
      // A society admin with no scope row must see nothing, not everything.
      conditions.push(`s.cooperative_id = $${index++}`);
      values.push(scope.rows[0]?.cooperative_id ?? null);
    } else if (req.user!.role === "federation_admin") {
      const scope = await pool.query("select federation_id from admin_scopes where user_id = $1", [req.user!.id]);
      conditions.push(`c.federation_id = $${index++}`);
      values.push(scope.rows[0]?.federation_id ?? null);
    }

    if (typeof req.query.status === "string") {
      conditions.push(`s.status = $${index++}`);
      values.push(req.query.status);
    }

    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const result = await pool.query(
      `select s.*, c.name as cooperative_name
         from settlements s
         join cooperatives c on c.id = s.cooperative_id
         ${where}
        order by s.period_start desc, c.name`,
      values
    );

    res.json({ settlements: result.rows });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /settlements/generate:
 *   post:
 *     summary: Aggregate paid bookings into settlement batches
 *     description: >
 *       Defaults to the previous calendar month. Idempotent — an invoice already
 *       attached to a batch is never claimed again, so re-running only picks up
 *       new activity. Also runs every six hours as the `settlement.generate` job.
 *     tags: [Settlements]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               periodStart: { type: string, format: date }
 *               periodEnd: { type: string, format: date }
 *               cooperativeId: { type: string, format: uuid }
 *     responses:
 *       201: { description: Batches generated }
 *       403: { description: Not permitted for that cooperative }
 */
settlementsRouter.post("/generate", requireAuth, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const input = generateSchema.parse(req.body ?? {});

    const period =
      input.periodStart && input.periodEnd
        ? { periodStart: input.periodStart, periodEnd: input.periodEnd }
        : previousMonthPeriod();

    if (period.periodStart > period.periodEnd) {
      res.status(400).json({ error: "INVALID_PERIOD", message: "periodStart must not be after periodEnd" });
      return;
    }

    // A society admin can only generate for their own cooperative; scope the
    // request to it rather than letting an unscoped call sweep every society.
    let cooperativeId = input.cooperativeId;
    if (req.user!.role === "society_admin") {
      const scope = await pool.query("select cooperative_id from admin_scopes where user_id = $1", [req.user!.id]);
      const scoped = scope.rows[0]?.cooperative_id;
      if (!scoped) { res.status(403).json({ error: "NO_ADMIN_SCOPE" }); return; }
      if (cooperativeId && cooperativeId !== scoped) { res.status(403).json({ error: "OUT_OF_SCOPE" }); return; }
      cooperativeId = scoped;
    } else if (cooperativeId && !(await canAdminister(req.user!.id, req.user!.role, cooperativeId))) {
      res.status(403).json({ error: "OUT_OF_SCOPE" });
      return;
    }

    const settlements = await generateSettlements(period, { cooperativeId, actorId: req.user!.id });

    void recordAuditEvent({
      actorId: req.user!.id,
      action: "settlement.generated",
      resourceType: "settlement",
      requestId: req.header("x-request-id") ?? undefined,
      metadata: { period, batches: settlements.length, cooperativeId: cooperativeId ?? "all" },
    }).catch(() => undefined);

    res.status(201).json({ period, settlements });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /settlements/{id}/process:
 *   post:
 *     summary: Close a draft batch (draft -> completed)
 *     tags: [Settlements]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Settlement closed }
 *       409: { description: Not in draft state }
 */
settlementsRouter.post("/:id/process", requireAuth, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const settlementId = String(req.params.id);
    const client = await pool.connect();

    try {
      await client.query("begin");

      const found = await client.query("select * from settlements where id = $1 for update", [settlementId]);
      if (!found.rows[0]) {
        await client.query("rollback");
        res.status(404).json({ error: "Settlement not found" });
        return;
      }
      const settlement = found.rows[0];

      if (settlement.status !== "draft") {
        await client.query("rollback");
        res.status(409).json({ error: "ALREADY_PROCESSED", message: `Settlement is '${settlement.status}'` });
        return;
      }

      if (!(await canAdminister(req.user!.id, req.user!.role, settlement.cooperative_id))) {
        await client.query("rollback");
        res.status(403).json({ error: "Cannot process this settlement" });
        return;
      }

      // Re-derive the header totals from the line items so the closed figures
      // always match settlement_bookings, whatever was claimed since generation.
      const totals = await client.query(
        `select count(*)::int                       as total_bookings,
                coalesce(sum(gross_amount), 0)      as total_revenue,
                coalesce(sum(platform_fee), 0)      as platform_fee,
                coalesce(sum(cooperative_share), 0) as cooperative_share,
                coalesce(sum(worker_share), 0)      as worker_share,
                coalesce(sum(welfare_fund), 0)      as welfare_fund,
                coalesce(sum(tax), 0)               as tax
           from settlement_bookings where settlement_id = $1`,
        [settlementId]
      );
      const t = totals.rows[0];

      const updated = await client.query(
        `update settlements
            set total_bookings = $1, total_revenue = $2, platform_fee = $3,
                cooperative_share = $4, worker_share = $5, welfare_fund = $6, tax = $7,
                status = 'completed', processed_at = now(), updated_at = now()
          where id = $8
        returning *`,
        [t.total_bookings, t.total_revenue, t.platform_fee, t.cooperative_share, t.worker_share, t.welfare_fund, t.tax, settlementId]
      );

      await client.query("commit");

      void recordAuditEvent({
        actorId: req.user!.id,
        action: "settlement.processed",
        resourceType: "settlement",
        resourceId: settlementId,
        requestId: req.header("x-request-id") ?? undefined,
      }).catch(() => undefined);

      res.json({ message: "Settlement processed", settlement: updated.rows[0] });
    } catch (error) {
      await client.query("rollback");
      await pool
        .query("update settlements set status = 'failed', updated_at = now() where id = $1", [settlementId])
        .catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /settlements/{id}/payout:
 *   post:
 *     summary: Record the payout transfer to the cooperative escrow
 *     tags: [Settlements]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [method, reference]
 *             properties:
 *               method: { type: string, enum: [bank_transfer, upi, neft, imps, manual] }
 *               reference: { type: string }
 *               notes: { type: string }
 *     responses:
 *       200: { description: Payout recorded }
 *       409: { description: Batch is not in 'completed' state, or already paid }
 */
settlementsRouter.post("/:id/payout", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const settlementId = String(req.params.id);
    const input = payoutSchema.parse(req.body);

    const found = await pool.query("select cooperative_id from settlements where id = $1", [settlementId]);
    if (!found.rows[0]) { res.status(404).json({ error: "Settlement not found" }); return; }

    if (!(await canAdminister(req.user!.id, req.user!.role, found.rows[0].cooperative_id))) {
      res.status(403).json({ error: "Cannot pay out this settlement" });
      return;
    }

    const result = await executePayout({
      settlementId,
      method: input.method,
      reference: input.reference,
      notes: input.notes,
      actorId: req.user!.id,
    });

    if (!result.ok) {
      res.status(result.error === "NOT_FOUND" ? 404 : 409).json({ error: result.error, message: result.message });
      return;
    }

    void recordAuditEvent({
      actorId: req.user!.id,
      action: "settlement.paid",
      resourceType: "settlement",
      resourceId: settlementId,
      requestId: req.header("x-request-id") ?? undefined,
      metadata: { method: input.method, reference: input.reference, amount: result.amount },
    }).catch(() => undefined);

    res.json({ message: "Settlement paid out", settlementId, amount: result.amount });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /settlements/{id}:
 *   get:
 *     summary: Get a settlement with its line items
 *     tags: [Settlements]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Settlement details }
 *       404: { description: Not found }
 */
settlementsRouter.get("/:id", requireAuth, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const settlementId = String(req.params.id);

    const result = await pool.query(
      `select s.*, c.name as cooperative_name
         from settlements s
         join cooperatives c on c.id = s.cooperative_id
        where s.id = $1`,
      [settlementId]
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Settlement not found" }); return; }

    if (!(await canAdminister(req.user!.id, req.user!.role, result.rows[0].cooperative_id))) {
      res.status(403).json({ error: "Cannot view this settlement" });
      return;
    }

    const items = await pool.query(
      `select sb.*, b.created_at as booking_created_at, u.name as customer_name,
              wu.name as worker_name, srv.name as service_name
         from settlement_bookings sb
         join bookings b on b.id = sb.booking_id
         join users u on u.id = b.customer_id
         join services srv on srv.id = b.service_id
         left join workers w on w.id = b.worker_id
         left join users wu on wu.id = w.user_id
        where sb.settlement_id = $1
        order by b.created_at`,
      [settlementId]
    );

    res.json({ settlement: result.rows[0], bookings: items.rows });
  } catch (error) { next(error); }
});
