import { env } from "../config/env.js";
import logger from "../core/logger.js";

/**
 * Razorpay Orders API.
 *
 * This is the piece that was missing: `payment_orders` rows were created
 * locally with `provider_order_id` left NULL, which broke the flow at both
 * ends. The client had no order id to open checkout with, and the webhook
 * handler looks orders up by `provider_order_id`, so a captured payment could
 * never be matched back to a booking.
 *
 * Amounts cross this boundary in PAISE. Razorpay rejects fractional amounts,
 * and passing rupees would undercharge by 100x, so the conversion is done in
 * exactly one place — `toPaise` — and asserted.
 */

const RAZORPAY_API = "https://api.razorpay.com/v1";

export interface RemoteOrder {
  providerOrderId: string;
  amount: number;
  currency: string;
  /** True when no gateway credentials are configured and a local stand-in was
   *  issued instead. Never true in production — see `assertConfigured`. */
  simulated: boolean;
}

export function isConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

/**
 * Fail loudly rather than silently taking fake payments.
 *
 * A production deployment with no gateway keys must not fall back to simulated
 * orders: every booking would look paid and no money would move.
 */
export function assertConfigured(): void {
  if (isConfigured()) return;
  if (env.NODE_ENV === "production") {
    throw new Error("RAZORPAY_NOT_CONFIGURED");
  }
  logger.warn(
    "Razorpay keys are not set; issuing a simulated order id. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to take real payments."
  );
}

export function toPaise(rupees: number): number {
  const paise = Math.round(rupees * 100);
  if (!Number.isFinite(paise) || paise <= 0) throw new Error("INVALID_AMOUNT");
  return paise;
}

function authHeader(): string {
  const raw = `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

/**
 * Create the order at Razorpay.
 *
 * `receipt` carries our own payment_order id so a payment can be traced back
 * from the Razorpay dashboard without a database lookup. Razorpay caps it at
 * 40 characters, which a uuid fits inside.
 */
export async function createRemoteOrder(params: {
  amount: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RemoteOrder> {
  assertConfigured();

  const amountInPaise = toPaise(params.amount);
  const currency = params.currency ?? "INR";

  if (!isConfigured()) {
    return {
      providerOrderId: `order_sim_${params.receipt.replace(/-/g, "").slice(0, 14)}`,
      amount: amountInPaise,
      currency,
      simulated: true,
    };
  }

  // Razorpay is a third party on the booking's critical path. A hung socket
  // must not hold the request open indefinitely.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${RAZORPAY_API}/orders`, {
      method: "POST",
      headers: {
        authorization: authHeader(),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency,
        receipt: params.receipt.slice(0, 40),
        notes: params.notes ?? {},
      }),
      signal: controller.signal,
    });

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const description =
        (body.error as { description?: string } | undefined)?.description ?? response.statusText;
      logger.error({ status: response.status, description }, "Razorpay order creation failed");
      throw new Error(`RAZORPAY_ORDER_FAILED: ${description}`);
    }

    const id = typeof body.id === "string" ? body.id : null;
    if (!id) throw new Error("RAZORPAY_ORDER_FAILED: response carried no order id");

    return {
      providerOrderId: id,
      amount: Number(body.amount ?? amountInPaise),
      currency: String(body.currency ?? currency),
      simulated: false,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("RAZORPAY_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The publishable key the mobile checkout needs.
 *
 * Only the key id is ever sent to a client. The secret signs webhooks and
 * checkout responses and must never leave the server.
 */
export function publishableKey(): string | null {
  return env.RAZORPAY_KEY_ID || null;
}
