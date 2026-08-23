import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";

/**
 * @openapi
 * /admin/users:
 *   get:
 *     summary: List users (system_admin)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: role
 *         in: query
 *         schema: { type: string, enum: [customer, worker, institutional_customer, society_admin, federation_admin, support_staff, system_admin] }
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [active, inactive, suspended] }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 *       - name: page
 *         in: query
 *         schema: { type: integer }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Paginated user list }
 * /admin/users/{id}/status:
 *   patch:
 *     summary: Update user status (system_admin)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [status], properties: { status: { type: string, enum: [active, inactive, suspended] } } }
 *     responses:
 *       200: { description: Updated user }
 * /admin/roles:
 *   get:
 *     summary: List available roles
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of roles }
 * /admin/audit-events:
 *   get:
 *     summary: List audit events
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: actorId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: action
 *         in: query
 *         schema: { type: string }
 *       - name: resourceType
 *         in: query
 *         schema: { type: string }
 *       - name: resourceId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: fromDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: toDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: page
 *         in: query
 *         schema: { type: integer }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Paginated audit events }
 * /admin/security-events:
 *   get:
 *     summary: List security events
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: userId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: eventType
 *         in: query
 *         schema: { type: string }
 *       - name: fromDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: toDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: page
 *         in: query
 *         schema: { type: integer }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Paginated security events }
 * /admin/operations/live:
 *   get:
 *     summary: Get live operations board
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Live operations data }
 * /admin/operations/emergency:
 *   get:
 *     summary: Get active emergencies
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Active emergencies }
 * /admin/operations/unassigned:
 *   get:
 *     summary: Get unassigned bookings
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Unassigned bookings }
 * /admin/operations/delayed:
 *   get:
 *     summary: Get delayed bookings
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Delayed bookings }
 * /admin/verifications:
 *   get:
 *     summary: List worker verification queue
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [draft, submitted, under_review, verified, rejected, suspended, expired] }
 *       - name: cooperativeId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: page
 *         in: query
 *         schema: { type: integer }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Verification queue }
 * /admin/verifications/{id}:
 *   get:
 *     summary: Get worker verification details
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Worker with documents, skills, events }
 *       404: { description: Not found }
 * /admin/verifications/{id}/approve:
 *   post:
 *     summary: Approve worker verification
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Worker approved }
 * /admin/verifications/{id}/reject:
 *   post:
 *     summary: Reject worker verification
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [reason], properties: { reason: { type: string } } }
 *     responses:
 *       200: { description: Worker rejected }
 * /admin/verifications/{id}/suspend:
 *   post:
 *     summary: Suspend worker verification
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [reason], properties: { reason: { type: string } } }
 *     responses:
 *       200: { description: Worker suspended }
 */

export const adminRouter = Router();

const userQuerySchema = z.object({
  role: z.enum(["customer", "worker", "institutional_customer", "society_admin", "federation_admin", "support_staff", "system_admin"]).optional(),
  status: z.enum(["active", "inactive", "suspended"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

adminRouter.get("/users", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const query = userQuerySchema.parse(req.query);
    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.role) { conditions.push(`role = $${index++}`); values.push(query.role); }
    if (query.status) { conditions.push(`status = $${index++}`); values.push(query.status); }
    if (query.search) { conditions.push(`(name ILIKE $${index} OR email ILIKE $${index} OR phone ILIKE $${index})`); values.push(`%${query.search}%`); index++; }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query(`SELECT id, name, phone, email, role, language, status, last_login_at, created_at FROM users ${whereClause} ORDER BY created_at DESC LIMIT $${index++} OFFSET $${index}`, values);
    const countResult = await pool.query(`SELECT count(*)::int as total FROM users ${whereClause}`, values.slice(0, -2));

    res.json({ users: result.rows, total: countResult.rows[0].total, page: query.page, limit: query.limit });
  } catch (error) { next(error); }
});

adminRouter.patch("/users/:id/status", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const userId = String(req.params.id);
    const input = z.object({ status: z.enum(["active", "inactive", "suspended"]) }).parse(req.body);
    const result = await pool.query(`UPDATE users SET status = $1, updated_at = now() WHERE id = $2 RETURNING id, name, role, status`, [input.status, userId]);
    if (!result.rows[0]) { res.status(404).json({ error: "User not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "user.status.changed", resourceType: "user", resourceId: userId, requestId: req.header("x-request-id") ?? undefined, metadata: { status: input.status } }).catch(() => undefined);
    res.json({ user: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.get("/roles", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    res.json({ roles: ["customer", "worker", "institutional_customer", "society_admin", "federation_admin", "support_staff", "system_admin"] });
  } catch (error) { next(error); }
});

adminRouter.post("/roles", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(50), permissions: z.array(z.string()).default([]) }).parse(req.body);
    res.status(501).json({ error: "Custom roles not yet implemented" });
  } catch (error) { next(error); }
});

const auditQuerySchema = z.object({
  actorId: z.string().uuid().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

adminRouter.get("/audit-events", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const query = auditQuerySchema.parse(req.query);
    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.actorId) { conditions.push(`actor_id = $${index++}`); values.push(query.actorId); }
    if (query.action) { conditions.push(`action ILIKE $${index++}`); values.push(`%${query.action}%`); }
    if (query.resourceType) { conditions.push(`resource_type = $${index++}`); values.push(query.resourceType); }
    if (query.resourceId) { conditions.push(`resource_id = $${index++}`); values.push(query.resourceId); }
    if (query.fromDate) { conditions.push(`created_at >= $${index++}`); values.push(query.fromDate); }
    if (query.toDate) { conditions.push(`created_at <= $${index++}`); values.push(query.toDate); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query(`SELECT * FROM audit_events ${whereClause} ORDER BY created_at DESC LIMIT $${index++} OFFSET $${index}`, values);
    const countResult = await pool.query(`SELECT count(*)::int as total FROM audit_events ${whereClause}`, values.slice(0, -2));

    res.json({ events: result.rows, total: countResult.rows[0].total, page: query.page, limit: query.limit });
  } catch (error) { next(error); }
});

adminRouter.get("/security-events", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const query = z.object({
      userId: z.string().uuid().optional(),
      eventType: z.string().optional(),
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(50),
    }).parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.userId) { conditions.push(`user_id = $${index++}`); values.push(query.userId); }
    if (query.eventType) { conditions.push(`event_type = $${index++}`); values.push(query.eventType); }
    if (query.fromDate) { conditions.push(`created_at >= $${index++}`); values.push(query.fromDate); }
    if (query.toDate) { conditions.push(`created_at <= $${index++}`); values.push(query.toDate); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query(`SELECT * FROM security_events ${whereClause} ORDER BY created_at DESC LIMIT $${index++} OFFSET $${index}`, values);
    const countResult = await pool.query(`SELECT count(*)::int as total FROM security_events ${whereClause}`, values.slice(0, -2));

    res.json({ events: result.rows, total: countResult.rows[0].total, page: query.page, limit: query.limit });
  } catch (error) { next(error); }
});

adminRouter.get("/operations/live", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const [activeBookings, activeEmergencies, availableWorkers] = await Promise.all([
      pool.query(`SELECT b.*, s.name as service_name, u.name as customer_name FROM bookings b JOIN services s ON s.id = b.service_id JOIN users u ON u.id = b.customer_id WHERE b.status NOT IN ('completed', 'cancelled', 'expired', 'refunded') ORDER BY b.created_at DESC LIMIT 50`),
      pool.query(`SELECT b.*, eb.priority, eb.escalation_level, s.name as service_name FROM emergency_bookings eb JOIN bookings b ON b.id = eb.booking_id JOIN services s ON s.id = b.service_id WHERE b.status NOT IN ('completed', 'cancelled') ORDER BY eb.priority DESC, b.created_at ASC`),
      pool.query(`SELECT w.id, w.current_status, w.rating, u.name, wl.location FROM workers w JOIN users u ON u.id = w.user_id LEFT JOIN worker_locations wl ON wl.worker_id = w.id WHERE w.verification_status = 'verified' AND w.current_status = 'available' AND w.location_sharing_enabled = true`),
    ]);

    res.json({
      activeBookings: activeBookings.rows,
      activeEmergencies: activeEmergencies.rows,
      availableWorkers: availableWorkers.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) { next(error); }
});

adminRouter.get("/operations/emergency", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT b.*, eb.priority, eb.radius_km, eb.max_response_minutes, eb.escalation_level, eb.escalated_at, s.name as service_name, u.name as customer_name FROM emergency_bookings eb JOIN bookings b ON b.id = eb.booking_id JOIN services s ON s.id = b.service_id JOIN users u ON u.id = b.customer_id WHERE b.status NOT IN ('completed', 'cancelled') ORDER BY eb.priority DESC, b.created_at ASC`);
    res.json({ emergencies: result.rows });
  } catch (error) { next(error); }
});

adminRouter.get("/operations/unassigned", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT b.*, s.name as service_name FROM bookings b JOIN services s ON s.id = b.service_id WHERE b.worker_id IS NULL AND b.status IN ('requested', 'matching') ORDER BY b.created_at ASC`);
    res.json({ unassigned: result.rows });
  } catch (error) { next(error); }
});

adminRouter.get("/operations/delayed", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT b.*, s.name as service_name, EXTRACT(EPOCH FROM (now() - b.created_at))/60 as minutes_pending FROM bookings b JOIN services s ON s.id = b.service_id WHERE b.status IN ('requested', 'matching', 'assigned') AND b.created_at < now() - interval '30 minutes' ORDER BY b.created_at ASC`);
    res.json({ delayed: result.rows });
  } catch (error) { next(error); }
});

adminRouter.get("/verifications", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const query = z.object({
      status: z.enum(["draft", "submitted", "under_review", "verified", "rejected", "suspended", "expired"]).optional(),
      cooperativeId: z.string().uuid().optional(),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
    }).parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.status) { conditions.push(`w.verification_status = $${index++}`); values.push(query.status); }
    else { conditions.push(`w.verification_status IN ('draft', 'submitted', 'under_review', 'rejected', 'expired')`); }
    if (query.cooperativeId) { conditions.push(`w.cooperative_id = $${index++}`); values.push(query.cooperativeId); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query(`SELECT w.id, w.user_id, u.name, u.phone, u.email, w.cooperative_id, c.name as cooperative_name, w.verification_status, w.experience_years, w.updated_at FROM workers w JOIN users u ON u.id = w.user_id LEFT JOIN cooperatives c ON c.id = w.cooperative_id ${whereClause} ORDER BY w.updated_at ASC LIMIT $${index++} OFFSET $${index}`, values);
    const countResult = await pool.query(`SELECT count(*)::int as total FROM workers w ${whereClause}`, values.slice(0, -2));

    res.json({ workers: result.rows, total: countResult.rows[0].total, page: query.page, limit: query.limit });
  } catch (error) { next(error); }
});

adminRouter.get("/verifications/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const workerId = String(req.params.id);
    const result = await pool.query(`SELECT w.*, u.name, u.phone, u.email, c.name as cooperative_name FROM workers w JOIN users u ON u.id = w.user_id LEFT JOIN cooperatives c ON c.id = w.cooperative_id WHERE w.id = $1`, [workerId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    const docs = await pool.query(`SELECT * FROM worker_documents WHERE worker_id = $1 ORDER BY created_at DESC`, [workerId]);
    const skills = await pool.query(`SELECT ws.*, s.name, s.category FROM worker_skills_new ws JOIN skills s ON s.id = ws.skill_id WHERE ws.worker_id = $1`, [workerId]);
    const events = await pool.query(`SELECT wve.*, u.name as actor_name FROM worker_verification_events wve JOIN users u ON u.id = wve.actor_id WHERE wve.worker_id = $1 ORDER BY wve.created_at DESC`, [workerId]);
    res.json({ worker: result.rows[0], documents: docs.rows, skills: skills.rows, events: events.rows });
  } catch (error) { next(error); }
});

adminRouter.post("/verifications/:id/approve", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const workerId = String(req.params.id);
    const result = await pool.query(`UPDATE workers SET verification_status = 'verified', current_status = 'available', updated_at = now() WHERE id = $1 RETURNING id, verification_status, current_status`, [workerId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    await pool.query(`INSERT INTO worker_verification_events (id, worker_id, actor_id, from_status, to_status, reason) VALUES ($1, $2, $3, $4, 'verified', $5)`, [crypto.randomUUID(), workerId, req.user!.id, result.rows[0].verification_status, "Approved by admin"]);
    await recordAuditEvent({ actorId: req.user!.id, action: "worker.verification.approved", resourceType: "worker", resourceId: workerId, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.json({ worker: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.post("/verifications/:id/reject", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const workerId = String(req.params.id);
    const input = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const result = await pool.query(`UPDATE workers SET verification_status = 'rejected', current_status = 'offline', updated_at = now() WHERE id = $1 RETURNING id, verification_status, current_status`, [workerId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    await pool.query(`INSERT INTO worker_verification_events (id, worker_id, actor_id, from_status, to_status, reason) VALUES ($1, $2, $3, $4, 'rejected', $5)`, [crypto.randomUUID(), workerId, req.user!.id, result.rows[0].verification_status, input.reason]);
    await recordAuditEvent({ actorId: req.user!.id, action: "worker.verification.rejected", resourceType: "worker", resourceId: workerId, requestId: req.header("x-request-id") ?? undefined, metadata: { reason: input.reason } }).catch(() => undefined);
    res.json({ worker: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.post("/verifications/:id/suspend", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const workerId = String(req.params.id);
    const input = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const result = await pool.query(`UPDATE workers SET verification_status = 'suspended', current_status = 'offline', updated_at = now() WHERE id = $1 RETURNING id, verification_status, current_status`, [workerId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    await pool.query(`INSERT INTO worker_verification_events (id, worker_id, actor_id, from_status, to_status, reason) VALUES ($1, $2, $3, $4, 'suspended', $5)`, [crypto.randomUUID(), workerId, req.user!.id, result.rows[0].verification_status, input.reason]);
    await recordAuditEvent({ actorId: req.user!.id, action: "worker.verification.suspended", resourceType: "worker", resourceId: workerId, requestId: req.header("x-request-id") ?? undefined, metadata: { reason: input.reason } }).catch(() => undefined);
    res.json({ worker: result.rows[0] });
  } catch (error) { next(error); }
});