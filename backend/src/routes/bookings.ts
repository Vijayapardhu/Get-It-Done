import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { createDemoBooking, findDemoMatches, getDemoBooking, updateDemoBookingStatus } from "../data/demoStore.js";
import { bookingStatuses, createBooking, getBookingForUser, listBookingsForUser, transitionBooking, cancelBooking, rescheduleBooking, acceptBooking, rejectBooking, startBooking, completeBooking, reassignBooking, getBookingTimeline, type BookingStatus } from "../services/bookingService.js";
import { recordAuditEvent } from "../services/auditService.js";
import { requireRoles } from "../middleware/auth.js";

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
 * /bookings/{id}/status:
 *   patch:
 *     summary: Transition a booking status
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 * /bookings/{id}/cancel:
 *   post:
 *     summary: Cancel a booking
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 * /bookings/{id}/reschedule:
 *   post:
 *     summary: Reschedule a booking
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 * /bookings/{id}/accept:
 *   post:
 *     summary: Accept a booking (worker)
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 * /bookings/{id}/reject:
 *   post:
 *     summary: Reject a booking (worker)
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 * /bookings/{id}/start:
 *   post:
 *     summary: Start a booking (worker)
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 * /bookings/{id}/complete:
 *   post:
 *     summary: Complete a booking (worker)
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 * /bookings/{id}/reassign:
 *   post:
 *     summary: Reassign a booking (admin)
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 * /bookings/{id}/timeline:
 *   get:
 *     summary: Get booking status timeline
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 */

export const bookingsRouter = Router();
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
      req.app.get("io")?.emit("booking:status_changed", booking);
      res.json({ booking });
      return;
    }
    const result = await transitionBooking(req.params.id, req.user.id, req.user.role, input.status as BookingStatus, input.reason, req.header("x-request-id"));
    if (result.kind === "not_found") { res.status(404).json({ error: "Booking not found" }); return; }
    if (result.kind === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (result.kind === "invalid_transition") { res.status(409).json({ error: `Cannot transition booking from ${result.from} to ${input.status}` }); return; }
    req.app.get("io")?.emit("booking:status_changed", result.booking);
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
    req.app.get("io")?.emit("booking:status_changed", result.booking);
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
    req.app.get("io")?.emit("booking:status_changed", result.booking);
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
    req.app.get("io")?.emit("booking:status_changed", result.booking);
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
    req.app.get("io")?.emit("booking:status_changed", result.booking);
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
    req.app.get("io")?.emit("booking:status_changed", result.booking);
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
    req.app.get("io")?.emit("booking:status_changed", result.booking);
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
    req.app.get("io")?.emit("booking:status_changed", result.booking);
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
