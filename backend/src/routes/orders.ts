import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { createOrder } from "../services/bookingService.js";
import { recordAuditEvent } from "../services/auditService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

/**
 * Multi-service checkout.
 *
 * A cart becomes one order and one booking per service, because a booking is
 * assigned to a single worker and a cart can hold two different trades. See
 * createOrder for why it is all-or-nothing.
 *
 * @openapi
 * /orders:
 *   post:
 *     summary: Check out a cart as one order of several bookings
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: Idempotency-Key
 *         in: header
 *         required: true
 *         schema: { type: string, minLength: 16, maxLength: 128 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lines, mode, latitude, longitude, address]
 *             properties:
 *               lines:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [serviceId, minutes]
 *                   properties:
 *                     serviceId: { type: string, format: uuid }
 *                     minutes: { type: integer, minimum: 5, maximum: 720 }
 *               mode: { type: string, enum: [instant, scheduled, recurring] }
 *               scheduledAt: { type: string, format: date-time }
 *               latitude: { type: number }
 *               longitude: { type: number }
 *               address: { type: string }
 *               addressId: { type: string, format: uuid, nullable: true }
 *               description: { type: string }
 *     responses:
 *       201: { description: Order placed, with one booking per service }
 *       400: { description: Empty cart, or scheduled with no time }
 *       403: { description: Only customers can place orders }
 *       409: { description: Idempotency key reused with a different payload }
 * /orders/{id}:
 *   get:
 *     summary: One of the caller's orders, with its bookings
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 */
export const ordersRouter = Router();
ordersRouter.param("id", rejectNonUuidParam);

const createOrderSchema = z.object({
  lines: z
    .array(
      z.object({
        serviceId: z.string().uuid(),
        // Bounds are per service and enforced by the pricing service; this is
        // only a sanity range, so a malformed client cannot ask for a year.
        minutes: z.number().int().min(5).max(720)
      })
    )
    .min(1)
    // A cart of fifty is not a customer, and each line places a real booking
    // that reserves a real worker.
    .max(20),
  mode: z.enum(["instant", "scheduled", "recurring"]),
  scheduledAt: z.string().datetime().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().trim().min(3).max(500),
  addressId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(2000).optional()
});

/** Order failures are the caller's fault, not a server fault. */
const ORDER_MESSAGES: Record<string, { status: number; message: string }> = {
  ORDER_EMPTY: { status: 400, message: "Your cart is empty." },
  ORDER_SCHEDULE_REQUIRED: { status: 400, message: "Pick a date and time for a scheduled order." },
  SERVICE_NOT_FOUND: { status: 400, message: "One of the services in your cart is no longer available." },
  EMERGENCY_NOT_SUPPORTED: { status: 400, message: "That service cannot be booked as an emergency." },
  ORDER_DUPLICATE_SERVICE: { status: 400, message: "That service is already in your cart. Change how long you need instead." },
  IDEMPOTENCY_KEY_REUSED: { status: 409, message: "This order was already submitted with different details." }
};

ordersRouter.post("/", async (req, res, next) => {
  try {
    if (!req.user || !["customer", "institutional_customer"].includes(req.user.role)) {
      res.status(403).json({ error: "Only customers can place orders" });
      return;
    }

    const idempotencyKey = req.header("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
      res.status(400).json({ error: "Idempotency-Key header is required" });
      return;
    }

    const input = createOrderSchema.parse(req.body);

    const result = await createOrder({
      customerId: req.user.id,
      lines: input.lines,
      mode: input.mode,
      scheduledAt: input.scheduledAt ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
      address: input.address,
      addressId: input.addressId ?? null,
      description: input.description,
      idempotencyKey
    });

    if (!result.replay) {
      await recordAuditEvent({
        actorId: req.user.id,
        action: "order.created",
        resourceType: "service_order",
        resourceId: (result.body as { order: { id: string } }).order.id,
        requestId: req.header("x-request-id") ?? undefined
      }).catch(() => undefined);
    }

    res.status(result.status).json(result.body);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const mapped = ORDER_MESSAGES[code];
    if (mapped) {
      res.status(mapped.status).json({ error: code, message: mapped.message });
      return;
    }
    next(error);
  }
});

ordersRouter.get("/:id", async (req, res, next) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const order = await pool.query(
      `select id, mode, scheduled_at as "scheduledAt", address, created_at as "createdAt"
         from service_orders
        where id = $1 and customer_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!order.rows[0]) { res.status(404).json({ error: "Order not found" }); return; }

    const bookings = await pool.query(
      `select b.id, b.status, b.scheduled_at as "scheduledAt", b.address, b.price,
              b.service_id as "serviceId", s.name as "serviceName", s.category as "serviceCategory"
         from bookings b
         join services s on s.id = b.service_id
        where b.order_id = $1
        order by b.created_at`,
      [req.params.id]
    );

    res.json({
      order: {
        ...order.rows[0],
        bookingCount: bookings.rowCount ?? 0,
        total: bookings.rows.reduce((sum, row) => sum + Number(row.price ?? 0), 0)
      },
      bookings: bookings.rows
    });
  } catch (error) { next(error); }
});
