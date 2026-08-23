import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import PDFDocument from "pdfkit";
import { PassThrough } from "node:stream";

/**
 * @openapi
 * /settlements:
 *   get:
 *     summary: List settlements
 *     tags: [Settlements]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of settlements }
 * /settlements/{id}/process:
 *   post:
 *     summary: Process settlement (admin)
 *     tags: [Settlements]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Settlement processed }
 *       404: { description: Not found }
 *       409: { description: Already processed }
 * /settlements/{id}:
 *   get:
 *     summary: Get settlement details
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

export const settlementsRouter = Router();

settlementsRouter.get("/", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    let query = `select s.*, c.name as cooperative_name from settlements s join cooperatives c on c.id = s.cooperative_id`;
    const values: unknown[] = [];
    let index = 1;

    if (req.user!.role === "society_admin") {
      const scope = await pool.query(`select cooperative_id from admin_scopes where user_id = $1`, [req.user!.id]);
      if (scope.rows[0]) { query += ` where s.cooperative_id = $${index++}`; values.push(scope.rows[0].cooperative_id); }
    } else if (req.user!.role === "federation_admin") {
      const scope = await pool.query(`select federation_id from admin_scopes where user_id = $1`, [req.user!.id]);
      if (scope.rows[0]) { query += ` where c.federation_id = $${index++}`; values.push(scope.rows[0].federation_id); }
    }

    query += ` order by s.period_start desc`;
    const result = await pool.query(query, values);
    res.json({ settlements: result.rows });
  } catch (error) { next(error); }
});

settlementsRouter.post("/:id/process", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const settlementId = String(req.params.id);
    const result = await pool.query(`select * from settlements where id = $1 for update`, [settlementId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Settlement not found" }); return; }
    const settlement = result.rows[0];

    if (settlement.status !== "draft") { res.status(409).json({ error: "Settlement already processed" }); return; }

    const canProcess = req.user!.role === "system_admin" ||
      (req.user!.role === "federation_admin" && await canAccessFederation(req.user!.id, settlement.cooperative_id)) ||
      (req.user!.role === "society_admin" && await canAccessCooperative(req.user!.id, settlement.cooperative_id));
    if (!canProcess) { res.status(403).json({ error: "Cannot process this settlement" }); return; }

    await pool.query(`update settlements set status = 'processing', updated_at = now() where id = $1`, [settlementId]);

    const client = await pool.connect();
    try {
      await client.query("begin");

      const bookings = await client.query(
        `select b.id, b.worker_id, b.service_id, s.base_price, w.cooperative_id, c.commission_rate
         from bookings b
         join services s on s.id = b.service_id
         join workers w on w.id = b.worker_id
         join cooperatives c on c.id = w.cooperative_id
         where w.cooperative_id = $1
         and b.status = 'completed'
         and b.created_at::date between $2 and $3`,
        [settlement.cooperative_id, settlement.period_start, settlement.period_end]
      );

      let totalRevenue = 0;
      let totalPlatformFee = 0;
      let totalCooperativeShare = 0;
      let totalWorkerShare = 0;

      for (const booking of bookings.rows) {
        const basePrice = Number(booking.base_price);
        totalRevenue += basePrice;
        const platformFee = basePrice * 0.05;
        const commissionRate = Number(booking.commission_rate ?? 10) / 100;
        const cooperativeShare = basePrice * commissionRate;
        const workerShare = basePrice - platformFee - cooperativeShare;

        totalPlatformFee += platformFee;
        totalCooperativeShare += cooperativeShare;
        totalWorkerShare += workerShare;

        await client.query(
          `insert into worker_earnings_ledger (id, worker_id, booking_id, entry_type, amount, reference)
           values ($1, $2, $3, 'earning', $4, 'settlement_processed')`,
          [crypto.randomUUID(), booking.worker_id, booking.id, workerShare]
        );
      }

      const tax = totalRevenue * 0.18;

      await client.query(
        `update settlements
         set total_bookings = $1, total_revenue = $2, platform_fee = $3, cooperative_share = $4, worker_share = $5, tax = $6,
             status = 'completed', processed_at = now(), updated_at = now()
         where id = $7`,
        [bookings.rows.length, totalRevenue, totalPlatformFee, totalCooperativeShare, totalWorkerShare, tax, settlementId]
      );

      await client.query("commit");

      await recordAuditEvent({ actorId: req.user!.id, action: "settlement.processed", resourceType: "settlement", resourceId: settlementId, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
      res.json({ message: "Settlement processed" });
    } catch (error) {
      await client.query("rollback");
      await pool.query(`update settlements set status = 'failed', updated_at = now() where id = $1`, [settlementId]);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) { next(error); }
});

settlementsRouter.get("/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const settlementId = String(req.params.id);
    const result = await pool.query(`select s.*, c.name as cooperative_name from settlements s join cooperatives c on c.id = s.cooperative_id where s.id = $1`, [settlementId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Settlement not found" }); return; }
    res.json({ settlement: result.rows[0] });
  } catch (error) { next(error); }
});

async function canAccessFederation(userId: string, cooperativeId: string): Promise<boolean> {
  const result = await pool.query(`select 1 from admin_scopes s join cooperatives c on c.id = s.cooperative_id where s.user_id = $1 and c.id = $2 and s.federation_id = c.federation_id`, [userId, cooperativeId]);
  return Boolean(result.rows[0]);
}

async function canAccessCooperative(userId: string, cooperativeId: string): Promise<boolean> {
  const result = await pool.query(`select 1 from admin_scopes where user_id = $1 and cooperative_id = $2`, [userId, cooperativeId]);
  return Boolean(result.rows[0]);
}

import crypto from "node:crypto";