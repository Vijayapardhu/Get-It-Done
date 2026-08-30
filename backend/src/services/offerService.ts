import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import logger from "../core/logger.js";
import { emitJobOffered, emitJobRevoked } from "../core/realtime.js";
import { isPushAvailable, sendDataPushToTokens } from "../core/push.js";
import { getDistanceMatrix, calculateDistance, isMapsConfigured } from "./googleMaps.js";
import { computeSplit } from "./revenueSplit.js";

/**
 * The 45-second moment.
 *
 * WORKER_APP_PLAN 4.1: before this module, a worker learned about a job as a
 * generic `notification:new` carrying two strings, delivered whenever the
 * outbox next polled -- up to five seconds of a forty-five second window. There
 * was no booking payload, no pay figure, no deadline, and no way to know the
 * offer had already gone to somebody else.
 *
 * What this adds is a first-class offer:
 *
 *   - a ROW, so `GET /workers/me/offers` can answer "what is live for me right
 *     now" on cold start, on reconnect, and when a push arrives with no socket.
 *     A socket event is not a source of truth; it is a delivery optimisation.
 *   - a SERVER deadline, so the countdown ring is rendered against a time the
 *     client did not invent. A client-side `Duration(seconds: 45)` started on
 *     receipt is wrong by the network latency plus whatever the phone's clock
 *     says, and being wrong here costs the worker a job.
 *   - the PAYOUT, not the customer's price. `computeSplit` was only ever called
 *     at settlement; a worker deciding whether to cross the city was shown
 *     either nothing or a number that is not their money.
 *   - an AREA, never the exact address. That is disclosed on acceptance.
 *
 * Delivery is deliberately both socket and FCM data message. On a good day both
 * fire and the client de-duplicates on `offerId` -- which is cheaper than
 * guessing which path will work on a 2G connection in a stairwell.
 */

export type OfferDeclineReason =
  | "too_far"
  | "busy"
  | "not_my_trade"
  | "unsafe"
  | "rate_too_low"
  | "other";

export type OfferRevokeReason = "timeout" | "reassigned" | "cancelled" | "taken";

export interface JobOfferPayload {
  offerId: string;
  bookingId: string;
  orderId: string | null;
  service: { id: string; name: string; category: string | null };
  scheduledAt: string | null;
  durationMinutes: number | null;
  isEmergency: boolean;
  /** Area name only. The street address is disclosed on acceptance. */
  area: string | null;
  distanceKm: number | null;
  etaMinutes: number | null;
  /** What the worker actually takes home, after the full split. */
  payout: number;
  /** The customer's inclusive total, shown alongside so the split is checkable. */
  customerTotal: number;
  expiresAt: string;
  /** The server's own clock at send time, so the client can measure its skew. */
  serverNow: string;
  attempt: number;
}

/** Straight-line fallback when Maps is unconfigured or the call fails. */
function estimateEtaMinutes(distanceKm: number): number {
  // 18 km/h is a defensible city-traffic average for Hyderabad on a two-wheeler
  // and errs slow, which is the safe direction: an ETA that flatters the
  // journey makes a worker accept a job they then arrive late for.
  return Math.max(3, Math.round((distanceKm / 18) * 60));
}

interface OfferContext {
  booking_id: string;
  order_id: string | null;
  service_id: string;
  service_name: string;
  category: string | null;
  scheduled_at: string | null;
  duration_minutes: number | null;
  is_emergency: boolean;
  price: string | null;
  base_price: string | null;
  locality: string | null;
  customer_lat: number | null;
  customer_lng: number | null;
  worker_user_id: string;
  worker_lat: number | null;
  worker_lng: number | null;
  cooperative_id: string | null;
  assignment_attempts: number | null;
}

async function loadOfferContext(bookingId: string, workerId: string): Promise<OfferContext | null> {
  const result = await pool.query<OfferContext>(
    `select b.id                       as booking_id,
            b.order_id,
            b.service_id,
            s.name                     as service_name,
            s.category,
            s.base_price,
            b.scheduled_at,
            b.duration_minutes,
            b.is_emergency,
            b.price,
            b.locality,
            b.assignment_attempts,
            st_y(b.location::geometry)  as customer_lat,
            st_x(b.location::geometry)  as customer_lng,
            w.user_id                   as worker_user_id,
            w.cooperative_id,
            st_y(wl.location::geometry) as worker_lat,
            st_x(wl.location::geometry) as worker_lng
       from bookings b
       join services s on s.id = b.service_id
       join workers  w on w.id = $2
       left join worker_locations wl on wl.worker_id = w.id
      where b.id = $1`,
    [bookingId, workerId]
  );
  return result.rows[0] ?? null;
}

/**
 * Build the payload the offer screen renders, without fetching anything else.
 *
 * Distance and ETA are best-effort: a Maps outage must degrade the offer to a
 * straight-line estimate, never suppress it. A worker who is not shown an offer
 * loses income; a worker shown an approximate ETA loses nothing.
 */
async function buildPayload(
  context: OfferContext,
  offerId: string,
  expiresAt: Date,
  attempt: number
): Promise<JobOfferPayload> {
  let distanceKm: number | null = null;
  let etaMinutes: number | null = null;

  const haveBothFixes =
    context.worker_lat != null &&
    context.worker_lng != null &&
    context.customer_lat != null &&
    context.customer_lng != null;

  if (haveBothFixes) {
    distanceKm = Number(
      calculateDistance(
        Number(context.worker_lat),
        Number(context.worker_lng),
        Number(context.customer_lat),
        Number(context.customer_lng)
      ).toFixed(2)
    );
    etaMinutes = estimateEtaMinutes(distanceKm);

    if (isMapsConfigured()) {
      try {
        const matrix = await getDistanceMatrix(
          [{ lat: Number(context.worker_lat), lng: Number(context.worker_lng) }],
          [{ lat: Number(context.customer_lat), lng: Number(context.customer_lng) }],
          { mode: "driving", departureTime: Math.floor(Date.now() / 1000), trafficModel: "best_guess" }
        );
        if (matrix[0]?.distance) {
          distanceKm = Number((matrix[0].distance.value / 1000).toFixed(2));
          etaMinutes = Math.round((matrix[0].durationInTraffic ?? matrix[0].duration).value / 60);
        }
      } catch (error) {
        logger.debug({ err: error, bookingId: context.booking_id }, "Offer ETA fell back to straight line");
      }
    }
  }

  // The frozen quote is what the customer agreed to and is tax-inclusive, which
  // is what computeSplit expects. base_price is a last resort for bookings that
  // predate quoting; it is the same fallback ladder settlement uses.
  const customerTotal = Number(context.price ?? context.base_price ?? 0);
  const split = computeSplit(customerTotal, Boolean(context.cooperative_id));

  return {
    offerId,
    bookingId: context.booking_id,
    orderId: context.order_id,
    service: { id: context.service_id, name: context.service_name, category: context.category },
    scheduledAt: context.scheduled_at ? new Date(context.scheduled_at).toISOString() : null,
    durationMinutes: context.duration_minutes,
    isEmergency: context.is_emergency,
    area: context.locality,
    distanceKm,
    etaMinutes,
    payout: split.workerShare,
    customerTotal: split.total,
    expiresAt: expiresAt.toISOString(),
    serverNow: new Date().toISOString(),
    attempt,
  };
}

/**
 * Offer one booking to one worker, and get it in front of them.
 *
 * Call this AFTER the transaction that assigned the worker has committed. An
 * offer emitted inside the transaction can reach a phone before the row it
 * describes is visible to the next reader, and a rollback would leave a worker
 * counting down on a job that does not exist.
 *
 * Never throws: dispatch is a side effect of an assignment that has already
 * happened, and a failed push must not undo it. The booking still has its
 * `assignment_expires_at`, the timer job still fires, and the offer is still
 * readable from `GET /workers/me/offers`.
 */
export async function dispatchOffer(
  bookingId: string,
  workerId: string,
  options: { ttlSeconds?: number } = {}
): Promise<JobOfferPayload | null> {
  try {
    const context = await loadOfferContext(bookingId, workerId);
    if (!context) {
      logger.warn({ bookingId, workerId }, "Offer dispatch skipped: booking or worker missing");
      return null;
    }

    const ttlSeconds = options.ttlSeconds ?? env.WORKER_ACCEPT_TIMEOUT_SECONDS;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const attempt = Number(context.assignment_attempts ?? 1) || 1;

    // Any earlier live offer for this booking/worker pair is closed first, so
    // the partial unique index cannot reject the insert on a re-offer.
    await pool.query(
      `update job_offers
          set status = 'revoked', revoked_reason = 'reassigned', responded_at = now()
        where booking_id = $1 and worker_id = $2 and status = 'offered'`,
      [bookingId, workerId]
    );

    const inserted = await pool.query<{ id: string }>(
      `insert into job_offers (booking_id, worker_id, user_id, expires_at, attempt, payload)
       values ($1, $2, $3, $4, $5, '{}'::jsonb)
       returning id`,
      [bookingId, workerId, context.worker_user_id, expiresAt, attempt]
    );
    const offerId = inserted.rows[0].id;

    const payload = await buildPayload(context, offerId, expiresAt, attempt);

    // Frozen after the fact rather than before, because the ETA call is the
    // slow part and the row must exist first for the accept path to find it.
    await pool.query(`update job_offers set payload = $2 where id = $1`, [offerId, JSON.stringify(payload)]);

    emitJobOffered(context.worker_user_id, payload);
    void deliverOfferPush(context.worker_user_id, payload, ttlSeconds).catch((error) =>
      logger.error({ err: error, bookingId }, "Offer push failed")
    );

    logger.info(
      { bookingId, workerId, offerId, payout: payload.payout, ttlSeconds },
      "Job offered"
    );
    return payload;
  } catch (error) {
    logger.error({ err: error, bookingId, workerId }, "Offer dispatch failed");
    return null;
  }
}

/**
 * The FCM half. A socket only exists while the app is foregrounded, and this
 * offer is arriving at a phone in a pocket.
 *
 * `job_offer` is intentionally not gated on the user's push preference. Every
 * other category is; this one is the worker's income, it is the reason the app
 * is installed, and a worker who silenced it would simply stop being matched
 * with no explanation. Turning it off is a duty-toggle decision, not a
 * notification-settings one.
 */
async function deliverOfferPush(userId: string, payload: JobOfferPayload, ttlSeconds: number): Promise<void> {
  if (!isPushAvailable()) return;

  const tokens = await pool.query<{ token: string }>(
    `select token from device_tokens where user_id = $1`,
    [userId]
  );
  const tokenList = tokens.rows.map((row) => row.token);
  if (tokenList.length === 0) return;

  const outcome = await sendDataPushToTokens(
    tokenList,
    {
      type: "job_offer",
      // The whole payload, so a cold-started app can draw the full-screen
      // interrupt without a network round trip it may not be able to make.
      offer: JSON.stringify(payload),
      offerId: payload.offerId,
      bookingId: payload.bookingId,
      expiresAt: payload.expiresAt,
    },
    {
      ttlSeconds,
      // A second offer for the same booking replaces the first in the tray
      // rather than stacking two countdowns for one job.
      collapseKey: `offer:${payload.bookingId}`,
    }
  );

  if (outcome.staleTokens.length > 0) {
    await pool.query(`delete from device_tokens where user_id = $1 and token = any($2::text[])`, [
      userId,
      outcome.staleTokens,
    ]);
  }
}

/**
 * Close the live offer a worker just answered.
 *
 * Returns `null` when there was nothing live to close -- which is exactly the
 * lapsed-accept case the route turns into a typed 409, so the app can say "this
 * job went to someone else" instead of showing a generic failure.
 */
export async function resolveOffer(
  bookingId: string,
  userId: string,
  status: "accepted" | "declined",
  declineReason?: OfferDeclineReason
): Promise<{ id: string; expiresAt: string } | null> {
  const result = await pool.query<{ id: string; expires_at: string }>(
    `update job_offers
        set status = $3,
            responded_at = now(),
            decline_reason = $4
      where booking_id = $1
        and user_id = $2
        and status = 'offered'
      returning id, expires_at`,
    [bookingId, userId, status, declineReason ?? null]
  );
  const row = result.rows[0];
  return row ? { id: row.id, expiresAt: new Date(row.expires_at).toISOString() } : null;
}

/**
 * Take the offer off every screen still showing it.
 *
 * Without this a worker stares at a countdown for a job somebody else already
 * accepted, and finds out only by pressing Accept -- which is the single worst
 * moment the app can produce, because it looks like the app lost them the job.
 */
export async function revokeLiveOffers(
  bookingId: string,
  reason: OfferRevokeReason,
  options: { exceptUserId?: string } = {}
): Promise<number> {
  const result = await pool.query<{ id: string; user_id: string }>(
    `update job_offers
        set status = 'revoked', revoked_reason = $2, responded_at = now()
      where booking_id = $1
        and status = 'offered'
        and ($3::uuid is null or user_id <> $3)
      returning id, user_id`,
    [bookingId, reason, options.exceptUserId ?? null]
  );

  for (const row of result.rows) {
    emitJobRevoked(row.user_id, { offerId: row.id, bookingId, reason });
  }
  return result.rowCount ?? 0;
}

/**
 * Every offer live for this worker right now, newest first.
 *
 * This is what the app calls on cold start, on socket reconnect, and whenever a
 * push arrives while the socket is down. Expired rows are swept first so the
 * caller never has to reason about a deadline in the past.
 */
export async function listLiveOffers(userId: string): Promise<{ offers: JobOfferPayload[]; serverNow: string }> {
  await expireDueOffers();

  const result = await pool.query<{ id: string; payload: JobOfferPayload; expires_at: string }>(
    `select id, payload, expires_at
       from job_offers
      where user_id = $1 and status = 'offered' and expires_at > now()
      order by offered_at desc`,
    [userId]
  );

  const serverNow = new Date().toISOString();
  const offers = result.rows.map((row) => ({
    ...row.payload,
    offerId: row.id,
    expiresAt: new Date(row.expires_at).toISOString(),
    // Re-stamped, so a client reconciling after a long sleep measures its skew
    // against now rather than against whenever the offer was made.
    serverNow,
  }));

  return { offers, serverNow };
}

/**
 * Sweep offers whose window closed.
 *
 * The failover job already reassigns the booking; this is the bookkeeping half,
 * and it runs periodically as well so an offer for a booking that was cancelled
 * outright does not sit `offered` forever.
 */
export async function expireDueOffers(): Promise<number> {
  const result = await pool.query<{ id: string; user_id: string; booking_id: string }>(
    `update job_offers
        set status = 'expired', revoked_reason = 'timeout', responded_at = now()
      where status = 'offered' and expires_at <= now()
      returning id, user_id, booking_id`
  );

  for (const row of result.rows) {
    emitJobRevoked(row.user_id, { offerId: row.id, bookingId: row.booking_id, reason: "timeout" });
  }
  return result.rowCount ?? 0;
}

/**
 * What a worker will actually be paid for one booking, itemised.
 *
 * The same `computeSplit` settlement uses, exposed before and during the job
 * rather than only after it. On a cooperative platform that transparency is not
 * a nicety: a worker who cannot see where the other 17% went has to take our
 * word for it.
 */
export async function getPayoutPreview(
  bookingId: string,
  workerUserId: string,
  client: PoolClient | typeof pool = pool
): Promise<{
  bookingId: string;
  currency: string;
  lines: { key: string; label: string; amount: number; destination: string }[];
  payout: number;
  customerTotal: number;
} | null> {
  const result = await client.query<{
    price: string | null;
    base_price: string | null;
    cooperative_id: string | null;
  }>(
    `select b.price, s.base_price, w.cooperative_id
       from bookings b
       join services s on s.id = b.service_id
       join workers  w on w.id = b.worker_id
      where b.id = $1 and w.user_id = $2`,
    [bookingId, workerUserId]
  );
  const row = result.rows[0];
  if (!row) return null;

  const split = computeSplit(Number(row.price ?? row.base_price ?? 0), Boolean(row.cooperative_id));

  return {
    bookingId,
    currency: "INR",
    // Ordered as the breakdown screen reads it, top to bottom, each line saying
    // where the money goes rather than only how much it is.
    lines: [
      { key: "total", label: "Customer pays", amount: split.total, destination: "" },
      { key: "tax", label: "GST", amount: -split.tax, destination: "Government" },
      { key: "gross", label: "Job value", amount: split.gross, destination: "" },
      { key: "platform", label: `Platform fee (${Math.round(env.PLATFORM_FEE_RATE * 100)}%)`, amount: -split.platformFee, destination: "GET IT DONE" },
      {
        key: "cooperative",
        label: `Cooperative (${Math.round(env.COOPERATIVE_SHARE_RATE * 100)}%)`,
        amount: -split.cooperativeShare,
        destination: split.cooperativeShare > 0 ? "Your society" : "Not a member yet",
      },
      { key: "welfare", label: `Welfare fund (${Math.round(env.WELFARE_FUND_RATE * 100)}%)`, amount: -split.welfareFund, destination: "Worker Welfare Fund" },
      { key: "payout", label: "You receive", amount: split.workerShare, destination: "Your payout account" },
    ],
    payout: split.workerShare,
    customerTotal: split.total,
  };
}
