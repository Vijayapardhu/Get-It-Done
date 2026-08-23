import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import {
  getWelfareBundle,
  addTraining,
  addInsurance,
  setPayoutAccount,
} from "../services/welfareService.js";

export const welfareRouter = Router();

const trainingSchema = z.object({
  courseName: z.string().trim().min(2).max(200),
  provider: z.string().trim().max(200).optional(),
  completedOn: z.string().date().optional(),
  expiresOn: z.string().date().optional(),
  status: z.enum(["planned", "in_progress", "completed", "expired"]).default("completed"),
});

const insuranceSchema = z.object({
  provider: z.string().trim().min(2).max(200),
  policyReference: z.string().trim().min(2).max(200),
  coverageAmount: z.number().nonnegative().max(100000000),
  startsOn: z.string().date(),
  expiresOn: z.string().date(),
  status: z.enum(["pending", "active", "expired", "cancelled"]).default("pending"),
});

const payoutAccountSchema = z.object({
  provider: z.string().trim().min(2).max(50),
  accountReference: z.string().trim().min(4).max(200),
});

const safetyIncidentSchema = z.object({
  bookingId: z.string().uuid().optional(),
  type: z.enum(["injury", "near_miss", "equipment_failure", "hazardous_condition", "other"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().trim().min(10).max(2000),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

const benefitsSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional(),
  eligibilityCriteria: z.record(z.unknown()).optional(),
  value: z.number().nonnegative().max(100000000).optional(),
  provider: z.string().trim().max(200).optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

const benefitEligibilitySchema = z.object({
  workerId: z.string().uuid(),
  benefitId: z.string().uuid(),
  eligible: z.boolean().default(false),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * @openapi
 * /welfare/workers/me:
 *   get:
 *     summary: Get worker welfare bundle
 *     tags: [Welfare]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Worker welfare bundle
 *       404:
 *         description: Worker profile not found
 */
welfareRouter.get("/workers/me", requireAuth, async (req, res, next) => {
  try {
    const welfare = await getWelfareBundle(req.user!.id);
    if (!welfare) { res.status(404).json({ error: "Worker profile not found" }); return; }
    res.json({ welfare });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /welfare/workers/me/training:
 *   post:
 *     summary: Add training record
 *     tags: [Welfare]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [courseName]
 *             properties:
 *               courseName: { type: string, minLength: 2, maxLength: 200 }
 *               provider: { type: string, maxLength: 200 }
 *               completedOn: { type: string, format: date }
 *               expiresOn: { type: string, format: date }
 *               status: { type: string, enum: [planned, in_progress, completed, expired] }
 *     responses:
 *       201:
 *         description: Training record created
 */
welfareRouter.post("/workers/me/training", requireAuth, async (req, res, next) => {
  try {
    const input = trainingSchema.parse(req.body);
    const training = await addTraining(req.user!.id, input);
    if (!training) { res.status(404).json({ error: "Worker profile not found" }); return; }
    res.status(201).json({ training });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /welfare/workers/me/insurance:
 *   post:
 *     summary: Add insurance record
 *     tags: [Welfare]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [provider, policyReference, coverageAmount, startsOn, expiresOn]
 *             properties:
 *               provider: { type: string, minLength: 2, maxLength: 200 }
 *               policyReference: { type: string, minLength: 2, maxLength: 200 }
 *               coverageAmount: { type: number, minimum: 0, maximum: 100000000 }
 *               startsOn: { type: string, format: date }
 *               expiresOn: { type: string, format: date }
 *               status: { type: string, enum: [pending, active, expired, cancelled] }
 *     responses:
 *       201:
 *         description: Insurance record created
 */
welfareRouter.post("/workers/me/insurance", requireAuth, async (req, res, next) => {
  try {
    const input = insuranceSchema.parse(req.body);
    if (input.expiresOn <= input.startsOn) { res.status(400).json({ error: "Insurance expiry must be after start date" }); return; }
    const insurance = await addInsurance(req.user!.id, input);
    if (!insurance) { res.status(404).json({ error: "Worker profile not found" }); return; }
    res.status(201).json({ insurance });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /welfare/workers/me/payout-account:
 *   put:
 *     summary: Update payout account
 *     tags: [Welfare]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [provider, accountReference]
 *             properties:
 *               provider: { type: string, minLength: 2, maxLength: 50 }
 *               accountReference: { type: string, minLength: 4, maxLength: 200 }
 *     responses:
 *       200:
 *         description: Payout account updated
 */
welfareRouter.put("/workers/me/payout-account", requireAuth, async (req, res, next) => {
  try {
    const input = payoutAccountSchema.parse(req.body);
    const payoutAccount = await setPayoutAccount(req.user!.id, input);
    if (!payoutAccount) { res.status(404).json({ error: "Worker profile not found" }); return; }
    res.json({ payoutAccount });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /welfare/workers/me/safety-incidents:
 *   get:
 *     summary: Get safety incidents
 *     tags: [Welfare]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: List of safety incidents
 */
welfareRouter.get("/workers/me/safety-incidents", requireAuth, async (req, res, next) => {
  try {
    const workerId = await pool.query(`select id from workers where user_id = $1`, [req.user!.id]);
    if (!workerId.rows[0]) { res.status(404).json({ error: "Worker profile not found" }); return; }
    const result = await pool.query(`select * from safety_incidents where worker_id = $1 order by reported_at desc`, [workerId.rows[0].id]);
    res.json({ incidents: result.rows });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /welfare/workers/me/safety-incidents:
 *   post:
 *     summary: Report a safety incident
 *     tags: [Welfare]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, severity, description]
 *             properties:
 *               bookingId: { type: string, format: uuid }
 *               type: { type: string, enum: [injury, near_miss, equipment_failure, hazardous_condition, other] }
 *               severity: { type: string, enum: [low, medium, high, critical] }
 *               description: { type: string, minLength: 10, maxLength: 2000 }
 *               latitude: { type: number, minimum: -90, maximum: 90 }
 *               longitude: { type: number, minimum: -180, maximum: 180 }
 *     responses:
 *       201:
 *         description: Safety incident reported
 */
welfareRouter.post("/workers/me/safety-incidents", requireAuth, async (req, res, next) => {
  try {
    const workerIdResult = await pool.query(`select id from workers where user_id = $1`, [req.user!.id]);
    if (!workerIdResult.rows[0]) { res.status(404).json({ error: "Worker profile not found" }); return; }
    const workerId = workerIdResult.rows[0].id;
    const input = safetyIncidentSchema.parse(req.body);
    const location = input.latitude && input.longitude
      ? `ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography`
      : null;
    const result = await pool.query(
      `insert into safety_incidents (worker_id, booking_id, type, severity, description, location)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [workerId, input.bookingId ?? null, input.type, input.severity, input.description, location]
    );
    res.status(201).json({ incident: result.rows[0] });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /welfare/workers/me/benefits:
 *   get:
 *     summary: Get worker benefits
 *     tags: [Welfare]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: List of benefits and eligibility
 */
welfareRouter.get("/workers/me/benefits", requireAuth, async (req, res, next) => {
  try {
    const workerIdResult = await pool.query(`select id from workers where user_id = $1`, [req.user!.id]);
    if (!workerIdResult.rows[0]) { res.status(404).json({ error: "Worker profile not found" }); return; }
    const workerId = workerIdResult.rows[0].id;
    const benefits = await pool.query(`select b.*, be.eligible, be.determined_at as "determinedAt", be.expires_at as "expiresAt"
      from benefits b
      left join benefit_eligibility be on be.benefit_id = b.id and be.worker_id = $1
      where b.status = 'active'`, [workerId]);
    res.json({ benefits: benefits.rows });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /welfare/workers/me/eligibility:
 *   get:
 *     summary: Get benefit eligibility
 *     tags: [Welfare]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Benefit eligibility status
 */
welfareRouter.get("/workers/me/eligibility", requireAuth, async (req, res, next) => {
  try {
    const workerIdResult = await pool.query(`select id from workers where user_id = $1`, [req.user!.id]);
    if (!workerIdResult.rows[0]) { res.status(404).json({ error: "Worker profile not found" }); return; }
    const workerId = workerIdResult.rows[0].id;
    const result = await pool.query(`select be.*, b.name, b.description, b.value, b.provider
      from benefit_eligibility be
      join benefits b on b.id = be.benefit_id
      where be.worker_id = $1`, [workerId]);
    res.json({ eligibility: result.rows });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /welfare/benefits:
 *   get:
 *     summary: List all benefits (admin)
 *     tags: [Welfare]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: List of benefits
 */
welfareRouter.get("/benefits", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`select * from benefits order by name`);
    res.json({ benefits: result.rows });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /welfare/benefits:
 *   post:
 *     summary: Create benefit (admin)
 *     tags: [Welfare]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 200 }
 *               description: { type: string, maxLength: 1000 }
 *               eligibilityCriteria: { type: object }
 *               value: { type: number, minimum: 0, maximum: 100000000 }
 *               provider: { type: string, maxLength: 200 }
 *               status: { type: string, enum: [active, inactive] }
 *     responses:
 *       201:
 *         description: Benefit created
 */
welfareRouter.post("/benefits", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = benefitsSchema.parse(req.body);
    const result = await pool.query(
      `insert into benefits (id, name, description, eligibility_criteria, value, provider, status) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [crypto.randomUUID(), input.name, input.description ?? null, input.eligibilityCriteria ?? null, input.value ?? null, input.provider ?? null, input.status]
    );
    res.status(201).json({ benefit: result.rows[0] });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /welfare/benefits/{id}/eligibility:
 *   post:
 *     summary: Set benefit eligibility for a worker (admin)
 *     tags: [Welfare]
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
 *             required: [workerId]
 *             properties:
 *               workerId: { type: string, format: uuid }
 *               eligible: { type: boolean }
 *               expiresAt: { type: string, format: date-time }
 *               metadata: { type: object }
 *     responses:
 *       200:
 *         description: Eligibility set
 */
welfareRouter.post("/benefits/:id/eligibility", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = benefitEligibilitySchema.parse({ ...req.body, benefitId: req.params.id });
    const result = await pool.query(
      `insert into benefit_eligibility (worker_id, benefit_id, eligible, expires_at, metadata)
       values ($1, $2, $3, $4, $5)
       on conflict (worker_id, benefit_id) do update set eligible = EXCLUDED.eligible, expires_at = EXCLUDED.expires_at, metadata = EXCLUDED.metadata
       returning *`,
      [input.workerId, input.benefitId, input.eligible, input.expiresAt ?? null, input.metadata ?? null]
    );
    res.json({ eligibility: result.rows[0] });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /welfare/workers/{workerId}/safety-incidents:
 *   get:
 *     summary: Get safety incidents for a worker (admin)
 *     tags: [Welfare]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: List of safety incidents
 */
welfareRouter.get("/workers/:workerId/safety-incidents", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`select si.*, u.name as worker_name from safety_incidents si join workers w on w.id = si.worker_id join users u on u.id = w.user_id where si.worker_id = $1 order by si.reported_at desc`, [req.params.workerId]);
    res.json({ incidents: result.rows });
  } catch (error) { next(error); }
});