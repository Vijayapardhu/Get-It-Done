import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

export const serviceAreasRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
serviceAreasRouter.param("id", rejectNonUuidParam);

const serviceAreaCreateSchema = z.object({
  serviceId: z.string().uuid(),
  polygon: z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(z.array(z.number()))) }),
});

const serviceAreaUpdateSchema = z.object({
  polygon: z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(z.array(z.number()))) }).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

const serviceRequirementCreateSchema = z.object({
  serviceId: z.string().uuid(),
  skillId: z.string().uuid(),
  requiredLevel: z.enum(["beginner", "intermediate", "expert", "master"]).default("beginner"),
  mandatory: z.boolean().default(true),
});

const serviceVariantCreateSchema = z.object({
  serviceId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  basePrice: z.number().nonnegative(),
  durationMinutes: z.number().int().positive().default(60),
  emergencySupported: z.boolean().default(false),
});

const serviceCategoryCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  icon: z.string().trim().max(100).optional(),
  displayOrder: z.number().int().default(0),
  status: z.enum(["active", "inactive"]).default("active"),
  imageKey: z.string().trim().optional(),
  accentColor: z.string().trim().max(7).optional(),
  parentId: z.string().uuid().optional(),
  subcategories: z.array(z.string().trim().min(1).max(100)).optional(),
});

const serviceCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(50),
  description: z.string().trim().max(500).optional(),
  basePrice: z.number().nonnegative(),
  emergencySupported: z.boolean().default(false),
});

const serviceUpdateSchema = serviceCreateSchema.partial();

/**
 * @openapi
 * /service-areas:
 *   post:
 *     summary: Create service coverage area
 *     tags: [Service Areas]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serviceId, polygon]
 *             properties:
 *               serviceId: { type: string, format: uuid }
 *               polygon: { type: object }
 *     responses:
 *       201:
 *         description: Service area created
 *   get:
 *     summary: List service areas
 *     tags: [Service Areas]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: List of service areas
 */
serviceAreasRouter.post("/", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = serviceAreaCreateSchema.parse(req.body);
    const result = await pool.query(
      `INSERT INTO service_areas (id, service_id, polygon) VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326)::geography) RETURNING id, service_id, status, created_at, updated_at, ST_AsGeoJSON(polygon::geometry)::jsonb as polygon`,
      [crypto.randomUUID(), input.serviceId, JSON.stringify(input.polygon)]
    );
    await recordAuditEvent({ actorId: req.user!.id, action: "service_area.created", resourceType: "service_area", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ serviceArea: result.rows[0] });
  } catch (error) { next(error); }
});

serviceAreasRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const serviceId = req.query.serviceId as string | undefined;
    let query = `SELECT sa.*, s.name as service_name FROM service_areas sa JOIN services s ON s.id = sa.service_id`;
    const values: any[] = [];
    if (serviceId) {
      query += ` WHERE sa.service_id = $1`;
      values.push(serviceId);
    }
    query += ` ORDER BY sa.created_at DESC`;
    const result = await pool.query(query, values);
    res.json({ serviceAreas: result.rows });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /service-areas/{id}:
 *   get:
 *     summary: Get service area details
 *     tags: [Service Areas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Service area details
 *       404:
 *         description: Not found
 *   patch:
 *     summary: Update service area
 *     tags: [Service Areas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               polygon: { type: object }
 *               status: { type: string, enum: [active, inactive] }
 *     responses:
 *       200:
 *         description: Service area updated
 *       404:
 *         description: Not found
 *   delete:
 *     summary: Delete service area
 *     tags: [Service Areas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Service area deleted
 *       404:
 *         description: Not found
 */
// NOTE: registered at the bottom of this file so literal GET paths
// (/requirements, /variants, /categories, /services) are matched first.

serviceAreasRouter.patch("/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = serviceAreaUpdateSchema.parse(req.body);
    const fields: string[] = [];
    const values: any[] = [];
    let index = 1;
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      if (key === "polygon") {
        fields.push(`polygon = ST_SetSRID(ST_GeomFromGeoJSON($${index++}), 4326)::geography`);
        values.push(JSON.stringify(value));
      } else {
        fields.push(`${key} = $${index++}`);
        values.push(value);
      }
    }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(req.params.id);
    const result = await pool.query(`UPDATE service_areas SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} RETURNING id, service_id, status, created_at, updated_at, ST_AsGeoJSON(polygon::geometry)::jsonb as polygon`, values);
    if (!result.rows[0]) { res.status(404).json({ error: "Service area not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "service_area.updated", resourceType: "service_area", resourceId: String(req.params.id), requestId: req.header("x-request-id") ?? undefined, metadata: { fields: Object.keys(input) } }).catch(() => undefined);
    res.json({ serviceArea: result.rows[0] });
  } catch (error) { next(error); }
});

serviceAreasRouter.delete("/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const result = await pool.query(`DELETE FROM service_areas WHERE id = $1 RETURNING id`, [id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Service area not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "service_area.deleted", resourceType: "service_area", resourceId: id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(204).send();
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /service-areas/requirements:
 *   post:
 *     summary: Create service requirement
 *     tags: [Service Areas]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serviceId, skillId]
 *             properties:
 *               serviceId: { type: string, format: uuid }
 *               skillId: { type: string, format: uuid }
 *               requiredLevel: { type: string, enum: [beginner, intermediate, expert, master] }
 *               mandatory: { type: boolean }
 *     responses:
 *       201:
 *         description: Service requirement created
 *   get:
 *     summary: List service requirements
 *     tags: [Service Areas]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: List of service requirements
 */
serviceAreasRouter.post("/requirements", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = serviceRequirementCreateSchema.parse(req.body);
    const result = await pool.query(
      `INSERT INTO service_requirements (id, service_id, skill_id, required_level, mandatory) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [crypto.randomUUID(), input.serviceId, input.skillId, input.requiredLevel, input.mandatory]
    );
    await recordAuditEvent({ actorId: req.user!.id, action: "service_requirement.created", resourceType: "service_requirement", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ requirement: result.rows[0] });
  } catch (error) { next(error); }
});

serviceAreasRouter.get("/requirements", requireAuth, async (req, res, next) => {
  try {
    const serviceId = req.query.serviceId as string | undefined;
    const skillId = req.query.skillId as string | undefined;
    let query = `SELECT sr.*, s.name as skill_name, s.category as skill_category, sv.name as service_name
      FROM service_requirements sr
      JOIN skills s ON s.id = sr.skill_id
      JOIN services sv ON sv.id = sr.service_id`;
    const values: any[] = [];
    const conditions: string[] = [];
    let index = 1;
    if (serviceId) { conditions.push(`sr.service_id = $${index++}`); values.push(serviceId); }
    if (skillId) { conditions.push(`sr.skill_id = $${index++}`); values.push(skillId); }
    if (conditions.length > 0) query += ` WHERE ${conditions.join(" AND ")}`;
    query += ` ORDER BY sv.name, s.category, s.name`;
    const result = await pool.query(query, values);
    res.json({ requirements: result.rows });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /service-areas/variants:
 *   post:
 *     summary: Create service variant
 *     tags: [Service Areas]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serviceId, name, basePrice]
 *             properties:
 *               serviceId: { type: string, format: uuid }
 *               name: { type: string, minLength: 2, maxLength: 100 }
 *               description: { type: string, maxLength: 500 }
 *               basePrice: { type: number, minimum: 0 }
 *               durationMinutes: { type: integer, minimum: 1 }
 *               emergencySupported: { type: boolean }
 *     responses:
 *       201:
 *         description: Service variant created
 *   get:
 *     summary: List service variants
 *     tags: [Service Areas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: serviceId
 *         in: query
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: List of service variants
 */
serviceAreasRouter.post("/variants", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = serviceVariantCreateSchema.parse(req.body);
    const result = await pool.query(
      `INSERT INTO service_variants (id, service_id, name, description, base_price, duration_minutes, emergency_supported) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [crypto.randomUUID(), input.serviceId, input.name, input.description ?? null, input.basePrice, input.durationMinutes, input.emergencySupported]
    );
    await recordAuditEvent({ actorId: req.user!.id, action: "service_variant.created", resourceType: "service_variant", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ variant: result.rows[0] });
  } catch (error) { next(error); }
});

serviceAreasRouter.get("/variants", requireAuth, async (req, res, next) => {
  try {
    const serviceId = req.query.serviceId as string | undefined;
    let query = `SELECT sv.*, s.name as service_name FROM service_variants sv JOIN services s ON s.id = sv.service_id`;
    const values: any[] = [];
    if (serviceId) { query += ` WHERE sv.service_id = $1`; values.push(serviceId); }
    query += ` ORDER BY s.name, sv.name`;
    const result = await pool.query(query, values);
    res.json({ variants: result.rows });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /service-areas/categories:
 *   post:
 *     summary: Create service category
 *     tags: [Service Areas]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 100 }
 *               description: { type: string, maxLength: 500 }
 *               icon: { type: string }
 *               displayOrder: { type: integer }
 *               status: { type: string, enum: [active, inactive] }
 *     responses:
 *       201:
 *         description: Service category created
 *   get:
 *     summary: List service categories
 *     tags: [Service Areas]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: List of service categories
 */
serviceAreasRouter.post("/categories", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = serviceCategoryCreateSchema.parse(req.body);
    const result = await pool.query(`INSERT INTO service_categories (id, name, description, icon, display_order, status, image_key, accent_color, parent_id, subcategories) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`, [crypto.randomUUID(), input.name, input.description ?? null, input.icon ?? null, input.displayOrder, input.status, input.imageKey ?? null, input.accentColor ?? null, input.parentId ?? null, JSON.stringify(input.subcategories ?? [])]);
    await recordAuditEvent({ actorId: req.user!.id, action: "service_category.created", resourceType: "service_category", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ category: result.rows[0] });
  } catch (error) { next(error); }
});

serviceAreasRouter.get("/categories", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM service_categories ORDER BY display_order, name`);
    res.json({ categories: result.rows });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /services:
 *   post:
 *     summary: Create service
 *     tags: [Services]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, category, basePrice]
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 100 }
 *               category: { type: string, minLength: 2, maxLength: 50 }
 *               description: { type: string, maxLength: 500 }
 *               basePrice: { type: number, minimum: 0 }
 *               emergencySupported: { type: boolean }
 *     responses:
 *       201:
 *         description: Service created
 *   get:
 *     summary: List all services
 *     tags: [Services]
 *     parameters:
 *       - name: category
 *         in: query
 *         schema: { type: string }
 *       - name: emergencyOnly
 *         in: query
 *         schema: { type: boolean }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of services
 */
serviceAreasRouter.post("/services", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = serviceCreateSchema.parse(req.body);
    const result = await pool.query(`INSERT INTO services (id, name, category, description, base_price, emergency_supported) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [crypto.randomUUID(), input.name, input.category, input.description ?? null, input.basePrice, input.emergencySupported]);
    await recordAuditEvent({ actorId: req.user!.id, action: "service.created", resourceType: "service", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ service: result.rows[0] });
  } catch (error) { next(error); }
});

serviceAreasRouter.get("/services", async (req, res, next) => {
  try {
    const category = req.query.category as string | undefined;
    const emergencyOnly = req.query.emergencyOnly === "true";
    const search = req.query.search as string | undefined;
    
    let query = `SELECT * FROM services`;
    const conditions: string[] = [];
    const values: any[] = [];
    let index = 1;
    
    if (category) { conditions.push(`category = $${index++}`); values.push(category); }
    if (emergencyOnly) { conditions.push(`emergency_supported = true`); }
    if (search) { conditions.push(`(name ILIKE $${index} OR description ILIKE $${index})`); values.push(`%${search}%`); index++; }
    
    if (conditions.length > 0) { query += ` WHERE ${conditions.join(" AND ")}`; }
    query += ` ORDER BY category, name`;
    
    const result = await pool.query(query, values);
    res.json({ services: result.rows });
  } catch (error) { next(error); }
});

serviceAreasRouter.get("/services/:id", async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT s.*, sc.name as category_name FROM services s LEFT JOIN service_categories sc ON sc.name = s.category WHERE s.id = $1`, [req.params.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Service not found" }); return; }
    const variants = await pool.query(`SELECT * FROM service_variants WHERE service_id = $1`, [req.params.id]);
    const areas = await pool.query(`SELECT * FROM service_areas WHERE service_id = $1`, [req.params.id]);
    const requirements = await pool.query(`SELECT sr.*, sk.name as skill_name, sk.category as skill_category FROM service_requirements sr JOIN skills sk ON sk.id = sr.skill_id WHERE sr.service_id = $1`, [req.params.id]);
    res.json({ service: result.rows[0], variants: variants.rows, areas: areas.rows, requirements: requirements.rows });
  } catch (error) { next(error); }
});

serviceAreasRouter.patch("/services/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = serviceUpdateSchema.parse(req.body);
    const fields: string[] = []; const values: any[] = []; let index = 1;
    for (const [key, value] of Object.entries(input)) { if (value !== undefined) { fields.push(`${key} = $${index++}`); values.push(value); } }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(req.params.id);
    const result = await pool.query(`UPDATE services SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} RETURNING *`, values);
    if (!result.rows[0]) { res.status(404).json({ error: "Service not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "service.updated", resourceType: "service", resourceId: String(req.params.id), requestId: req.header("x-request-id") ?? undefined, metadata: { fields: Object.keys(input) } }).catch(() => undefined);
    res.json({ service: result.rows[0] });
  } catch (error) { next(error); }
});

serviceAreasRouter.delete("/services/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const result = await pool.query(`DELETE FROM services WHERE id = $1 RETURNING id`, [id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Service not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "service.deleted", resourceType: "service", resourceId: id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(204).send();
  } catch (error) { next(error); }
});
// Registered last so literal GET paths above are matched first.
serviceAreasRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT sa.*, s.name as service_name FROM service_areas sa JOIN services s ON s.id = sa.service_id WHERE sa.id = $1`, [req.params.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Service area not found" }); return; }
    res.json({ serviceArea: result.rows[0] });
  } catch (error) { next(error); }
});
