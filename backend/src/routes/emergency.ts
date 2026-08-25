import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { findMatchingWorkers } from "../services/matching.js";
import { writeNotification } from "../services/notificationService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";
import { generateBookingOtps } from "../core/otp.js";
import { enqueue } from "../core/jobQueue.js";
import { escalateEmergency, scheduleAssignmentTimeout } from "../services/emergencyService.js";

/**
 * @openapi
 * /emergency/bookings:
 *   post:
 *     summary: Create emergency booking
 *     tags: [Emergency]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [serviceId, description, latitude, longitude, address], properties: { serviceId: { type: string, format: uuid }, description: { type: string }, latitude: { type: number }, longitude: { type: number }, address: { type: string }, priority: { type: string, enum: [critical, high, standard] }, duplicateKey: { type: string } } }
 *     responses:
 *       201: { description: Emergency booking created }
 *       409: { description: Duplicate emergency request }
 * /emergency/active:
 *   get:
 *     summary: List active emergencies (admin)
 *     tags: [Emergency]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of active emergencies }
 * /emergency/{id}:
 *   get:
 *     summary: Get emergency details with timeline
 *     tags: [Emergency]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Emergency details }
 *       404: { description: Not found }
 * /emergency/{id}/escalate:
 *   post:
 *     summary: Escalate emergency (admin)
 *     tags: [Emergency]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { newRadiusKm: { type: number }, notifySupervisors: { type: boolean } } }
 *     responses:
 *       200: { description: Emergency escalated }
 * /emergency/{id}/resolve:
 *   post:
 *     summary: Resolve emergency (admin)
 *     tags: [Emergency]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Emergency resolved }
 * /emergency/{id}/reassign:
 *   post:
 *     summary: Reassign emergency (admin)
 *     tags: [Emergency]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [workerId], properties: { workerId: { type: string, format: uuid } } }
 *     responses:
 *       200: { description: Emergency reassigned }
 */

export const emergencyRouter = Router();

emergencyRouter.param("id", rejectNonUuidParam);

const emergencyCreateSchema = z.object({
  serviceId: z.string().uuid(),
  description: z.string().trim().min(3).max(2000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().trim().min(3).max(500),
  priority: z.enum(["critical", "high", "standard"]).default("high"),
  duplicateKey: z.string().optional(),
});

const escalateSchema = z.object({
  newRadiusKm: z.number().positive().max(50).optional(),
  notifySupervisors: z.boolean().default(true),
  reason: z.string().max(500).optional(),
});

emergencyRouter.post("/bookings", requireAuth, async (req, res, next) => {
  try {
    if (!req.user || !["customer", "institutional_customer"].includes(req.user.role)) { res.status(403).json({ error: "Only customers can create emergency bookings" }); return; }
    const input = emergencyCreateSchema.parse(req.body);

    const duplicateKey = input.duplicateKey ?? `${req.user.id}:${input.serviceId}:${input.latitude.toFixed(3)}:${input.longitude.toFixed(3)}`;
    const existing = await pool.query(`SELECT booking_id FROM emergency_bookings WHERE duplicate_key = $1 AND created_at > now() - interval '10 minutes'`, [duplicateKey]);
    if (existing.rows[0]) { res.status(409).json({ error: "EMERGENCY_DUPLICATE", message: "Similar emergency request already exists" }); return; }

    const service = await pool.query(`SELECT id, base_price, emergency_supported FROM services WHERE id = $1`, [input.serviceId]);
    if (!service.rows[0]) { res.status(404).json({ error: "Service not found" }); return; }
    if (!service.rows[0].emergency_supported) { res.status(400).json({ error: "Emergency not supported for this service" }); return; }

    const radiusKm = input.priority === "critical" ? 5 : input.priority === "high" ? 8 : 10;
    const maxResponseMinutes = input.priority === "critical" ? 15 : input.priority === "high" ? 30 : 60;

    const client = await pool.connect();
    try {
      await client.query("begin");

      const matches = await findMatchingWorkers({ serviceId: input.serviceId, latitude: input.latitude, longitude: input.longitude, urgency: "emergency", radiusKm });
      const workerId: string | null = matches.workers[0]?.workerId ?? null;
      const status = workerId ? "assigned" : "requested";
      let confirmedWorkerId: string | null = workerId;

      if (workerId) {
        const worker = await client.query("select id from workers where id = $1 and verification_status = 'verified' and current_status = 'available' for update", [workerId]);
        if (!worker.rows[0]) { confirmedWorkerId = null; }
        else {
          const reserved = await client.query("update workers set current_status = 'busy', updated_at = now() where id = $1 and current_status = 'available' returning id", [workerId]);
          if (!reserved.rows[0]) confirmedWorkerId = null;
        }
      }

      const { startOtp, completionOtp, startOtpHash, completionOtpHash } = generateBookingOtps();

      const bookingResult = await client.query(
        `insert into bookings
           (id, customer_id, worker_id, service_id, status, is_emergency, location, address, description,
            start_otp_hash, completion_otp_hash, otp_issued_at)
         values ($1, $2, $3, $4, $5, true, st_setsrid(st_makepoint($6, $7), 4326)::geography, $8, $9, $10, $11, now())
         returning id`,
        [crypto.randomUUID(), req.user.id, confirmedWorkerId, input.serviceId,
         confirmedWorkerId ? "assigned" : "requested", input.longitude, input.latitude,
         input.address, input.description, startOtpHash, completionOtpHash]
      );
      const bookingId = bookingResult.rows[0].id;

      await client.query(`insert into emergency_bookings (booking_id, priority, radius_km, max_response_minutes, escalation_level, duplicate_key) values ($1, $2, $3, $4, 0, $5)`, [bookingId, input.priority, radiusKm, maxResponseMinutes, duplicateKey]);
      await client.query("insert into booking_status_events (booking_id, status, actor_id, reason, request_id) values ($1, $2, $3, $4, $5)", [bookingId, status, req.user.id, confirmedWorkerId ? "emergency_matched" : "emergency_awaiting_worker", null]);

      if (confirmedWorkerId) {
        const workerUser = await client.query("select user_id from workers where id = $1", [confirmedWorkerId]);
        if (workerUser.rows[0]) await writeNotification(client, { userId: workerUser.rows[0].user_id, type: "emergency.assigned", title: "Emergency service request", body: "You have been assigned an emergency service request.", aggregateType: "booking", aggregateId: bookingId });
      }

      await client.query("commit");

      // Durable scheduling: survives restarts, unlike the setTimeout this replaces.
      if (confirmedWorkerId) {
        // Blueprint 5.4: accept within WORKER_ACCEPT_TIMEOUT_SECONDS or the job
        // moves to the next candidate.
        await scheduleAssignmentTimeout(bookingId, confirmedWorkerId);
      } else {
        await enqueue(
          "emergency.escalate",
          { bookingId, reason: "no_worker_at_dispatch" },
          { delaySeconds: maxResponseMinutes * 60, dedupeKey: `emergency-escalate:${bookingId}` }
        );
      }

      res.status(201).json({
        bookingId,
        status,
        recommendedWorker: confirmedWorkerId ? matches.workers[0] ?? null : null,
        alternatives: matches.workers.slice(1, 4),
        // Shown once; only the hashes are stored.
        otps: { startOtp, completionOtp },
      });
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  } catch (error) { next(error); }
});

emergencyRouter.get("/active", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const result = await pool.query(`select b.id, b.customer_id, b.worker_id, b.service_id, b.status, b.address, b.description, b.created_at, eb.priority, eb.radius_km, eb.max_response_minutes, eb.escalation_level, eb.escalated_at, u.name as customer_name, s.name as service_name from emergency_bookings eb join bookings b on b.id = eb.booking_id join users u on u.id = b.customer_id join services s on s.id = b.service_id where b.status not in ('completed', 'cancelled') order by emergency_priority_rank(eb.priority) desc, b.created_at asc`);
    res.json({ emergencies: result.rows });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /emergency/zones:
 *   get:
 *     summary: Emergency density heatmap by zone
 *     description: >
 *       Buckets emergency bookings from the last N days onto a coarse
 *       geographic grid and reports volume, response time and current
 *       responder coverage per cell.
 *     tags: [Emergency]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: days
 *         in: query
 *         schema: { type: integer, default: 30, minimum: 1, maximum: 365 }
 *       - name: precision
 *         in: query
 *         description: Grid size in decimal degrees (default 0.05, roughly 5km).
 *         schema: { type: number, default: 0.05 }
 *     responses:
 *       200: { description: Zone density buckets }
 */
emergencyRouter.get(
  "/zones",
  requireAuth,
  requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"),
  async (req, res, next) => {
    try {
      const days = Math.min(Math.max(parseInt(String(req.query.days ?? 30), 10) || 30, 1), 365);
      const precision = Math.min(Math.max(Number(req.query.precision ?? 0.05), 0.01), 1);

      const result = await pool.query(
        `with grid as (
           select
             round((st_y(b.location::geometry) / $2)::numeric) * $2 as lat_cell,
             round((st_x(b.location::geometry) / $2)::numeric) * $2 as lng_cell,
             b.id,
             b.status,
             eb.priority,
             eb.escalation_level,
             extract(epoch from (
               coalesce(eb.resolved_at, b.updated_at) - b.created_at
             )) / 60 as response_minutes
           from emergency_bookings eb
           join bookings b on b.id = eb.booking_id
           where b.location is not null
             and b.created_at >= now() - ($1 || ' days')::interval
         )
         select lat_cell::float8                                  as latitude,
                lng_cell::float8                                  as longitude,
                count(*)::int                                     as incident_count,
                count(*) filter (where status not in ('completed', 'cancelled'))::int as active_count,
                count(*) filter (where priority = 'critical')::int as critical_count,
                round(avg(response_minutes)::numeric, 1)::float8   as avg_response_minutes,
                round(avg(escalation_level)::numeric, 2)::float8   as avg_escalation_level
           from grid
          group by lat_cell, lng_cell
          having count(*) > 0
          order by incident_count desc
          limit 500`,
        [String(days), precision]
      );

      // Available responders per cell, so a hotspot can be read against capacity.
      const coverage = await pool.query(
        `select round((st_y(wl.location::geometry) / $1)::numeric) * $1 as lat_cell,
                round((st_x(wl.location::geometry) / $1)::numeric) * $1 as lng_cell,
                count(*)::int as available_workers
           from worker_locations wl
           join workers w on w.id = wl.worker_id
          where w.verification_status = 'verified'
            and w.current_status = 'available'
          group by lat_cell, lng_cell`,
        [precision]
      );

      const coverageByCell = new Map(
        coverage.rows.map((row) => [`${row.lat_cell}:${row.lng_cell}`, Number(row.available_workers)])
      );

      res.json({
        windowDays: days,
        precision,
        zones: result.rows.map((row) => ({
          ...row,
          availableWorkers: coverageByCell.get(`${row.latitude}:${row.longitude}`) ?? 0,
        })),
      });
    } catch (error) { next(error); }
  }
);

emergencyRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const bookingId = String(req.params.id);
    const result = await pool.query(`select b.id, b.customer_id, b.worker_id, b.service_id, b.status, b.address, b.description, b.created_at, b.updated_at, eb.priority, eb.radius_km, eb.max_response_minutes, eb.escalation_level, eb.escalated_at, eb.resolved_at, u.name as customer_name, s.name as service_name from emergency_bookings eb join bookings b on b.id = eb.booking_id join users u on u.id = b.customer_id join services s on s.id = b.service_id where b.id = $1`, [bookingId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Emergency booking not found" }); return; }
    const timeline = await pool.query(`select bse.*, u.name as actor_name from booking_status_events bse left join users u on u.id = bse.actor_id where bse.booking_id = $1 order by bse.created_at asc`, [bookingId]);
    res.json({ emergency: result.rows[0], timeline: timeline.rows });
  } catch (error) { next(error); }
});

emergencyRouter.post("/:id/escalate", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const bookingId = String(req.params.id);
    const input = escalateSchema.parse(req.body);

    // escalateEmergency writes the emergency_escalations audit row itself; this
    // handler used to write a second one, duplicating every manual escalation.
    const result = await escalateEmergency(
      bookingId,
      input.newRadiusKm,
      input.notifySupervisors,
      input.reason ?? "manual_escalation"
    );

    if (!result.escalated) {
      const status = result.reason === "NOT_AN_EMERGENCY_BOOKING" ? 404 : 409;
      res.status(status).json({ error: result.reason, escalationLevel: result.escalationLevel });
      return;
    }

    void recordAuditEvent({
      actorId: req.user!.id,
      action: "emergency.escalated",
      resourceType: "emergency_booking",
      resourceId: bookingId,
      requestId: req.header("x-request-id") ?? undefined,
      metadata: { attempt: result.escalationLevel, radiusKm: result.radiusKm, assigned: Boolean(result.assignedWorkerId) },
    }).catch(() => undefined);

    res.json({
      message: "Emergency escalated",
      attemptNumber: result.escalationLevel,
      radiusKm: result.radiusKm,
      assignedWorkerId: result.assignedWorkerId ?? null,
    });
  } catch (error) { next(error); }
});

emergencyRouter.post("/:id/resolve", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const bookingId = String(req.params.id);
    await pool.query(`update emergency_bookings set resolved_at = now() where booking_id = $1`, [bookingId]);
    await pool.query(`update bookings set status = 'completed', updated_at = now() where id = $1 and status not in ('completed', 'cancelled')`, [bookingId]);
    void recordAuditEvent({ actorId: req.user!.id, action: "emergency.resolved", resourceType: "emergency_booking", resourceId: bookingId, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.json({ message: "Emergency resolved" });
  } catch (error) { next(error); }
});

emergencyRouter.post("/:id/reassign", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const bookingId = String(req.params.id);
    const input = z.object({ workerId: z.string().uuid() }).parse(req.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const current = await client.query(`select b.id, b.worker_id from bookings b where b.id = $1 for update`, [bookingId]);
      if (!current.rows[0]) { await client.query("rollback"); res.status(404).json({ error: "Booking not found" }); return; }
      if (current.rows[0].worker_id) {
        await client.query("update workers set current_status = 'available', updated_at = now() where id = $1", [current.rows[0].worker_id]);
      }
      const worker = await client.query("select id from workers where id = $1 and verification_status = 'verified' and current_status = 'available' for update", [input.workerId]);
      if (!worker.rows[0]) { await client.query("rollback"); res.status(409).json({ error: "Worker not available" }); return; }
      await client.query("update workers set current_status = 'busy', updated_at = now() where id = $1", [input.workerId]);
      await client.query(`update bookings set worker_id = $1, status = 'assigned', updated_at = now() where id = $2`, [input.workerId, bookingId]);
      await client.query("insert into booking_status_events (booking_id, status, actor_id, reason, request_id) values ($1, 'assigned', $2, $3, $4)", [bookingId, req.user!.id, `emergency_reassigned_to_${input.workerId}`, req.header("x-request-id") ?? null]);
      const workerUser = await client.query("select user_id from workers where id = $1", [input.workerId]);
      if (workerUser.rows[0]) await writeNotification(client, { userId: workerUser.rows[0].user_id, type: "emergency.assigned", title: "Emergency service request", body: "You have been assigned an emergency service request.", aggregateType: "booking", aggregateId: bookingId });
      await client.query("commit");
      res.json({ message: "Emergency reassigned" });
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  } catch (error) { next(error); }
});
