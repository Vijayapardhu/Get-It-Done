import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { findMatchingWorkers } from "../services/matching.js";

/**
 * @openapi
 * /recurring:
 *   post:
 *     summary: Create recurring booking
 *     tags: [Recurring]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [serviceId, frequency, startDate], properties: { serviceId: { type: string, format: uuid }, variantId: { type: string, format: uuid }, addressId: { type: string, format: uuid }, frequency: { type: string, enum: [daily, weekly, monthly, custom] }, daysOfWeek: { type: array, items: { type: integer } }, timeWindowStart: { type: string }, timeWindowEnd: { type: string }, startDate: { type: string, format: date }, endDate: { type: string, format: date } } }
 *     responses:
 *       201: { description: Recurring booking created }
 *   get:
 *     summary: List recurring bookings
 *     tags: [Recurring]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: List of recurring bookings }
* /recurring/{id}:
 *   get:
 *     summary: Get recurring booking with generated bookings
 *     tags: [Recurring]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Recurring booking with generated bookings }
 *       404: { description: Not found }
 *   patch:
 *     summary: Update recurring booking
 *     tags: [Recurring]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { variantId: { type: string, format: uuid }, addressId: { type: string, format: uuid }, frequency: { type: string, enum: [daily, weekly, monthly, custom] }, daysOfWeek: { type: array, items: { type: integer } }, timeWindowStart: { type: string }, timeWindowEnd: { type: string }, startDate: { type: string, format: date }, endDate: { type: string, format: date } } }
 *     responses:
 *       200: { description: Updated recurring booking }
 *   delete:
 *     summary: Cancel recurring booking
 *     tags: [Recurring]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Recurring booking cancelled }
 * /recurring/{id}/pause:
 *   post:
 *     summary: Pause recurring booking
 *     tags: [Recurring]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Recurring booking paused }
 * /recurring/{id}/resume:
 *   post:
 *     summary: Resume recurring booking
 *     tags: [Recurring]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Recurring booking resumed }
 */

export const recurringRouter = Router();

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

recurringRouter.post("/", requireAuth, async (req, res, next) => {
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

recurringRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(parseInt(String(req.query.page ?? 1)), 1);
    const limit = Math.min(parseInt(String(req.query.limit ?? 20)), 100);
    const offset = (page - 1) * limit;
    const result = await pool.query(`SELECT rb.*, s.name as service_name FROM recurring_bookings rb JOIN services s ON s.id = rb.service_id WHERE rb.customer_id = $1 ORDER BY rb.created_at DESC LIMIT $2 OFFSET $3`, [req.user!.id, limit, offset]);
    res.json({ recurringBookings: result.rows, page, limit });
  } catch (error) { next(error); }
});

recurringRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const rbId = String(req.params.id);
    const result = await pool.query(`SELECT rb.*, s.name as service_name FROM recurring_bookings rb JOIN services s ON s.id = rb.service_id WHERE rb.id = $1 AND rb.customer_id = $2`, [rbId, req.user!.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Recurring booking not found" }); return; }
    const bookings = await pool.query(`SELECT b.*, s.name as service_name FROM bookings b JOIN services s ON s.id = b.service_id WHERE b.description LIKE $1 ORDER BY b.created_at DESC`, [`%${rbId}%`]);
    res.json({ recurringBooking: result.rows[0], generatedBookings: bookings.rows });
  } catch (error) { next(error); }
});

recurringRouter.patch("/:id", requireAuth, async (req, res, next) => {
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

recurringRouter.post("/:id/pause", requireAuth, async (req, res, next) => {
  try {
    const rbId = String(req.params.id);
    const result = await pool.query(`UPDATE recurring_bookings SET status = 'paused', updated_at = now() WHERE id = $1 AND customer_id = $2 RETURNING *`, [rbId, req.user!.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Recurring booking not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "recurring_booking.paused", resourceType: "recurring_booking", resourceId: rbId, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.json({ recurringBooking: result.rows[0] });
  } catch (error) { next(error); }
});

recurringRouter.post("/:id/resume", requireAuth, async (req, res, next) => {
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

recurringRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const rbId = String(req.params.id);
    const result = await pool.query(`UPDATE recurring_bookings SET status = 'cancelled', updated_at = now() WHERE id = $1 AND customer_id = $2 RETURNING *`, [rbId, req.user!.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "Recurring booking not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "recurring_booking.cancelled", resourceType: "recurring_booking", resourceId: rbId, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(204).send();
  } catch (error) { next(error); }
});

function calculateNextGeneration(startDate: string, frequency: string, daysOfWeek: number[]): Date {
  const start = new Date(startDate);
  const now = new Date();
  let next = new Date(Math.max(start.getTime(), now.getTime()));

  if (frequency === "daily") {
    while (next <= now) next.setDate(next.getDate() + 1);
  } else if (frequency === "weekly") {
    const targetDays = daysOfWeek.length > 0 ? daysOfWeek : [start.getDay()];
    while (true) {
      if (targetDays.includes(next.getDay()) && next >= start) break;
      next.setDate(next.getDate() + 1);
    }
  } else if (frequency === "monthly") {
    while (next <= now) next.setMonth(next.getMonth() + 1);
  } else {
    return start;
  }
  return next;
}

export async function generateRecurringBookings() {
  const client = await pool.connect();
  try {
    const now = new Date();
    const recurring = await client.query(`SELECT * FROM recurring_bookings WHERE status = 'active' AND next_generation_at <= $1`, [now]);
    for (const rb of recurring.rows) {
      await client.query("begin");
      try {
        const addressResult = rb.address_id ? await client.query(`SELECT * FROM organization_addresses WHERE id = $1`, [rb.address_id]) : { rows: [] };
        const service = await client.query(`SELECT * FROM services WHERE id = $1`, [rb.service_id]);
        if (!service.rows[0]) { await client.query("rollback"); continue; }

        const latitude = addressResult.rows[0]?.latitude ?? 0;
        const longitude = addressResult.rows[0]?.longitude ?? 0;
        const rbAddress = addressResult.rows[0]?.address ?? "Address not specified";

        const matches = await findMatchingWorkers({ serviceId: rb.service_id, latitude, longitude, urgency: "regular" });
        const workerId = matches.workers[0]?.workerId ?? null;
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

        const location = latitude && longitude ? `POINT(${longitude} ${latitude})` : null;
        const bookingResult = await client.query(`insert into bookings (id, customer_id, worker_id, service_id, status, scheduled_at, is_emergency, location, address, description) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
          [crypto.randomUUID(), rb.customer_id, confirmedWorkerId, rb.service_id, status, null, false, location, rbAddress, `Recurring: ${rb.id}`]);

        await client.query("insert into booking_status_events (booking_id, status, actor_id, reason, request_id) values ($1, $2, $3, $4, $5)", [bookingResult.rows[0].id, status, rb.customer_id, `recurring_generated_${rb.id}`, null]);

        if (confirmedWorkerId) {
          const workerUser = await client.query("select user_id from workers where id = $1", [confirmedWorkerId]);
          if (workerUser.rows[0]) await import("../services/notificationService.js").then(m => m.writeNotification(client, { userId: workerUser.rows[0].user_id, type: "booking.assigned", title: "New service booking", body: "You have been assigned a recurring service request.", aggregateType: "booking", aggregateId: bookingResult.rows[0].id }));
        }

        const nextGen = calculateNextGeneration(rb.start_date, rb.frequency, rb.days_of_week);
        await client.query(`update recurring_bookings set last_generated_at = $1, next_generation_at = $2, updated_at = now() where id = $3`, [now, nextGen, rb.id]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
      }
    }
  } finally {
    client.release();
  }
}