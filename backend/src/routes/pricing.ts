import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

/**
 * @openapi
 * /pricing/estimate:
 *   post:
 *     summary: Get price estimate for a service
 *     tags: [Pricing]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [serviceId, latitude, longitude], properties: { serviceId: { type: string, format: uuid }, variantId: { type: string, format: uuid }, latitude: { type: number }, longitude: { type: number }, urgency: { type: string, enum: [regular, emergency] }, scheduledAt: { type: string, format: date-time }, cooperativeId: { type: string, format: uuid } } }
 *     responses:
 *       200: { description: Price estimate with breakdown }
 * /pricing/rules:
 *   get:
 *     summary: List pricing rules (admin)
 *     tags: [Pricing]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of pricing rules }
 *   post:
 *     summary: Create pricing rule (admin)
 *     tags: [Pricing]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [name, ruleType, formula], properties: { name: { type: string }, serviceId: { type: string, format: uuid }, variantId: { type: string, format: uuid }, cooperativeId: { type: string, format: uuid }, ruleType: { type: string, enum: [base, travel, surge, emergency, discount, tax] }, formula: { type: object }, priority: { type: integer }, validFrom: { type: string, format: date-time }, validTo: { type: string, format: date-time } } }
 *     responses:
 *       201: { description: Pricing rule created }
 * /pricing/rules/{id}:
 *   patch:
 *     summary: Update pricing rule (admin)
 *     tags: [Pricing]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { name: { type: string }, serviceId: { type: string, format: uuid }, variantId: { type: string, format: uuid }, cooperativeId: { type: string, format: uuid }, ruleType: { type: string, enum: [base, travel, surge, emergency, discount, tax] }, formula: { type: object }, priority: { type: integer }, validFrom: { type: string, format: date-time }, validTo: { type: string, format: date-time } } }
 *     responses:
 *       200: { description: Pricing rule updated }
 *   delete:
 *     summary: Delete pricing rule (admin)
 *     tags: [Pricing]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Pricing rule deleted }
 * /pricing/surge-rules:
 *   get:
 *     summary: List surge rules (admin)
 *     tags: [Pricing]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of surge rules }
 *   post:
 *     summary: Create surge rule (admin)
 *     tags: [Pricing]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [area, multiplier, trigger], properties: { area: { type: object }, serviceId: { type: string, format: uuid }, multiplier: { type: number }, trigger: { type: string, enum: [demand_threshold, time, weather] }, demandThreshold: { type: number }, startsAt: { type: string, format: date-time }, endsAt: { type: string, format: date-time } } }
 *     responses:
 *       201: { description: Surge rule created }
 * /pricing/travel-fees:
 *   get:
 *     summary: List travel fees (admin)
 *     tags: [Pricing]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of travel fees }
 *   post:
 *     summary: Create travel fee (admin)
 *     tags: [Pricing]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [cooperativeId, baseKm, baseFee, perKmRate, maxDistanceKm], properties: { cooperativeId: { type: string, format: uuid }, baseKm: { type: integer }, baseFee: { type: number }, perKmRate: { type: number }, maxDistanceKm: { type: number } } }
 *     responses:
 *       201: { description: Travel fee created }
 * /pricing/tax-rules:
 *   get:
 *     summary: List tax rules (system_admin)
 *     tags: [Pricing]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of tax rules }
 *   post:
 *     summary: Create tax rule (system_admin)
 *     tags: [Pricing]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [name, rate, appliesTo, jurisdiction], properties: { name: { type: string }, rate: { type: number }, appliesTo: { type: string, enum: [service, worker, platform] }, jurisdiction: { type: string } } }
 *     responses:
 *       201: { description: Tax rule created }
 */

export const pricingRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
pricingRouter.param("id", rejectNonUuidParam);

const pricingRuleCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  serviceId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  cooperativeId: z.string().uuid().optional(),
  ruleType: z.enum(["base", "travel", "surge", "emergency", "discount", "tax"]),
  formula: z.record(z.unknown()),
  priority: z.number().int().default(0),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().optional(),
});

const surgeRuleCreateSchema = z.object({
  area: z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(z.array(z.number()))) }),
  serviceId: z.string().uuid().optional(),
  multiplier: z.number().positive().max(10),
  trigger: z.enum(["demand_threshold", "time", "weather"]),
  demandThreshold: z.number().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

const travelFeeCreateSchema = z.object({
  cooperativeId: z.string().uuid(),
  baseKm: z.number().int().positive().default(5),
  baseFee: z.number().nonnegative(),
  perKmRate: z.number().nonnegative(),
  maxDistanceKm: z.number().positive().default(50),
});

const taxRuleCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  rate: z.number().positive().max(1),
  appliesTo: z.enum(["service", "worker", "platform"]),
  jurisdiction: z.string().trim().max(100),
});

pricingRouter.post("/estimate", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({
      serviceId: z.string().uuid(),
      variantId: z.string().uuid().optional(),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      urgency: z.enum(["regular", "emergency"]).default("regular"),
      scheduledAt: z.string().datetime().optional(),
      cooperativeId: z.string().uuid().optional(),
    }).parse(req.body);

    const service = await pool.query(`SELECT base_price, emergency_supported FROM services WHERE id = $1`, [input.serviceId]);
    if (!service.rows[0]) { res.status(404).json({ error: "Service not found" }); return; }
    if (input.urgency === "emergency" && !service.rows[0].emergency_supported) { res.status(400).json({ error: "Emergency not supported for this service" }); return; }

    let variantPrice = Number(service.rows[0].base_price);
    if (input.variantId) {
      const variant = await pool.query(`SELECT base_price FROM service_variants WHERE id = $1 AND service_id = $2`, [input.variantId, input.serviceId]);
      if (variant.rows[0]) variantPrice = Number(variant.rows[0].base_price);
    }

    const cooperativeId = input.cooperativeId ?? (await pool.query(`SELECT cooperative_id FROM workers WHERE id = (SELECT id FROM workers WHERE user_id = $1)`, [req.user!.id])).rows[0]?.cooperative_id;

    const distanceKm = 5;
    const travelFee = cooperativeId ? await calculateTravelFee(cooperativeId, distanceKm) : 0;
    const emergencyFee = input.urgency === "emergency" ? variantPrice * 0.25 : 0;
    const surgeMultiplier = await getSurgeMultiplier(input.serviceId, input.latitude, input.longitude, input.urgency);
    const surgeFee = (variantPrice + travelFee + emergencyFee) * (surgeMultiplier - 1);
    const subtotal = variantPrice + travelFee + emergencyFee + surgeFee;
    const taxRate = await getTaxRate(cooperativeId);
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    const breakdown = {
      baseService: variantPrice,
      travel: travelFee,
      emergency: emergencyFee,
      surge: surgeFee,
      subtotal,
      taxRate,
      tax,
      total,
      currency: "INR",
    };

    res.json({ estimate: breakdown });
  } catch (error) { next(error); }
});

async function calculateTravelFee(cooperativeId: string, distanceKm: number): Promise<number> {
  const result = await pool.query(`SELECT base_km, base_fee, per_km_rate, max_distance_km FROM travel_fees WHERE cooperative_id = $1`, [cooperativeId]);
  if (!result.rows[0]) return 0;
  const { base_km, base_fee, per_km_rate, max_distance_km } = result.rows[0];
  if (distanceKm > max_distance_km) return 0;
  if (distanceKm <= base_km) return Number(base_fee);
  return Number(base_fee) + (distanceKm - base_km) * Number(per_km_rate);
}

async function getSurgeMultiplier(serviceId: string, latitude: number, longitude: number, urgency: string): Promise<number> {
  const result = await pool.query(`SELECT multiplier FROM surge_rules WHERE (service_id = $1 OR service_id IS NULL) AND ST_Contains(area::geometry, ST_SetSRID(ST_MakePoint($2, $3), 4326)) AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()) ORDER BY multiplier DESC LIMIT 1`, [serviceId, longitude, latitude]);
  return result.rows[0] ? Number(result.rows[0].multiplier) : 1;
}

async function getTaxRate(cooperativeId: string | null): Promise<number> {
  const result = await pool.query(`SELECT rate FROM tax_rules WHERE applies_to = 'service' ${cooperativeId ? "AND jurisdiction = (SELECT state FROM cooperatives WHERE id = $1)" : ""} ORDER BY rate DESC LIMIT 1`, cooperativeId ? [cooperativeId] : []);
  return result.rows[0] ? Number(result.rows[0].rate) : 0.18;
}

pricingRouter.get("/rules", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM pricing_rules ORDER BY priority DESC, created_at DESC`);
    res.json({ rules: result.rows });
  } catch (error) { next(error); }
});

pricingRouter.post("/rules", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = pricingRuleCreateSchema.parse(req.body);
    const result = await pool.query(`INSERT INTO pricing_rules (id, name, service_id, variant_id, cooperative_id, rule_type, formula, priority, valid_from, valid_to) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`, [crypto.randomUUID(), input.name, input.serviceId ?? null, input.variantId ?? null, input.cooperativeId ?? null, input.ruleType, input.formula, input.priority, input.validFrom ?? null, input.validTo ?? null]);
    await recordAuditEvent({ actorId: req.user!.id, action: "pricing_rule.created", resourceType: "pricing_rule", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ rule: result.rows[0] });
  } catch (error) { next(error); }
});

pricingRouter.patch("/rules/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = pricingRuleCreateSchema.partial().parse(req.body);
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    const fieldMap: Record<string, string> = { serviceId: "service_id", variantId: "variant_id", cooperativeId: "cooperative_id", ruleType: "rule_type", validFrom: "valid_from", validTo: "valid_to" };
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) { fields.push(`${fieldMap[key] ?? key} = $${index++}`); values.push(value); }
    }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(req.params.id);
    const result = await pool.query(`UPDATE pricing_rules SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} RETURNING *`, values);
    if (!result.rows[0]) { res.status(404).json({ error: "Pricing rule not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "pricing_rule.updated", resourceType: "pricing_rule", resourceId: String(req.params.id), requestId: req.header("x-request-id") ?? undefined, metadata: { fields: Object.keys(input) } }).catch(() => undefined);
    res.json({ rule: result.rows[0] });
  } catch (error) { next(error); }
});

pricingRouter.delete("/rules/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM pricing_rules WHERE id = $1`, [req.params.id]);
    await recordAuditEvent({ actorId: req.user!.id, action: "pricing_rule.deleted", resourceType: "pricing_rule", resourceId: String(req.params.id), requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(204).send();
  } catch (error) { next(error); }
});

pricingRouter.get("/surge-rules", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT sr.*, s.name as service_name FROM surge_rules sr LEFT JOIN services s ON s.id = sr.service_id ORDER BY sr.created_at DESC`);
    res.json({ surgeRules: result.rows });
  } catch (error) { next(error); }
});

pricingRouter.post("/surge-rules", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const input = surgeRuleCreateSchema.parse(req.body);
    const result = await pool.query(`INSERT INTO surge_rules (id, area, service_id, multiplier, trigger, demand_threshold, starts_at, ends_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`, [crypto.randomUUID(), input.area, input.serviceId ?? null, input.multiplier, input.trigger, input.demandThreshold ?? null, input.startsAt ?? null, input.endsAt ?? null]);
    await recordAuditEvent({ actorId: req.user!.id, action: "surge_rule.created", resourceType: "surge_rule", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ surgeRule: result.rows[0] });
  } catch (error) { next(error); }
});

pricingRouter.get("/travel-fees", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT tf.*, c.name as cooperative_name FROM travel_fees tf JOIN cooperatives c ON c.id = tf.cooperative_id ORDER BY tf.created_at DESC`);
    res.json({ travelFees: result.rows });
  } catch (error) { next(error); }
});

pricingRouter.post("/travel-fees", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const input = travelFeeCreateSchema.parse(req.body);
    let result;
    try {
      result = await pool.query(`INSERT INTO travel_fees (id, cooperative_id, base_km, base_fee, per_km_rate, max_distance_km) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [crypto.randomUUID(), input.cooperativeId, input.baseKm, input.baseFee, input.perKmRate, input.maxDistanceKm]);
    } catch (insertError) {
      if ((insertError as { code?: string })?.code === "23505") { res.status(409).json({ error: "Travel fee already exists for this cooperative" }); return; }
      throw insertError;
    }
    await recordAuditEvent({ actorId: req.user!.id, action: "travel_fee.created", resourceType: "travel_fee", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ travelFee: result.rows[0] });
  } catch (error) { next(error); }
});

pricingRouter.get("/tax-rules", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM tax_rules ORDER BY created_at DESC`);
    res.json({ taxRules: result.rows });
  } catch (error) { next(error); }
});

pricingRouter.post("/tax-rules", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const input = taxRuleCreateSchema.parse(req.body);
    const result = await pool.query(`INSERT INTO tax_rules (id, name, rate, applies_to, jurisdiction) VALUES ($1, $2, $3, $4, $5) RETURNING *`, [crypto.randomUUID(), input.name, input.rate, input.appliesTo, input.jurisdiction]);
    await recordAuditEvent({ actorId: req.user!.id, action: "tax_rule.created", resourceType: "tax_rule", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ taxRule: result.rows[0] });
  } catch (error) { next(error); }
});