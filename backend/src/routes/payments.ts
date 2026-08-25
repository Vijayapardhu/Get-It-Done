import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { createPaymentOrder, getPaymentOrder, getPaymentOrderByBooking, listPaymentOrders, processWebhook, initiateRefund, getPaymentLedger, getReconciliationReport, getInvoice, getInvoiceByBooking, listInvoices } from "../services/paymentService.js";
import { recordAuditEvent } from "../services/auditService.js";
import { verifyWebhookSignature, verifyCheckoutSignature } from "../services/webhookSignature.js";
import logger from "../core/logger.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

/**
 * @openapi
 * /payments/orders:
 *   post:
 *     summary: Create payment order
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [bookingId, provider, idempotencyKey], properties: { bookingId: { type: string, format: uuid }, provider: { type: string }, idempotencyKey: { type: string } } }
 *     responses:
 *       201: { description: Payment order created }
 *       200: { description: Existing order (replay) }
 *   get:
 *     summary: List payment orders
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: bookingId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: status
 *         in: query
 *         schema: { type: string }
 *       - name: provider
 *         in: query
 *         schema: { type: string }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *       - name: offset
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: List of payment orders }
 * /payments/orders/{id}:
 *   get:
 *     summary: Get payment order
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Payment order details }
 *       404: { description: Not found }
 * /payments/orders/{id}/verify:
 *   post:
 *     summary: Verify payment signature
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [signature, payload], properties: { signature: { type: string }, payload: { type: object } } }
 *     responses:
 *       200: { description: Verification result }
 * /payments/orders/{id}/refund:
 *   post:
 *     summary: Initiate refund
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [amount, reason], properties: { amount: { type: number }, reason: { type: string } } }
 *     responses:
 *       201: { description: Refund initiated }
 * /payments/orders/{id}/refunds:
 *   get:
 *     summary: List refunds for payment order
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: List of refunds }
 * /payments/orders/{id}/ledger:
 *   get:
 *     summary: Get payment ledger
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Payment ledger }
 * /payments/reconciliation:
 *   get:
 *     summary: Get reconciliation report (admin)
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: fromDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: toDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: provider
 *         in: query
 *         schema: { type: string }
 *       - name: status
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200: { description: Reconciliation report }
 * /payments/invoices/{id}:
 *   get:
 *     summary: Get invoice
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Invoice details }
 *       404: { description: Not found }
 * /payments/invoices:
 *   get:
 *     summary: List invoices
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *       - name: offset
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: List of invoices }
 * /payments/invoices/booking/{bookingId}:
 *   get:
 *     summary: Get invoice by booking
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: bookingId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Invoice details }
 * /payments/webhooks/{provider}:
 *   post:
 *     summary: Handle payment webhook
 *     tags: [Payments]
 *     parameters:
 *       - name: provider
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [eventId, eventType, payload], properties: { eventId: { type: string }, eventType: { type: string }, payload: { type: object } } }
 *     responses:
 *       200: { description: Webhook processed }
 */

export const paymentsRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
paymentsRouter.param("id", rejectNonUuidParam);
paymentsRouter.param("bookingId", rejectNonUuidParam);

const createOrderSchema = z.object({
  bookingId: z.string().uuid(),
  provider: z.string().trim().min(2).max(30),
  idempotencyKey: z.string().min(16).max(128),
});

const refundSchema = z.object({
  amount: z.number().positive().max(10000000),
  reason: z.string().trim().min(3).max(500),
});

const webhookSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.string().min(1),
  payload: z.record(z.unknown()),
});

paymentsRouter.post("/orders", requireAuth, async (req, res, next) => {
  try {
    if (!["customer", "institutional_customer"].includes(req.user!.role)) {
      res.status(403).json({ error: "Only customers can create payment orders" });
      return;
    }
    const input = createOrderSchema.parse(req.body);

    const booking = await pool.query(`select b.*, s.base_price from bookings b join services s on s.id = b.service_id where b.id = $1 and b.customer_id = $2`, [input.bookingId, req.user!.id]);
    if (!booking.rows[0]) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    const expectedAmount = Number(booking.rows[0].base_price);
    const { order, isReplay } = await createPaymentOrder({
      bookingId: input.bookingId,
      customerId: req.user!.id,
      amount: expectedAmount,
      provider: input.provider,
      idempotencyKey: input.idempotencyKey,
    });

    await recordAuditEvent({ actorId: req.user!.id, action: "payment.order.created", resourceType: "payment_order", resourceId: order.id, requestId: req.header("x-request-id") ?? undefined, metadata: { bookingId: input.bookingId, provider: input.provider } }).catch(() => undefined);

    res.status(isReplay ? 200 : 201).json({ order, replay: isReplay });
  } catch (error) { next(error); }
});

paymentsRouter.get("/orders/:id", requireAuth, async (req, res, next) => {
  try {
    const order = await getPaymentOrder(String(req.params.id));
    if (!order) { res.status(404).json({ error: "Payment order not found" }); return; }
    if (order.customerId !== req.user!.id && !["system_admin", "federation_admin", "society_admin", "support_staff"].includes(req.user!.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    res.json({ order });
  } catch (error) { next(error); }
});

paymentsRouter.get("/orders", requireAuth, async (req, res, next) => {
  try {
    const filters = {
      customerId: req.user!.role === "customer" ? req.user!.id : (req.query.customerId as string | undefined),
      bookingId: req.query.bookingId as string | undefined,
      status: req.query.status as string | undefined,
      provider: req.query.provider as string | undefined,
      limit: Math.min(parseInt(String(req.query.limit ?? 50)), 100),
      offset: parseInt(String(req.query.offset ?? 0)),
    };
    const orders = await listPaymentOrders(filters);
    res.json({ orders });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /payments/webhooks/{provider}:
 *   post:
 *     summary: Payment gateway webhook (HMAC-signed, no bearer auth)
 *     tags: [Payments]
 *     parameters:
 *       - name: provider
 *         in: path
 *         required: true
 *         schema: { type: string, enum: [razorpay, stripe, phonepe, upi] }
 *     responses:
 *       200: { description: Event accepted (or ignored as a duplicate) }
 *       401: { description: Missing or invalid signature }
 */
paymentsRouter.post("/:provider", async (req, res, next) => {
  try {
    const provider = String(req.params.provider);

    // Verify BEFORE parsing or touching any state. Previously this handler
    // trusted the body outright, so anyone could POST `payment.captured` and
    // drive a booking to paid.
    const signature = verifyWebhookSignature(provider, req.rawBody, req.headers as Record<string, string | undefined>);
    if (!signature.verified) {
      logger.warn(
        { provider, reason: signature.reason, ip: req.ip, requestId: req.header("x-request-id") },
        "Rejected payment webhook with invalid signature"
      );
      await recordAuditEvent({
        actorId: null,
        action: "payment.webhook.rejected",
        resourceType: "payment_webhook",
        resourceId: provider,
        requestId: req.header("x-request-id") ?? undefined,
        metadata: { reason: signature.reason, ip: req.ip },
      }).catch(() => undefined);
      res.status(401).json({ error: "INVALID_WEBHOOK_SIGNATURE" });
      return;
    }

    const input = webhookSchema.parse(req.body);
    const result = await processWebhook(provider, input.eventId, input.eventType, input.payload, {
      signatureVerified: true,
      receivedIp: req.ip,
    });
    res.json({ processed: result.processed, paymentOrderId: result.paymentOrderId });
  } catch (error) { next(error); }
});

paymentsRouter.post("/orders/:id/verify", requireAuth, async (req, res, next) => {
  try {
    const orderId = String(req.params.id);
    const order = await getPaymentOrder(orderId);
    if (!order) { res.status(404).json({ error: "Payment order not found" }); return; }
    if (order.customerId !== req.user!.id) { res.status(403).json({ error: "Forbidden" }); return; }

    const input = z.object({
      signature: z.string().min(1),
      // Razorpay checkout returns these two ids alongside the signature; they
      // are the signed payload, so they are required rather than free-form.
      paymentId: z.string().min(1).optional(),
      orderId: z.string().min(1).optional(),
      payload: z.record(z.unknown()).optional(),
    }).parse(req.body);

    const result = verifyCheckoutSignature(order.provider, {
      orderId: input.orderId ?? order.providerOrderId ?? undefined,
      paymentId: input.paymentId ?? (input.payload?.paymentId as string | undefined),
    }, input.signature);

    if (!result.verified) {
      await recordAuditEvent({ actorId: req.user!.id, action: "payment.verification.failed", resourceType: "payment_order", resourceId: orderId, requestId: req.header("x-request-id") ?? undefined, metadata: { reason: result.reason } }).catch(() => undefined);
      res.status(400).json({ error: "INVALID_PAYMENT_SIGNATURE", message: result.reason });
      return;
    }

    await recordAuditEvent({ actorId: req.user!.id, action: "payment.verification.succeeded", resourceType: "payment_order", resourceId: orderId, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.json({ verified: true });
  } catch (error) { next(error); }
});

paymentsRouter.post("/orders/:id/refund", requireAuth, async (req, res, next) => {
  try {
    const orderId = String(req.params.id);
    const order = await getPaymentOrder(orderId);
    if (!order) { res.status(404).json({ error: "Payment order not found" }); return; }
    if (order.customerId !== req.user!.id && !["system_admin", "support_staff"].includes(req.user!.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const input = refundSchema.parse(req.body);
    const result = await initiateRefund(order.id, input.amount, input.reason, req.user!.id);
    res.status(201).json({ refundId: result.refundId });
  } catch (error) { next(error); }
});

paymentsRouter.get("/orders/:id/refunds", requireAuth, async (req, res, next) => {
  try {
    const orderId = String(req.params.id);
    const order = await getPaymentOrder(orderId);
    if (!order) { res.status(404).json({ error: "Payment order not found" }); return; }
    if (order.customerId !== req.user!.id && !["system_admin", "support_staff"].includes(req.user!.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const result = await pool.query(`select * from payment_refunds where payment_order_id = $1 order by created_at desc`, [orderId]);
    res.json({ refunds: result.rows });
  } catch (error) { next(error); }
});

paymentsRouter.get("/orders/:id/ledger", requireAuth, async (req, res, next) => {
  try {
    const orderId = String(req.params.id);
    const order = await getPaymentOrder(orderId);
    if (!order) { res.status(404).json({ error: "Payment order not found" }); return; }
    if (order.customerId !== req.user!.id && !["system_admin", "federation_admin", "society_admin", "support_staff"].includes(req.user!.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const ledger = await getPaymentLedger(orderId);
    res.json({ ledger });
  } catch (error) { next(error); }
});

paymentsRouter.get("/reconciliation", requireAuth, requireRoles("system_admin", "federation_admin", "support_staff"), async (req, res, next) => {
  try {
    const filters = {
      fromDate: req.query.fromDate ? new Date(req.query.fromDate as string) : undefined,
      toDate: req.query.toDate ? new Date(req.query.toDate as string) : undefined,
      provider: req.query.provider as string | undefined,
      status: req.query.status as string | undefined,
    };
    const report = await getReconciliationReport(filters);
    res.json(report);
  } catch (error) { next(error); }
});

paymentsRouter.get("/invoices/:id", requireAuth, async (req, res, next) => {
  try {
    const invoiceId = String(req.params.id);
    const invoice = await getInvoice(invoiceId);
    if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
    if (invoice.customerId !== req.user!.id && invoice.workerId !== req.user!.id && !["system_admin", "federation_admin", "society_admin", "support_staff"].includes(req.user!.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    res.json({ invoice });
  } catch (error) { next(error); }
});

paymentsRouter.get("/invoices", requireAuth, async (req, res, next) => {
  try {
    const filters = {
      customerId: req.user!.role === "customer" ? req.user!.id : (req.query.customerId as string | undefined),
      workerId: req.user!.role === "worker" ? req.user!.id : (req.query.workerId as string | undefined),
      status: req.query.status as string | undefined,
      limit: Math.min(parseInt(String(req.query.limit ?? 50)), 100),
      offset: parseInt(String(req.query.offset ?? 0)),
    };
    const invoices = await listInvoices(filters);
    res.json({ invoices });
  } catch (error) { next(error); }
});

paymentsRouter.get("/invoices/booking/:bookingId", requireAuth, async (req, res, next) => {
  try {
    const invoice = await getInvoiceByBooking(String(req.params.bookingId));
    if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
    if (invoice.customerId !== req.user!.id && invoice.workerId !== req.user!.id && !["system_admin", "federation_admin", "society_admin", "support_staff"].includes(req.user!.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    res.json({ invoice });
  } catch (error) { next(error); }
});
