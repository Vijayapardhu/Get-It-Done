import { pool } from "../db/pool.js";
import type { PoolClient } from "pg";
import logger from "../core/logger.js";

/**
 * Price computation.
 *
 * This lives in a service rather than inside the /pricing/estimate route
 * because two callers need the SAME number: the estimate the customer is shown
 * before booking, and the amount they are actually charged. When those were
 * computed in two places they disagreed — the estimate applied travel, surge,
 * emergency and tax, while the payment order charged the raw
 * `services.base_price`. A customer quoted 442 was charged 299.
 */

export interface PriceBreakdown {
  baseService: number;
  travel: number;
  emergency: number;
  surge: number;
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  currency: "INR";
}

export interface QuoteInput {
  serviceId: string;
  variantId?: string;
  latitude: number;
  longitude: number;
  urgency: "regular" | "emergency";
  cooperativeId?: string | null;
}

export async function calculateTravelFee(cooperativeId: string, distanceKm: number): Promise<number> {
  const result = await pool.query(
    `SELECT base_km, base_fee, per_km_rate, max_distance_km FROM travel_fees WHERE cooperative_id = $1`,
    [cooperativeId]
  );
  if (!result.rows[0]) return 0;
  const { base_km, base_fee, per_km_rate, max_distance_km } = result.rows[0];
  if (distanceKm > max_distance_km) return 0;
  if (distanceKm <= base_km) return Number(base_fee);
  return Number(base_fee) + (distanceKm - base_km) * Number(per_km_rate);
}

export async function getSurgeMultiplier(
  serviceId: string,
  latitude: number,
  longitude: number
): Promise<number> {
  const result = await pool.query(
    `SELECT multiplier FROM surge_rules
      WHERE (service_id = $1 OR service_id IS NULL)
        AND ST_Contains(area::geometry, ST_SetSRID(ST_MakePoint($2, $3), 4326))
        AND (starts_at IS NULL OR starts_at <= now())
        AND (ends_at IS NULL OR ends_at > now())
      ORDER BY multiplier DESC LIMIT 1`,
    [serviceId, longitude, latitude]
  );
  return result.rows[0] ? Number(result.rows[0].multiplier) : 1;
}

/** Statutory GST on services. Used whenever no jurisdiction rule applies. */
export const DEFAULT_TAX_RATE = 0.18;

/**
 * Tax rate for a booking, as a FRACTION (0.18, not 18).
 *
 * The previous query was `... WHERE applies_to = 'service' ORDER BY rate DESC
 * LIMIT 1` with the jurisdiction clause attached only when a cooperative was
 * known. For a customer — who is never a member of a cooperative, so the
 * lookup always came back empty — that degenerated to "the single highest tax
 * rate anywhere in the table, from any state". A stray rule with rate 1.0000
 * therefore taxed every booking at 100%, doubling the quoted price.
 *
 * A tax rule now only applies to its own jurisdiction, and an out-of-range
 * rate is refused rather than charged.
 */
export async function getTaxRate(cooperativeId: string | null): Promise<number> {
  if (!cooperativeId) return DEFAULT_TAX_RATE;

  const result = await pool.query(
    `SELECT t.rate
       FROM tax_rules t
       JOIN cooperatives c ON c.id = $1
      WHERE t.applies_to = 'service'
        AND t.jurisdiction = c.state
      ORDER BY t.rate DESC
      LIMIT 1`,
    [cooperativeId]
  );
  if (!result.rows[0]) return DEFAULT_TAX_RATE;

  const rate = Number(result.rows[0].rate);

  // Guard the customer against bad reference data. Anything outside this band
  // is a data-entry error (a percentage stored where a fraction belongs, most
  // likely), not a real tax rate, and must not reach a card.
  if (!Number.isFinite(rate) || rate < 0 || rate > 0.5) {
    logger.error(
      { cooperativeId, rate },
      "Ignoring out-of-range tax rate; falling back to the statutory default"
    );
    return DEFAULT_TAX_RATE;
  }
  return rate;
}

/** Money is rounded to paise once, at the end, not at every intermediate step. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function quote(input: QuoteInput): Promise<PriceBreakdown> {
  const service = await pool.query(
    `SELECT base_price, emergency_supported FROM services WHERE id = $1`,
    [input.serviceId]
  );
  if (!service.rows[0]) throw new Error("SERVICE_NOT_FOUND");
  if (input.urgency === "emergency" && !service.rows[0].emergency_supported) {
    throw new Error("EMERGENCY_NOT_SUPPORTED");
  }

  let variantPrice = Number(service.rows[0].base_price);
  if (input.variantId) {
    const variant = await pool.query(
      `SELECT base_price FROM service_variants WHERE id = $1 AND service_id = $2`,
      [input.variantId, input.serviceId]
    );
    if (variant.rows[0]) variantPrice = Number(variant.rows[0].base_price);
  }

  const cooperativeId = input.cooperativeId ?? null;
  const distanceKm = 5;
  const travelFee = cooperativeId ? await calculateTravelFee(cooperativeId, distanceKm) : 0;
  const emergencyFee = input.urgency === "emergency" ? variantPrice * 0.25 : 0;
  const surgeMultiplier = await getSurgeMultiplier(input.serviceId, input.latitude, input.longitude);
  const surgeFee = (variantPrice + travelFee + emergencyFee) * (surgeMultiplier - 1);
  const subtotal = variantPrice + travelFee + emergencyFee + surgeFee;
  const taxRate = await getTaxRate(cooperativeId);
  const tax = subtotal * taxRate;

  return {
    baseService: round2(variantPrice),
    travel: round2(travelFee),
    emergency: round2(emergencyFee),
    surge: round2(surgeFee),
    subtotal: round2(subtotal),
    taxRate,
    tax: round2(tax),
    total: round2(subtotal + tax),
    currency: "INR",
  };
}

/**
 * The authoritative amount payable for a booking, in rupees.
 *
 * Quoted ONCE and frozen onto `bookings.price`, normally at booking creation.
 * Two rules make this correct rather than merely convenient:
 *
 *  1. The customer pays the number they agreed to. A surge rule that starts
 *     between booking and payment must not change what they owe.
 *  2. The quote must not depend on WHICH worker is assigned. Deriving the
 *     cooperative from the assigned worker made the charge differ from the
 *     estimate the customer was shown — travel fees are per-cooperative, and
 *     at estimate time nobody has been assigned yet. A customer quoted 352.82
 *     was charged 411.82.
 *
 * Travel fees therefore do not currently reach the customer's total. Charging
 * them needs a cooperative chosen before the quote, which the matching flow
 * does not do yet.
 */
export async function quoteBookingAmount(
  bookingId: string,
  client?: PoolClient
): Promise<{ amount: number; breakdown: PriceBreakdown | null; frozen: boolean }> {
  const db = client ?? pool;

  const result = await db.query(
    `SELECT b.id, b.price, b.service_id, b.is_emergency,
            ST_Y(b.location::geometry) AS latitude,
            ST_X(b.location::geometry) AS longitude
       FROM bookings b
      WHERE b.id = $1`,
    [bookingId]
  );
  const booking = result.rows[0];
  if (!booking) throw new Error("BOOKING_NOT_FOUND");

  if (booking.price !== null && booking.price !== undefined) {
    return { amount: Number(booking.price), breakdown: null, frozen: true };
  }

  const breakdown = await quote({
    serviceId: booking.service_id,
    latitude: Number(booking.latitude),
    longitude: Number(booking.longitude),
    urgency: booking.is_emergency ? "emergency" : "regular",
    cooperativeId: null,
  });

  // `price IS NULL` in the predicate makes this safe under a race: whichever
  // request gets there first sets the price, the loser reads it back.
  const updated = await db.query(
    `UPDATE bookings SET price = $1, updated_at = now() WHERE id = $2 AND price IS NULL RETURNING price`,
    [breakdown.total, bookingId]
  );

  if (updated.rows[0]) return { amount: Number(updated.rows[0].price), breakdown, frozen: false };

  const reread = await db.query(`SELECT price FROM bookings WHERE id = $1`, [bookingId]);
  return { amount: Number(reread.rows[0].price), breakdown, frozen: true };
}
