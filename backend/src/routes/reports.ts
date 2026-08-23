import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";

/**
 * @openapi
 * /reports/bookings:
 *   get:
 *     summary: Get bookings report
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: fromDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: toDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: serviceId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: cooperativeId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: status
 *         in: query
 *         schema: { type: string }
 *       - name: page
 *         in: query
 *         schema: { type: integer }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Bookings report }
 * /reports/workers:
 *   get:
 *     summary: Get workers report
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: fromDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: toDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: serviceId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: cooperativeId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: status
 *         in: query
 *         schema: { type: string }
 *       - name: page
 *         in: query
 *         schema: { type: integer }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Workers report }
 * /reports/earnings:
 *   get:
 *     summary: Get earnings report
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: fromDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: toDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: serviceId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: cooperativeId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: status
 *         in: query
 *         schema: { type: string }
 *       - name: page
 *         in: query
 *         schema: { type: integer }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Earnings report }
 * /reports/payments:
 *   get:
 *     summary: Get payments report
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: fromDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: toDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: serviceId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: cooperativeId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: status
 *         in: query
 *         schema: { type: string }
 *       - name: page
 *         in: query
 *         schema: { type: integer }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Payments report }
 * /reports/welfare:
 *   get:
 *     summary: Get welfare report
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Welfare report }
 * /reports/cooperative-performance:
 *   get:
 *     summary: Get cooperative performance report
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Cooperative performance report }
 * /reports/export:
 *   post:
 *     summary: Queue report export
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [reportType], properties: { reportType: { type: string, enum: [bookings, workers, earnings, payments, welfare, cooperative_performance] }, filters: { type: object }, format: { type: string, enum: [csv, xlsx, pdf] } } }
 *     responses:
 *       202: { description: Export queued }
 * /reports/exports/{id}:
 *   get:
 *     summary: Get export status
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Export status }
 *       404: { description: Not found }
 */

export const reportsRouter = Router();

const exportQuerySchema = z.object({
  reportType: z.enum(["bookings", "workers", "earnings", "payments", "welfare", "cooperative_performance"]),
  filters: z.record(z.unknown()).optional(),
  format: z.enum(["csv", "xlsx", "pdf"]).default("csv"),
});

const reportQuerySchema = z.object({
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  serviceId: z.string().uuid().optional(),
  cooperativeId: z.string().uuid().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

reportsRouter.get("/bookings", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const query = reportQuerySchema.parse(req.query);
    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.fromDate) { conditions.push(`b.created_at >= $${index++}`); values.push(query.fromDate); }
    if (query.toDate) { conditions.push(`b.created_at <= $${index++}`); values.push(query.toDate); }
    if (query.serviceId) { conditions.push(`b.service_id = $${index++}`); values.push(query.serviceId); }
    if (query.cooperativeId) { conditions.push(`b.worker_id IN (SELECT id FROM workers WHERE cooperative_id = $${index++})`); values.push(query.cooperativeId); }
    if (query.status) { conditions.push(`b.status = $${index++}`); values.push(query.status); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query(`SELECT b.*, s.name as service_name, u.name as customer_name, w.user_id as worker_user_id FROM bookings b JOIN services s ON s.id = b.service_id JOIN users u ON u.id = b.customer_id LEFT JOIN workers w ON w.id = b.worker_id ${whereClause} ORDER BY b.created_at DESC LIMIT $${index++} OFFSET $${index}`, values);
    res.json({ bookings: result.rows, page: query.page, limit: query.limit });
  } catch (error) { next(error); }
});

reportsRouter.get("/workers", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const query = reportQuerySchema.parse(req.query);
    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.cooperativeId) { conditions.push(`w.cooperative_id = $${index++}`); values.push(query.cooperativeId); }
    if (query.status) { conditions.push(`w.verification_status = $${index++}`); values.push(query.status); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query(`SELECT w.*, u.name, u.phone, u.email, c.name as cooperative_name FROM workers w JOIN users u ON u.id = w.user_id LEFT JOIN cooperatives c ON c.id = w.cooperative_id ${whereClause} ORDER BY w.created_at DESC LIMIT $${index++} OFFSET $${index}`, values);
    res.json({ workers: result.rows, page: query.page, limit: query.limit });
  } catch (error) { next(error); }
});

reportsRouter.get("/earnings", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const query = reportQuerySchema.parse(req.query);
    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.fromDate) { conditions.push(`wel.created_at >= $${index++}`); values.push(query.fromDate); }
    if (query.toDate) { conditions.push(`wel.created_at <= $${index++}`); values.push(query.toDate); }
    if (query.cooperativeId) { conditions.push(`w.cooperative_id = $${index++}`); values.push(query.cooperativeId); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query(`SELECT wel.*, w.worker_code, u.name as worker_name, c.name as cooperative_name FROM worker_earnings_ledger wel JOIN workers w ON w.id = wel.worker_id JOIN users u ON u.id = w.user_id LEFT JOIN cooperatives c ON c.id = w.cooperative_id ${whereClause} ORDER BY wel.created_at DESC LIMIT $${index++} OFFSET $${index}`, values);
    res.json({ earnings: result.rows, page: query.page, limit: query.limit });
  } catch (error) { next(error); }
});

reportsRouter.get("/payments", requireAuth, requireRoles("system_admin", "federation_admin", "support_staff"), async (req, res, next) => {
  try {
    const query = reportQuerySchema.parse(req.query);
    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.fromDate) { conditions.push(`po.created_at >= $${index++}`); values.push(query.fromDate); }
    if (query.toDate) { conditions.push(`po.created_at <= $${index++}`); values.push(query.toDate); }
    if (query.status) { conditions.push(`po.status = $${index++}`); values.push(query.status); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query(`SELECT po.*, u.name as customer_name, s.name as service_name FROM payment_orders po JOIN users u ON u.id = po.customer_id JOIN bookings b ON b.id = po.booking_id JOIN services s ON s.id = b.service_id ${whereClause} ORDER BY po.created_at DESC LIMIT $${index++} OFFSET $${index}`, values);
    res.json({ payments: result.rows, page: query.page, limit: query.limit });
  } catch (error) { next(error); }
});

reportsRouter.get("/welfare", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT c.id as cooperative_id, c.name as cooperative_name, count(w.id) as total_workers, count(w.id) filter (where w.verification_status = 'verified') as verified_workers, count(distinct it.id) as insured_workers, count(distinct tr.id) as trained_workers, count(distinct si.id) as safety_incidents FROM cooperatives c LEFT JOIN workers w ON w.cooperative_id = c.id LEFT JOIN worker_insurance_records it ON it.worker_id = w.id AND it.status = 'active' LEFT JOIN worker_training_records tr ON tr.worker_id = w.id AND tr.status = 'completed' LEFT JOIN safety_incidents si ON si.worker_id = w.id GROUP BY c.id, c.name ORDER BY c.name`);
    res.json({ welfare: result.rows });
  } catch (error) { next(error); }
});

reportsRouter.get("/cooperative-performance", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT c.id, c.name, count(w.id) as total_workers, count(w.id) filter (where w.verification_status = 'verified') as verified_workers, count(b.id) as total_bookings, count(b.id) filter (where b.status = 'completed') as completed_bookings, avg(w.rating)::numeric(2,1) as avg_rating FROM cooperatives c LEFT JOIN workers w ON w.cooperative_id = c.id LEFT JOIN bookings b ON b.worker_id = w.id GROUP BY c.id, c.name ORDER BY total_bookings DESC`);
    res.json({ performance: result.rows });
  } catch (error) { next(error); }
});

reportsRouter.post("/export", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const input = exportQuerySchema.parse(req.body);
    const exportId = crypto.randomUUID();
    await pool.query(`INSERT INTO report_exports (id, report_type, filters, format, status, requested_by) VALUES ($1, $2, $3, $4, 'pending', $5)`, [exportId, input.reportType, input.filters ?? {}, input.format, req.user!.id]);
    await recordAuditEvent({ actorId: req.user!.id, action: "report.export.queued", resourceType: "report_export", resourceId: exportId, requestId: req.header("x-request-id") ?? undefined, metadata: { reportType: input.reportType, format: input.format } }).catch(() => undefined);
    res.status(202).json({ exportId, status: "pending" });
  } catch (error) { next(error); }
});

reportsRouter.get("/exports/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM report_exports WHERE id = $1`, [req.params.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Export not found" }); return; }
    res.json({ export: result.rows[0] });
  } catch (error) { next(error); }
});