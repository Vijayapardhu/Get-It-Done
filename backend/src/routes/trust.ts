import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";

/**
 * @openapi
 * /trust/payments:
 *   post:
 *     summary: Create a payment record
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 * /trust/reviews:
 *   post:
 *     summary: Review a completed booking
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 * /trust/complaints:
 *   post:
 *     summary: Raise a complaint
 *     tags: [Complaints]
 *     security: [{ bearerAuth: [] }]
 */

export const trustRouter = Router();

trustRouter.post("/payments", async (req, res, next) => {
  try {
    const input = z.object({ bookingId: z.string().uuid(), provider: z.string().trim().min(2).max(30), providerOrderId: z.string().trim().max(200).optional(), amount: z.number().positive().max(10000000) }).parse(req.body);
    const booking = await pool.query("select b.customer_id, s.base_price from bookings b join services s on s.id = b.service_id where b.id = $1", [input.bookingId]);
    if (!booking.rows[0]) { res.status(404).json({ error: "Booking not found" }); return; }
    if (booking.rows[0].customer_id !== req.user!.id) { res.status(403).json({ error: "Forbidden" }); return; }
    if (input.providerOrderId) {
      const existing = await pool.query("select id, booking_id as \"bookingId\", amount, status from payments where provider = $1 and provider_order_id = $2", [input.provider, input.providerOrderId]);
      if (existing.rows[0]) {
        if (existing.rows[0].bookingId !== input.bookingId || Number(existing.rows[0].amount) !== input.amount) { res.status(409).json({ error: "Payment order conflict" }); return; }
        res.json({ payment: existing.rows[0] });
        return;
      }
    }
    const expectedAmount = Number(booking.rows[0].base_price);
    if (input.amount !== expectedAmount) { res.status(409).json({ error: "Payment amount does not match the booking" }); return; }
    const result = await pool.query(`insert into payments (booking_id, provider, provider_order_id, amount) values ($1, $2, $3, $4) returning id, booking_id as "bookingId", provider, provider_order_id as "providerOrderId", amount, status`, [input.bookingId, input.provider, input.providerOrderId ?? null, expectedAmount]);
    void recordAuditEvent({ actorId: req.user!.id, action: "payment.created", resourceType: "payment", resourceId: result.rows[0].id, metadata: { bookingId: input.bookingId, provider: input.provider } }).catch(() => undefined);
    res.status(201).json({ payment: result.rows[0] });
  } catch (error) { next(error); }
});

trustRouter.post("/reviews", async (req, res, next) => {
  try {
    const input = z.object({ bookingId: z.string().uuid(), rating: z.number().int().min(1).max(5), feedback: z.string().trim().max(2000).optional() }).parse(req.body);
    const result = await pool.query(`insert into reviews (booking_id, customer_id, worker_id, rating, feedback) select b.id, b.customer_id, b.worker_id, $2, $3 from bookings b where b.id = $1 and b.customer_id = $4 and b.status = 'completed' and b.worker_id is not null on conflict (booking_id) do nothing returning id, booking_id as "bookingId", rating, feedback, created_at as "createdAt"`, [input.bookingId, input.rating, input.feedback ?? null, req.user!.id]);
    if (!result.rows[0]) { res.status(409).json({ error: "Only completed bookings can be reviewed" }); return; }
    void recordAuditEvent({ actorId: req.user!.id, action: "review.created", resourceType: "review", resourceId: result.rows[0].id, metadata: { bookingId: input.bookingId } }).catch(() => undefined);
    res.status(201).json({ review: result.rows[0] });
  } catch (error) { next(error); }
});

trustRouter.post("/complaints", async (req, res, next) => {
  try {
    const input = z.object({ bookingId: z.string().uuid().optional(), description: z.string().trim().min(10).max(4000) }).parse(req.body);
    const result = await pool.query(`insert into complaints (booking_id, raised_by, description) values ($1, $2, $3) returning id, booking_id as "bookingId", status, description, created_at as "createdAt"`, [input.bookingId ?? null, req.user!.id, input.description]);
    void recordAuditEvent({ actorId: req.user!.id, action: "complaint.created", resourceType: "complaint", resourceId: result.rows[0].id, metadata: { bookingId: input.bookingId ?? null } }).catch(() => undefined);
    res.status(201).json({ complaint: result.rows[0] });
  } catch (error) { next(error); }
});