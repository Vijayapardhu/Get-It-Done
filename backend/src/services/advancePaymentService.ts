import crypto from "node:crypto";
import { pool } from "../db/pool.js";
import type { PoolClient } from "pg";
import { createPaymentOrder, capturePayment, getPaymentOrderByBooking } from "./paymentService.js";
import { settleBooking } from "./revenueSplit.js";
import logger from "../core/logger.js";

export interface AdvancePaymentResult {
  success: boolean;
  paymentOrderId?: string;
  amount?: number;
  error?: string;
}

export interface FinalPaymentResult {
  success: boolean;
  paymentOrderId?: string;
  amount?: number;
  error?: string;
}

/**
 * Create an advance payment order for a booking.
 * Advance is 20% of the total price.
 */
export async function createAdvancePayment(
  bookingId: string,
  customerId: string
): Promise<AdvancePaymentResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    // Get booking details
    const bookingResult = await client.query(
      `SELECT id, price, advance_amount, advance_paid, payment_stage 
       FROM bookings WHERE id = $1 AND customer_id = $2 FOR UPDATE`,
      [bookingId, customerId]
    );

    const booking = bookingResult.rows[0];
    if (!booking) {
      await client.query("rollback");
      return { success: false, error: "BOOKING_NOT_FOUND" };
    }

    if (booking.advance_paid) {
      await client.query("rollback");
      return { success: false, error: "ADVANCE_ALREADY_PAID" };
    }

    const advanceAmount = booking.advance_amount || Math.round(booking.price * 0.20 * 100) / 100;

    // Create payment order for advance
    const { order } = await createPaymentOrder({
      bookingId,
      customerId,
      amount: advanceAmount,
      currency: "INR",
      provider: "razorpay",
      idempotencyKey: `advance_${bookingId}_${Date.now()}`,
    });

    // Update booking with advance payment info
    await client.query(
      `UPDATE bookings 
       SET advance_payment_id = $1, 
           payment_stage = 'pending',
           updated_at = now() 
       WHERE id = $2`,
      [order.id, bookingId]
    );

    await client.query("commit");

    logger.info({ bookingId, advanceAmount, paymentOrderId: order.id }, "Advance payment order created");

    return {
      success: true,
      paymentOrderId: order.id,
      amount: advanceAmount,
    };
  } catch (error) {
    await client.query("rollback");
    logger.error({ error, bookingId }, "Failed to create advance payment");
    return { success: false, error: "PAYMENT_CREATION_FAILED" };
  } finally {
    client.release();
  }
}

/**
 * Capture advance payment after successful payment.
 */
export async function captureAdvancePayment(
  bookingId: string,
  paymentOrderId: string,
  providerPaymentId: string
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    // Capture the payment
    const { captured } = await capturePayment(paymentOrderId, providerPaymentId);

    if (captured) {
      // Update booking status
      await client.query(
        `UPDATE bookings 
         SET advance_paid = TRUE, 
             payment_stage = 'advance_paid',
             updated_at = now() 
         WHERE id = $1 AND advance_payment_id = $2`,
        [bookingId, paymentOrderId]
      );
    }

    await client.query("commit");
    return captured;
  } catch (error) {
    await client.query("rollback");
    logger.error({ error, bookingId, paymentOrderId }, "Failed to capture advance payment");
    return false;
  } finally {
    client.release();
  }
}

/**
 * Create final payment order for remaining balance after job completion.
 */
export async function createFinalPayment(
  bookingId: string,
  customerId: string
): Promise<FinalPaymentResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    // Get booking details
    const bookingResult = await client.query(
      `SELECT id, price, advance_amount, balance_due, advance_paid, final_paid, payment_stage, status 
       FROM bookings WHERE id = $1 AND customer_id = $2 FOR UPDATE`,
      [bookingId, customerId]
    );

    const booking = bookingResult.rows[0];
    if (!booking) {
      await client.query("rollback");
      return { success: false, error: "BOOKING_NOT_FOUND" };
    }

    if (!booking.advance_paid) {
      await client.query("rollback");
      return { success: false, error: "ADVANCE_NOT_PAID" };
    }

    if (booking.final_paid) {
      await client.query("rollback");
      return { success: false, error: "FINAL_ALREADY_PAID" };
    }

    if (booking.status !== "completed") {
      await client.query("rollback");
      return { success: false, error: "JOB_NOT_COMPLETED" };
    }

    const balanceDue = booking.balance_due || (booking.price - booking.advance_amount);

    // Create payment order for final payment
    const { order } = await createPaymentOrder({
      bookingId,
      customerId,
      amount: balanceDue,
      currency: "INR",
      provider: "razorpay",
      idempotencyKey: `final_${bookingId}_${Date.now()}`,
    });

    await client.query("commit");

    logger.info({ bookingId, balanceDue, paymentOrderId: order.id }, "Final payment order created");

    return {
      success: true,
      paymentOrderId: order.id,
      amount: balanceDue,
    };
  } catch (error) {
    await client.query("rollback");
    logger.error({ error, bookingId }, "Failed to create final payment");
    return { success: false, error: "PAYMENT_CREATION_FAILED" };
  } finally {
    client.release();
  }
}

/**
 * Capture final payment and settle the booking.
 */
export async function captureFinalPayment(
  bookingId: string,
  paymentOrderId: string,
  providerPaymentId: string
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    // Capture the payment
    const { captured } = await capturePayment(paymentOrderId, providerPaymentId);

    if (captured) {
      // Update booking status
      await client.query(
        `UPDATE bookings 
         SET final_paid = TRUE, 
             payment_stage = 'fully_paid',
             updated_at = now() 
         WHERE id = $1`,
        [bookingId]
      );

      // Settle the booking - this credits the worker
      await settleBooking(client, bookingId);
    }

    await client.query("commit");
    return captured;
  } catch (error) {
    await client.query("rollback");
    logger.error({ error, bookingId, paymentOrderId }, "Failed to capture final payment");
    return false;
  } finally {
    client.release();
  }
}

/**
 * Process refund for cancelled booking.
 */
export async function processAdvanceRefund(
  bookingId: string,
  reason: string = "booking_cancelled"
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const bookingResult = await client.query(
      `SELECT id, advance_paid, final_paid, advance_payment_id, advance_amount, payment_stage 
       FROM bookings WHERE id = $1 FOR UPDATE`,
      [bookingId]
    );

    const booking = bookingResult.rows[0];
    if (!booking) {
      await client.query("rollback");
      return false;
    }

    // Only refund if advance was paid but final wasn't
    if (!booking.advance_paid || booking.final_paid) {
      await client.query("rollback");
      return false;
    }

    // Update booking status
    await client.query(
      `UPDATE bookings 
       SET payment_stage = 'refunded',
           updated_at = now() 
       WHERE id = $1`,
      [bookingId]
    );

    // Create refund record
    if (booking.advance_payment_id) {
      await client.query(
        `INSERT INTO payment_refunds (id, payment_order_id, amount, reason, status, processed_at)
         VALUES ($1, $2, $3, $4, 'pending', now())`,
        [crypto.randomUUID(), booking.advance_payment_id, booking.advance_amount, reason]
      );
    }

    await client.query("commit");

    logger.info({ bookingId, refundAmount: booking.advance_amount }, "Advance refund processed");
    return true;
  } catch (error) {
    await client.query("rollback");
    logger.error({ error, bookingId }, "Failed to process advance refund");
    return false;
  } finally {
    client.release();
  }
}

/**
 * Get payment status for a booking.
 */
export async function getBookingPaymentStatus(bookingId: string, userId: string) {
  const result = await pool.query(
    `SELECT b.id, b.price, b.advance_amount, b.balance_due, 
            b.advance_paid, b.final_paid, b.payment_stage,
            b.advance_payment_id,
            po_advance.status as advance_payment_status,
            po_advance.provider_order_id as advance_provider_order_id,
            po_final.id as final_payment_order_id,
            po_final.status as final_payment_status,
            po_final.provider_order_id as final_provider_order_id
     FROM bookings b
     LEFT JOIN payment_orders po_advance ON po_advance.id = b.advance_payment_id
     LEFT JOIN LATERAL (
       SELECT * FROM payment_orders 
       WHERE booking_id = b.id AND payment_type = 'final'
       ORDER BY created_at DESC LIMIT 1
     ) po_final ON true
     WHERE b.id = $1 AND (b.customer_id = $2 OR EXISTS (
       SELECT 1 FROM workers w WHERE w.id = b.worker_id AND w.user_id = $2
     ))`,
    [bookingId, userId]
  );

  return result.rows[0] ?? null;
}
