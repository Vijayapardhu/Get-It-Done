import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";
import {
  calculateNextGeneration,
  generateInstanceById,
  generateDueRecurringBookings,
} from "../services/recurringService.js";


export const recurringRouter = Router();

// "/plans/..." is the blueprint spelling; "/..." is what the codebase
// already used. Both are served so neither client breaks.
recurringRouter.param("id", rejectNonUuidParam);

const recurringCreateSchema = z.object({
  serviceId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  addressId: z.string().uuid().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "custom"]),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
  timeWindowStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  timeWindowEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  startDate: z.string().date(),
  endDate: z.string().date().optional(),
});

const recurringUpdateSchema = recurringCreateSchema.partial();

recurringRouter.post(["/", "/plans"], requireAuth, async (req, res, next) => {
  try {
    if (!["customer", "institutional_customer"].includes(req.user!.role)) { res.status(403).json({ error: "Only customers can create recurring bookings" }); return; }
    const input = recurringCreateSchema.parse(req.body);
    const nextGen = calculateNextGeneration(input.startDate, input.frequency, input.daysOfWeek);
    const result = await pool.query(`INSERT INTO recurring_bookings (id, organization_id, customer_id, service_id, variant_id, address_id, frequency, days_of_week, time_window_start, time_window_end, start_date, end_date, status, next_generation_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active', $13) RETURNING *`,
      [crypto.randomUUID(), null, req.user!.id, input.serviceId, input.variantId ?? null, input.addressId ?? null, input.frequency, input.daysOfWeek, input.timeWindowStart ?? null, input.timeWindowEnd ?? null, input.startDate, input.endDate ?? null, nextGen]);
    await recordAuditEvent({ actorId: req.user!.id, action: "recurring_booking.created", resourceType: "recurring_booking", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ recurringBooking: result.rows[0] });
  } catch (error) { next(error); }
});

recurringRouter.get(["/", "/plans"], requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(parseInt(String(req.query.page ?? 1)), 1);
    const limit = Math.min(parseInt(String(req.query.limit ?? 20)), 100);
    const offset = (page - 1) * limit;
    const result = await pool.query(`SELECT rb.*, s.name as service_name FROM recurring_bookings rb JOIN services s ON s.id = rb.service_id WHERE rb.customer_id = $1 ORDER BY rb.created_at DESC LIMIT $2 OFFSET $3`, [req.user!.id, limit, offset]);
    res.json({ recurringBookings: result.rows, page, limit });
  } catch (error) { next(error); }
});

recurringRouter.get(["/:id", "/plans/:id"], requireAuth, async (req, res, next) => {
  try {
    const rbId = String(req.params.id);
    const result = await pool.query(`SELECT rb.*, s.name as service_name FROM recurring_bookings rb JOIN services s ON s.id = rb.service_id WHERE rb.id = $1 AND rb.customer_id = $2`, [rbId, req.user!.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Recurring booking not found" }); return; }
    const bookings = await pool.query(`SELECT b.*, s.name as service_name FROM bookings b JOIN services s ON s.id = b.service_id WHERE b.description LIKE $1 ORDER BY b.created_at DESC`, [`%${rbId}%`]);
    res.json({ recurringBooking: result.rows[0], generatedBookings: bookings.rows });
  } catch (error) { next(error); }
});

recurringRouter.patch(["/:id", "/plans/:id"], requireAuth, async (req, res, next) => {
  try {
    const rbId = String(req.params.id);
    const input = recurringUpdateSchema.parse(req.body);
    const fields: string[] = []; const values: unknown[] = []; let index = 1;
    const fieldMap: Record<string, string> = { variantId: "variant_id", addressId: "address_id", timeWindowStart: "time_window_start", timeWindowEnd: "time_window_end", startDate: "start_date", endDate: "end_date", daysOfWeek: "days_of_week" };
    for (const [key, value] of Object.entries(input)) { if (value !== undefined) { fields.push(`${fieldMap[key] ?? key} = $${index++}`); values.push(value); } }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    if (input.frequency || input.daysOfWeek || input.startDate) {
      const current = await pool.query(`SELECT * FROM recurring_bookings WHERE id = $1`, [rbId]);
      if (current.rows[0]) {
        const freq = input.frequency ?? current.rows[0].frequency;
        const days = input.daysOfWeek ?? current.rows[0].days_of_week;
        const start = input.startDate ?? current.rows[0].start_date;
        const nextGen = calculateNextGeneration(start, freq, days);
        fields.push(`next_generation_at = $${index++}`); values.push(nextGen);
      }
    }
    values.push(rbId);
    const result = await pool.query(`UPDATE recurring_bookings SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} AND customer_id = $${index + 1} RETURNING *`, [...values, req.user!.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Recurring booking not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "recurring_booking.updated", resourceType: "recurring_booking", resourceId: rbId, requestId: req.header("x-request-id") ?? undefined, metadata: { fields: Object.keys(input) } }).catch(() => undefined);
    res.json({ recurringBooking: result.rows[0] });
  } catch (error) { next(error); }
});

recurringRouter.post(["/:id/pause", "/plans/:id/pause"], requireAuth, async (req, res, next) => {
  try {
    const rbId = String(req.params.id);
    const result = await pool.query(`UPDATE recurring_bookings SET status = 'paused', updated_at = now() WHERE id = $1 AND customer_id = $2 RETURNING *`, [rbId, req.user!.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Recurring booking not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "recurring_booking.paused", resourceType: "recurring_booking", resourceId: rbId, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.json({ recurringBooking: result.rows[0] });
  } catch (error) { next(error); }
});

recurringRouter.post(["/:id/resume", "/plans/:id/resume"], requireAuth, async (req, res, next) => {
  try {
    const rbId = String(req.params.id);
    const current = await pool.query(`SELECT * FROM recurring_bookings WHERE id = $1 AND customer_id = $2`, [rbId, req.user!.id]);
    if (!current.rows[0]) { res.status(404).json({ error: "Recurring booking not found" }); return; }
    const nextGen = calculateNextGeneration(current.rows[0].start_date, current.rows[0].frequency, current.rows[0].days_of_week);
    const result = await pool.query(`UPDATE recurring_bookings SET status = 'active', next_generation_at = $1, updated_at = now() WHERE id = $2 AND customer_id = $3 RETURNING *`, [nextGen, rbId, req.user!.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Recurring booking not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "recurring_booking.resumed", resourceType: "recurring_booking", resourceId: rbId, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.json({ recurringBooking: result.rows[0] });
  } catch (error) { next(error); }
});

recurringRouter.delete(["/:id", "/plans/:id"], requireAuth, async (req, res, next) => {
  try {
    const rbId = String(req.params.id);
    const result = await pool.query(`UPDATE recurring_bookings SET status = 'cancelled', updated_at = now() WHERE id = $1 AND customer_id = $2 RETURNING *`, [rbId, req.user!.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Recurring booking not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "recurring_booking.cancelled", resourceType: "recurring_booking", resourceId: rbId, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(204).send();
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /recurring/plans/{id}/generate:
 *   post:
 *     summary: Spawn a booking instance from a recurring plan
 *     description: >
 *       Also runs automatically every 15 minutes via the `recurring.generate`
 *       background job for every plan whose next_generation_at has passed.
 *     tags: [Recurring]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       201: { description: Booking instance created }
 *       404: { description: No active plan with that id }
 */
recurringRouter.post(
  ["/:id/generate", "/plans/:id/generate"],
  requireAuth,
  requireRoles("system_admin", "federation_admin", "society_admin"),
  async (req, res, next) => {
    try {
      const planId = String(req.params.id);
      const instance = await generateInstanceById(planId, req.user!.id);
      if (!instance) { res.status(404).json({ error: "Active recurring booking not found" }); return; }

      void recordAuditEvent({
        actorId: req.user!.id,
        action: "recurring_booking.manually_generated",
        resourceType: "recurring_booking",
        resourceId: planId,
        requestId: req.header("x-request-id") ?? undefined,
        metadata: { bookingId: instance.bookingId },
      }).catch(() => undefined);

      res.status(201).json({
        message: "Booking instance generated",
        bookingId: instance.bookingId,
        status: instance.status,
        workerId: instance.workerId,
        // Shown once; only the hashes are stored.
        otps: { startOtp: instance.startOtp, completionOtp: instance.completionOtp },
      });
    } catch (error) { next(error); }
  }
);

/**
 * @openapi
 * /recurring/plans/generate-due:
 *   post:
 *     summary: Run the due-plan sweep immediately (admin)
 *     tags: [Recurring]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Sweep result }
 */
recurringRouter.post(
  ["/generate-due", "/plans/generate-due"],
  requireAuth,
  requireRoles("system_admin", "federation_admin"),
  async (req, res, next) => {
    try {
      const result = await generateDueRecurringBookings();
      res.json(result);
    } catch (error) { next(error); }
  }
);
