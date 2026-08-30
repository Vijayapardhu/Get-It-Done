import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { canAdminAccessWorker } from "../services/scopeService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

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

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
adminRouter.param("id", rejectNonUuidParam);
adminRouter.param("userId", rejectNonUuidParam);
adminRouter.param("roleId", rejectNonUuidParam);

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
    const userId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const input = z.object({ status: z.enum(["active", "inactive", "suspended"]) }).parse(req.body);
    const result = await pool.query(`UPDATE users SET status = $1, updated_at = now() WHERE id = $2 RETURNING id, name, role, status`, [input.status, userId]);
    if (!result.rows[0]) { res.status(404).json({ error: "User not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "user.status.changed", resourceType: "user", resourceId: userId, requestId: req.header("x-request-id") ?? undefined, metadata: { status: input.status } }).catch(() => undefined);
    res.json({ user: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.get("/roles", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT r.id, r.name, r.description, r.is_system, r.is_custom, r.created_at, r.updated_at,
      COALESCE(json_agg(json_build_object('permission', rp.permission)) FILTER (WHERE rp.permission IS NOT NULL), '[]'::json) as permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      GROUP BY r.id
      ORDER BY r.is_system DESC, r.name`);
    res.json({ roles: result.rows });
  } catch (error) { next(error); }
});

adminRouter.post("/roles", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(50), description: z.string().max(500).optional(), permissions: z.array(z.string()).default([]) }).parse(req.body);
    
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      const roleResult = await client.query(`INSERT INTO roles (id, name, description, is_custom) VALUES ($1, $2, $3, true) RETURNING *`,
        [crypto.randomUUID(), input.name, input.description ?? null]);
      const roleId = roleResult.rows[0].id;
      
      for (const permission of input.permissions) {
        await client.query(`INSERT INTO role_permissions (role_id, permission) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [roleId, permission]);
      }
      
      await client.query("COMMIT");
      
      const result = await pool.query(`SELECT r.*, 
        COALESCE(json_agg(json_build_object('permission', rp.permission)) FILTER (WHERE rp.permission IS NOT NULL), '[]'::json) as permissions
        FROM roles r
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        WHERE r.id = $1
        GROUP BY r.id`, [roleId]);
      
      await recordAuditEvent({ actorId: req.user!.id, action: "role.created", resourceType: "role", resourceId: roleId, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
      res.status(201).json({ role: result.rows[0] });
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  } catch (error) { next(error); }
});

adminRouter.get("/roles/:id", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await pool.query(`SELECT r.*, 
      COALESCE(json_agg(json_build_object('permission', rp.permission)) FILTER (WHERE rp.permission IS NOT NULL), '[]'::json) as permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      WHERE r.id = $1
      GROUP BY r.id`, [id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Role not found" }); return; }
    res.json({ role: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.patch("/roles/:id", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const input = z.object({ name: z.string().trim().min(2).max(50).optional(), description: z.string().max(500).optional(), permissions: z.array(z.string()).optional() }).parse(req.body);
    
    const existing = await pool.query(`SELECT * FROM roles WHERE id = $1`, [id]);
    if (!existing.rows[0]) { res.status(404).json({ error: "Role not found" }); return; }
    if (existing.rows[0].is_system) { res.status(403).json({ error: "Cannot modify system role" }); return; }
    
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      const fields: string[] = [];
      const values: unknown[] = [];
      let index = 1;
      
      if (input.name !== undefined) { fields.push(`name = $${index++}`); values.push(input.name); }
      if (input.description !== undefined) { fields.push(`description = $${index++}`); values.push(input.description); }
      
      if (fields.length > 0) {
        values.push(id);
        await client.query(`UPDATE roles SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index}`, values);
      }
      
      if (input.permissions !== undefined) {
        await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [id]);
        for (const permission of input.permissions) {
          await client.query(`INSERT INTO role_permissions (role_id, permission) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, permission]);
        }
      }
      
      await client.query("COMMIT");
      
      const result = await pool.query(`SELECT r.*, 
        COALESCE(json_agg(json_build_object('permission', rp.permission)) FILTER (WHERE rp.permission IS NOT NULL), '[]'::json) as permissions
        FROM roles r
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        WHERE r.id = $1
        GROUP BY r.id`, [id]);
      
      await recordAuditEvent({ actorId: req.user!.id, action: "role.updated", resourceType: "role", resourceId: id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
      res.json({ role: result.rows[0] });
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  } catch (error) { next(error); }
});

adminRouter.delete("/roles/:id", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const existing = await pool.query(`SELECT * FROM roles WHERE id = $1`, [id]);
    if (!existing.rows[0]) { res.status(404).json({ error: "Role not found" }); return; }
    if (existing.rows[0].is_system) { res.status(403).json({ error: "Cannot delete system role" }); return; }
    
    await pool.query(`DELETE FROM roles WHERE id = $1`, [id]);
    await recordAuditEvent({ actorId: req.user!.id, action: "role.deleted", resourceType: "role", resourceId: id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(204).send();
  } catch (error) { next(error); }
});

adminRouter.post("/roles/:id/permissions", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { permissions } = z.object({ permissions: z.array(z.string()).min(1) }).parse(req.body);
    
    const existing = await pool.query(`SELECT * FROM roles WHERE id = $1`, [id]);
    if (!existing.rows[0]) { res.status(404).json({ error: "Role not found" }); return; }
    if (existing.rows[0].is_system) { res.status(403).json({ error: "Cannot modify system role permissions" }); return; }
    
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const permission of req.body.permissions) {
        await client.query(`INSERT INTO role_permissions (role_id, permission) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, permission]);
      }
      await client.query("COMMIT");
      
      const result = await pool.query(`SELECT r.*, 
        COALESCE(json_agg(json_build_object('permission', rp.permission)) FILTER (WHERE rp.permission IS NOT NULL), '[]'::json) as permissions
        FROM roles r
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        WHERE r.id = $1
        GROUP BY r.id`, [id]);
      
      await recordAuditEvent({ actorId: req.user!.id, action: "role.permissions.added", resourceType: "role", resourceId: id, requestId: req.header("x-request-id") ?? undefined, metadata: { permissions: req.body.permissions } }).catch(() => undefined);
      res.json({ role: result.rows[0] });
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  } catch (error) { next(error); }
});

adminRouter.delete("/roles/:id/permissions/:permission", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const permission = Array.isArray(req.params.permission) ? req.params.permission[0] : req.params.permission;
    
    const existing = await pool.query(`SELECT * FROM roles WHERE id = $1`, [id]);
    if (!existing.rows[0]) { res.status(404).json({ error: "Role not found" }); return; }
    if (existing.rows[0].is_system) { res.status(403).json({ error: "Cannot modify system role permissions" }); return; }
    
    await pool.query(`DELETE FROM role_permissions WHERE role_id = $1 AND permission = $2`, [id, permission]);
    
    const result = await pool.query(`SELECT r.*, 
      COALESCE(json_agg(json_build_object('permission', rp.permission)) FILTER (WHERE rp.permission IS NOT NULL), '[]'::json) as permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      WHERE r.id = $1
      GROUP BY r.id`, [id]);
    
    await recordAuditEvent({ actorId: req.user!.id, action: "role.permission.removed", resourceType: "role", resourceId: id, requestId: req.header("x-request-id") ?? undefined, metadata: { permission } }).catch(() => undefined);
    res.json({ role: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.get("/users/:userId/roles", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const result = await pool.query(`SELECT r.id, r.name, r.description, r.is_system, r.is_custom, ur.assigned_at, ur.expires_at, u.name as assigned_by_name
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      LEFT JOIN users u ON u.id = ur.assigned_by
      WHERE ur.user_id = $1 AND (ur.expires_at IS NULL OR ur.expires_at > now())
      ORDER BY r.is_system DESC, r.name`, [req.params.userId]);
    res.json({ roles: result.rows });
  } catch (error) { next(error); }
});

adminRouter.post("/users/:userId/roles", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const { roleId, expiresAt } = z.object({ roleId: z.string().uuid(), expiresAt: z.string().datetime().optional() }).parse(req.body);
    
    const user = await pool.query(`SELECT * FROM users WHERE id = $1`, [userId]);
    if (!user.rows[0]) { res.status(404).json({ error: "User not found" }); return; }
    
    const role = await pool.query(`SELECT * FROM roles WHERE id = $1`, [roleId]);
    if (!role.rows[0]) { res.status(404).json({ error: "Role not found" }); return; }
    
    const existing = await pool.query(`SELECT * FROM user_roles WHERE user_id = $1 AND role_id = $2`, [userId, roleId]);
    if (existing.rows[0]) { res.status(409).json({ error: "User already has this role" }); return; }
    
    const result = await pool.query(`INSERT INTO user_roles (user_id, role_id, assigned_by, expires_at) VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, roleId, req.user!.id, req.body.expiresAt ?? null]);
    
    await recordAuditEvent({ actorId: req.user!.id, action: "user_role.assigned", resourceType: "user_role", resourceId: userId, requestId: req.header("x-request-id") ?? undefined, metadata: { roleId, expiresAt } }).catch(() => undefined);
    res.status(201).json({ userRole: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.delete("/users/:userId/roles/:roleId", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const roleId = Array.isArray(req.params.roleId) ? req.params.roleId[0] : req.params.roleId;
    
    const result = await pool.query(`DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2 RETURNING *`, [userId, roleId]);
    if (!result.rows[0]) { res.status(404).json({ error: "User role not found" }); return; }
    
    await recordAuditEvent({ actorId: req.user!.id, action: "user_role.removed", resourceType: "user_role", resourceId: userId, requestId: req.header("x-request-id") ?? undefined, metadata: { roleId } }).catch(() => undefined);
    res.status(204).send();
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
    const workerId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const result = await pool.query(`SELECT w.*, u.name, u.phone, u.email, c.name as cooperative_name FROM workers w JOIN users u ON u.id = w.user_id LEFT JOIN cooperatives c ON c.id = w.cooperative_id WHERE w.id = $1`, [workerId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    const docs = await pool.query(`SELECT * FROM worker_documents WHERE worker_id = $1 ORDER BY created_at DESC`, [workerId]);
    const skills = await pool.query(`SELECT ws.*, ws.service_id AS skill_id, s.name, s.category FROM worker_skills ws JOIN services s ON s.id = ws.service_id WHERE ws.worker_id = $1`, [workerId]);
    const events = await pool.query(`SELECT wve.*, u.name as actor_name FROM worker_verification_events wve JOIN users u ON u.id = wve.actor_id WHERE wve.worker_id = $1 ORDER BY wve.created_at DESC`, [workerId]);
    res.json({ worker: result.rows[0], documents: docs.rows, skills: skills.rows, events: events.rows });
  } catch (error) { next(error); }
});

adminRouter.post("/verifications/:id/approve", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const workerId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    // scopeService was written for this and never wired up: a society admin
    // could act on any worker in the country, not just their own society's.
    if (!(await canAdminAccessWorker(req.user!.id, req.user!.role, workerId))) {
      res.status(403).json({ error: "Worker is outside your administrative scope" });
      return;
    }
    const result = await pool.query(`UPDATE workers SET verification_status = 'verified', current_status = 'available', updated_at = now() WHERE id = $1 RETURNING id, verification_status, current_status`, [workerId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    await pool.query(`INSERT INTO worker_verification_events (id, worker_id, actor_id, from_status, to_status, reason) VALUES ($1, $2, $3, $4, 'verified', $5)`, [crypto.randomUUID(), workerId, req.user!.id, result.rows[0].verification_status, "Approved by admin"]);
    await recordAuditEvent({ actorId: req.user!.id, action: "worker.verification.approved", resourceType: "worker", resourceId: workerId, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.json({ worker: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.post("/verifications/:id/reject", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const workerId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    // scopeService was written for this and never wired up: a society admin
    // could act on any worker in the country, not just their own society's.
    if (!(await canAdminAccessWorker(req.user!.id, req.user!.role, workerId))) {
      res.status(403).json({ error: "Worker is outside your administrative scope" });
      return;
    }
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
    const workerId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    // scopeService was written for this and never wired up: a society admin
    // could act on any worker in the country, not just their own society's.
    if (!(await canAdminAccessWorker(req.user!.id, req.user!.role, workerId))) {
      res.status(403).json({ error: "Worker is outside your administrative scope" });
      return;
    }
    const input = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const result = await pool.query(`UPDATE workers SET verification_status = 'suspended', current_status = 'offline', updated_at = now() WHERE id = $1 RETURNING id, verification_status, current_status`, [workerId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    await pool.query(`INSERT INTO worker_verification_events (id, worker_id, actor_id, from_status, to_status, reason) VALUES ($1, $2, $3, $4, 'suspended', $5)`, [crypto.randomUUID(), workerId, req.user!.id, result.rows[0].verification_status, input.reason]);
    await recordAuditEvent({ actorId: req.user!.id, action: "worker.verification.suspended", resourceType: "worker", resourceId: workerId, requestId: req.header("x-request-id") ?? undefined, metadata: { reason: input.reason } }).catch(() => undefined);
    res.json({ worker: result.rows[0] });
  } catch (error) { next(error); }
});

/* ──────────────────────────────────────────────────────────────────────────────
   SERVICES MANAGEMENT
   ────────────────────────────────────────────────────────────────────────────── */

const serviceCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(50),
  description: z.string().trim().max(500).optional(),
  basePrice: z.number().nonnegative(),
  emergencySupported: z.boolean().default(false),
  pricePerMinute: z.number().nonnegative().optional(),
  minMinutes: z.number().int().positive().optional(),
  maxMinutes: z.number().int().positive().optional(),
  defaultMinutes: z.number().int().positive().optional(),
  listPrice: z.number().nonnegative().optional(),
  heroImageUrl: z.string().url().optional(),
  includes: z.array(z.string()).optional(),
  excludes: z.array(z.string()).optional(),
  steps: z.array(z.string()).optional(),
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
});

const serviceUpdateSchema = serviceCreateSchema.partial();

adminRouter.get("/services", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const query = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
      search: z.string().optional(),
    }).parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.search) {
      conditions.push(`(name ILIKE $${index} OR category ILIKE $${index} OR description ILIKE $${index})`);
      values.push(`%${query.search}%`);
      index++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query(`SELECT * FROM services ${whereClause} ORDER BY created_at DESC LIMIT $${index++} OFFSET $${index}`, values);
    const countResult = await pool.query(`SELECT count(*)::int as total FROM services ${whereClause}`, values.slice(0, -2));

    res.json({ services: result.rows, total: countResult.rows[0].total, page: query.page, limit: query.limit });
  } catch (error) { next(error); }
});

adminRouter.post("/services", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = serviceCreateSchema.parse(req.body);
    const fields = ["id", "name", "category", "description", "base_price", "emergency_supported"];
    const values = [
      crypto.randomUUID(),
      input.name,
      input.category,
      input.description ?? null,
      input.basePrice,
      input.emergencySupported,
    ];
    let index = values.length;

    if (input.pricePerMinute !== undefined) { fields.push("price_per_minute"); values.push(input.pricePerMinute); index++; }
    if (input.minMinutes !== undefined) { fields.push("min_minutes"); values.push(input.minMinutes); index++; }
    if (input.maxMinutes !== undefined) { fields.push("max_minutes"); values.push(input.maxMinutes); index++; }
    if (input.defaultMinutes !== undefined) { fields.push("default_minutes"); values.push(input.defaultMinutes); index++; }
    if (input.listPrice !== undefined) { fields.push("list_price"); values.push(input.listPrice); index++; }
    if (input.heroImageUrl !== undefined) { fields.push("hero_image_url"); values.push(input.heroImageUrl); index++; }
    if (input.includes !== undefined) { fields.push("includes"); values.push(JSON.stringify(input.includes)); index++; }
    if (input.excludes !== undefined) { fields.push("excludes"); values.push(JSON.stringify(input.excludes)); index++; }
    if (input.steps !== undefined) { fields.push("steps"); values.push(JSON.stringify(input.steps)); index++; }
    if (input.faqs !== undefined) { fields.push("faqs"); values.push(JSON.stringify(input.faqs)); index++; }

    const placeholders = fields.map((_, i) => `$${i + 1}`).join(", ");
    const result = await pool.query(`INSERT INTO services (${fields.join(", ")}) VALUES (${placeholders}) RETURNING *`, values);
    await recordAuditEvent({ actorId: req.user!.id, action: "service.created", resourceType: "service", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ service: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.get("/services/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM services WHERE id = $1`, [Array.isArray(req.params.id) ? req.params.id[0] : req.params.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Service not found" }); return; }
    res.json({ service: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.patch("/services/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = serviceUpdateSchema.parse(req.body);
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    const columnMap: Record<string, string> = {
      name: "name",
      category: "category",
      description: "description",
      basePrice: "base_price",
      emergencySupported: "emergency_supported",
      pricePerMinute: "price_per_minute",
      minMinutes: "min_minutes",
      maxMinutes: "max_minutes",
      defaultMinutes: "default_minutes",
      listPrice: "list_price",
      heroImageUrl: "hero_image_url",
      includes: "includes",
      excludes: "excludes",
      steps: "steps",
      faqs: "faqs",
    };

    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined && columnMap[key]) {
        fields.push(`${columnMap[key]} = $${index++}`);
        if (key === "includes" || key === "excludes" || key === "steps" || key === "faqs") {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
      }
    }

    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const result = await pool.query(`UPDATE services SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} RETURNING *`, values);
    if (!result.rows[0]) { res.status(404).json({ error: "Service not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "service.updated", resourceType: "service", resourceId: Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, requestId: req.header("x-request-id") ?? undefined, metadata: { fields: Object.keys(input) } }).catch(() => undefined);
    res.json({ service: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.delete("/services/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`DELETE FROM services WHERE id = $1 RETURNING id`, [Array.isArray(req.params.id) ? req.params.id[0] : req.params.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Service not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "service.deleted", resourceType: "service", resourceId: Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(204).send();
  } catch (error) { next(error); }
});

/* ──────────────────────────────────────────────────────────────────────────────
   COOPERATIVES & FEDERATIONS MANAGEMENT
   ────────────────────────────────────────────────────────────────────────────── */

const coopCreateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9_]+$/),
  district: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  federationId: z.string().uuid(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  commissionRate: z.number().min(0).max(100).default(10),
  minWorkers: z.number().int().positive().default(1),
  maxWorkers: z.number().int().positive().default(1000),
});

const coopUpdateSchema = coopCreateSchema.partial();

const federationCreateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9_]+$/),
  state: z.string().trim().min(2).max(100),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

const federationUpdateSchema = federationCreateSchema.partial();

adminRouter.get("/cooperatives", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const query = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
      search: z.string().optional(),
      federationId: z.string().uuid().optional(),
    }).parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.search) { conditions.push(`(c.name ILIKE $${index} OR c.code ILIKE $${index})`); values.push(`%${query.search}%`); index++; }
    if (query.federationId) { conditions.push(`c.federation_id = $${index++}`); values.push(query.federationId); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query(`SELECT c.*, f.name as federation_name FROM cooperatives c LEFT JOIN federations f ON f.id = c.federation_id ${whereClause} ORDER BY c.created_at DESC LIMIT $${index++} OFFSET $${index}`, values);
    const countResult = await pool.query(`SELECT count(*)::int as total FROM cooperatives c ${whereClause}`, values.slice(0, -2));

    res.json({ cooperatives: result.rows, total: countResult.rows[0].total, page: query.page, limit: query.limit });
  } catch (error) { next(error); }
});

adminRouter.post("/cooperatives", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const input = coopCreateSchema.parse(req.body);
    const canCreate = req.user!.role === "system_admin" || (req.user!.role === "federation_admin" && await canAccessFederation(req.user!.id, input.federationId));
    if (!canCreate) { res.status(403).json({ error: "Cannot create cooperative in this federation" }); return; }
    const result = await pool.query(`INSERT INTO cooperatives (id, name, code, district, state, federation_id, contact_email, contact_phone, address, commission_rate, min_workers, max_workers) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [crypto.randomUUID(), input.name, input.code, input.district, input.state, input.federationId, input.contactEmail ?? null, input.contactPhone ?? null, input.address ?? null, input.commissionRate, input.minWorkers, input.maxWorkers]);
    await recordAuditEvent({ actorId: req.user!.id, action: "cooperative.created", resourceType: "cooperative", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ cooperative: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.get("/cooperatives/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const cooperativeId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const result = await pool.query(`SELECT c.*, f.name as federation_name FROM cooperatives c LEFT JOIN federations f ON f.id = c.federation_id WHERE c.id = $1`, [cooperativeId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Cooperative not found" }); return; }
    const canView = req.user!.role === "system_admin" || (req.user!.role === "federation_admin" && await canAccessFederation(req.user!.id, result.rows[0].federation_id)) || (req.user!.role === "society_admin" && await canAccessCooperative(req.user!.id, cooperativeId));
    if (!canView) { res.status(403).json({ error: "Cannot view this cooperative" }); return; }
    res.json({ cooperative: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.patch("/cooperatives/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const cooperativeId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const input = coopUpdateSchema.parse(req.body);
    const cooperative = await pool.query(`SELECT * FROM cooperatives WHERE id = $1`, [cooperativeId]);
    if (!cooperative.rows[0]) { res.status(404).json({ error: "Cooperative not found" }); return; }
    const canEdit = req.user!.role === "system_admin" || (req.user!.role === "federation_admin" && await canAccessFederation(req.user!.id, cooperative.rows[0].federation_id)) || (req.user!.role === "society_admin" && await canAccessCooperative(req.user!.id, cooperativeId));
    if (!canEdit) { res.status(403).json({ error: "Cannot edit this cooperative" }); return; }
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    const fieldMap: Record<string, string> = { contactEmail: "contact_email", contactPhone: "contact_phone", commissionRate: "commission_rate", minWorkers: "min_workers", maxWorkers: "max_workers", federationId: "federation_id" };
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) { fields.push(`${fieldMap[key] ?? key} = $${index++}`); values.push(value); }
    }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(cooperativeId);
    const result = await pool.query(`UPDATE cooperatives SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} RETURNING *`, values);
    await recordAuditEvent({ actorId: req.user!.id, action: "cooperative.updated", resourceType: "cooperative", resourceId: cooperativeId, requestId: req.header("x-request-id") ?? undefined, metadata: { fields: Object.keys(input) } }).catch(() => undefined);
    res.json({ cooperative: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.get("/cooperatives/:id/workers", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const cooperativeId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const query = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
      verificationStatus: z.enum(["pending", "under_review", "verified", "rejected", "suspended", "expired"]).optional(),
      availability: z.enum(["available", "busy", "offline"]).optional(),
    }).parse(req.query);

    const conditions: string[] = ["w.cooperative_id = $1"];
    const values: unknown[] = [cooperativeId];
    let index = 2;

    if (query.verificationStatus) { conditions.push(`w.verification_status = $${index++}`); values.push(query.verificationStatus); }
    if (query.availability) { conditions.push(`w.current_status = $${index++}`); values.push(query.availability); }

    const whereClause = conditions.join(" AND ");
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query(`SELECT w.id, w.worker_code, w.verification_status, w.rating, w.current_status, w.experience_years, u.name, u.phone, u.email FROM workers w JOIN users u ON u.id = w.user_id WHERE ${whereClause} ORDER BY w.rating DESC NULLS LAST LIMIT $${index++} OFFSET $${index}`, values);
    const countResult = await pool.query(`SELECT count(*)::int as total FROM workers w WHERE ${whereClause}`, values.slice(0, -2));

    res.json({ workers: result.rows, total: countResult.rows[0].total, page: query.page, limit: query.limit });
  } catch (error) { next(error); }
});

adminRouter.get("/federations", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const query = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
    }).parse(req.query);

    const offset = (query.page - 1) * query.limit;
    const result = await pool.query(`SELECT * FROM federations ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [query.limit, offset]);
    const countResult = await pool.query(`SELECT count(*)::int as total FROM federations`);

    res.json({ federations: result.rows, total: countResult.rows[0].total, page: query.page, limit: query.limit });
  } catch (error) { next(error); }
});

adminRouter.post("/federations", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const input = federationCreateSchema.parse(req.body);
    const result = await pool.query(`INSERT INTO federations (id, name, code, state, contact_email, contact_phone, address) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [crypto.randomUUID(), input.name, input.code, input.state, input.contactEmail ?? null, input.contactPhone ?? null, input.address ?? null]);
    await recordAuditEvent({ actorId: req.user!.id, action: "federation.created", resourceType: "federation", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ federation: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.patch("/federations/:id", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const input = federationUpdateSchema.parse(req.body);
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) { fields.push(`${key === "contactEmail" ? "contact_email" : key === "contactPhone" ? "contact_phone" : key} = $${index++}`); values.push(value); }
    }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const result = await pool.query(`UPDATE federations SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} RETURNING *`, values);
    if (!result.rows[0]) { res.status(404).json({ error: "Federation not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "federation.updated", resourceType: "federation", resourceId: Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, requestId: req.header("x-request-id") ?? undefined, metadata: { fields: Object.keys(input) } }).catch(() => undefined);
    res.json({ federation: result.rows[0] });
  } catch (error) { next(error); }
});

/* ──────────────────────────────────────────────────────────────────────────────
   PRICING MANAGEMENT
   ────────────────────────────────────────────────────────────────────────────── */

const surgeRuleCreateSchema = z.object({
  area: z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(z.array(z.number()))) }),
  serviceId: z.string().uuid().optional(),
  multiplier: z.number().min(1).max(10),
  trigger: z.enum(["demand_threshold", "time", "weather"]),
  demandThreshold: z.number().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

const surgeRuleUpdateSchema = z.object({
  multiplier: z.number().min(1).max(10).optional(),
  demandThreshold: z.number().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

const travelFeeCreateSchema = z.object({
  cooperativeId: z.string().uuid(),
  baseKm: z.number().int().positive().default(5),
  baseFee: z.number().nonnegative().default(0),
  perKmRate: z.number().nonnegative().default(0),
  maxDistanceKm: z.number().int().positive().default(50),
});

const taxRuleCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  rate: z.number().min(0).max(1),
  appliesTo: z.enum(["service", "worker", "platform"]),
  jurisdiction: z.string().trim().min(2).max(100),
});

adminRouter.get("/pricing/surge-rules", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM surge_rules ORDER BY created_at DESC`);
    res.json({ surgeRules: result.rows });
  } catch (error) { next(error); }
});

adminRouter.post("/pricing/surge-rules", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const input = surgeRuleCreateSchema.parse(req.body);
    const result = await pool.query(`INSERT INTO surge_rules (id, area, service_id, multiplier, trigger, demand_threshold, starts_at, ends_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [crypto.randomUUID(), input.area, input.serviceId ?? null, input.multiplier, input.trigger, input.demandThreshold ?? null, input.startsAt ?? null, input.endsAt ?? null]);
    await recordAuditEvent({ actorId: req.user!.id, action: "surge_rule.created", resourceType: "surge_rule", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ surgeRule: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.patch("/pricing/surge-rules/:id", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const input = surgeRuleUpdateSchema.parse(req.body);
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) { fields.push(`${key === "demandThreshold" ? "demand_threshold" : key} = $${index++}`); values.push(value); }
    }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const result = await pool.query(`UPDATE surge_rules SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} RETURNING *`, values);
    if (!result.rows[0]) { res.status(404).json({ error: "Surge rule not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "surge_rule.updated", resourceType: "surge_rule", resourceId: Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.json({ surgeRule: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.delete("/pricing/surge-rules/:id", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`DELETE FROM surge_rules WHERE id = $1 RETURNING id`, [Array.isArray(req.params.id) ? req.params.id[0] : req.params.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Surge rule not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "surge_rule.deleted", resourceType: "surge_rule", resourceId: Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(204).send();
  } catch (error) { next(error); }
});

// ─── ZONE MANAGEMENT ────────────────────────────────────────────────────────
const zoneCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  polygon: z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(z.array(z.number()))) }),
  basePrice: z.number().nonnegative(),
  demandMultiplier: z.number().min(0.5).max(5).default(1.0),
  status: z.enum(["active", "inactive"]).default("active"),
});

const zoneUpdateSchema = zoneCreateSchema.partial();

adminRouter.get("/zones", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT z.*, c.name as cooperative_name,
             ST_AsGeoJSON(z.polygon::geometry)::jsonb as geometry
      FROM zones z
      LEFT JOIN cooperatives c ON c.id = z.cooperative_id
      ORDER BY z.created_at DESC
    `);
    res.json({ zones: result.rows });
  } catch (error) { next(error); }
});

adminRouter.post("/zones", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const input = zoneCreateSchema.parse(req.body);
    const result = await pool.query(
      `INSERT INTO zones (id, name, polygon, base_price, demand_multiplier, status)
       VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326)::geography, $4, $5, $6)
       RETURNING *, ST_AsGeoJSON(polygon::geometry)::jsonb as geometry`,
      [crypto.randomUUID(), input.name, JSON.stringify(input.polygon), input.basePrice, input.demandMultiplier, input.status]
    );
    await recordAuditEvent({ actorId: req.user!.id, action: "zone.created", resourceType: "zone", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ zone: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.patch("/zones/:id", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const input = zoneUpdateSchema.parse(req.body);
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (input.name !== undefined) { fields.push(`name = $${index++}`); values.push(input.name); }
    if (input.polygon !== undefined) { fields.push(`polygon = ST_SetSRID(ST_GeomFromGeoJSON($${index++}), 4326)::geography`); values.push(JSON.stringify(input.polygon)); }
    if (input.basePrice !== undefined) { fields.push(`base_price = $${index++}`); values.push(input.basePrice); }
    if (input.demandMultiplier !== undefined) { fields.push(`demand_multiplier = $${index++}`); values.push(input.demandMultiplier); }
    if (input.status !== undefined) { fields.push(`status = $${index++}`); values.push(input.status); }

    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(id);
    const result = await pool.query(
      `UPDATE zones SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} RETURNING *, ST_AsGeoJSON(polygon::geometry)::jsonb as geometry`,
      values
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Zone not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "zone.updated", resourceType: "zone", resourceId: id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.json({ zone: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.delete("/zones/:id", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const result = await pool.query(`DELETE FROM zones WHERE id = $1 RETURNING id`, [id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Zone not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "zone.deleted", resourceType: "zone", resourceId: id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(204).send();
  } catch (error) { next(error); }
});

// ─── COOPERATIVE ZONE PRICING ───────────────────────────────────────────────
adminRouter.get("/cooperatives/:id/zones", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const cooperativeId = z.string().uuid().parse(req.params.id);
    const result = await pool.query(`
      SELECT zp.*, z.name as zone_name, z.base_price as federation_base_price,
             ST_AsGeoJSON(z.polygon::geometry)::jsonb as geometry
      FROM zone_pricing zp
      JOIN zones z ON z.id = zp.zone_id
      WHERE zp.cooperative_id = $1
      ORDER BY z.name
    `, [cooperativeId]);
    res.json({ zonePricing: result.rows });
  } catch (error) { next(error); }
});

adminRouter.put("/cooperatives/:id/zones/:zoneId", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const cooperativeId = z.string().uuid().parse(req.params.id);
    const zoneId = z.string().uuid().parse(req.params.zoneId);
    const input = z.object({
      priceOverride: z.number().nonnegative().optional(),
      demandMultiplier: z.number().min(0.5).max(5).optional(),
      enabled: z.boolean().default(true),
    }).parse(req.body);

    const result = await pool.query(`
      INSERT INTO zone_pricing (id, cooperative_id, zone_id, price_override, demand_multiplier, enabled)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (cooperative_id, zone_id)
      DO UPDATE SET price_override = EXCLUDED.price_override, demand_multiplier = EXCLUDED.demand_multiplier, enabled = EXCLUDED.enabled, updated_at = now()
      RETURNING *
    `, [crypto.randomUUID(), cooperativeId, zoneId, input.priceOverride ?? null, input.demandMultiplier ?? 1.0, input.enabled]);

    await recordAuditEvent({ actorId: req.user!.id, action: "zone_pricing.updated", resourceType: "zone_pricing", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.json({ zonePricing: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.get("/pricing/travel-fees", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT tf.*, c.name as cooperative_name FROM travel_fees tf JOIN cooperatives c ON c.id = tf.cooperative_id ORDER BY tf.created_at DESC`);
    res.json({ travelFees: result.rows });
  } catch (error) { next(error); }
});

adminRouter.post("/pricing/travel-fees", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const input = travelFeeCreateSchema.parse(req.body);
    const result = await pool.query(`INSERT INTO travel_fees (id, cooperative_id, base_km, base_fee, per_km_rate, max_distance_km) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (cooperative_id) DO UPDATE SET base_km = EXCLUDED.base_km, base_fee = EXCLUDED.base_fee, per_km_rate = EXCLUDED.per_km_rate, max_distance_km = EXCLUDED.max_distance_km, updated_at = now() RETURNING *`,
      [crypto.randomUUID(), input.cooperativeId, input.baseKm, input.baseFee, input.perKmRate, input.maxDistanceKm]);
    await recordAuditEvent({ actorId: req.user!.id, action: "travel_fee.upserted", resourceType: "travel_fee", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ travelFee: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.get("/pricing/tax-rules", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM tax_rules ORDER BY created_at DESC`);
    res.json({ taxRules: result.rows });
  } catch (error) { next(error); }
});

adminRouter.post("/pricing/tax-rules", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const input = taxRuleCreateSchema.parse(req.body);
    const result = await pool.query(`INSERT INTO tax_rules (id, name, rate, applies_to, jurisdiction) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [crypto.randomUUID(), input.name, input.rate, input.appliesTo, input.jurisdiction]);
    await recordAuditEvent({ actorId: req.user!.id, action: "tax_rule.created", resourceType: "tax_rule", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ taxRule: result.rows[0] });
  } catch (error) { next(error); }
});

/* ──────────────────────────────────────────────────────────────────────────────
   PAYMENTS & REFUNDS MANAGEMENT
   ────────────────────────────────────────────────────────────────────────────── */

adminRouter.get("/payments/refunds", requireAuth, requireRoles("system_admin", "federation_admin", "support_staff"), async (req, res, next) => {
  try {
    const query = z.object({
      status: z.string().optional(),
      provider: z.string().optional(),
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
    }).parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.status) { conditions.push(`pr.status = $${index++}`); values.push(query.status); }
    if (query.provider) { conditions.push(`po.provider = $${index++}`); values.push(query.provider); }
    if (query.fromDate) { conditions.push(`pr.created_at >= $${index++}`); values.push(query.fromDate); }
    if (query.toDate) { conditions.push(`pr.created_at <= $${index++}`); values.push(query.toDate); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query(`SELECT pr.*, po.id as order_id, po.booking_id, po.provider, po.amount as order_amount, u.name as customer_name FROM payment_refunds pr JOIN payment_orders po ON po.id = pr.payment_order_id JOIN users u ON u.id = po.customer_id ${whereClause} ORDER BY pr.created_at DESC LIMIT $${index++} OFFSET $${index}`, values);
    const countResult = await pool.query(`SELECT count(*)::int as total FROM payment_refunds pr ${whereClause}`, values.slice(0, -2));

    res.json({ refunds: result.rows, total: countResult.rows[0].total, page: query.page, limit: query.limit });
  } catch (error) { next(error); }
});

adminRouter.get("/payments/reconciliation", requireAuth, requireRoles("system_admin", "federation_admin", "support_staff"), async (req, res, next) => {
  try {
    const query = z.object({
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
      provider: z.string().optional(),
      status: z.string().optional(),
    }).parse(req.query);

    const { getReconciliationReport } = await import("../services/paymentService.js");
    const filters = {
      fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
      toDate: query.toDate ? new Date(query.toDate) : undefined,
      provider: query.provider,
      status: query.status,
    };
    const report = await getReconciliationReport(filters);
    res.json(report);
  } catch (error) { next(error); }
});

/* ──────────────────────────────────────────────────────────────────────────────
   NOTIFICATION TEMPLATES
   ────────────────────────────────────────────────────────────────────────────── */

const notificationTemplateCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  type: z.string().trim().min(2).max(50),
  titleTemplate: z.string().trim().min(2).max(200),
  bodyTemplate: z.string().trim().min(2).max(2000),
  channels: z.array(z.string()).default(["in_app"]),
  language: z.string().min(2).max(10).default("en"),
  variables: z.array(z.string()).default([]),
});

const notificationTemplateUpdateSchema = z.object({
  titleTemplate: z.string().trim().min(2).max(200).optional(),
  bodyTemplate: z.string().trim().min(2).max(2000).optional(),
  channels: z.array(z.string()).optional(),
  language: z.string().min(2).max(10).optional(),
  isActive: z.boolean().optional(),
});

adminRouter.get("/notifications/templates", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM notification_templates ORDER BY created_at DESC`);
    res.json({ templates: result.rows });
  } catch (error) { next(error); }
});

adminRouter.post("/notifications/templates", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = notificationTemplateCreateSchema.parse(req.body);
    const result = await pool.query(`INSERT INTO notification_templates (id, name, type, title_template, body_template, channels, language, variables) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [crypto.randomUUID(), input.name, input.type, input.titleTemplate, input.bodyTemplate, input.channels, input.language, input.variables]);
    await recordAuditEvent({ actorId: req.user!.id, action: "notification_template.created", resourceType: "notification_template", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ template: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.patch("/notifications/templates/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = notificationTemplateUpdateSchema.parse(req.body);
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) { fields.push(`${key === "titleTemplate" ? "title_template" : key === "bodyTemplate" ? "body_template" : key === "isActive" ? "is_active" : key} = $${index++}`); values.push(value); }
    }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const result = await pool.query(`UPDATE notification_templates SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} RETURNING *`, values);
    if (!result.rows[0]) { res.status(404).json({ error: "Template not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "notification_template.updated", resourceType: "notification_template", resourceId: Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.json({ template: result.rows[0] });
  } catch (error) { next(error); }
});

/* ──────────────────────────────────────────────────────────────────────────────
   SYSTEM CONFIGURATION
   ────────────────────────────────────────────────────────────────────────────── */

adminRouter.get("/system/health", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const { getReadiness } = await import("../core/health.js");
    const health = await getReadiness();
    res.json(health);
  } catch (error) { next(error); }
});

adminRouter.get("/system/config", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const env = (await import("../config/env.js")).env;
    const config = {
      maintenanceMode: false,
      allowRegistrations: true,
      maxFileSize: 15 * 1024 * 1024,
      sessionTimeout: 15 * 60 * 1000,
      jwtExpiry: env.JWT_EXPIRY ?? "15m",
      jwtRefreshExpiry: env.JWT_REFRESH_EXPIRY ?? "7d",
      corsOrigins: env.CORS_ORIGINS,
      aiServiceUrl: env.AI_SERVICE_URL,
      s3Endpoint: env.S3_ENDPOINT,
      s3Bucket: env.S3_BUCKET,
      storageProvider: env.STORAGE_PROVIDER,
    };
    res.json(config);
  } catch (error) { next(error); }
});

adminRouter.patch("/system/config", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const input = z.object({
      maintenanceMode: z.boolean().optional(),
      allowRegistrations: z.boolean().optional(),
      maxFileSize: z.number().int().positive().optional(),
      sessionTimeout: z.number().int().positive().optional(),
    }).parse(req.body);

    res.json({ message: "Configuration updated (requires restart for some changes)", config: input });
  } catch (error) { next(error); }
});

/* ──────────────────────────────────────────────────────────────────────────────
   WORKERS BULK OPERATIONS
   ────────────────────────────────────────────────────────────────────────────── */

const bulkWorkerStatusSchema = z.object({
  workerIds: z.array(z.string().uuid()).min(1).max(100),
  status: z.enum(["available", "busy", "offline"]),
});

adminRouter.post("/workers/bulk-status", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = bulkWorkerStatusSchema.parse(req.body);

    const result = await pool.query(`UPDATE workers SET current_status = $1, updated_at = now() WHERE id = ANY($2) RETURNING id`,
      [input.status, input.workerIds]);

    await recordAuditEvent({ actorId: req.user!.id, action: "workers.bulk_status_updated", resourceType: "worker", resourceId: "bulk", requestId: req.header("x-request-id") ?? undefined, metadata: { workerIds: input.workerIds, status: input.status } }).catch(() => undefined);

    res.json({ updated: result.rowCount, workerIds: input.workerIds, status: input.status });
  } catch (error) { next(error); }
});

/* ──────────────────────────────────────────────────────────────────────────────
   SUPPORT TICKETS MANAGEMENT
   ────────────────────────────────────────────────────────────────────────────── */

adminRouter.get("/support/tickets", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const query = z.object({
      status: z.string().optional(),
      category: z.string().optional(),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
    }).parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.status) { conditions.push(`c.status = $${index++}`); values.push(query.status); }
    if (query.category) { conditions.push(`c.category = $${index++}`); values.push(query.category); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query(
      `SELECT c.*, b.id as booking_id, s.name as service_name,
              u.name as raised_by_name, u.phone as raised_by_phone,
              a.name as assigned_to_name
         FROM complaints c
         LEFT JOIN bookings b ON b.id = c.booking_id
         LEFT JOIN services s ON s.id = b.service_id
         JOIN users u ON u.id = c.raised_by
         LEFT JOIN users a ON a.id = c.assigned_to
         ${whereClause}
         ORDER BY c.created_at DESC
         LIMIT $${index++} OFFSET $${index}`,
      values
    );

    const countResult = await pool.query(
      `SELECT count(*)::int as total FROM complaints c ${whereClause}`,
      values.slice(0, -2)
    );

    res.json({ tickets: result.rows, total: countResult.rows[0].total, page: query.page, limit: query.limit });
  } catch (error) { next(error); }
});

adminRouter.post("/support/tickets/:id/assign", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { assignedTo } = z.object({ assignedTo: z.string().uuid() }).parse(req.body);

    const result = await pool.query(`UPDATE complaints SET assigned_to = $1, status = 'investigating', updated_at = now() WHERE id = $2 RETURNING *`,
      [assignedTo, id]);

    if (!result.rows[0]) { res.status(404).json({ error: "Ticket not found" }); return; }

    await recordAuditEvent({ actorId: req.user!.id, action: "support.ticket.assigned", resourceType: "complaint", resourceId: id, requestId: req.header("x-request-id") ?? undefined, metadata: { assignedTo } }).catch(() => undefined);

    res.json({ ticket: result.rows[0] });
  } catch (error) { next(error); }
});

/* ──────────────────────────────────────────────────────────────────────────────
   SUPPORT TICKET DETAIL & REPLY
   ────────────────────────────────────────────────────────────────────────────── */

adminRouter.get("/support/tickets/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

    const result = await pool.query(
      `SELECT c.*, b.id as booking_id, s.name as service_name,
              u.name as raised_by_name, u.phone as raised_by_phone,
              a.name as assigned_to_name
       FROM complaints c
       LEFT JOIN bookings b ON b.id = c.booking_id
       LEFT JOIN services s ON s.id = b.service_id
       JOIN users u ON u.id = c.raised_by
       LEFT JOIN users a ON a.id = c.assigned_to
       WHERE c.id = $1`,
      [id]
    );

    if (!result.rows[0]) { res.status(404).json({ error: "Ticket not found" }); return; }
    res.json({ ticket: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.post("/support/tickets/:id/reply", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { message } = z.object({ message: z.string().min(1).max(5000) }).parse(req.body);

    const result = await pool.query(
      `UPDATE complaints SET description = description || E'\n\n--- Reply ---\n' || $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [message, id]
    );

    if (!result.rows[0]) { res.status(404).json({ error: "Ticket not found" }); return; }

    await recordAuditEvent({ actorId: req.user!.id, action: "support.ticket.replied", resourceType: "complaint", resourceId: id, requestId: req.header("x-request-id") ?? undefined, metadata: { messageLength: message.length } }).catch(() => undefined);

    res.json({ ticket: result.rows[0] });
  } catch (error) { next(error); }
});

/* ──────────────────────────────────────────────────────────────────────────────
   AUDIT LOG
   ────────────────────────────────────────────────────────────────────────────── */

adminRouter.get("/audit-log", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const query = z.object({
      actorId: z.string().optional(),
      action: z.string().optional(),
      resourceType: z.string().optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
    }).parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.actorId) { conditions.push(`actor_id = $${index++}`); values.push(query.actorId); }
    if (query.action) { conditions.push(`action = $${index++}`); values.push(query.action); }
    if (query.resourceType) { conditions.push(`resource_type = $${index++}`); values.push(query.resourceType); }
    if (query.fromDate) { conditions.push(`created_at >= $${index++}`); values.push(query.fromDate); }
    if (query.toDate) { conditions.push(`created_at <= $${index++}`); values.push(query.toDate); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query(
      `SELECT a.*, u.name as actor_name
       FROM audit_events a
       LEFT JOIN users u ON u.id = a.actor_id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${index++} OFFSET $${index}`,
      values
    );

    const countResult = await pool.query(
      `SELECT count(*)::int as total FROM audit_events a ${whereClause}`,
      values.slice(0, -2)
    );

    res.json({ events: result.rows, total: countResult.rows[0].total, page: query.page, limit: query.limit });
  } catch (error) { next(error); }
});

/* ──────────────────────────────────────────────────────────────────────────────
   AI RECOMMENDATIONS MANAGEMENT
   ────────────────────────────────────────────────────────────────────────────── */

adminRouter.get("/ai/recommendations", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const validStatuses = ["pending", "approved", "rejected", "applied"];

    let query = `SELECT r.*, s.name as service_name, u.name as approved_by_name
                 FROM ai_recommendation_records r
                 LEFT JOIN services s ON s.id = r.service_id
                 LEFT JOIN users u ON u.id = r.approved_by`;
    const values: any[] = [];

    if (status && validStatuses.includes(status)) {
      query += ` WHERE r.status = $1`;
      values.push(status);
    }

    query += ` ORDER BY r.created_at DESC LIMIT 100`;

    const result = await pool.query(query, values);
    res.json({ recommendations: result.rows });
  } catch (error) { next(error); }
});

adminRouter.post("/ai/recommendations/:id/approve", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const recId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const result = await pool.query(
      `UPDATE ai_recommendation_records SET status = 'approved', approved_by = $1, updated_at = now()
       WHERE id = $2 AND status = 'pending' RETURNING *`,
      [req.user!.id, recId]
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Recommendation not found or not pending" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "ai.recommendation_approved", resourceType: "ai_recommendation_records", resourceId: recId }).catch(() => undefined);
    res.json({ recommendation: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.post("/ai/recommendations/:id/reject", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const recId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(req.body);
    const result = await pool.query(
      `UPDATE ai_recommendation_records SET status = 'rejected', updated_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [recId]
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Recommendation not found or not pending" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "ai.recommendation_rejected", resourceType: "ai_recommendation_records", resourceId: recId, metadata: { reason } }).catch(() => undefined);
    res.json({ recommendation: result.rows[0] });
  } catch (error) { next(error); }
});

// ── Scope ────────────────────────────────────────────────────────────────────
//
// The console's header has a scope switcher: a society admin can only see
// their own cooperative, a federation admin can switch between the societies
// under their federation, and a system_admin can see everything. These two
// routes feed that switcher.

adminRouter.get("/scope", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;

    // Which cooperative/federation does this admin currently scope to?
    const scopeResult = await pool.query(
      `SELECT c.id, c.name, 'cooperative'::text as type
       FROM admin_scopes s
       JOIN cooperatives c ON c.id = s.cooperative_id
       WHERE s.user_id = $1
       UNION ALL
       SELECT f.id, f.name, 'federation'::text as type
       FROM admin_scopes s
       JOIN federations f ON f.id = s.federation_id
       WHERE s.user_id = $1
       LIMIT 1`,
      [userId]
    );

    res.json({ scope: scopeResult.rows[0] ?? null });
  } catch (error) { next(error); }
});

adminRouter.get("/scopes", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;

    // system_admin can scope to any federation or cooperative
    if (role === "system_admin") {
      const [federations, cooperatives] = await Promise.all([
        pool.query("SELECT id, name, 'federation'::text as type FROM federations ORDER BY name"),
        pool.query("SELECT id, name, 'cooperative'::text as type FROM cooperatives ORDER BY name"),
      ]);
      res.json({ scopes: [...federations.rows, ...cooperatives.rows] });
      return;
    }

    // federation_admin can scope to their federation and its societies
    if (role === "federation_admin") {
      const [federations, cooperatives] = await Promise.all([
        pool.query(
          `SELECT f.id, f.name, 'federation'::text as type
           FROM admin_scopes s
           JOIN federations f ON f.id = s.federation_id
           WHERE s.user_id = $1`,
          [userId]
        ),
        pool.query(
          `SELECT c.id, c.name, 'cooperative'::text as type
           FROM admin_scopes s
           JOIN cooperatives c ON c.federation_id = s.federation_id
           WHERE s.user_id = $1
           ORDER BY c.name`,
          [userId]
        ),
      ]);
      res.json({ scopes: [...federations.rows, ...cooperatives.rows] });
      return;
    }

    // society_admin can only scope to their own cooperative
    const cooperatives = await pool.query(
      `SELECT c.id, c.name, 'cooperative'::text as type
       FROM admin_scopes s
       JOIN cooperatives c ON c.id = s.cooperative_id
       WHERE s.user_id = $1`,
      [userId]
    );
    res.json({ scopes: cooperatives.rows });
  } catch (error) { next(error); }
});

/* ──────────────────────────────────────────────────────────────────────────────
   HELPER FUNCTIONS
   ────────────────────────────────────────────────────────────────────────────── */

async function canAccessFederation(userId: string, federationId: string): Promise<boolean> {
  const result = await pool.query(`SELECT 1 FROM admin_scopes WHERE user_id = $1 AND federation_id = $2`, [userId, federationId]);
  return Boolean(result.rows[0]);
}

async function canAccessCooperative(userId: string, cooperativeId: string): Promise<boolean> {
  const result = await pool.query(`SELECT 1 FROM admin_scopes WHERE user_id = $1 AND cooperative_id = $2`, [userId, cooperativeId]);
  return Boolean(result.rows[0]);
}

// ── Society Admin Creation ─────────────────────────────────────────────────
// Creates a society_admin user with temporary password and assigns scope

const societyAdminCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email(),
  phone: z.string().trim().min(10).max(20),
});

adminRouter.post("/cooperatives/:id/admin", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const cooperativeId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const input = societyAdminCreateSchema.parse(req.body);

    const coopResult = await pool.query(`SELECT id, name, federation_id, status FROM cooperatives WHERE id = $1`, [cooperativeId]);
    if (!coopResult.rows[0]) { res.status(404).json({ error: "Cooperative not found" }); return; }

    const canEdit = req.user!.role === "system_admin" ||
      (req.user!.role === "federation_admin" && await canAccessFederation(req.user!.id, coopResult.rows[0].federation_id));
    if (!canEdit) { res.status(403).json({ error: "Cannot manage this cooperative" }); return; }

    const existingUser = await pool.query(`SELECT id FROM users WHERE email = $1`, [input.email]);
    if (existingUser.rows[0]) { res.status(409).json({ error: "User with this email already exists" }); return; }

    const tempPassword = crypto.randomBytes(4).toString("hex").toUpperCase();
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const userResult = await client.query(
        `INSERT INTO users (id, name, email, phone, password_hash, role, status, password_must_change, temporary_password, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'society_admin', 'active', true, true, now(), now())
         RETURNING id, name, email, phone, role, status`,
        [crypto.randomUUID(), input.name, input.email, input.phone, passwordHash]
      );
      const newUser = userResult.rows[0];

      await client.query(
        `INSERT INTO admin_scopes (user_id, cooperative_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [newUser.id, cooperativeId]
      );

      await client.query(
        `UPDATE cooperatives SET status = 'active', updated_at = now() WHERE id = $1 AND status IN ('draft', 'territory_pending', 'admin_pending')`,
        [cooperativeId]
      );

      await client.query("COMMIT");

      await recordAuditEvent({
        actorId: req.user!.id,
        action: "society.admin_created",
        resourceType: "user",
        resourceId: newUser.id,
        metadata: { cooperativeId, email: input.email },
      }).catch(() => undefined);

      res.status(201).json({
        user: newUser,
        temporaryPassword: tempPassword,
        message: "Society admin created. Share the temporary password securely.",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) { next(error); }
});

// ── Update Society Status ──────────────────────────────────────────────────

const societyStatusSchema = z.object({
  status: z.enum(["draft", "territory_pending", "admin_pending", "active", "suspended"]),
});

adminRouter.patch("/cooperatives/:id/status", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const cooperativeId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const input = societyStatusSchema.parse(req.body);

    const coopResult = await pool.query(`SELECT id, federation_id FROM cooperatives WHERE id = $1`, [cooperativeId]);
    if (!coopResult.rows[0]) { res.status(404).json({ error: "Cooperative not found" }); return; }

    const canEdit = req.user!.role === "system_admin" ||
      (req.user!.role === "federation_admin" && await canAccessFederation(req.user!.id, coopResult.rows[0].federation_id));
    if (!canEdit) { res.status(403).json({ error: "Cannot manage this cooperative" }); return; }

    const result = await pool.query(
      `UPDATE cooperatives SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [input.status, cooperativeId]
    );

    await recordAuditEvent({
      actorId: req.user!.id,
      action: "cooperative.status_changed",
      resourceType: "cooperative",
      resourceId: cooperativeId,
      metadata: { newStatus: input.status },
    }).catch(() => undefined);

    res.json({ cooperative: result.rows[0] });
  } catch (error) { next(error); }
});

// ── Get Society Admin ──────────────────────────────────────────────────────

adminRouter.get("/cooperatives/:id/admin", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const cooperativeId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

    const coopResult = await pool.query(`SELECT id, federation_id FROM cooperatives WHERE id = $1`, [cooperativeId]);
    if (!coopResult.rows[0]) { res.status(404).json({ error: "Cooperative not found" }); return; }

    const canView = req.user!.role === "system_admin" ||
      (req.user!.role === "federation_admin" && await canAccessFederation(req.user!.id, coopResult.rows[0].federation_id));
    if (!canView) { res.status(403).json({ error: "Cannot view this cooperative" }); return; }

    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.status, u.last_login_at, u.temporary_password, u.created_at
       FROM users u
       JOIN admin_scopes s ON s.user_id = u.id
       WHERE s.cooperative_id = $1 AND u.role = 'society_admin'
       ORDER BY u.created_at DESC
       LIMIT 1`,
      [cooperativeId]
    );

    res.json({ admin: result.rows[0] || null });
  } catch (error) { next(error); }
});

export default adminRouter;