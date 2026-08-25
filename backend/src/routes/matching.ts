import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { 
  findMatchingWorkers, 
  recommendWorker, 
  assignWorker, 
  reassignWorker, 
  getMatchingAudit,
  getWorkerAvailability,
  updateWorkerAvailability,
  getWorkerLocation,
  updateWorkerLocation,
  getNearbyWorkers,
  type MatchingCriteria
} from "../services/matching.js";
import { recordAuditEvent } from "../services/auditService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

export const matchingRouter = Router();
matchingRouter.param("id", rejectNonUuidParam);
matchingRouter.param("bookingId", rejectNonUuidParam);
matchingRouter.param("workerId", rejectNonUuidParam);

const matchingCriteriaSchema = z.object({
  serviceId: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  urgency: z.enum(["regular", "emergency"]).default("regular"),
  radiusKm: z.number().positive().max(50).optional(),
  maxDistanceKm: z.number().positive().max(100).optional(),
  minRating: z.number().min(0).max(5).optional(),
  excludeWorkerIds: z.array(z.string().uuid()).optional(),
  requiredSkills: z.array(z.string().uuid()).optional(),
});

const assignWorkerSchema = z.object({
  workerId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500).optional(),
});

const availabilitySchema = z.object({
  status: z.enum(["available", "busy", "offline"]),
});

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().positive().optional(),
});

/**
 * @openapi
 * /matching/candidates:
 *   post:
 *     summary: Find matching workers for a service request
 *     tags: [Matching]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serviceId, latitude, longitude]
 *             properties:
 *               serviceId: { type: string, format: uuid }
 *               latitude: { type: number, minimum: -90, maximum: 90 }
 *               longitude: { type: number, minimum: -180, maximum: 180 }
 *               urgency: { type: string, enum: [regular, emergency], default: regular }
 *               radiusKm: { type: number, minimum: 1, maximum: 50 }
 *               maxDistanceKm: { type: number, minimum: 1, maximum: 100 }
 *               minRating: { type: number, minimum: 0, maximum: 5 }
 *               excludeWorkerIds: { type: array, items: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Ranked list of matching workers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 workers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       workerId: { type: string, format: uuid }
 *                       name: { type: string }
 *                       distanceKm: { type: number }
 *                       rating: { type: number }
 *                       jobsToday: { type: number }
 *                       hasCertification: { type: boolean }
 *                       isAvailable: { type: boolean }
 *                       score: { type: number }
 *                       reasons: { type: array, items: { type: string } }
 *                 totalCandidates: { type: integer }
 *                 searchRadiusKm: { type: number }
 *                 searchTimeMs: { type: integer }
 *       400: { description: Invalid criteria }
 *       401: { description: Unauthorized }
 */
matchingRouter.post("/candidates", requireAuth, async (req, res, next) => {
  try {
    const criteria = matchingCriteriaSchema.parse(req.body);
    const result = await findMatchingWorkers(criteria);
    res.json(result);
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /matching/bookings/{bookingId}/candidates:
 *   get:
 *     summary: Get matching candidates for a specific booking
 *     tags: [Matching]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: bookingId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: radiusKm
 *         in: query
 *         schema: { type: number, minimum: 1, maximum: 50 }
 *       - name: maxDistanceKm
 *         in: query
 *         schema: { type: number, minimum: 1, maximum: 100 }
 *       - name: minRating
 *         in: query
 *         schema: { type: number, minimum: 0, maximum: 5 }
 *     responses:
 *       200:
 *         description: Ranked matching candidates
 *       404:
 *         description: Booking not found
 *       403:
 *         description: Forbidden
 */
matchingRouter.get("/bookings/:bookingId/candidates", requireAuth, async (req, res, next) => {
  try {
    const bookingId = req.params.bookingId;
    
    // Verify access to booking
    const booking = await pool.query(
      `SELECT id, service_id, customer_id FROM bookings WHERE id = $1`,
      [bookingId]
    );
    if (!booking.rows[0]) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    
    const bookingData = booking.rows[0];
    if (bookingData.customer_id !== req.user!.id && !["system_admin", "federation_admin", "society_admin", "support_staff"].includes(req.user!.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    
    const criteria: MatchingCriteria = {
      serviceId: bookingData.service_id,
      latitude: 0, // Will be overridden from booking location
      longitude: 0,
      urgency: "regular",
      radiusKm: req.query.radiusKm ? Number(req.query.radiusKm) : undefined,
      maxDistanceKm: req.query.maxDistanceKm ? Number(req.query.maxDistanceKm) : undefined,
      minRating: req.query.minRating ? Number(req.query.minRating) : undefined,
    };
    
    // Get booking location
    const bookingLoc = await pool.query(
      `SELECT ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng FROM bookings WHERE id = $1`,
      [bookingId]
    );
    if (bookingLoc.rows[0]) {
      criteria.latitude = Number(bookingLoc.rows[0].lat);
      criteria.longitude = Number(bookingLoc.rows[0].lng);
    }
    
    // Get urgency from booking
    const bookingUrgency = await pool.query(`SELECT is_emergency FROM bookings WHERE id = $1`, [bookingId]);
    if (bookingUrgency.rows[0]?.is_emergency) {
      criteria.urgency = "emergency";
    }
    
    const result = await findMatchingWorkers(criteria);
    res.json(result);
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /matching/bookings/{bookingId}/recommend:
 *   get:
 *     summary: Get top worker recommendation for a booking
 *     tags: [Matching]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: bookingId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Top recommendation with reasoning
 *       404:
 *         description: Booking not found
 */
matchingRouter.get("/bookings/:bookingId/recommend", requireAuth, async (req, res, next) => {
  try {
    const bookingId = String(req.params.bookingId);
    
    const booking = await pool.query(
      `SELECT id, service_id, is_emergency FROM bookings WHERE id = $1`,
      [bookingId]
    );
    if (!booking.rows[0]) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    
    const bookingData = booking.rows[0];
    if (bookingData.customer_id !== req.user!.id && !["system_admin", "federation_admin", "society_admin", "support_staff"].includes(req.user!.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    
    // Get location
    const bookingLoc = await pool.query(
      `SELECT ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng FROM bookings WHERE id = $1`,
      [bookingId]
    );
    if (!bookingLoc.rows[0]) {
      res.status(400).json({ error: "Booking has no location" });
      return;
    }
    
    const criteria: any = {
      serviceId: bookingData.service_id,
      latitude: Number(bookingLoc.rows[0].lat),
      longitude: Number(bookingLoc.rows[0].lng),
      urgency: bookingData.is_emergency ? "emergency" : "regular",
      radiusKm: 15
    };
    
    const recommendation = await recommendWorker(bookingId, criteria);
    res.json(recommendation);
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /matching/bookings/{bookingId}/assign:
 *   post:
 *     summary: Assign a worker to a booking
 *     tags: [Matching]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: bookingId
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
 *               reason: { type: string, maxLength: 500 }
 *     responses:
 *       200:
 *         description: Worker assigned successfully
 *       404:
 *         description: Booking or worker not found
 *       409:
 *         description: Worker not available
 *       403:
 *         description: Forbidden
 */
matchingRouter.post("/bookings/:bookingId/assign", requireAuth, async (req, res, next) => {
  try {
    const bookingId = String(req.params.bookingId);
    const input = assignWorkerSchema.parse(req.body);
    
    const result = await assignWorker(bookingId, input.workerId, req.user!.id, input.reason || "manual_assignment");
    res.json({ success: true, booking: result.booking });
  } catch (error) { 
    const err = error as Error;
    if (err.message.includes("not found")) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err.message.includes("not available")) {
      res.status(409).json({ error: err.message });
      return;
    }
    next(err); 
  }
});

/**
 * @openapi
 * /matching/bookings/{bookingId}/reassign:
 *   post:
 *     summary: Reassign a booking to a different worker
 *     tags: [Matching]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: bookingId
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
 *               reason: { type: string, maxLength: 500 }
 *     responses:
 *       200:
 *         description: Booking reassigned successfully
 *       404:
 *         description: Booking or worker not found
 *       409:
 *         description: Worker not available
 */
matchingRouter.post("/bookings/:bookingId/reassign", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const bookingId = String(req.params.bookingId);
    const input = assignWorkerSchema.parse(req.body);
    
    const result = await reassignWorker(bookingId, input.workerId, req.user!.id, input.reason || "reassigned_by_admin");
    res.json({ success: true, booking: result.booking });
  } catch (error) { 
    const err = error as Error;
    if (err.message.includes("not found")) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err.message.includes("not available")) {
      res.status(409).json({ error: err.message });
      return;
    }
    next(err); 
  }
});

/**
 * @openapi
 * /matching/bookings/{bookingId}/audit:
 *   get:
 *     summary: Get matching audit trail for a booking
 *     tags: [Matching]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: bookingId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Matching audit trail
 */
matchingRouter.get("/bookings/:bookingId/audit", requireAuth, async (req, res, next) => {
  try {
    const audit = await getMatchingAudit(String(req.params.bookingId));
    res.json({ audit });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /matching/workers/{workerId}/availability:
 *   get:
 *     summary: Get worker availability status
 *     tags: [Matching]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Worker availability status
 *   patch:
 *     summary: Update worker availability (worker only)
 *     tags: [Matching]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [available, busy, offline] }
 *     responses:
 *       200:
 *         description: Availability updated
 */
matchingRouter.get("/workers/:workerId/availability", requireAuth, async (req, res, next) => {
  try {
    const availability = await getWorkerAvailability(String(req.params.workerId));
    res.json({ availability });
  } catch (error) { next(error); }
});

matchingRouter.patch("/workers/:workerId/availability", requireAuth, async (req, res, next) => {
  try {
    const workerId = String(req.params.workerId);
    const worker = await pool.query(`SELECT user_id FROM workers WHERE id = $1`, [workerId]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    if (worker.rows[0].user_id !== req.user!.id && !["system_admin"].includes(req.user!.role)) {
      res.status(403).json({ error: "Cannot update another worker's availability" });
      return;
    }
    const input = availabilitySchema.parse(req.body);
    await updateWorkerAvailability(workerId, input.status);
    res.json({ message: "Availability updated" });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /matching/workers/{workerId}/location:
 *   get:
 *     summary: Get worker current location
 *     tags: [Matching]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Worker location
 *       404:
 *         description: Location not available
 *   put:
 *     summary: Update worker location (worker only)
 *     tags: [Matching]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude: { type: number, minimum: -90, maximum: 90 }
 *               longitude: { type: number, minimum: -180, maximum: 180 }
 *               accuracy: { type: number, minimum: 0 }
 *     responses:
 *       200:
 *         description: Location updated
 */
matchingRouter.get("/workers/:workerId/location", requireAuth, async (req, res, next) => {
  try {
    const location = await getWorkerLocation(String(req.params.workerId));
    if (!location) { res.status(404).json({ error: "Location not available" }); return; }
    res.json({ location });
  } catch (error) { next(error); }
});

matchingRouter.put("/workers/:workerId/location", requireAuth, async (req, res, next) => {
  try {
    const workerId = String(req.params.workerId);
    const worker = await pool.query(`SELECT user_id FROM workers WHERE id = $1`, [workerId]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    if (worker.rows[0].user_id !== req.user!.id && !["system_admin"].includes(req.user!.role)) {
      res.status(403).json({ error: "Cannot update another worker's location" });
      return;
    }
    const input = locationSchema.parse(req.body);
    await updateWorkerLocation(workerId, input.latitude, input.longitude, input.accuracy);
    res.json({ message: "Location updated" });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /matching/nearby:
 *   get:
 *     summary: Find nearby workers (alias for /workers/nearby)
 *     tags: [Matching]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: serviceId
 *         in: query
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: latitude
 *         in: query
 *         required: true
 *         schema: { type: number, minimum: -90, maximum: 90 }
 *       - name: longitude
 *         in: query
 *         required: true
 *         schema: { type: number, minimum: -180, maximum: 180 }
 *       - name: urgency
 *         in: query
 *         schema: { type: string, enum: [regular, emergency] }
 *       - name: radiusKm
 *         in: query
 *         schema: { type: number, minimum: 1, maximum: 50 }
 *     responses:
 *       200:
 *         description: Nearby matching workers
 */
matchingRouter.get("/nearby", requireAuth, async (req, res, next) => {
  try {
    const params = z.object({
      serviceId: z.string().uuid(),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      urgency: z.enum(["regular", "emergency"]).default("regular"),
      radiusKm: z.number().positive().max(50).optional(),
    }).parse(req.query);
    
    const workers = await getNearbyWorkers(params);
    res.json({ workers });
  } catch (error) { next(error); }
});

