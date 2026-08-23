import crypto from "node:crypto";
import { pool } from "../db/pool.js";
import type { PoolClient } from "pg";
import { recordAuditEvent } from "./auditService.js";

export interface PaymentOrder {
  id: string;
  bookingId: string;
  customerId: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  providerOrderId: string | null;
  idempotencyKey: string;
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentOrderInput {
  bookingId: string;
  customerId: string;
  amount: number;
  currency?: string;
  provider: string;
  idempotencyKey: string;
  expiresAt?: Date;
}

export async function createPaymentOrder(input: CreatePaymentOrderInput): Promise<{ order: PaymentOrder; isReplay: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const existing = await client.query(`select * from payment_orders where customer_id = $1 and idempotency_key = $2 for update`, [input.customerId, input.idempotencyKey]);
    if (existing.rows[0]) {
      await client.query("commit");
      return { order: existing.rows[0], isReplay: true };
    }

    const expiresAt = input.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000);
    const result = await client.query(
      `insert into payment_orders (id, booking_id, customer_id, amount, currency, provider, idempotency_key, expires_at) 
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [crypto.randomUUID(), input.bookingId, input.customerId, input.amount, input.currency ?? "INR", input.provider, input.idempotencyKey, expiresAt]
    );

    await client.query("commit");
    return { order: result.rows[0], isReplay: false };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function getPaymentOrder(id: string): Promise<PaymentOrder | null> {
  const result = await pool.query(`select * from payment_orders where id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function getPaymentOrderByBooking(bookingId: string): Promise<PaymentOrder | null> {
  const result = await pool.query(`select * from payment_orders where booking_id = $1 order by created_at desc limit 1`, [bookingId]);
  return result.rows[0] ?? null;
}

export async function listPaymentOrders(filters: { customerId?: string; bookingId?: string; status?: string; provider?: string; limit?: number; offset?: number } = {}) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (filters.customerId) { conditions.push(`customer_id = $${index++}`); values.push(filters.customerId); }
  if (filters.bookingId) { conditions.push(`booking_id = $${index++}`); values.push(filters.bookingId); }
  if (filters.status) { conditions.push(`status = $${index++}`); values.push(filters.status); }
  if (filters.provider) { conditions.push(`provider = $${index++}`); values.push(filters.provider); }

  const whereClause = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  values.push(limit, offset);
  const result = await pool.query(`select * from payment_orders ${whereClause} order by created_at desc limit $${index++} offset $${index}`, values);
  return result.rows;
}

export async function verifyPaymentSignature(provider: string, payload: Record<string, unknown>, signature: string): Promise<boolean> {
  // Provider-specific verification logic would go here
  // For now, return true - implement based on provider (Razorpay, Stripe, PhonePe, etc.)
  return true;
}

export async function processWebhook(provider: string, eventId: string, eventType: string, payload: Record<string, unknown>): Promise<{ processed: boolean; paymentOrderId?: string }> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const existing = await client.query(`select id from payment_webhook_events where provider = $1 and event_id = $2 for update`, [provider, eventId]);
    if (existing.rows[0]) {
      await client.query("commit");
      return { processed: false };
    }

    await client.query(`insert into payment_webhook_events (provider, event_id, event_type, payload, processed_at) values ($1, $2, $3, $4, now())`, [provider, eventId, eventType, payload]);

    let paymentOrderId: string | undefined;

    if (eventType === "payment.captured" || eventType === "payment.success") {
      const providerOrderId = String(payload.order_id ?? payload.payment_id ?? "");
      const orderResult = await client.query(`select * from payment_orders where provider = $1 and provider_order_id = $2 for update`, [provider, providerOrderId]);
      if (orderResult.rows[0]) {
        await client.query(`update payment_orders set status = 'paid', provider_order_id = $1, paid_at = now(), updated_at = now() where id = $2`, [providerOrderId, orderResult.rows[0].id]);
        paymentOrderId = orderResult.rows[0].id;

        // Create payment transaction
        await client.query(`insert into payment_transactions (id, payment_order_id, type, amount, status, provider_transaction_id, raw_response) values ($1, $2, 'charge', $3, 'success', $4, $5)`,
          [crypto.randomUUID(), orderResult.rows[0].id, orderResult.rows[0].amount, providerOrderId, payload]);

        // Update payment ledger
        await appendLedgerEntry(client, orderResult.rows[0].id, "credit", orderResult.rows[0].amount, `Payment received via ${provider}`, providerOrderId);

        // If booking completed, create invoice
        const booking = await client.query(`select * from bookings where id = $1`, [orderResult.rows[0].booking_id]);
        if (booking.rows[0] && booking.rows[0].status === "completed") {
          await createInvoiceForBooking(client, booking.rows[0].id);
        }
      }
    } else if (eventType === "payment.failed") {
      const providerOrderId = String(payload.order_id ?? payload.payment_id ?? "");
      const orderResult = await client.query(`select * from payment_orders where provider = $1 and provider_order_id = $2 for update`, [provider, providerOrderId]);
      if (orderResult.rows[0]) {
        await client.query(`update payment_orders set status = 'failed', updated_at = now() where id = $1`, [orderResult.rows[0].id]);
        await client.query(`insert into payment_transactions (id, payment_order_id, type, amount, status, provider_transaction_id, raw_response) values ($1, $2, 'charge', $3, 'failed', $4, $5)`,
          [crypto.randomUUID(), orderResult.rows[0].id, orderResult.rows[0].amount, providerOrderId, payload]);
      }
    } else if (eventType === "refund.created" || eventType === "refund.processed") {
      const providerRefundId = String(payload.refund_id ?? "");
      const providerOrderId = String(payload.order_id ?? payload.payment_id ?? "");
      const orderResult = await client.query(`select * from payment_orders where provider = $1 and provider_order_id = $2 for update`, [provider, providerOrderId]);
      if (orderResult.rows[0]) {
        const refundAmount = Number(payload.amount ?? 0) / 100; // Assuming paise
        await client.query(`insert into payment_refunds (id, payment_order_id, amount, reason, status, provider_refund_id, processed_at) values ($1, $2, $3, $4, 'completed', $5, now())`,
          [crypto.randomUUID(), orderResult.rows[0].id, refundAmount, payload.reason ?? "refund", providerRefundId]);
        await client.query(`update payment_orders set status = 'refunded', updated_at = now() where id = $1`, [orderResult.rows[0].id]);
        await client.query(`insert into payment_transactions (id, payment_order_id, type, amount, status, provider_transaction_id, raw_response) values ($1, $2, 'refund', $3, 'success', $4, $5)`,
          [crypto.randomUUID(), orderResult.rows[0].id, refundAmount, providerRefundId, payload]);
        await appendLedgerEntry(client, orderResult.rows[0].id, "refund", refundAmount, `Refund via ${provider}`, providerRefundId);
      }
    }

    await client.query(`update payment_webhook_events set processed_at = now() where provider = $1 and event_id = $2`, [provider, eventId]);
    await client.query("commit");
    return { processed: true, paymentOrderId };
  } catch (error) {
    await client.query("rollback");
    await client.query(`update payment_webhook_events set attempts = attempts + 1, last_error = $1 where provider = $2 and event_id = $3`, [String(error), provider, eventId]);
    throw error;
  } finally {
    client.release();
  }
}

async function appendLedgerEntry(client: PoolClient, paymentOrderId: string, entryType: string, amount: number, description: string, reference: string) {
  const lastEntry = await client.query(`select balance_after from payment_ledger where payment_order_id = $1 order by created_at desc limit 1`, [paymentOrderId]);
  const previousBalance = lastEntry.rows[0] ? Number(lastEntry.rows[0].balance_after) : 0;
  const newBalance = entryType === "debit" || entryType === "refund" || entryType === "fee" ? previousBalance - amount : previousBalance + amount;

  await client.query(`insert into payment_ledger (id, payment_order_id, entry_type, amount, balance_after, description, reference) values ($1, $2, $3, $4, $5, $6, $7)`,
    [crypto.randomUUID(), paymentOrderId, entryType, amount, newBalance, description, reference]);
}

export async function initiateRefund(paymentOrderId: string, amount: number, reason: string, actorId: string): Promise<{ refundId: string }> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const order = await client.query(`select * from payment_orders where id = $1 for update`, [paymentOrderId]);
    if (!order.rows[0]) throw new Error("PAYMENT_ORDER_NOT_FOUND");
    if (order.rows[0].status !== "paid") throw new Error("PAYMENT_NOT_PAID");
    if (amount > Number(order.rows[0].amount)) throw new Error("REFUND_AMOUNT_EXCEEDS_PAYMENT");

    const refundResult = await client.query(`insert into payment_refunds (id, payment_order_id, amount, reason, status) values ($1, $2, $3, $4, 'pending') returning id`,
      [crypto.randomUUID(), paymentOrderId, amount, reason]);

    await client.query("commit");
    await recordAuditEvent({ actorId, action: "payment.refund.initiated", resourceType: "payment_refund", resourceId: refundResult.rows[0].id, metadata: { paymentOrderId, amount, reason } }).catch(() => undefined);
    return { refundId: refundResult.rows[0].id };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function getPaymentLedger(paymentOrderId: string) {
  const result = await pool.query(`select * from payment_ledger where payment_order_id = $1 order by created_at asc`, [paymentOrderId]);
  return result.rows;
}

export async function getReconciliationReport(filters: { fromDate?: Date; toDate?: Date; provider?: string; status?: string } = {}) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (filters.fromDate) { conditions.push(`created_at >= $${index++}`); values.push(filters.fromDate); }
  if (filters.toDate) { conditions.push(`created_at <= $${index++}`); values.push(filters.toDate); }
  if (filters.provider) { conditions.push(`provider = $${index++}`); values.push(filters.provider); }
  if (filters.status) { conditions.push(`status = $${index++}`); values.push(filters.status); }

  const whereClause = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

  const summary = await pool.query(`select count(*) as total_orders, sum(amount) as total_amount, status, provider from payment_orders ${whereClause} group by status, provider`, values);
  const ledger = await pool.query(`select pl.* from payment_ledger pl join payment_orders po on po.id = pl.payment_order_id ${whereClause} order by pl.created_at asc`, values);

  return { summary: summary.rows, ledger: ledger.rows };
}

async function createInvoiceForBooking(client: PoolClient, bookingId: string) {
  const booking = await client.query(`select b.*, s.base_price, c.cooperative_id from bookings b join services s on s.id = b.service_id left join workers w on w.id = b.worker_id left join cooperatives c on c.id = w.cooperative_id where b.id = $1`, [bookingId]);
  if (!booking.rows[0]) return;

  const b = booking.rows[0];
  const subtotal = Number(b.base_price ?? 0);
  const platformFee = subtotal * 0.05; // 5% platform fee
  const cooperativeShare = b.cooperative_id ? subtotal * 0.10 : 0; // 10% cooperative share
  const workerShare = subtotal - platformFee - cooperativeShare;
  const tax = subtotal * 0.18; // 18% GST
  const total = subtotal + tax;

  const invoiceNumber = `INV-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

  await client.query(
    `insert into invoices (id, invoice_number, booking_id, customer_id, worker_id, service_id, subtotal, discount, tax, platform_fee, cooperative_share, worker_share, total, payment_status, issued_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'paid', now())`,
    [crypto.randomUUID(), invoiceNumber, bookingId, b.customer_id, b.worker_id, b.service_id, subtotal, 0, tax, platformFee, cooperativeShare, workerShare, total]
  );
}

export async function getInvoice(id: string) {
  const result = await pool.query(`select * from invoices where id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function getInvoiceByBooking(bookingId: string) {
  const result = await pool.query(`select * from invoices where booking_id = $1`, [bookingId]);
  return result.rows[0] ?? null;
}

export async function listInvoices(filters: { customerId?: string; workerId?: string; status?: string; limit?: number; offset?: number } = {}) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (filters.customerId) { conditions.push(`customer_id = $${index++}`); values.push(filters.customerId); }
  if (filters.workerId) { conditions.push(`worker_id = $${index++}`); values.push(filters.workerId); }
  if (filters.status) { conditions.push(`payment_status = $${index++}`); values.push(filters.status); }

  const whereClause = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  values.push(limit, offset);
  const result = await pool.query(`select * from invoices ${whereClause} order by issued_at desc limit $${index++} offset $${index}`, values);
  return result.rows;
}