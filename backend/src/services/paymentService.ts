import crypto from "node:crypto";
import { pool } from "../db/pool.js";
import type { PoolClient } from "pg";
import { recordAuditEvent } from "./auditService.js";
import { env } from "../config/env.js";
import { settleBooking } from "./revenueSplit.js";
import { createRemoteOrder } from "./razorpayClient.js";
import logger from "../core/logger.js";

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

/**
 * Map a raw `payment_orders` row to the camelCase shape the API returns.
 *
 * This is not cosmetic. The routes authorise with `order.customerId`, and pg
 * returns `customer_id` — so the comparison was `undefined !== req.user.id`,
 * which is always true, and every customer got 403 on their OWN payment order.
 * Going through one mapper makes the interface and the row agree.
 */
export function toPaymentOrder(row: Record<string, any>): PaymentOrder {
  return {
    id: row.id,
    bookingId: row.booking_id,
    customerId: row.customer_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    provider: row.provider,
    providerOrderId: row.provider_order_id ?? null,
    idempotencyKey: row.idempotency_key,
    expiresAt: row.expires_at,
    paidAt: row.paid_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
  let row: Record<string, any>;
  try {
    await client.query("begin");

    const existing = await client.query(`select * from payment_orders where customer_id = $1 and idempotency_key = $2 for update`, [input.customerId, input.idempotencyKey]);
    if (existing.rows[0]) {
      await client.query("commit");
      // A replay may still be missing its gateway order — see below.
      const replayed = await ensureRemoteOrder(toPaymentOrder(existing.rows[0]));
      return { order: replayed, isReplay: true };
    }

    const expiresAt = input.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000);
    const result = await client.query(
      `insert into payment_orders (id, booking_id, customer_id, amount, currency, provider, idempotency_key, expires_at) 
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [crypto.randomUUID(), input.bookingId, input.customerId, input.amount, input.currency ?? "INR", input.provider, input.idempotencyKey, expiresAt]
    );

    await client.query("commit");
    row = result.rows[0];
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  // The gateway call happens AFTER the transaction commits, deliberately.
  // Holding a row lock open across a third-party HTTP round trip would let a
  // slow Razorpay response block every other write touching this order.
  const order = await ensureRemoteOrder(toPaymentOrder(row));
  return { order, isReplay: false };
}

/**
 * Give an order a gateway order id, creating one if it does not have it yet.
 *
 * Idempotent and safe to call on a replay: if the row already carries a
 * `provider_order_id` this is a no-op. That matters because the gateway call
 * can fail after the row is committed — the client simply retries with the
 * same idempotency key and picks up where it left off, rather than stranding
 * a booking with an unpayable order.
 */
export async function ensureRemoteOrder(order: PaymentOrder): Promise<PaymentOrder> {
  if (order.providerOrderId) return order;
  if (order.provider !== "razorpay") return order;

  const remote = await createRemoteOrder({
    amount: order.amount,
    currency: order.currency,
    receipt: order.id,
    notes: { bookingId: order.bookingId, customerId: order.customerId },
  });

  const updated = await pool.query(
    `update payment_orders set provider_order_id = $1, updated_at = now()
      where id = $2 and provider_order_id is null returning *`,
    [remote.providerOrderId, order.id]
  );

  if (!updated.rows[0]) {
    // Another request won the race and attached its own gateway order. Use
    // theirs; two Razorpay orders for one payment is survivable (only one can
    // be captured) but two DIFFERENT ids in our own table is not.
    const reread = await pool.query(`select * from payment_orders where id = $1`, [order.id]);
    return toPaymentOrder(reread.rows[0]);
  }

  logger.info(
    { paymentOrderId: order.id, simulated: remote.simulated },
    "Created gateway order"
  );
  return toPaymentOrder(updated.rows[0]);
}

export async function getPaymentOrder(id: string): Promise<PaymentOrder | null> {
  const result = await pool.query(`select * from payment_orders where id = $1`, [id]);
  return result.rows[0] ? toPaymentOrder(result.rows[0]) : null;
}

export async function getPaymentOrderByBooking(bookingId: string): Promise<PaymentOrder | null> {
  const result = await pool.query(`select * from payment_orders where booking_id = $1 order by created_at desc limit 1`, [bookingId]);
  return result.rows[0] ? toPaymentOrder(result.rows[0]) : null;
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
  return result.rows.map(toPaymentOrder);
}

/**
 * Mark an order paid and run the split. Idempotent.
 *
 * Two independent things reach this: the client's post-checkout verify call
 * (fast, so the customer sees confirmation immediately) and Razorpay's webhook
 * (authoritative, and arrives even if the app was killed mid-payment). Whoever
 * gets here first does the work; the second is a no-op. That is why the UPDATE
 * is guarded on `status <> 'paid'` and everything downstream is idempotent.
 */
export async function capturePayment(
  paymentOrderId: string,
  providerPaymentId: string,
  payload: Record<string, unknown> = {}
): Promise<{ captured: boolean; alreadyPaid: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const result = await client.query(`select * from payment_orders where id = $1 for update`, [paymentOrderId]);
    const order = result.rows[0];
    if (!order) {
      await client.query("rollback");
      throw new Error("PAYMENT_ORDER_NOT_FOUND");
    }

    if (order.status === "paid") {
      // Settle again rather than returning flat. settleBooking will not
      // re-split an already-invoiced booking, but it DOES reconcile an invoice
      // still marked pending — which is how a booking paid after completion
      // catches up. It also repairs rows left inconsistent by an earlier
      // failure or an older build.
      await settleBooking(client, order.booking_id);
      await client.query("commit");
      return { captured: false, alreadyPaid: true };
    }

    await client.query(
      `update payment_orders set status = 'paid', paid_at = now(), updated_at = now() where id = $1`,
      [paymentOrderId]
    );

    await client.query(
      `insert into payment_transactions (id, payment_order_id, type, amount, status, provider_transaction_id, raw_response)
       values ($1, $2, 'charge', $3, 'success', $4, $5)`,
      [crypto.randomUUID(), paymentOrderId, order.amount, providerPaymentId, payload]
    );

    await appendLedgerEntry(client, paymentOrderId, "credit", Number(order.amount), "Payment captured", providerPaymentId);

    // Only now does money actually exist to divide.
    await settleBooking(client, order.booking_id);

    await client.query("commit");
    return { captured: true, alreadyPaid: false };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export interface WebhookContext {
  /** Always true in production: routes/payments.ts rejects unverified webhooks
   *  before calling this. Recorded for audit. */
  signatureVerified?: boolean;
  receivedIp?: string;
}

export async function processWebhook(
  provider: string,
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>,
  context: WebhookContext = {}
): Promise<{ processed: boolean; paymentOrderId?: string }> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const existing = await client.query(`select 1 from payment_webhook_events where provider = $1 and event_id = $2 for update`, [provider, eventId]);
    if (existing.rows[0]) {
      await client.query("commit");
      return { processed: false };
    }

    await client.query(
      `insert into payment_webhook_events (provider, event_id, event_type, payload, processed_at, signature_verified, received_ip)
       values ($1, $2, $3, $4, now(), $5, $6)`,
      [provider, eventId, eventType, payload, context.signatureVerified ?? false, context.receivedIp ?? null]
    );

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

        // Run the split now that money has actually landed. settleBooking is
        // idempotent, so a webhook redelivery (or the completion path getting
        // here first) will not double-credit anyone.
        await settleBooking(client, orderResult.rows[0].booking_id);
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

  if (filters.fromDate) { conditions.push(`po.created_at >= $${index++}`); values.push(filters.fromDate); }
  if (filters.toDate) { conditions.push(`po.created_at <= $${index++}`); values.push(filters.toDate); }
  if (filters.provider) { conditions.push(`po.provider = $${index++}`); values.push(filters.provider); }
  if (filters.status) { conditions.push(`po.status = $${index++}`); values.push(filters.status); }

  const whereClause = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

  const summary = await pool.query(`select count(*) as total_orders, sum(amount) as total_amount, status, provider from payment_orders po ${whereClause} group by status, provider`, values);
  const ledger = await pool.query(`select pl.* from payment_ledger pl join payment_orders po on po.id = pl.payment_order_id ${whereClause} order by pl.created_at asc`, values);

  return { summary: summary.rows, ledger: ledger.rows };
}

/**
 * Map an `invoices` row to camelCase. Same authorisation bug as payment
 * orders: the routes compare `invoice.customerId` against the caller.
 */
export function toInvoice(row: Record<string, any>) {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    bookingId: row.booking_id,
    customerId: row.customer_id,
    workerId: row.worker_id ?? null,
    cooperativeId: row.cooperative_id ?? null,
    subtotal: Number(row.subtotal ?? 0),
    tax: Number(row.tax ?? 0),
    total: Number(row.total ?? 0),
    platformFee: Number(row.platform_fee ?? 0),
    cooperativeShare: Number(row.cooperative_share ?? 0),
    welfareFund: Number(row.welfare_fund ?? 0),
    workerShare: Number(row.worker_share ?? 0),
    paymentStatus: row.payment_status,
    issuedAt: row.issued_at ?? null,
  };
}

export async function getInvoice(id: string) {
  const result = await pool.query(`select * from invoices where id = $1`, [id]);
  return result.rows[0] ? toInvoice(result.rows[0]) : null;
}

export async function getInvoiceByBooking(bookingId: string) {
  const result = await pool.query(`select * from invoices where booking_id = $1`, [bookingId]);
  return result.rows[0] ? toInvoice(result.rows[0]) : null;
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
  return result.rows.map(toInvoice);
}