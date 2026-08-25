import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { findDemoMatches } from "../data/demoStore.js";
import { requireRoles } from "../middleware/auth.js";
import { findMatchingWorkers } from "../services/matching.js";
import { addWorkerDocument, createWorkerProfile, getWorkerByUserId, getWorkerServiceAreas, getWorkerSkills, replaceWorkerServiceAreas, replaceWorkerSkills, updateAvailability, updateWorkerLocation, updateWorkerProfile } from "../services/workerService.js";
import { savePrivateWorkerDocument } from "../services/storageService.js";
import { addInsurance, addTraining, getWelfareBundle, setPayoutAccount } from "../services/welfareService.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

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
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Worker profile
 *       404:
 *         description: Worker not found
 * /workers/{id}/jobs:
 *   get:
 *     summary: Get worker job history
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: page
 *         in: query
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: List of worker jobs
 *       404:
 *         description: Worker not found
 * /workers/{id}/earnings:
 *   get:
 *     summary: Get worker earnings
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Worker earnings
 *       404:
 *         description: Worker not found
 * /workers/{id}/ratings:
 *   get:
 *     summary: Get worker ratings
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: page
 *         in: query
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Worker ratings
 *       404:
 *         description: Worker not found
 * /workers/{id}/statistics:
 *   get:
 *     summary: Get worker statistics
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Worker statistics
 *       404:
 *         description: Worker not found
 */

export const workersRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
workersRouter.param("id", rejectNonUuidParam);
workersRouter.param("workerId", rejectNonUuidParam);
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

// ─── Worker Verification Flow ──────────────────────────────────────────────────
const verificationSubmitSchema = z.object({
  documents: z.array(z.object({
    type: z.string().min(2).max(50),
    fileKey: z.string().min(1),
    issuedBy: z.string().optional(),
    issuedAt: z.string().date().optional(),
    expiresAt: z.string().date().optional(),
  })).min(1).max(20),
  notes: z.string().max(1000).optional(),
});

/**
 * @openapi
 * /workers/me/verification/submit:
 *   post:
 *     summary: Submit worker profile for verification
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [documents]
 *             properties:
 *               documents:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [type, fileKey]
 *                   properties:
 *                     type: { type: string }
 *                     fileKey: { type: string }
 *                     issuedBy: { type: string }
 *                     issuedAt: { type: string, format: date }
 *                     expiresAt: { type: string, format: date }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Verification submitted
 *       400:
 *         description: Missing required documents
 */
workersRouter.post("/me/verification/submit", workerOnly, async (req, res, next) => {
  try {
    const worker = await getWorkerByUserId(req.user!.id);
    if (!worker) { res.status(404).json({ error: "Worker profile not found" }); return; }
    
    if (worker.verificationStatus !== "pending" && worker.verificationStatus !== "rejected") {
      res.status(409).json({ error: `Cannot submit for verification. Current status: ${worker.verificationStatus}` });
      return;
    }

    const input = verificationSubmitSchema.parse(req.body);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Update worker verification status to submitted
      await client.query(
        `UPDATE workers SET verification_status = 'submitted', verification_submitted_at = now(), verification_notes = $1, updated_at = now() WHERE id = $2`,
        [input.notes ?? null, worker.id]
      );

      // Link documents to verification
      for (const doc of input.documents) {
        // First save document if it's a new fileKey
        const docResult = await client.query(
          `INSERT INTO worker_documents (id, worker_id, type, file_url, file_hash, status, issued_by, issued_at, expires_at)
           SELECT $1, $2, $3, file_url, file_hash, 'pending', $4, $5, $6
           FROM uploaded_files WHERE file_key = $7
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [crypto.randomUUID(), worker.id, doc.type, doc.issuedBy ?? null, doc.issuedAt ?? null, doc.expiresAt ?? null, doc.fileKey]
        );

        if (docResult.rows[0]) {
          await client.query(
            `INSERT INTO worker_verification_documents (id, worker_id, document_id, verification_type, status)
             VALUES ($1, $2, $3, 'identity', 'pending')`,
            [crypto.randomUUID(), worker.id, docResult.rows[0].id]
          );
        }
      }

      // Log verification event
      await client.query(
        `INSERT INTO worker_verification_events (id, worker_id, actor_id, from_status, to_status, reason)
         VALUES ($1, $2, $3, $4, 'submitted', $5)`,
        [crypto.randomUUID(), worker.id, req.user!.id, worker.verificationStatus, "Submitted by worker"]
      );

      await client.query("COMMIT");

      await recordAuditEvent({
        actorId: req.user!.id,
        action: "worker.verification.submitted",
        resourceType: "worker",
        resourceId: worker.id,
        requestId: req.header("x-request-id"),
      }).catch(() => undefined);

      res.status(201).json({ message: "Verification submitted for review", workerId: worker.id });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /workers/me/verification/status:
 *   get:
 *     summary: Get worker verification status
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Verification status and details
 */
workersRouter.get("/me/verification/status", workerOnly, async (req, res, next) => {
  try {
    const worker = await getWorkerByUserId(req.user!.id);
    if (!worker) { res.status(404).json({ error: "Worker profile not found" }); return; }

    const [documents, events, verificationDocs] = await Promise.all([
      pool.query(
        `SELECT wd.*, wvd.verification_type, wvd.status as verification_status, wvd.reviewed_at, wvd.rejection_reason
         FROM worker_documents wd
         LEFT JOIN worker_verification_documents wvd ON wvd.document_id = wd.id
         WHERE wd.worker_id = $1
         ORDER BY wd.created_at DESC`,
        [worker.id]
      ),
      pool.query(
        `SELECT wve.*, u.name as actor_name FROM worker_verification_events wve
         LEFT JOIN users u ON u.id = wve.actor_id
         WHERE wve.worker_id = $1 ORDER BY wve.created_at DESC`,
        [worker.id]
      ),
      pool.query(
        `SELECT wvd.*, wd.type as document_type, wd.file_url
         FROM worker_verification_documents wvd
         JOIN worker_documents wd ON wd.id = wvd.document_id
         WHERE wvd.worker_id = $1`,
        [worker.id]
      ),
    ]);

    const requiredDocTypes = ["identity_proof", "address_proof", "skill_certificate", "experience_letter", "cooperative_membership"];
    const submittedTypes = new Set(documents.rows.map(d => d.type));
    const missingDocs = requiredDocTypes.filter(t => !submittedTypes.has(t));

    res.json({
      verificationStatus: worker.verificationStatus,
      verificationSubmittedAt: worker.verificationSubmittedAt,
      verificationNotes: worker.verificationNotes,
      documents: documents.rows,
      events: events.rows,
      verificationDocuments: verificationDocs.rows,
      missingRequiredDocuments: missingDocs,
      isComplete: missingDocs.length === 0 && documents.rows.length > 0,
    });
  } catch (error) { next(error); }
});

// Admin: Submit verification for a worker (society admin can do on behalf)
workersRouter.post("/:workerId/verification/submit", requireRoles("society_admin", "federation_admin", "system_admin"), async (req, res, next) => {
  try {
    const workerId = z.string().uuid().parse(req.params.workerId);
    const input = verificationSubmitSchema.parse(req.body);

    const worker = await pool.query("SELECT * FROM workers WHERE id = $1", [workerId]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE workers SET verification_status = 'submitted', verification_submitted_at = now(), verification_notes = $1, updated_at = now() WHERE id = $2`,
        [input.notes ?? null, workerId]
      );
      for (const doc of input.documents) {
        const docResult = await client.query(
          `INSERT INTO worker_documents (id, worker_id, type, file_url, file_hash, status, issued_by, issued_at, expires_at)
           SELECT $1, $2, $3, file_url, file_hash, 'pending', $4, $5, $6
           FROM uploaded_files WHERE file_key = $7
           ON CONFLICT DO NOTHING RETURNING id`,
          [crypto.randomUUID(), workerId, doc.type, doc.issuedBy ?? null, doc.issuedAt ?? null, doc.expiresAt ?? null, doc.fileKey]
        );
        if (docResult.rows[0]) {
          await client.query(
            `INSERT INTO worker_verification_documents (id, worker_id, document_id, verification_type, status)
             VALUES ($1, $2, $3, 'identity', 'pending')`,
            [crypto.randomUUID(), workerId, docResult.rows[0].id]
          );
        }
      }
      await client.query(
        `INSERT INTO worker_verification_events (id, worker_id, actor_id, from_status, to_status, reason)
         VALUES ($1, $2, $3, $4, 'submitted', $5)`,
        [crypto.randomUUID(), workerId, req.user!.id, worker.rows[0].verificationStatus, "Submitted by admin"]
      );
      await client.query("COMMIT");
      res.status(201).json({ message: "Verification submitted", workerId });
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
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

/**
 * @openapi
 * /workers/me/skills:
 *   get:
 *     summary: List the caller's certified skills
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Skills with certification level }
 *       404: { description: No worker profile for this account }
 */
workersRouter.get("/me/skills", workerOnly, async (req, res, next) => {
  try {
    const worker = await pool.query("select id from workers where user_id = $1", [req.user!.id]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker profile not found" }); return; }

    const result = await pool.query(
      `select ws.service_id, ws.certification_level,
              s.name as service_name, s.category,
              exists (
                select 1 from certifications c
                 where c.worker_id = ws.worker_id and c.status = 'active'
              ) as has_active_certification
         from worker_skills ws
         join services s on s.id = ws.service_id
        where ws.worker_id = $1
        order by s.name`,
      [worker.rows[0].id]
    );

    res.json({ skills: result.rows });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /workers/me/service-areas:
 *   get:
 *     summary: Get the caller's configured coverage radius per service
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Service areas }
 *       404: { description: No worker profile for this account }
 */
workersRouter.get("/me/service-areas", workerOnly, async (req, res, next) => {
  try {
    const worker = await pool.query("select id, service_radius_km from workers where user_id = $1", [req.user!.id]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker profile not found" }); return; }

    const result = await pool.query(
      `select wsa.service_id, wsa.radius_km, s.name as service_name, s.category
         from worker_service_areas wsa
         join services s on s.id = wsa.service_id
        where wsa.worker_id = $1
        order by s.name`,
      [worker.rows[0].id]
    );

    res.json({ serviceAreas: result.rows, defaultRadiusKm: worker.rows[0].service_radius_km ?? null });
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

// Blueprint spells this POST /workers/me/location; the codebase used PUT.
workersRouter.put(["/me/location"], workerOnly, async (req, res, next) => {
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

/**
 * @openapi
 * /workers/{id}/jobs:
 *   get:
 *     summary: Get worker job history
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: page
 *         in: query
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: List of worker jobs
 *       404:
 *         description: Worker not found
 */
workersRouter.get("/:id/jobs", async (req, res, next) => {
  try {
    const page = Math.max(parseInt(String(req.query.page ?? 1)), 1);
    const limit = Math.min(parseInt(String(req.query.limit ?? 20)), 100);
    const offset = (page - 1) * limit;

    const result = await pool.query(`SELECT b.id, b.booking_number, b.status, b.scheduled_at, b.is_emergency, b.address, b.description, b.price, b.created_at, s.name as service_name FROM bookings b JOIN services s ON s.id = b.service_id WHERE b.worker_id = $1 ORDER BY b.created_at DESC LIMIT $2 OFFSET $3`, [req.params.id, limit, offset]);
    res.json({ bookings: result.rows, page, limit });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /workers/{id}/earnings:
 *   get:
 *     summary: Get worker earnings
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Worker earnings
 *       404:
 *         description: Worker not found
 */
workersRouter.get("/:id/earnings", async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT entry_type, amount, reference, created_at, booking_id FROM worker_earnings_ledger WHERE worker_id = $1 ORDER BY created_at DESC LIMIT 100`, [req.params.id]);
    const summary = await pool.query(`SELECT SUM(CASE WHEN entry_type = 'earning' THEN amount ELSE 0 END) as total_earnings, SUM(CASE WHEN entry_type = 'payout' THEN amount ELSE 0 END) as total_payouts, SUM(CASE WHEN entry_type = 'adjustment' THEN amount ELSE 0 END) as total_adjustments, SUM(CASE WHEN entry_type = 'refund' THEN amount ELSE 0 END) as total_refunds FROM worker_earnings_ledger WHERE worker_id = $1`, [req.params.id]);
    res.json({ ledger: result.rows, summary: summary.rows[0] });
} catch (error) { next(error); }
});

/**
 * @openapi
 * /workers/{id}/ratings:
 *   get:
 *     summary: Get worker ratings
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: page
 *         in: query
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Worker ratings
 *       404:
 *         description: Worker not found
 */
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

/**
 * @openapi
 * /workers/{id}/statistics:
 *   get:
 *     summary: Get worker statistics
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Worker statistics
 *       404:
 *         description: Worker not found
 */
workersRouter.get("/:id/statistics", async (req, res, next) => {
  try {
    const stats = await pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs, COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_jobs, AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/60) as avg_job_duration_minutes FROM bookings WHERE worker_id = $1 AND status IN ('completed', 'cancelled')`, [req.params.id]);
    const rating = await pool.query(`SELECT AVG(rating)::numeric(2,1) as avg_rating, COUNT(*) as total_ratings FROM reviews WHERE worker_id = $1`, [req.params.id]);
    const responseTime = await pool.query(`SELECT AVG(EXTRACT(EPOCH FROM (accepted_at - created_at))/60) as avg_response_minutes FROM (SELECT b.id, b.created_at, bse.created_at as accepted_at FROM bookings b JOIN booking_status_events bse ON bse.booking_id = b.id WHERE b.worker_id = $1 AND bse.status = 'accepted') sub`, [req.params.id]);
    res.json({ ...stats.rows[0], ...rating.rows[0], ...responseTime.rows[0] });
  } catch (error) { next(error); }
});

workersRouter.get("/:id", async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT w.id, w.worker_code, w.verification_status, w.rating, w.current_status, w.experience_years, w.service_radius_km, w.bio, w.total_jobs, w.completed_jobs, w.cancelled_jobs, u.name, u.avatar_url, c.name as cooperative_name, c.district, c.state FROM workers w JOIN users u ON u.id = w.user_id LEFT JOIN cooperatives c ON c.id = w.cooperative_id WHERE w.id = $1`, [req.params.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    const worker = result.rows[0];
    const skills = await pool.query(`SELECT ws.skill_id, s.name, s.category, ws.level, ws.years_experience, ws.verified FROM worker_skills_new ws JOIN skills s ON s.id = ws.skill_id WHERE ws.worker_id = $1`, [worker.id]);
    const serviceAreas = await pool.query(`SELECT wsa.service_id, s.name, wsa.radius_km FROM worker_service_areas wsa JOIN services s ON s.id = wsa.service_id WHERE wsa.worker_id = $1`, [worker.id]);
    res.json({ worker, skills: skills.rows, serviceAreas: serviceAreas.rows });
  } catch (error) { next(error); }
});

export default workersRouter;
