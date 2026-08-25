import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import logger from "../core/logger.js";

/**
 * The one place a booking's money is divided.
 *
 * Before this module the split existed in three places that disagreed:
 *   - paymentService.createInvoiceForBooking priced off `services.base_price`,
 *     ignoring what the customer was actually charged (surge, travel, quantity).
 *   - bookingService.transitionBooking credited the worker the GROSS base price
 *     on completion, with no deduction at all.
 *   - routes/bookings.ts verify-complete did the same again, so a booking that
 *     completed through both paths was credited twice.
 * None of them deducted the 2% Worker Welfare Fund the platform is built on.
 *
 * `settleBooking` is idempotent: the unique constraints on `invoices.booking_id`
 * and `welfare_contributions.booking_id` mean concurrent callers (payment
 * capture and job completion racing) settle exactly once.
 */

export interface RevenueSplit {
  gross: number;
  platformFee: number;
  cooperativeShare: number;
  welfareFund: number;
  workerShare: number;
  tax: number;
  total: number;
}

/** Round to paise. Floating point drift must not leak into ledger rows. */
function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Split `gross` between the four parties.
 *
 * The worker takes the remainder rather than its own percentage, so the four
 * shares always add back to exactly `gross` no matter how the rates round.
 * `hasCooperative` is false for workers not yet attached to a society; their
 * share of that fee stays with the worker rather than being collected by nobody.
 */
export function computeSplit(gross: number, hasCooperative: boolean): RevenueSplit {
  const base = money(Math.max(0, gross));

  const platformFee = money(base * env.PLATFORM_FEE_RATE);
  const cooperativeShare = hasCooperative ? money(base * env.COOPERATIVE_SHARE_RATE) : 0;
  const welfareFund = money(base * env.WELFARE_FUND_RATE);
  const workerShare = money(base - platformFee - cooperativeShare - welfareFund);
  const tax = money(base * env.TAX_RATE);

  return {
    gross: base,
    platformFee,
    cooperativeShare,
    welfareFund,
    workerShare,
    tax,
    // Tax is charged on top of the service price; the customer pays base + tax.
    total: money(base + tax),
  };
}

interface SettlementContext {
  booking_id: string;
  customer_id: string;
  worker_id: string | null;
  service_id: string;
  status: string;
  cooperative_id: string | null;
  gross: number;
  payment_order_id: string | null;
}

/**
 * Resolve what the booking is actually worth, most authoritative source first:
 *   1. a captured payment order — what the customer really paid
 *   2. bookings.price — the quoted price including surge and travel
 *   3. services.base_price — catalogue fallback
 */
async function loadContext(client: PoolClient, bookingId: string): Promise<SettlementContext | null> {
  const result = await client.query(
    `select b.id            as booking_id,
            b.customer_id,
            b.worker_id,
            b.service_id,
            b.status,
            b.price         as booking_price,
            s.base_price,
            w.cooperative_id,
            po.id           as payment_order_id,
            po.amount       as paid_amount
       from bookings b
       join services s on s.id = b.service_id
       left join workers w on w.id = b.worker_id
       left join lateral (
         select id, amount
           from payment_orders
          where booking_id = b.id and status = 'paid'
          order by paid_at desc nulls last
          limit 1
       ) po on true
      where b.id = $1
      for update of b`,
    [bookingId]
  );

  const row = result.rows[0];
  if (!row) return null;

  const gross = Number(row.paid_amount ?? row.booking_price ?? row.base_price ?? 0);

  return {
    booking_id: row.booking_id,
    customer_id: row.customer_id,
    worker_id: row.worker_id,
    service_id: row.service_id,
    status: row.status,
    cooperative_id: row.cooperative_id,
    gross,
    payment_order_id: row.payment_order_id,
  };
}

export interface SettleResult {
  settled: boolean;
  reason?: string;
  invoiceId?: string;
  split?: RevenueSplit;
}

/**
 * Create the invoice, credit the worker their NET share, and move the welfare
 * fund contribution into escrow — exactly once per booking.
 *
 * Safe to call from both the payment-capture path and the job-completion path;
 * whichever runs second is a no-op. Requires an open transaction on `client`.
 */
export async function settleBooking(client: PoolClient, bookingId: string): Promise<SettleResult> {
  const ctx = await loadContext(client, bookingId);
  if (!ctx) return { settled: false, reason: "BOOKING_NOT_FOUND" };
  if (!ctx.worker_id) return { settled: false, reason: "NO_WORKER_ASSIGNED" };
  if (ctx.gross <= 0) return { settled: false, reason: "NO_BILLABLE_AMOUNT" };

  // Already settled? The invoice row is the marker.
  const existing = await client.query("select id from invoices where booking_id = $1", [bookingId]);
  if (existing.rows[0]) {
    return { settled: false, reason: "ALREADY_SETTLED", invoiceId: existing.rows[0].id };
  }

  const split = computeSplit(ctx.gross, Boolean(ctx.cooperative_id));
  const invoiceId = crypto.randomUUID();
  const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;

  const invoiced = await client.query(
    `insert into invoices
       (id, invoice_number, booking_id, customer_id, worker_id, service_id,
        subtotal, discount, tax, platform_fee, cooperative_share, welfare_fund,
        worker_share, total, payment_status, issued_at)
     values ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11, $12, $13, $14, now())
     on conflict (booking_id) do nothing
     returning id`,
    [
      invoiceId,
      invoiceNumber,
      bookingId,
      ctx.customer_id,
      ctx.worker_id,
      ctx.service_id,
      split.gross,
      split.tax,
      split.platformFee,
      split.cooperativeShare,
      split.welfareFund,
      split.workerShare,
      split.total,
      ctx.payment_order_id ? "paid" : "pending",
    ]
  );

  // The SELECT above and this INSERT are not atomic together: a concurrent
  // settle (payment capture racing job completion) can slip between them. The
  // unique constraint makes the insert a no-op for the loser — so if it wrote
  // nothing, stop here rather than posting a second earnings credit.
  if (!invoiced.rows[0]) {
    const existingInvoice = await client.query("select id from invoices where booking_id = $1", [bookingId]);
    return { settled: false, reason: "ALREADY_SETTLED", invoiceId: existingInvoice.rows[0]?.id };
  }

  // Worker is credited their NET share, not the gross price.
  await client.query(
    `insert into worker_earnings_ledger (worker_id, booking_id, entry_type, amount, reference)
     values ($1, $2, 'earning', $3, 'booking.settled')`,
    [ctx.worker_id, bookingId, split.workerShare]
  );

  // Welfare fund escrow — blueprint pillar #3. UNIQUE(booking_id) makes a
  // redelivered webhook a no-op rather than a double credit.
  if (split.welfareFund > 0) {
    await client.query(
      `insert into welfare_contributions
         (booking_id, worker_id, cooperative_id, payment_order_id, amount, rate)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (booking_id) do nothing`,
      [bookingId, ctx.worker_id, ctx.cooperative_id, ctx.payment_order_id, split.welfareFund, env.WELFARE_FUND_RATE]
    );
  }

  logger.info(
    { bookingId, invoiceId, ...split },
    "Booking settled: invoice issued, worker credited, welfare fund contributed"
  );

  return { settled: true, invoiceId, split };
}

/**
 * Convenience wrapper for callers that are not already inside a transaction.
 * Never throws on a losing race — a concurrent settle is reported, not raised.
 */
export async function settleBookingStandalone(bookingId: string): Promise<SettleResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await settleBooking(client, bookingId);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    // A unique violation means someone else settled it first, which is fine.
    if ((error as { code?: string }).code === "23505") {
      return { settled: false, reason: "ALREADY_SETTLED" };
    }
    throw error;
  } finally {
    client.release();
  }
}
