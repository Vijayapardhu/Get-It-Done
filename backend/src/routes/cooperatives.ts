import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

/**
 * @openapi
 * /cooperatives/federations:
 *   post:
 *     summary: Create federation (system_admin)
 *     tags: [Cooperatives]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [name, code, state], properties: { name: { type: string }, code: { type: string }, state: { type: string }, contactEmail: { type: string }, contactPhone: { type: string }, address: { type: string } } }
 *     responses:
 *       201: { description: Federation created }
 *   get:
 *     summary: List federations
 *     tags: [Cooperatives]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of federations }
 * /cooperatives/federations/{id}:
 *   get:
 *     summary: Get federation with cooperatives
 *     tags: [Cooperatives]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Federation details }
 *       404: { description: Not found }
 *   patch:
 *     summary: Update federation (system_admin)
 *     tags: [Cooperatives]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { name: { type: string }, code: { type: string }, state: { type: string }, contactEmail: { type: string }, contactPhone: { type: string }, address: { type: string } } }
 *     responses:
 *       200: { description: Updated federation }
 * /cooperatives/societies:
 *   post:
 *     summary: Create cooperative (system_admin, federation_admin)
 *     tags: [Cooperatives]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [name, code, district, state, federationId], properties: { name: { type: string }, code: { type: string }, district: { type: string }, state: { type: string }, federationId: { type: string, format: uuid }, contactEmail: { type: string }, contactPhone: { type: string }, address: { type: string }, commissionRate: { type: number }, minWorkers: { type: integer }, maxWorkers: { type: integer } } }
 *     responses:
 *       201: { description: Cooperative created }
 *   get:
 *     summary: List cooperatives (with federation filter)
 *     tags: [Cooperatives]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: federationId
 *         in: query
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: List of cooperatives }
 * /cooperatives/societies/{id}:
 *   get:
 *     summary: Get cooperative details
 *     tags: [Cooperatives]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Cooperative details }
 *       404: { description: Not found }
 *   patch:
 *     summary: Update cooperative
 *     tags: [Cooperatives]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { name: { type: string }, code: { type: string }, district: { type: string }, state: { type: string }, contactEmail: { type: string }, contactPhone: { type: string }, address: { type: string }, commissionRate: { type: number }, minWorkers: { type: integer }, maxWorkers: { type: integer } } }
 *     responses:
 *       200: { description: Updated cooperative }
 * /cooperatives/societies/{id}/members:
 *   post:
 *     summary: Add member to cooperative
 *     tags: [Cooperatives]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [userId], properties: { userId: { type: string, format: uuid }, role: { type: string, enum: [member, admin, supervisor] } } }
 *     responses:
 *       201: { description: Member added }
 *   get:
 *     summary: List cooperative members
 *     tags: [Cooperatives]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: List of members }
 * /cooperatives/memberships/{userId}/{cooperativeId}:
 *   patch:
 *     summary: Update membership
 *     tags: [Cooperatives]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: userId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: cooperativeId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { status: { type: string, enum: [active, inactive, suspended] }, role: { type: string, enum: [member, admin, supervisor] } } }
 *     responses:
 *       200: { description: Membership updated }
 *   delete:
 *     summary: Remove member from cooperative
 *     tags: [Cooperatives]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: userId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: cooperativeId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Member removed }
 */

export const cooperativesRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
cooperativesRouter.param("id", rejectNonUuidParam);
cooperativesRouter.param("userId", rejectNonUuidParam);
cooperativesRouter.param("cooperativeId", rejectNonUuidParam);

const federationCreateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9_]+$/),
  state: z.string().trim().min(2).max(100),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

const federationUpdateSchema = federationCreateSchema.partial();

const cooperativeCreateSchema = z.object({
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

const cooperativeUpdateSchema = cooperativeCreateSchema.partial();

const membershipSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["member", "admin", "supervisor"]).default("member"),
});

const workerMembershipSchema = z.object({
  workerId: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected", "suspended"]).default("pending"),
});

cooperativesRouter.post("/federations", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const input = federationCreateSchema.parse(req.body);
    const result = await pool.query(`INSERT INTO federations (id, name, code, state, contact_email, contact_phone, address) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [crypto.randomUUID(), input.name, input.code, input.state, input.contactEmail ?? null, input.contactPhone ?? null, input.address ?? null]);
    await recordAuditEvent({ actorId: req.user!.id, action: "federation.created", resourceType: "federation", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ federation: result.rows[0] });
  } catch (error) { next(error); }
});

cooperativesRouter.get("/federations", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM federations ORDER BY created_at DESC`);
    res.json({ federations: result.rows });
  } catch (error) { next(error); }
});

cooperativesRouter.get("/federations/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM federations WHERE id = $1`, [req.params.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Federation not found" }); return; }
    const cooperatives = await pool.query(`SELECT * FROM cooperatives WHERE federation_id = $1`, [req.params.id]);
    res.json({ federation: result.rows[0], cooperatives: cooperatives.rows });
  } catch (error) { next(error); }
});

cooperativesRouter.patch("/federations/:id", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const input = federationUpdateSchema.parse(req.body);
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    const fieldMap: Record<string, string> = { contactEmail: "contact_email", contactPhone: "contact_phone" };
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) { fields.push(`${fieldMap[key] ?? key} = $${index++}`); values.push(value); }
    }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(req.params.id);
    const result = await pool.query(`UPDATE federations SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} RETURNING *`, values);
    if (!result.rows[0]) { res.status(404).json({ error: "Federation not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "federation.updated", resourceType: "federation", resourceId: String(req.params.id), requestId: req.header("x-request-id") ?? undefined, metadata: { fields: Object.keys(input) } }).catch(() => undefined);
    res.json({ federation: result.rows[0] });
  } catch (error) { next(error); }
});

cooperativesRouter.post("/societies", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const input = cooperativeCreateSchema.parse(req.body);
    const canCreate = req.user!.role === "system_admin" || (req.user!.role === "federation_admin" && await canAccessFederation(req.user!.id, input.federationId));
    if (!canCreate) { res.status(403).json({ error: "Cannot create cooperative in this federation" }); return; }
    const result = await pool.query(`INSERT INTO cooperatives (id, name, code, district, state, federation_id, contact_email, contact_phone, address, commission_rate, min_workers, max_workers) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`, [crypto.randomUUID(), input.name, input.code, input.district, input.state, input.federationId, input.contactEmail ?? null, input.contactPhone ?? null, input.address ?? null, input.commissionRate, input.minWorkers, input.maxWorkers]);
    await recordAuditEvent({ actorId: req.user!.id, action: "cooperative.created", resourceType: "cooperative", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ cooperative: result.rows[0] });
  } catch (error) { next(error); }
});

cooperativesRouter.get("/societies", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const federationId = req.query.federationId as string | undefined;
    let query = `SELECT c.*, f.name as federation_name FROM cooperatives c LEFT JOIN federations f ON f.id = c.federation_id`;
    const values: unknown[] = [];
    if (federationId) { query += ` WHERE c.federation_id = $1`; values.push(federationId); }
    else if (req.user!.role === "federation_admin") { const fed = await getUserFederation(req.user!.id); if (fed) { query += ` WHERE c.federation_id = $1`; values.push(fed); } }
    else if (req.user!.role === "society_admin") { const coop = await getUserCooperative(req.user!.id); if (coop) { query += ` WHERE c.id = $1`; values.push(coop); } }
    query += ` ORDER BY c.created_at DESC`;
    const result = await pool.query(query, values);
    res.json({ cooperatives: result.rows });
  } catch (error) { next(error); }
});

cooperativesRouter.get("/societies/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const cooperativeId = String(req.params.id);
    const result = await pool.query(`SELECT c.*, f.name as federation_name FROM cooperatives c LEFT JOIN federations f ON f.id = c.federation_id WHERE c.id = $1`, [cooperativeId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Cooperative not found" }); return; }
    const canView = req.user!.role === "system_admin" || (req.user!.role === "federation_admin" && await canAccessFederation(req.user!.id, result.rows[0].federation_id)) || (req.user!.role === "society_admin" && await canAccessCooperative(req.user!.id, cooperativeId));
    if (!canView) { res.status(403).json({ error: "Cannot view this cooperative" }); return; }
    res.json({ cooperative: result.rows[0] });
  } catch (error) { next(error); }
});

cooperativesRouter.patch("/societies/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const cooperativeId = String(req.params.id);
    const input = cooperativeUpdateSchema.parse(req.body);
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

cooperativesRouter.post("/societies/:id/members", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const cooperativeId = String(req.params.id);
    const input = membershipSchema.parse(req.body);
    const cooperative = await pool.query(`SELECT * FROM cooperatives WHERE id = $1`, [cooperativeId]);
    if (!cooperative.rows[0]) { res.status(404).json({ error: "Cooperative not found" }); return; }
    const canManage = req.user!.role === "system_admin" || (req.user!.role === "federation_admin" && await canAccessFederation(req.user!.id, cooperative.rows[0].federation_id)) || (req.user!.role === "society_admin" && await canAccessCooperative(req.user!.id, cooperativeId));
    if (!canManage) { res.status(403).json({ error: "Cannot manage members of this cooperative" }); return; }
    const result = await pool.query(`INSERT INTO cooperative_members (user_id, cooperative_id, role) VALUES ($1, $2, $3) ON CONFLICT (user_id, cooperative_id) DO UPDATE SET role = EXCLUDED.role, status = 'active' RETURNING *`, [input.userId, cooperativeId, input.role]);
    await recordAuditEvent({ actorId: req.user!.id, action: "cooperative.member_added", resourceType: "cooperative", resourceId: cooperativeId, requestId: req.header("x-request-id") ?? undefined, metadata: { userId: input.userId, role: input.role } }).catch(() => undefined);
    res.status(201).json({ member: result.rows[0] });
  } catch (error) { next(error); }
});

cooperativesRouter.get("/societies/:id/members", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const cooperativeId = String(req.params.id);
    const cooperative = await pool.query(`SELECT * FROM cooperatives WHERE id = $1`, [cooperativeId]);
    if (!cooperative.rows[0]) { res.status(404).json({ error: "Cooperative not found" }); return; }
    const canView = req.user!.role === "system_admin" || (req.user!.role === "federation_admin" && await canAccessFederation(req.user!.id, cooperative.rows[0].federation_id)) || (req.user!.role === "society_admin" && await canAccessCooperative(req.user!.id, cooperativeId));
    if (!canView) { res.status(403).json({ error: "Cannot view members of this cooperative" }); return; }
    const result = await pool.query(`SELECT cm.*, u.name, u.email, u.phone FROM cooperative_members cm JOIN users u ON u.id = cm.user_id WHERE cm.cooperative_id = $1 ORDER BY cm.joined_at DESC`, [cooperativeId]);
    res.json({ members: result.rows });
  } catch (error) { next(error); }
});

cooperativesRouter.patch("/memberships/:userId/:cooperativeId", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const userId = String(req.params.userId);
    const cooperativeId = String(req.params.cooperativeId);
    const input = z.object({ status: z.enum(["active", "inactive", "suspended"]).optional(), role: z.enum(["member", "admin", "supervisor"]).optional() }).parse(req.body);
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) { fields.push(`${key} = $${index++}`); values.push(value); }
    }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    await pool.query(`UPDATE cooperative_members SET ${fields.join(", ")} WHERE user_id = $1 AND cooperative_id = $2`, [userId, cooperativeId]);
    res.json({ message: "Membership updated" });
  } catch (error) { next(error); }
});

cooperativesRouter.delete("/memberships/:userId/:cooperativeId", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const userId = String(req.params.userId);
    const cooperativeId = String(req.params.cooperativeId);
    await pool.query(`DELETE FROM cooperative_members WHERE user_id = $1 AND cooperative_id = $2`, [userId, cooperativeId]);
    await recordAuditEvent({ actorId: req.user!.id, action: "cooperative.member_removed", resourceType: "cooperative", resourceId: cooperativeId, requestId: req.header("x-request-id") ?? undefined, metadata: { userId } }).catch(() => undefined);
    res.status(204).send();
  } catch (error) { next(error); }
});

async function canAccessFederation(userId: string, federationId: string): Promise<boolean> {
  const result = await pool.query(`SELECT 1 FROM admin_scopes WHERE user_id = $1 AND federation_id = $2`, [userId, federationId]);
  return Boolean(result.rows[0]);
}

async function canAccessCooperative(userId: string, cooperativeId: string): Promise<boolean> {
  const result = await pool.query(`SELECT 1 FROM admin_scopes WHERE user_id = $1 AND cooperative_id = $2`, [userId, cooperativeId]);
  return Boolean(result.rows[0]);
}

async function getUserFederation(userId: string): Promise<string | null> {
  const result = await pool.query(`SELECT federation_id FROM admin_scopes WHERE user_id = $1`, [userId]);
  return result.rows[0]?.federation_id ?? null;
}

async function getUserCooperative(userId: string): Promise<string | null> {
  const result = await pool.query(`SELECT cooperative_id FROM admin_scopes WHERE user_id = $1`, [userId]);
  return result.rows[0]?.cooperative_id ?? null;
}