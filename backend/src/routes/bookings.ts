import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { createDemoBooking, findDemoMatches, getDemoBooking, updateDemoBookingStatus } from "../data/demoStore.js";
import { bookingStatuses, createBooking, getBookingForUser, listBookingsForUser, transitionBooking, cancelBooking, rescheduleBooking, acceptBooking, rejectBooking, startBooking, completeBooking, reassignBooking, getBookingTimeline, type BookingStatus } from "../services/bookingService.js";
import { recordAuditEvent } from "../services/auditService.js";
import { requireRoles } from "../middleware/auth.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";
import { emitBookingStatusChange } from "../core/realtime.js";
import crypto from "node:crypto";
import { pool } from "../db/pool.js";
import { generateOtp, sha256Hex } from "../core/otp.js";
import { settleBooking } from "../services/revenueSplit.js";
import { clearAssignmentTimeout, scheduleAssignmentTimeout } from "../services/emergencyService.js";

/**
 * @openapi
 * /bookings:
 *   post:
 *     summary: Create a booking
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *   get:
 *     summary: List the caller's bookings
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 * /bookings/{id}:
 *   get:
 *     summary: Get an authorized booking
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Booking details
 *       404:
 *         description: Booking not found
 * /bookings/{id}/status:
 *   patch:
 *     summary: Transition a booking status
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Status updated
 *       404:
 *         description: Booking not found
 * /bookings/{id}/cancel:
 *   post:
 *     summary: Cancel a booking
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Booking cancelled
 *       404:
 *         description: Booking not found
 * /bookings/{id}/reschedule:
 *   post:
 *     summary: Reschedule a booking
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Booking rescheduled
 *       404:
 *         description: Booking not found
 * /bookings/{id}/accept:
 *   post:
 *     summary: Accept a booking (worker)
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Booking accepted
 *       404:
 *         description: Booking not found
 * /bookings/{id}/reject:
 *   post:
 *     summary: Reject a booking (worker)
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Booking rejected
 *       404:
 *         description: Booking not found
 * /bookings/{id}/start:
 *   post:
 *     summary: Start a booking (worker)
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Booking started
 *       404:
 *         description: Booking not found
 * /bookings/{id}/complete:
 *   post:
 *     summary: Complete a booking (worker)
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Booking completed
 *       404:
 *         description: Booking not found
 * /bookings/{id}/reassign:
 *   post:
 *     summary: Reassign a booking (admin)
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Booking reassigned
 *       404:
 *         description: Booking not found
 * /bookings/{id}/timeline:
 *   get:
 *     summary: Get booking status timeline
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Booking timeline
 *       404:
 *         description: Booking not found
 */

export const bookingsRouter = Router();
bookingsRouter.param("id", rejectNonUuidParam);
const createBookingSchema = z.object({ serviceId: z.string().uuid(), description: z.string().trim().min(3).max(2000), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), address: z.string().trim().min(3).max(500), scheduledAt: z.string().datetime().optional(), isEmergency: z.boolean().default(false) });
const statusSchema = z.enum(bookingStatuses);

bookingsRouter.post("/", async (req, res, next) => {
  try {
    if (!req.user || !["customer", "institutional_customer"].includes(req.user.role)) { res.status(403).json({ error: "Only customers can create bookings" }); return; }
    const input = createBookingSchema.parse(req.body);
    const idempotencyKey = req.header("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128) { res.status(400).json({ error: "Idempotency-Key header is required" }); return; }
    if (env.USE_MOCK_DB) {
      const matches = findDemoMatches(input.serviceId, input.isEmergency ? "emergency" : "regular");
      const body = { booking: createDemoBooking({ customerId: req.user.id, workerId: matches[0]?.workerId, serviceId: input.serviceId, isEmergency: input.isEmergency, address: input.address, description: input.description }), recommendedWorker: matches[0] ?? null, alternatives: matches.slice(1, 4) };
      res.status(201).json(body);
      return;
    }
    const result = await createBooking({ ...input, customerId: req.user.id, idempotencyKey });
    res.status(result.status).json(result.body);
  } catch (error) { next(error); }
});

bookingsRouter.get("/", async (req, res, next) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
    if (env.USE_MOCK_DB) { res.json({ bookings: [] }); return; }
    res.json({ bookings: await listBookingsForUser(req.user.id, req.user.role) });
  } catch (error) { next(error); }
});

bookingsRouter.get("/:id", async (req, res, next) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
    if (env.USE_MOCK_DB) {
      const booking = getDemoBooking(req.params.id);
      if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
      if (booking.customerId !== req.user.id) { res.status(403).json({ error: "Forbidden" }); return; }
      res.json({ booking });
      return;
    }
    const booking = await getBookingForUser(req.params.id, req.user.id, req.user.role);
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    res.json({ booking });
  } catch (error) { next(error); }
});

bookingsRouter.patch("/:id/status", async (req, res, next) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
    const input = z.object({ status: statusSchema, reason: z.string().trim().max(500).optional() }).parse(req.body);
    if (env.USE_MOCK_DB) {
      const booking = updateDemoBookingStatus(req.params.id, input.status);
      if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
      emitBookingStatusChange(String(req.params.id), booking);
      res.json({ booking });
      return;
    }
    const result = await transitionBooking(req.params.id, req.user.id, req.user.role, input.status as BookingStatus, input.reason, req.header("x-request-id"));
    if (result.kind === "not_found") { res.status(404).json({ error: "Booking not found" }); return; }
    if (result.kind === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (result.kind === "invalid_transition") { res.status(409).json({ error: `Cannot transition booking from ${result.from} to ${input.status}` }); return; }
    emitBookingStatusChange(String(req.params.id), result.booking);
    void recordAuditEvent({ actorId: req.user.id, action: "booking.status.changed", resourceType: "booking", resourceId: req.params.id, requestId: req.header("x-request-id") ?? undefined, metadata: { status: input.status } }).catch(() => undefined);
    res.json({ booking: result.booking });
  } catch (error) { next(error); }
});

bookingsRouter.post("/:id/cancel", async (req, res, next) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
    const input = z.object({ reason: z.string().trim().max(500).optional() }).parse(req.body);
    const result = await cancelBooking(req.params.id, req.user.id, req.user.role, input.reason, req.header("x-request-id"));
    if (result.kind === "not_found") { res.status(404).json({ error: "Booking not found" }); return; }
    if (result.kind === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (result.kind === "invalid_transition") { res.status(409).json({ error: `Cannot cancel booking from ${result.from}` }); return; }
    emitBookingStatusChange(String(req.params.id), result.booking);
    void recordAuditEvent({ actorId: req.user.id, action: "booking.cancelled", resourceType: "booking", resourceId: req.params.id, requestId: req.header("x-request-id") ?? undefined, metadata: { reason: input.reason } }).catch(() => undefined);
    res.json({ booking: result.booking });
  } catch (error) { next(error); }
});

bookingsRouter.post("/:id/reschedule", async (req, res, next) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
    const input = z.object({ scheduledAt: z.string().datetime() }).parse(req.body);
    const result = await rescheduleBooking(req.params.id, req.user.id, req.user.role, input.scheduledAt, req.header("x-request-id"));
    if (result.kind === "not_found") { res.status(404).json({ error: "Booking not found" }); return; }
    if (result.kind === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (result.kind === "invalid_transition") { res.status(409).json({ error: `Cannot reschedule booking from ${result.from}` }); return; }
    emitBookingStatusChange(String(req.params.id), result.booking);
    void recordAuditEvent({ actorId: req.user.id, action: "booking.rescheduled", resourceType: "booking", resourceId: req.params.id, requestId: req.header("x-request-id") ?? undefined, metadata: { scheduledAt: input.scheduledAt } }).catch(() => undefined);
    res.json({ booking: result.booking });
  } catch (error) { next(error); }
});

bookingsRouter.post("/:id/accept", async (req, res, next) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
    if (req.user.role !== "worker") { res.status(403).json({ error: "Only workers can accept bookings" }); return; }
    const result = await acceptBooking(req.params.id, req.user.id, req.header("x-request-id"));
    if (result.kind === "not_found") { res.status(404).json({ error: "Booking not found" }); return; }
    if (result.kind === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (result.kind === "invalid_transition") { res.status(409).json({ error: `Cannot accept booking from ${result.from}` }); return; }
    // The worker responded in time; cancel the pending failover job.
    await clearAssignmentTimeout(String(req.params.id));

    emitBookingStatusChange(String(req.params.id), result.booking);
    void recordAuditEvent({ actorId: req.user.id, action: "booking.accepted", resourceType: "booking", resourceId: req.params.id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.json({ booking: result.booking });
  } catch (error) { next(error); }
});

bookingsRouter.post("/:id/reject", async (req, res, next) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
    if (req.user.role !== "worker") { res.status(403).json({ error: "Only workers can reject bookings" }); return; }
    const input = z.object({ reason: z.string().trim().max(500).optional() }).parse(req.body);
    const result = await rejectBooking(req.params.id, req.user.id, input.reason, req.header("x-request-id"));
    if (result.kind === "not_found") { res.status(404).json({ error: "Booking not found" }); return; }
    if (result.kind === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (result.kind === "invalid_transition") { res.status(409).json({ error: `Cannot reject booking from ${result.from}` }); return; }
    emitBookingStatusChange(String(req.params.id), result.booking);
    void recordAuditEvent({ actorId: req.user.id, action: "booking.rejected", resourceType: "booking", resourceId: req.params.id, requestId: req.header("x-request-id") ?? undefined, metadata: { reason: input.reason } }).catch(() => undefined);
    res.json({ booking: result.booking });
  } catch (error) { next(error); }
});

bookingsRouter.post("/:id/start", async (req, res, next) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
    if (req.user.role !== "worker") { res.status(403).json({ error: "Only workers can start bookings" }); return; }
    const result = await startBooking(req.params.id, req.user.id, req.header("x-request-id"));
    if (result.kind === "not_found") { res.status(404).json({ error: "Booking not found" }); return; }
    if (result.kind === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (result.kind === "invalid_transition") { res.status(409).json({ error: `Cannot start booking from ${result.from}` }); return; }
    emitBookingStatusChange(String(req.params.id), result.booking);
    void recordAuditEvent({ actorId: req.user.id, action: "booking.started", resourceType: "booking", resourceId: req.params.id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.json({ booking: result.booking });
  } catch (error) { next(error); }
});

bookingsRouter.post("/:id/complete", async (req, res, next) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
    if (req.user.role !== "worker") { res.status(403).json({ error: "Only workers can complete bookings" }); return; }
    const result = await completeBooking(req.params.id, req.user.id, req.header("x-request-id"));
    if (result.kind === "not_found") { res.status(404).json({ error: "Booking not found" }); return; }
    if (result.kind === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (result.kind === "invalid_transition") { res.status(409).json({ error: `Cannot complete booking from ${result.from}` }); return; }
    emitBookingStatusChange(String(req.params.id), result.booking);
    void recordAuditEvent({ actorId: req.user.id, action: "booking.completed", resourceType: "booking", resourceId: req.params.id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.json({ booking: result.booking });
  } catch (error) { next(error); }
});

bookingsRouter.post("/:id/reassign", async (req, res, next) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
    const adminRoles = ["society_admin", "federation_admin", "system_admin", "support_staff"];
    if (!adminRoles.includes(req.user.role)) { res.status(403).json({ error: "Admin access required" }); return; }
    const input = z.object({ workerId: z.string().uuid() }).parse(req.body);
    const result = await reassignBooking(req.params.id, input.workerId, req.user.id, req.user.role, req.header("x-request-id"));
    if (result.kind === "not_found") { res.status(404).json({ error: "Booking not found" }); return; }
    if (result.kind === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (result.kind === "worker_not_available") { res.status(409).json({ error: "Worker not available" }); return; }
    emitBookingStatusChange(String(req.params.id), result.booking);
    void recordAuditEvent({ actorId: req.user.id, action: "booking.reassigned", resourceType: "booking", resourceId: req.params.id, requestId: req.header("x-request-id") ?? undefined, metadata: { newWorkerId: input.workerId } }).catch(() => undefined);
    res.json({ booking: result.booking });
  } catch (error) { next(error); }
});

bookingsRouter.get("/:id/timeline", async (req, res, next) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
    const booking = await getBookingForUser(req.params.id, req.user.id, req.user.role);
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    const timeline = await getBookingTimeline(req.params.id);
    res.json({ timeline });
  } catch (error) { next(error); }
});

// ─── Booking start / completion OTP handshake ─────────────────────────────────
//
// The customer holds two 6-digit codes issued when the booking was created. The
// worker must key the code in on site to move accepted -> started and
// started -> completed. This is what stops a worker from billing a job they
// never attended.
//
// Previously both handlers read `if (hash && hash !== given)`, so a booking with
// a NULL hash — every booking created outside bookingService, i.e. emergency,
// institutional bulk and recurring — accepted ANY six digits. These now fail
// closed and rate-limit guessing.

const MAX_OTP_ATTEMPTS = 5;

/** Constant-time compare of a submitted code against a stored SHA-256 digest. */
function otpMatches(storedHash: string, candidate: string): boolean {
  const candidateHash = crypto.createHash("sha256").update(candidate).digest("hex");
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(candidateHash, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

type OtpStage = "start" | "completion";

interface OtpFailure {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Validate the submitted code for one stage, counting failures.
 * Returns null when the code is good and the caller should proceed.
 */
async function checkOtp(bookingId: string, stage: OtpStage, submitted: string): Promise<OtpFailure | null> {
  const hashColumn = stage === "start" ? "start_otp_hash" : "completion_otp_hash";
  const attemptsColumn = stage === "start" ? "start_otp_attempts" : "completion_otp_attempts";

  const row = await pool.query(
    `SELECT ${hashColumn} AS hash, ${attemptsColumn} AS attempts FROM bookings WHERE id = $1`,
    [bookingId]
  );
  const record = row.rows[0];
  if (!record) return { status: 404, body: { error: "Booking not found" } };

  if (!record.hash) {
    // Fail closed. The customer can mint a fresh pair via POST /bookings/:id/otp.
    return {
      status: 409,
      body: {
        error: "OTP_NOT_ISSUED",
        message: "No verification code has been issued for this booking. Ask the customer to request one.",
      },
    };
  }

  if (Number(record.attempts) >= MAX_OTP_ATTEMPTS) {
    return {
      status: 429,
      body: {
        error: "OTP_ATTEMPTS_EXCEEDED",
        message: "Too many incorrect codes. Ask the customer to reissue the verification code.",
      },
    };
  }

  if (!otpMatches(String(record.hash), submitted)) {
    const updated = await pool.query(
      `UPDATE bookings SET ${attemptsColumn} = ${attemptsColumn} + 1, updated_at = now()
       WHERE id = $1 RETURNING ${attemptsColumn} AS attempts`,
      [bookingId]
    );
    const used = Number(updated.rows[0]?.attempts ?? 0);
    return {
      status: 400,
      body: { error: "INVALID_OTP", attemptsRemaining: Math.max(0, MAX_OTP_ATTEMPTS - used) },
    };
  }

  return null;
}

/**
 * @openapi
 * /bookings/{id}/otp:
 *   post:
 *     summary: Issue (or reissue) the start and completion verification codes
 *     description: >
 *       Customer-only. Returns both 6-digit codes in plaintext exactly once —
 *       only the SHA-256 hashes are stored. Reissuing invalidates the previous
 *       pair and clears the failed-attempt counters.
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Freshly issued codes }
 *       403: { description: Only the booking customer may issue codes }
 *       409: { description: Booking is already finished }
 */
bookingsRouter.post("/:id/otp", async (req, res, next) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }

    const booking = await pool.query(
      "SELECT id, customer_id, status FROM bookings WHERE id = $1",
      [req.params.id]
    );
    if (!booking.rows[0]) { res.status(404).json({ error: "Booking not found" }); return; }

    // Only the customer holds the codes — a worker issuing their own would
    // defeat the entire handshake.
    const isCustomer = booking.rows[0].customer_id === req.user.id;
    const isAdmin = ["system_admin", "federation_admin", "society_admin", "support_staff"].includes(req.user.role);
    if (!isCustomer && !isAdmin) {
      res.status(403).json({ error: "Only the booking customer can issue verification codes" });
      return;
    }

    if (["completed", "cancelled", "expired", "refunded"].includes(booking.rows[0].status)) {
      res.status(409).json({ error: "Booking is already finished" });
      return;
    }

    const startOtp = generateOtp();
    const completionOtp = generateOtp();

    await pool.query(
      `UPDATE bookings
          SET start_otp_hash = $1,
              completion_otp_hash = $2,
              start_otp_attempts = 0,
              completion_otp_attempts = 0,
              otp_issued_at = now(),
              updated_at = now()
        WHERE id = $3`,
      [sha256Hex(startOtp), sha256Hex(completionOtp), req.params.id]
    );

    void recordAuditEvent({
      actorId: req.user.id,
      action: "booking.otp_issued",
      resourceType: "booking",
      resourceId: String(req.params.id),
      requestId: req.header("x-request-id") ?? undefined,
    }).catch(() => undefined);

    res.json({ startOtp, completionOtp, issuedAt: new Date().toISOString() });
  } catch (error) { next(error); }
});

// ─── OTP Verification: Worker verifies arrival with customer OTP ───────────────
bookingsRouter.post("/:id/verify-start", async (req, res, next) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
    const { otp } = z.object({ otp: z.string().regex(/^[0-9]{6}$/) }).parse(req.body);

    const booking = await getBookingForUser(req.params.id, req.user.id, req.user.role);
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    if (booking.status !== "accepted" && booking.status !== "en_route") {
      res.status(409).json({ error: "Booking must be in accepted or en_route status to verify start" });
      return;
    }
    if (booking.start_verified_at) {
      res.status(409).json({ error: "Start already verified" });
      return;
    }

    const failure = await checkOtp(String(req.params.id), "start", otp);
    if (failure) { res.status(failure.status).json(failure.body); return; }

    await pool.query(
      `UPDATE bookings SET start_verified_at = now(), status = 'started', updated_at = now() WHERE id = $1`,
      [req.params.id]
    );
    await pool.query(
      `INSERT INTO booking_status_events (booking_id, status, actor_id, reason) VALUES ($1, 'started', $2, 'start_verified_by_otp')`,
      [req.params.id, req.user.id]
    );

    const io = req.app.get("io");
    emitBookingStatusChange(String(req.params.id), { id: req.params.id, status: "started" });

    void recordAuditEvent({
      actorId: req.user.id,
      action: "booking.start_verified",
      resourceType: "booking",
      resourceId: String(req.params.id),
      requestId: req.header("x-request-id") ?? undefined,
    }).catch(() => undefined);

    res.json({ message: "Start verified, booking is now in progress" });
  } catch (error) { next(error); }
});

// ─── OTP Verification: Worker verifies completion with customer OTP ────────────
bookingsRouter.post("/:id/verify-complete", async (req, res, next) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
    const { otp } = z.object({ otp: z.string().regex(/^[0-9]{6}$/) }).parse(req.body);

    const booking = await getBookingForUser(req.params.id, req.user.id, req.user.role);
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    if (booking.status !== "started") {
      res.status(409).json({ error: "Booking must be in started status to verify completion" });
      return;
    }
    if (booking.completion_verified_at) {
      res.status(409).json({ error: "Completion already verified" });
      return;
    }

    const failure = await checkOtp(String(req.params.id), "completion", otp);
    if (failure) { res.status(failure.status).json(failure.body); return; }

    const client = await pool.connect();
    try {
      await client.query("begin");

      await client.query(
        `UPDATE bookings SET completion_verified_at = now(), status = 'completed', updated_at = now() WHERE id = $1`,
        [req.params.id]
      );
      await client.query(
        `INSERT INTO booking_status_events (booking_id, status, actor_id, reason) VALUES ($1, 'completed', $2, 'completion_verified_by_otp')`,
        [req.params.id, req.user.id]
      );

      if (booking.workerId) {
        await client.query(
          `UPDATE workers SET current_status = 'available', updated_at = now() WHERE id = $1 AND verification_status = 'verified'`,
          [booking.workerId]
        );
      }

      // Same idempotent split used by transitionBooking and payment capture.
      // This previously credited the worker the GROSS base price directly,
      // double-crediting any booking that also completed via PATCH /status.
      await settleBooking(client, String(req.params.id));

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    const io = req.app.get("io");
    emitBookingStatusChange(String(req.params.id), { id: req.params.id, status: "completed" });

    void recordAuditEvent({
      actorId: req.user.id,
      action: "booking.completion_verified",
      resourceType: "booking",
      resourceId: String(req.params.id),
      requestId: req.header("x-request-id") ?? undefined,
    }).catch(() => undefined);

    res.json({ message: "Completion verified, booking is now complete" });
  } catch (error) { next(error); }
});

