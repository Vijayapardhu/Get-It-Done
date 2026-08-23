import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";

/**
 * @openapi
 * /institutions:
 *   post:
 *     summary: Create organization
 *     tags: [Institutions]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [name, type], properties: { name: { type: string }, type: { type: string, enum: [school, apartment, office, government, ngo, hospital, hotel, other] }, registrationNumber: { type: string }, gstNumber: { type: string }, address: { type: string }, contactPerson: { type: string }, contactEmail: { type: string }, contactPhone: { type: string }, billingAddress: { type: string } } }
 *     responses:
 *       201: { description: Organization created }
 *   get:
 *     summary: List user's organizations
 *     tags: [Institutions]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of organizations }
 * /institutions/{id}:
 *   get:
 *     summary: Get organization with addresses, contracts, plans
 *     tags: [Institutions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Organization details }
 *       404: { description: Not found }
 *   patch:
 *     summary: Update organization (admin)
 *     tags: [Institutions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { name: { type: string }, type: { type: string, enum: [school, apartment, office, government, ngo, hospital, hotel, other] }, registrationNumber: { type: string }, gstNumber: { type: string }, address: { type: string }, contactPerson: { type: string }, contactEmail: { type: string }, contactPhone: { type: string }, billingAddress: { type: string } } }
 *     responses:
 *       200: { description: Updated organization }
 * /institutions/{id}/members:
 *   post:
 *     summary: Add member to organization
 *     tags: [Institutions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [userId], properties: { userId: { type: string, format: uuid }, role: { type: string, enum: [admin, member, viewer] } } }
 *     responses:
 *       201: { description: Member added }
 *   delete:
 *     summary: Remove member from organization
 *     tags: [Institutions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: userId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Member removed }
 * /institutions/{id}/addresses:
 *   post:
 *     summary: Add address to organization
 *     tags: [Institutions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [name, address], properties: { name: { type: string }, address: { type: string }, latitude: { type: number }, longitude: { type: number }, isDefault: { type: boolean }, instructions: { type: string } } }
 *     responses:
 *       201: { description: Address added }
 * /institutions/{id}/contracts:
 *   post:
 *     summary: Create service contract
 *     tags: [Institutions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [serviceId, startDate], properties: { serviceId: { type: string, format: uuid }, variantId: { type: string, format: uuid }, pricingRuleId: { type: string, format: uuid }, startDate: { type: string, format: date }, endDate: { type: string, format: date }, terms: { type: string } } }
 *     responses:
 *       201: { description: Contract created }
 * /institutions/{id}/plans:
 *   post:
 *     summary: Create service plan
 *     tags: [Institutions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [name, services, frequency], properties: { name: { type: string }, services: { type: array }, frequency: { type: string, enum: [daily, weekly, monthly, custom] }, preferredDays: { type: array, items: { type: integer } }, preferredTimeStart: { type: string }, preferredTimeEnd: { type: string } } }
 *     responses:
 *       201: { description: Plan created }
 * /institutions/{id}/purchase-orders:
 *   post:
 *     summary: Create purchase order
 *     tags: [Institutions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [poNumber, amount], properties: { contractId: { type: string, format: uuid }, poNumber: { type: string }, amount: { type: number }, validUntil: { type: string, format: date-time } } }
 *     responses:
 *       201: { description: Purchase order created }
 * /institutions/{id}/bookings:
 *   get:
 *     summary: List organization bookings
 *     tags: [Institutions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: page
 *         in: query
 *         schema: { type: integer }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: List of bookings }
 * /institutions/{id}/invoices:
 *   get:
 *     summary: List organization invoices
 *     tags: [Institutions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: page
 *         in: query
 *         schema: { type: integer }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: List of invoices }
 */

export const institutionsRouter = Router();

const orgCreateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  type: z.enum(["school", "apartment", "office", "government", "ngo", "hospital", "hotel", "other"]),
  registrationNumber: z.string().trim().optional(),
  gstNumber: z.string().trim().optional(),
  address: z.string().trim().optional(),
  contactPerson: z.string().trim().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().trim().optional(),
  billingAddress: z.string().trim().optional(),
});

const orgUpdateSchema = orgCreateSchema.partial();

const addressSchema = z.object({
  name: z.string().trim().min(2).max(100),
  address: z.string().trim().min(5).max(500),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isDefault: z.boolean().default(false),
  instructions: z.string().trim().max(500).optional(),
});

const contractSchema = z.object({
  serviceId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  pricingRuleId: z.string().uuid().optional(),
  startDate: z.string().date(),
  endDate: z.string().date().optional(),
  terms: z.string().trim().optional(),
});

const planSchema = z.object({
  name: z.string().trim().min(2).max(200),
  services: z.array(z.object({
    serviceId: z.string().uuid(),
    frequency: z.string().optional(),
    preferredDays: z.array(z.number().int().min(0).max(6)).optional(),
    preferredTimeStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
    preferredTimeEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  })).min(1),
  frequency: z.enum(["daily", "weekly", "monthly", "custom"]),
  preferredDays: z.array(z.number().int().min(0).max(6)).default([]),
  preferredTimeStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  preferredTimeEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
});

const poSchema = z.object({
  contractId: z.string().uuid().optional(),
  poNumber: z.string().trim().min(4).max(50),
  amount: z.number().positive().max(100000000),
  validUntil: z.string().datetime().optional(),
});

institutionsRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    if (!["institutional_customer", "system_admin"].includes(req.user!.role)) {
      res.status(403).json({ error: "Only institutional customers can create organizations" });
      return;
    }
    const input = orgCreateSchema.parse(req.body);
    const result = await pool.query(`INSERT INTO organizations (id, name, type, registration_number, gst_number, address, contact_person, contact_email, contact_phone, billing_address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [crypto.randomUUID(), input.name, input.type, input.registrationNumber ?? null, input.gstNumber ?? null, input.address ?? null, input.contactPerson ?? null, input.contactEmail ?? null, input.contactPhone ?? null, input.billingAddress ?? null]);

    await pool.query(`INSERT INTO organization_members (organization_id, user_id, role, invited_by) VALUES ($1, $2, 'admin', $2)`, [result.rows[0].id, req.user!.id]);
    await recordAuditEvent({ actorId: req.user!.id, action: "organization.created", resourceType: "organization", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ organization: result.rows[0] });
  } catch (error) { next(error); }
});

institutionsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    let query = `SELECT o.*, om.role as user_role FROM organizations o JOIN organization_members om ON om.organization_id = o.id WHERE om.user_id = $1`;
    const result = await pool.query(query, [req.user!.id]);
    res.json({ organizations: result.rows });
  } catch (error) { next(error); }
});

institutionsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const orgId = String(req.params.id);
    const result = await pool.query(`SELECT o.*, om.role as user_role FROM organizations o JOIN organization_members om ON om.organization_id = o.id WHERE o.id = $1 AND om.user_id = $2`, [orgId, req.user!.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Organization not found" }); return; }
    const addresses = await pool.query(`SELECT * FROM organization_addresses WHERE organization_id = $1`, [orgId]);
    const contracts = await pool.query(`SELECT sc.*, s.name as service_name FROM service_contracts sc JOIN services s ON s.id = sc.service_id WHERE sc.organization_id = $1`, [orgId]);
    const plans = await pool.query(`SELECT * FROM service_plans WHERE organization_id = $1`, [orgId]);
    res.json({ organization: result.rows[0], addresses: addresses.rows, contracts: contracts.rows, plans: plans.rows });
  } catch (error) { next(error); }
});

institutionsRouter.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const orgId = String(req.params.id);
    const member = await pool.query(`SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`, [orgId, req.user!.id]);
    if (!member.rows[0] || !["admin"].includes(member.rows[0].role)) { res.status(403).json({ error: "Admin access required" }); return; }
    const input = orgUpdateSchema.parse(req.body);
    const fields: string[] = []; const values: unknown[] = []; let index = 1;
    const fieldMap: Record<string, string> = { registrationNumber: "registration_number", gstNumber: "gst_number", contactPerson: "contact_person", contactEmail: "contact_email", contactPhone: "contact_phone", billingAddress: "billing_address" };
    for (const [key, value] of Object.entries(input)) { if (value !== undefined) { fields.push(`${fieldMap[key] ?? key} = $${index++}`); values.push(value); } }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(orgId);
    const result = await pool.query(`UPDATE organizations SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} RETURNING *`, values);
    await recordAuditEvent({ actorId: req.user!.id, action: "organization.updated", resourceType: "organization", resourceId: orgId, requestId: req.header("x-request-id") ?? undefined, metadata: { fields: Object.keys(input) } }).catch(() => undefined);
    res.json({ organization: result.rows[0] });
  } catch (error) { next(error); }
});

institutionsRouter.post("/:id/members", requireAuth, async (req, res, next) => {
  try {
    const orgId = String(req.params.id);
    const member = await pool.query(`SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`, [orgId, req.user!.id]);
    if (!member.rows[0] || !["admin"].includes(member.rows[0].role)) { res.status(403).json({ error: "Admin access required" }); return; }
    const input = z.object({ userId: z.string().uuid(), role: z.enum(["admin", "member", "viewer"]).default("member") }).parse(req.body);
    const result = await pool.query(`INSERT INTO organization_members (organization_id, user_id, role, invited_by) VALUES ($1, $2, $3, $4) ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role RETURNING *`, [orgId, input.userId, input.role, req.user!.id]);
    await recordAuditEvent({ actorId: req.user!.id, action: "organization.member_added", resourceType: "organization", resourceId: orgId, requestId: req.header("x-request-id") ?? undefined, metadata: { userId: input.userId, role: input.role } }).catch(() => undefined);
    res.status(201).json({ member: result.rows[0] });
  } catch (error) { next(error); }
});

institutionsRouter.delete("/:id/members/:userId", requireAuth, async (req, res, next) => {
  try {
    const orgId = String(req.params.id);
    const member = await pool.query(`SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`, [orgId, req.user!.id]);
    if (!member.rows[0] || !["admin"].includes(member.rows[0].role)) { res.status(403).json({ error: "Admin access required" }); return; }
    await pool.query(`DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2`, [orgId, req.params.userId]);
    await recordAuditEvent({ actorId: req.user!.id, action: "organization.member_removed", resourceType: "organization", resourceId: orgId, requestId: req.header("x-request-id") ?? undefined, metadata: { userId: req.params.userId } }).catch(() => undefined);
    res.status(204).send();
  } catch (error) { next(error); }
});

institutionsRouter.post("/:id/addresses", requireAuth, async (req, res, next) => {
  try {
    const orgId = String(req.params.id);
    const member = await pool.query(`SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`, [orgId, req.user!.id]);
    if (!member.rows[0]) { res.status(403).json({ error: "Access denied" }); return; }
    const input = addressSchema.parse(req.body);
    if (input.isDefault) { await pool.query(`UPDATE organization_addresses SET is_default = false WHERE organization_id = $1`, [orgId]); }
    const result = await pool.query(`INSERT INTO organization_addresses (id, organization_id, name, address, latitude, longitude, is_default, instructions) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`, [crypto.randomUUID(), orgId, input.name, input.address, input.latitude ?? null, input.longitude ?? null, input.isDefault, input.instructions ?? null]);
    res.status(201).json({ address: result.rows[0] });
  } catch (error) { next(error); }
});

institutionsRouter.post("/:id/contracts", requireAuth, async (req, res, next) => {
  try {
    const orgId = String(req.params.id);
    const member = await pool.query(`SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`, [orgId, req.user!.id]);
    if (!member.rows[0] || !["admin"].includes(member.rows[0].role)) { res.status(403).json({ error: "Admin access required" }); return; }
    const input = contractSchema.parse(req.body);
    const result = await pool.query(`INSERT INTO service_contracts (id, organization_id, service_id, variant_id, pricing_rule_id, start_date, end_date, terms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`, [crypto.randomUUID(), orgId, input.serviceId, input.variantId ?? null, input.pricingRuleId ?? null, input.startDate, input.endDate ?? null, input.terms ?? null]);
    await recordAuditEvent({ actorId: req.user!.id, action: "contract.created", resourceType: "service_contract", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined, metadata: { organizationId: orgId } }).catch(() => undefined);
    res.status(201).json({ contract: result.rows[0] });
  } catch (error) { next(error); }
});

institutionsRouter.post("/:id/plans", requireAuth, async (req, res, next) => {
  try {
    const orgId = String(req.params.id);
    const member = await pool.query(`SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`, [orgId, req.user!.id]);
    if (!member.rows[0] || !["admin"].includes(member.rows[0].role)) { res.status(403).json({ error: "Admin access required" }); return; }
    const input = planSchema.parse(req.body);
    const result = await pool.query(`INSERT INTO service_plans (id, organization_id, name, services, frequency, preferred_days, preferred_time_start, preferred_time_end) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`, [crypto.randomUUID(), orgId, input.name, input.services, input.frequency, input.preferredDays, input.preferredTimeStart ?? null, input.preferredTimeEnd ?? null]);
    res.status(201).json({ plan: result.rows[0] });
  } catch (error) { next(error); }
});

institutionsRouter.post("/:id/purchase-orders", requireAuth, async (req, res, next) => {
  try {
    const orgId = String(req.params.id);
    const member = await pool.query(`SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`, [orgId, req.user!.id]);
    if (!member.rows[0] || !["admin"].includes(member.rows[0].role)) { res.status(403).json({ error: "Admin access required" }); return; }
    const input = poSchema.parse(req.body);
    const result = await pool.query(`INSERT INTO purchase_orders (id, organization_id, contract_id, po_number, amount, status, issued_at, valid_until) VALUES ($1, $2, $3, $4, $5, 'issued', now(), $6) RETURNING *`, [crypto.randomUUID(), orgId, input.contractId ?? null, input.poNumber, input.amount, input.validUntil ?? null]);
    await recordAuditEvent({ actorId: req.user!.id, action: "purchase_order.created", resourceType: "purchase_order", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined, metadata: { organizationId: orgId } }).catch(() => undefined);
    res.status(201).json({ purchaseOrder: result.rows[0] });
  } catch (error) { next(error); }
});

institutionsRouter.get("/:id/bookings", requireAuth, async (req, res, next) => {
  try {
    const orgId = String(req.params.id);
    const member = await pool.query(`SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2`, [orgId, req.user!.id]);
    if (!member.rows[0]) { res.status(403).json({ error: "Access denied" }); return; }
    const page = Math.max(parseInt(String(req.query.page ?? 1)), 1);
    const limit = Math.min(parseInt(String(req.query.limit ?? 20)), 100);
    const offset = (page - 1) * limit;
    const result = await pool.query(`SELECT b.*, s.name as service_name FROM bookings b JOIN services s ON s.id = b.service_id WHERE b.customer_id IN (SELECT user_id FROM organization_members WHERE organization_id = $1) ORDER BY b.created_at DESC LIMIT $2 OFFSET $3`, [orgId, limit, offset]);
    res.json({ bookings: result.rows, page, limit });
  } catch (error) { next(error); }
});

institutionsRouter.get("/:id/invoices", requireAuth, async (req, res, next) => {
  try {
    const orgId = String(req.params.id);
    const member = await pool.query(`SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2`, [orgId, req.user!.id]);
    if (!member.rows[0]) { res.status(403).json({ error: "Access denied" }); return; }
    const page = Math.max(parseInt(String(req.query.page ?? 1)), 1);
    const limit = Math.min(parseInt(String(req.query.limit ?? 20)), 100);
    const offset = (page - 1) * limit;
    const result = await pool.query(`SELECT i.*, b.address FROM invoices i JOIN bookings b ON b.id = i.booking_id WHERE i.customer_id IN (SELECT user_id FROM organization_members WHERE organization_id = $1) ORDER BY i.issued_at DESC LIMIT $2 OFFSET $3`, [orgId, limit, offset]);
    res.json({ invoices: result.rows, page, limit });
  } catch (error) { next(error); }
});