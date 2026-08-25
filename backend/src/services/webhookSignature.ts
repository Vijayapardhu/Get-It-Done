import crypto from "node:crypto";
import { env } from "../config/env.js";
import logger from "../core/logger.js";

/**
 * Payment webhook signature verification.
 *
 * Replaces two stubs (`routes/payments.ts` and `services/paymentService.ts`)
 * that both returned `true` unconditionally, which meant anyone who could reach
 * the webhook URL could POST `payment.captured` and mark a booking paid.
 *
 * Every provider signs the RAW request body. A re-serialised `JSON.stringify`
 * of the parsed object will not match (key order, whitespace, unicode escaping),
 * so `captureRawBody` in app.ts stashes the untouched Buffer and these functions
 * read that.
 */

export type SignatureResult =
  | { verified: true; provider: string }
  | { verified: false; provider: string; reason: string };

/**
 * Constant-time compare that does not leak length through an early return.
 * `timingSafeEqual` throws on length mismatch, so hash both sides to a fixed
 * width first.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function hmacHex(secret: string, payload: string | Buffer): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/** Razorpay: X-Razorpay-Signature = hex HMAC-SHA256(rawBody, webhookSecret). */
function verifyRazorpay(rawBody: Buffer, headers: Record<string, string | undefined>): SignatureResult {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return { verified: false, provider: "razorpay", reason: "RAZORPAY_WEBHOOK_SECRET is not configured" };

  const signature = headers["x-razorpay-signature"];
  if (!signature) return { verified: false, provider: "razorpay", reason: "Missing X-Razorpay-Signature header" };

  return safeEqual(hmacHex(secret, rawBody), signature)
    ? { verified: true, provider: "razorpay" }
    : { verified: false, provider: "razorpay", reason: "Signature mismatch" };
}

/**
 * Stripe: Stripe-Signature: t=<unix>,v1=<hex>
 * signed payload is `${t}.${rawBody}`. The timestamp is part of the signature,
 * so an attacker cannot replay an old body under a fresh timestamp.
 */
function verifyStripe(rawBody: Buffer, headers: Record<string, string | undefined>): SignatureResult {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return { verified: false, provider: "stripe", reason: "STRIPE_WEBHOOK_SECRET is not configured" };

  const header = headers["stripe-signature"];
  if (!header) return { verified: false, provider: "stripe", reason: "Missing Stripe-Signature header" };

  const parts = new Map(
    header.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")] as const;
    })
  );

  const timestamp = parts.get("t");
  const signature = parts.get("v1");
  if (!timestamp || !signature) return { verified: false, provider: "stripe", reason: "Malformed Stripe-Signature header" };

  // Reject anything older than five minutes to bound the replay window.
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    return { verified: false, provider: "stripe", reason: "Signature timestamp outside tolerance" };
  }

  const expected = hmacHex(secret, `${timestamp}.${rawBody.toString("utf-8")}`);
  return safeEqual(expected, signature)
    ? { verified: true, provider: "stripe" }
    : { verified: false, provider: "stripe", reason: "Signature mismatch" };
}

/** PhonePe: X-VERIFY = sha256(base64Payload + saltKey) + "###" + saltIndex. */
function verifyPhonePe(rawBody: Buffer, headers: Record<string, string | undefined>): SignatureResult {
  const salt = env.PHONEPE_SALT_KEY;
  if (!salt) return { verified: false, provider: "phonepe", reason: "PHONEPE_SALT_KEY is not configured" };

  const header = headers["x-verify"];
  if (!header) return { verified: false, provider: "phonepe", reason: "Missing X-VERIFY header" };

  const [signature, saltIndex] = header.split("###");
  if (!signature) return { verified: false, provider: "phonepe", reason: "Malformed X-VERIFY header" };
  if (saltIndex && saltIndex !== env.PHONEPE_SALT_INDEX) {
    return { verified: false, provider: "phonepe", reason: "Unknown salt index" };
  }

  // PhonePe posts { response: "<base64>" }; the base64 string itself is signed.
  let base64Payload: string;
  try {
    const parsed = JSON.parse(rawBody.toString("utf-8")) as { response?: unknown };
    base64Payload = typeof parsed.response === "string" ? parsed.response : rawBody.toString("base64");
  } catch {
    base64Payload = rawBody.toString("base64");
  }

  const expected = crypto.createHash("sha256").update(base64Payload + salt).digest("hex");
  return safeEqual(expected, signature)
    ? { verified: true, provider: "phonepe" }
    : { verified: false, provider: "phonepe", reason: "Signature mismatch" };
}

const VERIFIERS: Record<string, (raw: Buffer, headers: Record<string, string | undefined>) => SignatureResult> = {
  razorpay: verifyRazorpay,
  stripe: verifyStripe,
  phonepe: verifyPhonePe,
  upi: verifyRazorpay, // UPI collect flows are brokered through Razorpay
};

/**
 * Verify an inbound webhook. Unknown providers and missing secrets both fail
 * closed — a payload we cannot authenticate is never treated as authentic.
 *
 * ALLOW_UNSIGNED_WEBHOOKS bypasses this for local development. env.ts refuses
 * to start with that flag set when NODE_ENV=production.
 */
export function verifyWebhookSignature(
  provider: string,
  rawBody: Buffer | undefined,
  headers: Record<string, string | undefined>
): SignatureResult {
  const key = provider.toLowerCase();

  if (env.ALLOW_UNSIGNED_WEBHOOKS) {
    logger.warn({ provider: key }, "ALLOW_UNSIGNED_WEBHOOKS is on — skipping signature verification");
    return { verified: true, provider: key };
  }

  if (!rawBody || rawBody.length === 0) {
    return { verified: false, provider: key, reason: "Raw request body unavailable; cannot verify signature" };
  }

  const verifier = VERIFIERS[key];
  if (!verifier) return { verified: false, provider: key, reason: `Unsupported webhook provider '${provider}'` };

  return verifier(rawBody, headers);
}

/**
 * Verify a client-side payment confirmation (Razorpay checkout handback).
 * Signed with the API key secret over `${orderId}|${paymentId}`, which is a
 * different secret and a different payload from the webhook above.
 */
export function verifyCheckoutSignature(
  provider: string,
  fields: { orderId?: string; paymentId?: string },
  signature: string
): SignatureResult {
  const key = provider.toLowerCase();

  if (key === "razorpay" || key === "upi") {
    const secret = env.RAZORPAY_KEY_SECRET;
    if (!secret) return { verified: false, provider: key, reason: "RAZORPAY_KEY_SECRET is not configured" };
    if (!fields.orderId || !fields.paymentId) {
      return { verified: false, provider: key, reason: "orderId and paymentId are required" };
    }
    const expected = hmacHex(secret, `${fields.orderId}|${fields.paymentId}`);
    return safeEqual(expected, signature)
      ? { verified: true, provider: key }
      : { verified: false, provider: key, reason: "Signature mismatch" };
  }

  if (env.ALLOW_UNSIGNED_WEBHOOKS) return { verified: true, provider: key };
  return { verified: false, provider: key, reason: `Checkout verification not supported for '${provider}'` };
}
