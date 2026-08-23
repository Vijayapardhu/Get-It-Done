import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { findDemoMatches } from "../data/demoStore.js";
import { requireRoles } from "../middleware/auth.js";
import { findMatchingWorkers } from "../services/matching.js";
import { addWorkerDocument, createWorkerProfile, getWorkerByUserId, getWorkerServiceAreas, getWorkerSkills, replaceWorkerServiceAreas, replaceWorkerSkills, updateAvailability, updateWorkerLocation, updateWorkerProfile } from "../services/workerService.js";
import { savePrivateWorkerDocument } from "../services/storageService.js";
import { addInsurance, addTraining, getWelfareBundle, setPayoutAccount } from "../services/welfareService.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";

/**
 * @openapi
 * /workers:
 *   get:
 *     summary: List workers with filters
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 * /workers/search:
 *   get:
 *     summary: Search workers with advanced filters
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 * /workers/{id}:
 *   get:
 *     summary: Get worker public profile
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 * /workers/{id}/jobs:
 *   get:
 *     summary: Get worker job history
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 * /workers/{id}/earnings:
 *   get:
 *     summary: Get worker earnings
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 * /workers/{id}/ratings:
 *   get:
 *     summary: Get worker ratings
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 * /workers/{id}/statistics:
 *   get:
 *     summary: Get worker statistics
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 */

export const workersRouter = Router();
const workerOnly = requireRoles("worker");
const nearbyQuerySchema = z.object({ serviceId: z.string().uuid(), latitude: z.coerce.number().min(-90).max(90), longitude: z.coerce.number().min(-180).max(180), urgency: z.enum(["regular", "emergency"]).default("regular") });
const profileSchema = z.object({ address: z.string().trim().min(3).max(300).optional(), profilePhotoUrl: z.string().url().max(2000).optional(), experienceYears: z.number().int().min(0).max(80).optional() });

workersRouter.get("/nearby", async (req, res, next) => {
  try {
    const query = nearbyQuerySchema.parse(req.query);
    if (env.USE_MOCK_DB) { res.json({ matches: findDemoMatches(query.serviceId, query.urgency) }); return; }
    res.json({ matches: await findMatchingWorkers(query) });
  } catch (error) { next(error); }
});

workersRouter.post("/me/onboarding", workerOnly, async (req, res, next) => {
  try {
    const input = profileSchema.parse(req.body);
    const worker = await createWorkerProfile(req.user!.id, input);
    res.status(201).json({ worker });
  } catch (error) { next(error); }
});

workersRouter.get("/me", workerOnly, async (req, res, next) => {
  try {
    const worker = await getWorkerByUserId(req.user!.id);
    if (!worker) { res.status(404).json({ error: "Worker profile not found" }); return; }
    res.json({ worker, skills: await getWorkerSkills(worker.id), serviceAreas: await getWorkerServiceAreas(worker.id), welfare: await getWelfareBundle(req.user!.id) });
  } catch (error) { next(error); }
});

workersRouter.patch("/me", workerOnly, async (req, res, next) => {
  try {
    const worker = await updateWorkerProfile(req.user!.id, profileSchema.parse(req.body));
    if (!worker) { res.status(404).json({ error: "Worker profile not found" }); return; }
    res.json({ worker });
  } catch (error) { next(error); }
});

workersRouter.put("/me/skills", workerOnly, async (req, res, next) => {
  try {
    const input = z.object({ skills: z.array(z.object({ serviceId: z.string().uuid(), certificationLevel: z.string().trim().min(2).max(50).optional() })).max(50) }).parse(req.body);
    const skills = await replaceWorkerSkills(req.user!.id, input.skills);
    if (!skills) { res.status(404).json({ error: "Worker profile not found" }); return; }
    res.json({ skills });
  } catch (error) { next(error); }
});

workersRouter.put("/me/service-areas", workerOnly, async (req, res, next) => {
  try {
    const input = z.object({ areas: z.array(z.object({ serviceId: z.string().uuid(), radiusKm: z.number().positive().max(100) })).max(50) }).parse(req.body);
    const serviceAreas = await replaceWorkerServiceAreas(req.user!.id, input.areas);
    if (!serviceAreas) { res.status(404).json({ error: "Worker profile not found" }); return; }
    res.json({ serviceAreas });
  } catch (error) { next(error); }
});

workersRouter.patch("/me/availability", workerOnly, async (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(["available", "busy", "offline"]) }).parse(req.body);
    const worker = await updateAvailability(req.user!.id, status);
    if (!worker) { res.status(409).json({ error: "Only verified workers can change availability" }); return; }
    req.app.get("io")?.emit("worker:availability:update", { userId: req.user!.id, ...worker });
    res.json({ worker });
  } catch (error) { next(error); }
});

workersRouter.put("/me/location", workerOnly, async (req, res, next) => {
  try {
    const input = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), sharingEnabled: z.boolean() }).parse(req.body);
    const location = await updateWorkerLocation(req.user!.id, input.latitude, input.longitude, input.sharingEnabled);
    if (!location) { res.status(404).json({ error: "Worker profile not found" }); return; }
    req.app.get("io")?.emit("worker:location:update", { userId: req.user!.id, ...location });
    res.json({ location, sharingEnabled: input.sharingEnabled });
  } catch (error) { next(error); }
});

workersRouter.post("/me/documents", workerOnly, async (req, res, next) => {
  try {
    const input = z.object({ type: z.string().trim().min(2).max(50), filename: z.string().trim().regex(/^[a-zA-Z0-9._-]{1,120}$/), contentBase64: z.string().min(1).max(15_000_000) }).parse(req.body);
    const fileKey = await savePrivateWorkerDocument(req.user!.id, input.filename, input.contentBase64);
    const document = await addWorkerDocument(req.user!.id, input.type, fileKey);
    if (!document) { res.status(404).json({ error: "Worker profile not found" }); return; }
    res.status(201).json({ document });
  } catch (error) { next(error); }
});

workersRouter.get("/me/welfare", workerOnly, async (req, res, next) => {
  try { res.json({ welfare: await getWelfareBundle(req.user!.id) }); } catch (error) { next(error); }
});

workersRouter.post("/me/training", workerOnly, async (req, res, next) => {
  try {
    const input = z.object({ courseName: z.string().trim().min(2).max(200), provider: z.string().trim().max(200).optional(), completedOn: z.string().date().optional(), expiresOn: z.string().date().optional(), status: z.enum(["planned", "in_progress", "completed", "expired"]).default("completed") }).parse(req.body);
    const training = await addTraining(req.user!.id, input);
    if (!training) { res.status(404).json({ error: "Worker profile not found" }); return; }
    res.status(201).json({ training });
  } catch (error) { next(error); }
});

workersRouter.post("/me/insurance", workerOnly, async (req, res, next) => {
  try {
    const input = z.object({ provider: z.string().trim().min(2).max(200), policyReference: z.string().trim().min(2).max(200), coverageAmount: z.number().nonnegative().max(100000000), startsOn: z.string().date(), expiresOn: z.string().date(), status: z.enum(["pending", "active", "expired", "cancelled"]).default("pending") }).parse(req.body);
    if (input.expiresOn <= input.startsOn) { res.status(400).json({ error: "Insurance expiry must be after its start date" }); return; }
    const insurance = await addInsurance(req.user!.id, input);
    if (!insurance) { res.status(404).json({ error: "Worker profile not found" }); return; }
    res.status(201).json({ insurance });
  } catch (error) { next(error); }
});

workersRouter.put("/me/payout-account", workerOnly, async (req, res, next) => {
  try {
    const input = z.object({ provider: z.string().trim().min(2).max(50), accountReference: z.string().trim().min(4).max(200) }).parse(req.body);
    const payoutAccount = await setPayoutAccount(req.user!.id, input);
    if (!payoutAccount) { res.status(404).json({ error: "Worker profile not found" }); return; }
    res.json({ payoutAccount });
  } catch (error) { next(error); }
});

const listQuerySchema = z.object({
  serviceId: z.string().uuid().optional(),
  cooperativeId: z.string().uuid().optional(),
  verificationStatus: z.enum(["pending", "under_review", "verified", "rejected", "suspended", "expired"]).optional(),
  availability: z.enum(["available", "busy", "offline"]).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

workersRouter.get("/", async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.serviceId) { conditions.push(`EXISTS (SELECT 1 FROM worker_skills ws WHERE ws.worker_id = w.id AND ws.service_id = $${index++})`); values.push(query.serviceId); }
    if (query.cooperativeId) { conditions.push(`w.cooperative_id = $${index++}`); values.push(query.cooperativeId); }
    if (query.verificationStatus) { conditions.push(`w.verification_status = $${index++}`); values.push(query.verificationStatus); }
    if (query.availability) { conditions.push(`w.current_status = $${index++}`); values.push(query.availability); }
    if (query.minRating) { conditions.push(`w.rating >= $${index++}`); values.push(query.minRating); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;

    const result = await pool.query(`SELECT w.id, w.worker_code, w.verification_status, w.rating, w.current_status, w.experience_years, w.service_radius_km, u.name, u.avatar_url, c.name as cooperative_name, c.district, c.state FROM workers w JOIN users u ON u.id = w.user_id LEFT JOIN cooperatives c ON c.id = w.cooperative_id ${whereClause} ORDER BY w.rating DESC NULLS LAST LIMIT $${index++} OFFSET $${index}`, [...values, query.limit, offset]);
    res.json({ workers: result.rows, page: query.page, limit: query.limit });
  } catch (error) { next(error); }
});

workersRouter.get("/search", async (req, res, next) => {
  try {
    const query = z.object({
      serviceId: z.string().uuid(),
      latitude: z.coerce.number().min(-90).max(90),
      longitude: z.coerce.number().min(-180).max(180),
      urgency: z.enum(["regular", "emergency"]).default("regular"),
      radiusKm: z.coerce.number().positive().max(100).optional(),
    }).parse(req.query);

    const { findMatchingWorkers } = await import("../services/matching.js");
    const matches = await findMatchingWorkers(query);
    res.json({ matches });
  } catch (error) { next(error); }
});

workersRouter.get("/:id", async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT w.id, w.worker_code, w.verification_status, w.rating, w.current_status, w.experience_years, w.service_radius_km, w.bio, w.total_jobs, w.completed_jobs, w.cancelled_jobs, u.name, u.avatar_url, c.name as cooperative_name, c.district, c.state FROM workers w JOIN users u ON u.id = w.user_id LEFT JOIN cooperatives c ON c.id = w.cooperative_id WHERE w.id = $1`, [req.params.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    const worker = result.rows[0];
    const skills = await pool.query(`SELECT ws.service_id, s.name, s.category, ws.level, ws.years_experience, ws.verified FROM worker_skills_new ws JOIN skills s ON s.id = ws.skill_id WHERE ws.worker_id = $1`, [worker.id]);
    const serviceAreas = await pool.query(`SELECT wsa.service_id, s.name, wsa.radius_km FROM worker_service_areas wsa JOIN services s ON s.id = wsa.service_id WHERE wsa.worker_id = $1`, [worker.id]);
    res.json({ worker, skills: skills.rows, serviceAreas: serviceAreas.rows });
  } catch (error) { next(error); }
});

workersRouter.get("/:id/jobs", async (req, res, next) => {
  try {
    const page = Math.max(parseInt(String(req.query.page ?? 1)), 1);
    const limit = Math.min(parseInt(String(req.query.limit ?? 20)), 100);
    const offset = (page - 1) * limit;

    const result = await pool.query(`SELECT b.id, b.booking_number, b.status, b.scheduled_at, b.is_emergency, b.address, b.description, b.price, b.created_at, s.name as service_name FROM bookings b JOIN services s ON s.id = b.service_id WHERE b.worker_id = $1 ORDER BY b.created_at DESC LIMIT $2 OFFSET $3`, [req.params.id, limit, offset]);
    res.json({ bookings: result.rows, page, limit });
  } catch (error) { next(error); }
});

workersRouter.get("/:id/earnings", async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT entry_type, amount, reference, created_at, booking_id FROM worker_earnings_ledger WHERE worker_id = $1 ORDER BY created_at DESC LIMIT 100`, [req.params.id]);
    const summary = await pool.query(`SELECT SUM(CASE WHEN entry_type = 'earning' THEN amount ELSE 0 END) as total_earnings, SUM(CASE WHEN entry_type = 'payout' THEN amount ELSE 0 END) as total_payouts, SUM(CASE WHEN entry_type = 'adjustment' THEN amount ELSE 0 END) as total_adjustments, SUM(CASE WHEN entry_type = 'refund' THEN amount ELSE 0 END) as total_refunds FROM worker_earnings_ledger WHERE worker_id = $1`, [req.params.id]);
    res.json({ ledger: result.rows, summary: summary.rows[0] });
  } catch (error) { next(error); }
});

workersRouter.get("/:id/ratings", async (req, res, next) => {
  try {
    const page = Math.max(parseInt(String(req.query.page ?? 1)), 1);
    const limit = Math.min(parseInt(String(req.query.limit ?? 20)), 100);
    const offset = (page - 1) * limit;

    const result = await pool.query(`SELECT r.rating, r.feedback, r.created_at, b.id as booking_id, u.name as customer_name FROM reviews r JOIN bookings b ON b.id = r.booking_id JOIN users u ON u.id = r.customer_id WHERE r.worker_id = $1 ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`, [req.params.id, limit, offset]);
    const summary = await pool.query(`SELECT AVG(rating)::numeric(2,1) as avg_rating, COUNT(*) as total_reviews, COUNT(*) FILTER (WHERE rating = 5) as five_star, COUNT(*) FILTER (WHERE rating = 4) as four_star, COUNT(*) FILTER (WHERE rating = 3) as three_star, COUNT(*) FILTER (WHERE rating = 2) as two_star, COUNT(*) FILTER (WHERE rating = 1) as one_star FROM reviews WHERE worker_id = $1`, [req.params.id]);
    res.json({ reviews: result.rows, summary: summary.rows[0], page, limit });
  } catch (error) { next(error); }
});

workersRouter.get("/:id/statistics", async (req, res, next) => {
  try {
    const stats = await pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs, COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_jobs, AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/60) as avg_job_duration_minutes FROM bookings WHERE worker_id = $1 AND status IN ('completed', 'cancelled')`, [req.params.id]);
    const rating = await pool.query(`SELECT AVG(rating)::numeric(2,1) as avg_rating, COUNT(*) as total_ratings FROM reviews WHERE worker_id = $1`, [req.params.id]);
    const responseTime = await pool.query(`SELECT AVG(EXTRACT(EPOCH FROM (accepted_at - created_at))/60) as avg_response_minutes FROM (SELECT b.id, b.created_at, bse.created_at as accepted_at FROM bookings b JOIN booking_status_events bse ON bse.booking_id = b.id WHERE b.worker_id = $1 AND bse.status = 'accepted') sub`, [req.params.id]);
    res.json({ ...stats.rows[0], ...rating.rows[0], ...responseTime.rows[0] });
  } catch (error) { next(error); }
});
