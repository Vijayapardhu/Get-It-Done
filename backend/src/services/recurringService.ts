import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { findMatchingWorkers } from "./matching.js";
import { writeNotification } from "./notificationService.js";
import { generateBookingOtps } from "../core/otp.js";
import logger from "../core/logger.js";

/**
 * Recurring service plans -> concrete bookings.
 *
 * `routes/recurring.ts` carried two near-identical copies of this logic (the
 * manual POST /:id/generate handler and an exported generateRecurringBookings),
 * and neither was ever called by a scheduler — the whole router was orphaned,
 * never imported by app.ts. Both copies also passed the PostGIS expression
 * `ST_SetSRID(ST_MakePoint(..))` as a bound *parameter*, which Postgres receives
 * as a text literal and fails to cast, so generation would have errored anyway.
 */

export interface RecurringPlan {
  id: string;
  customer_id: string;
  service_id: string;
  address_id: string | null;
  frequency: string;
  days_of_week: number[];
  start_date: string;
  end_date: string | null;
  status: string;
}

/**
 * Next occurrence strictly after now.
 *
 * The weekly branch previously looped `while (true)` with no bound: a plan whose
 * daysOfWeek was `[]` and whose start date had passed spun forever. Every branch
 * here is bounded.
 */
export function calculateNextGeneration(startDate: string | Date, frequency: string, daysOfWeek: number[] = []): Date {
  const start = new Date(startDate);
  const now = new Date();
  const next = new Date(Math.max(start.getTime(), now.getTime()));

  if (frequency === "daily") {
    while (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }

  if (frequency === "weekly") {
    const targetDays = daysOfWeek.length > 0 ? daysOfWeek : [start.getDay()];
    // At most 7 steps reaches any weekday; the bound stops a malformed
    // daysOfWeek array (e.g. [9]) from hanging the process.
    for (let step = 0; step <= 7; step++) {
      if (next > now && targetDays.includes(next.getDay())) return next;
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  if (frequency === "monthly") {
    while (next <= now) next.setMonth(next.getMonth() + 1);
    return next;
  }

  // 'custom': caller drives generation manually; park it a day out.
  next.setDate(next.getDate() + 1);
  return next;
}

/** Resolve the plan's service location from either address table. */
async function resolveAddress(
  client: PoolClient,
  addressId: string | null
): Promise<{ address: string; latitude: number | null; longitude: number | null }> {
  if (!addressId) return { address: "Address on file", latitude: null, longitude: null };

  // address_id may point at either the per-user table or the organization table
  // depending on whether the plan was created by a customer or an institution.
  const personal = await client.query(
    "select address, latitude, longitude from addresses where id = $1",
    [addressId]
  );
  if (personal.rows[0]) return personal.rows[0];

  const organisation = await client.query(
    "select address, latitude, longitude from organization_addresses where id = $1",
    [addressId]
  );
  if (organisation.rows[0]) return organisation.rows[0];

  return { address: "Address on file", latitude: null, longitude: null };
}

export interface GeneratedInstance {
  bookingId: string;
  status: string;
  workerId: string | null;
  startOtp: string;
  completionOtp: string;
}

/**
 * Create one booking from a plan. Must be called inside an open transaction.
 * `actorId` is the user credited in the status event (null for the scheduler).
 */
export async function generateInstance(
  client: PoolClient,
  plan: RecurringPlan,
  actorId: string | null
): Promise<GeneratedInstance> {
  const { address, latitude, longitude } = await resolveAddress(client, plan.address_id);

  const matches = await findMatchingWorkers({
    serviceId: plan.service_id,
    latitude: latitude ?? 0,
    longitude: longitude ?? 0,
    urgency: "regular",
  });

  let confirmedWorkerId: string | null = matches.workers[0]?.workerId ?? null;
  if (confirmedWorkerId) {
    const reserved = await client.query(
      `update workers set current_status = 'busy', updated_at = now()
        where id = $1 and current_status = 'available' and verification_status = 'verified'
        returning id`,
      [confirmedWorkerId]
    );
    if (!reserved.rows[0]) confirmedWorkerId = null;
  }

  const status = confirmedWorkerId ? "assigned" : "requested";
  const bookingId = crypto.randomUUID();

  // Every booking gets handshake codes. Instances generated here previously had
  // none, which left verify-start/verify-complete with nothing to check.
  const { startOtp, completionOtp, startOtpHash, completionOtpHash } = generateBookingOtps();

  // The geography value is built in SQL, not passed as a parameter — a bound
  // string is received as text and cannot be cast to geography.
  const hasCoordinates = latitude !== null && longitude !== null;
  await client.query(
    `insert into bookings
       (id, customer_id, worker_id, service_id, status, is_emergency, location, address, description,
        start_otp_hash, completion_otp_hash, otp_issued_at)
     values ($1, $2, $3, $4, $5, false,
             ${hasCoordinates ? "st_setsrid(st_makepoint($8, $9), 4326)::geography" : "null"},
             $6, $7, $10, $11, now())`,
    hasCoordinates
      ? [bookingId, plan.customer_id, confirmedWorkerId, plan.service_id, status, address,
         `Recurring plan ${plan.id}`, longitude, latitude, startOtpHash, completionOtpHash]
      : [bookingId, plan.customer_id, confirmedWorkerId, plan.service_id, status, address,
         `Recurring plan ${plan.id}`, startOtpHash, completionOtpHash]
  );

  await client.query(
    `insert into booking_status_events (booking_id, status, actor_id, reason, request_id)
     values ($1, $2, $3, $4, null)`,
    [bookingId, status, actorId, `recurring_generated_${plan.id}`]
  );

  if (confirmedWorkerId) {
    const workerUser = await client.query("select user_id from workers where id = $1", [confirmedWorkerId]);
    if (workerUser.rows[0]) {
      await writeNotification(client, {
        userId: workerUser.rows[0].user_id,
        type: "booking.assigned",
        title: "Recurring service booking",
        body: "You have been assigned a scheduled service request.",
        aggregateType: "booking",
        aggregateId: bookingId,
      });
    }
  }

  const nextGeneration = calculateNextGeneration(plan.start_date, plan.frequency, plan.days_of_week ?? []);
  await client.query(
    "update recurring_bookings set last_generated_at = now(), next_generation_at = $1, updated_at = now() where id = $2",
    [nextGeneration, plan.id]
  );

  return { bookingId, status, workerId: confirmedWorkerId, startOtp, completionOtp };
}

/** Generate one instance for a plan by id, in its own transaction. */
export async function generateInstanceById(
  planId: string,
  actorId: string | null
): Promise<GeneratedInstance | null> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query(
      "select * from recurring_bookings where id = $1 and status = 'active' for update",
      [planId]
    );
    if (!result.rows[0]) {
      await client.query("rollback");
      return null;
    }
    const instance = await generateInstance(client, result.rows[0] as RecurringPlan, actorId);
    await client.query("commit");
    return instance;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Scheduler entry point: generate every plan whose next_generation_at has
 * passed. One transaction per plan, so a single bad plan cannot block the batch.
 */
export async function generateDueRecurringBookings(): Promise<{ generated: number; failed: number }> {
  const due = await pool.query(
    `select id from recurring_bookings
      where status = 'active'
        and next_generation_at is not null
        and next_generation_at <= now()
        and (end_date is null or end_date >= current_date)
      order by next_generation_at
      limit 200`
  );

  let generated = 0;
  let failed = 0;

  for (const row of due.rows) {
    try {
      const instance = await generateInstanceById(row.id, null);
      if (instance) generated++;
    } catch (error) {
      failed++;
      logger.error({ planId: row.id, error }, "Recurring booking generation failed");
      // Push the plan forward so one broken plan does not jam every later tick.
      await pool
        .query(
          "update recurring_bookings set next_generation_at = now() + interval '1 hour', updated_at = now() where id = $1",
          [row.id]
        )
        .catch(() => undefined);
    }
  }

  if (generated || failed) logger.info({ generated, failed }, "Recurring booking generation complete");
  return { generated, failed };
}
