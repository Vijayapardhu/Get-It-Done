import rateLimit, { type RateLimitRequestHandler, ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { env } from "../config/env.js";

/**
 * Named rate limiters.
 *
 * Before this file there was exactly one limiter in the whole codebase — 60
 * requests per quarter hour on `/auth` — and everything else was unbounded.
 * That left three different kinds of exposure open, and they want three
 * different answers rather than one global number:
 *
 *   * Guessing. The booking OTPs are six digits. `core/otp.ts` caps attempts
 *     per booking, which stops one booking being brute-forced; it does nothing
 *     about one client working through many bookings, and nothing about the
 *     webhook signature check, which is real cryptographic work an unauthorised
 *     caller can force the server to do for free.
 *
 *   * Spend. Every `/maps/*` call is a billed Google API request made with the
 *     SERVER key, and every `/ai/*` call fits a model. Both sit behind
 *     `requireAuth`, so the exposure is not anonymous — but one stolen token
 *     should not be able to run up an unbounded invoice overnight.
 *
 *   * Volume. Booking creation is idempotency-keyed, so a replayed request is
 *     cheap. A fresh key on every request is not: it is a new row, a new
 *     matching run and a new PostGIS scan.
 *
 * Keyed per authenticated user where there is one, falling back to IP.
 * Keying purely on IP puts an entire office, campus or CGNAT range behind one
 * bucket, and the first person to hit it locks out everybody else.
 */

/**
 * `user:{id}` for a signed-in caller, otherwise the client IP.
 *
 * `ipKeyGenerator` is used rather than `req.ip` directly because it normalises
 * IPv6 to a /64 — a single IPv6 host is routinely handed 2^64 addresses, so an
 * unnormalised key is not a limit at all.
 */
function userOrIp(req: Request): string {
  const userId = (req as Request & { user?: { id?: string } }).user?.id;
  return userId ? `user:${userId}` : ipKeyGenerator(req.ip ?? "");
}

interface LimiterOptions {
  windowMs: number;
  limit: number;
  message: string;
}

function make({ windowMs, limit, message }: LimiterOptions): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: userOrIp,
    // The integration suite drives hundreds of requests through one process in
    // seconds and would trip every bucket. `skip` rather than `limit: 0`:
    // express-rate-limit v7 changed the meaning of a zero limit from "no limit"
    // to "block everything", so setting it here would fail the whole suite with
    // 429s instead of disabling the limiter. The middleware stays mounted, so
    // the wiring is still exercised.
    skip: () => env.NODE_ENV === "test",
    // RFC 7807, matching core/errors.ts — a limiter that answers in a different
    // error shape from the rest of the API is a second thing for a client to parse.
    handler: (_req, res) => {
      res.status(429).json({
        type: "https://getitdone.dev/problems/rate-limited",
        title: "Too many requests",
        status: 429,
        detail: message,
      });
    },
  });
}

/**
 * Sign-in, registration, password reset. Unchanged from what `/auth` already
 * had — named here so every limit in the system is declared in one place.
 */
export const authLimiter = make({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: "Too many authentication attempts. Try again in a few minutes.",
});

/**
 * Anything a caller could guess or force work with: the start/completion OTPs
 * and the payment webhook signature check.
 *
 * Deliberately tight. A worker and a customer standing together enter one OTP
 * once, twice on a mistype; nothing legitimate approaches twenty in a quarter
 * hour, and a caller that does is not typing.
 */
export const strictLimiter = make({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: "Too many attempts. Wait a few minutes before trying again.",
});

/**
 * Endpoints that cost real money per call — Google Maps, and the AI sidecar.
 *
 * Sized for how the apps actually use them: address autocomplete fires per
 * keystroke while somebody types an address, which is bursty and legitimate,
 * so this is generous per minute rather than stingy per hour.
 */
export const meteredLimiter = make({
  windowMs: 60 * 1000,
  limit: 60,
  message: "Too many location requests. Slow down and try again shortly.",
});

/**
 * Writes that create durable state — bookings, orders, emergency requests.
 * High enough that a customer checking out several services never notices.
 */
export const writeLimiter = make({
  windowMs: 60 * 1000,
  limit: 30,
  message: "Too many requests. Wait a moment and try again.",
});
