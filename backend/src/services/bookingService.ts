import crypto from "node:crypto";
import { pool } from "../db/pool.js";
import type { PoolClient } from "pg";
import { findMatchingWorkers } from "./matching.js";
import { writeNotification } from "./notificationService.js";
import { settleBooking } from "./revenueSplit.js";
import { generateBookingOtps } from "../core/otp.js";
import { scheduleAssignmentTimeout, clearAssignmentTimeout, reassignToNextCandidate } from "./emergencyService.js";

export const bookingStatuses = ["requested", "matching", "assigned", "accepted", "en_route", "started", "completed", "cancelled", "expired", "disputed", "refunded"] as const;
export type BookingStatus = typeof bookingStatuses[number];

const transitions: Record<BookingStatus, BookingStatus[]> = {
  requested: ["matching", "assigned", "cancelled", "expired"],
  matching: ["assigned", "requested", "cancelled", "expired"],
  assigned: ["accepted", "cancelled", "expired"],
  accepted: ["en_route", "cancelled", "disputed"],
  en_route: ["started", "cancelled", "disputed"],
  started: ["completed", "disputed"],
  completed: ["disputed", "refunded"],
  cancelled: [], expired: [], disputed: ["refunded"], refunded: []
};

function requestHash(input: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function getBooking(client: typeof pool | PoolClient, id: string) {
  const result = await client.query(`select id, customer_id as "customerId", worker_id as "workerId", service_id as "serviceId", status, scheduled_at as "scheduledAt", is_emergency as "isEmergency", address, description, price, created_at as "createdAt", updated_at as "updatedAt" from bookings where id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function createBooking(input: { customerId: string; serviceId: string; latitude: number; longitude: number; address: string; description: string; scheduledAt?: string; isEmergency: boolean; idempotencyKey?: string }) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const bodyHash = requestHash(input);
    if (input.idempotencyKey) {
      const existing = await client.query("select request_hash, response_status, response_body from idempotency_keys where user_id = $1 and endpoint = 'create-booking' and key = $2 for update", [input.customerId, input.idempotencyKey]);
      if (existing.rows[0]) {
        if (existing.rows[0].request_hash !== bodyHash) throw new Error("IDEMPOTENCY_KEY_REUSED");
        await client.query("commit");
        return { replay: true, status: existing.rows[0].response_status, body: existing.rows[0].response_body };
      }
    }

    const service = await client.query("select id, emergency_supported from services where id = $1", [input.serviceId]);
    if (!service.rows[0]) throw new Error("SERVICE_NOT_FOUND");
    if (input.isEmergency && !service.rows[0].emergency_supported) throw new Error("EMERGENCY_NOT_SUPPORTED");

    const matches = await findMatchingWorkers({ serviceId: input.serviceId, latitude: input.latitude, longitude: input.longitude, urgency: input.isEmergency ? "emergency" : "regular" });
    const workerId: string | null = matches.workers[0]?.workerId ?? null;
    const status: BookingStatus = workerId ? "assigned" : "requested";
    let confirmedWorkerId: string | null = workerId;
    if (workerId) {
      const worker = await client.query("select id from workers where id = $1 and verification_status = 'verified' and current_status = 'available' for update", [workerId]);
      if (!worker.rows[0]) { confirmedWorkerId = null; }
      else {
        const reserved = await client.query("update workers set current_status = 'busy', updated_at = now() where id = $1 and current_status = 'available' returning id", [workerId]);
        if (!reserved.rows[0]) confirmedWorkerId = null;
      }
    }

    // Start/completion handshake codes. CSPRNG-backed: Math.random() is not
    // unpredictable enough for a credential that gates payment.
    const { startOtp, completionOtp, startOtpHash, completionOtpHash } = generateBookingOtps();

    const result = await client.query(
      `INSERT INTO bookings (customer_id, worker_id, service_id, status, scheduled_at, is_emergency, location, address, description, start_otp_hash, completion_otp_hash)
       VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography, $9, $10, $11, $12)
       RETURNING id`,
      [input.customerId, confirmedWorkerId, input.serviceId, confirmedWorkerId ? "assigned" : "requested", input.scheduledAt ?? null, input.isEmergency, input.longitude, input.latitude, input.address, input.description, startOtpHash, completionOtpHash]
    );

    const booking = await getBooking(client, result.rows[0].id);
    await client.query("insert into booking_status_events (booking_id, status, actor_id, reason, request_id) values ($1, $2, $3, $4, $5)", [result.rows[0].id, status, input.customerId, confirmedWorkerId ? "matched_verified_worker" : "awaiting_worker", input.idempotencyKey ?? null]);
    if (confirmedWorkerId) {
      const workerUser = await client.query("select user_id from workers where id = $1", [confirmedWorkerId]);
      if (workerUser.rows[0]) await writeNotification(client, { userId: workerUser.rows[0].user_id, type: "booking.assigned", title: "New service booking", body: "You have been assigned a new service request.", aggregateType: "booking", aggregateId: result.rows[0].id });
    }
    const response = {
      booking,
      recommendedWorker: confirmedWorkerId ? matches.workers[0] ?? null : null,
      alternatives: matches.workers.slice(1, 4),
      // OTPs are shown ONCE at booking creation; customer shares with worker on-site
      otps: { startOtp, completionOtp },
    };
    if (input.idempotencyKey) await client.query("insert into idempotency_keys (user_id, endpoint, key, request_hash, response_status, response_body, expires_at) values ($1, 'create-booking', $2, $3, 201, $4, now() + interval '24 hours')", [input.customerId, input.idempotencyKey, bodyHash, response]);
    await client.query("commit");

    // Blueprint 5.4: the assigned worker has WORKER_ACCEPT_TIMEOUT_SECONDS to
    // accept before the booking is offered to the next candidate. Armed after
    // commit so the job can never reference a rolled-back row.
    if (confirmedWorkerId) {
      await scheduleAssignmentTimeout(result.rows[0].id, confirmedWorkerId).catch(() => undefined);
    }

    return { replay: false, status: 201, body: response };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function getBookingForUser(id: string, userId: string, role: string) {
  const result = await pool.query(
    `SELECT b.id, b.customer_id as "customerId", b.worker_id as "workerId", b.service_id as "serviceId",
            b.status, b.scheduled_at as "scheduledAt", b.is_emergency as "isEmergency",
            b.address, b.description, b.price, b.created_at as "createdAt", b.updated_at as "updatedAt",
            b.start_otp_hash, b.completion_otp_hash,
            b.start_verified_at as "startVerifiedAt", b.completion_verified_at as "completionVerifiedAt"
     FROM bookings b
     LEFT JOIN workers w ON w.id = b.worker_id
     WHERE b.id = $1
       AND ($2 IN ('society_admin', 'federation_admin', 'system_admin', 'support_staff')
            OR b.customer_id = $3 OR w.user_id = $3)`,
    [id, role, userId]
  );
  return result.rows[0] ?? null;
}

export async function transitionBooking(id: string, actorId: string, role: string, nextStatus: BookingStatus, reason?: string, requestId?: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const currentResult = await client.query(`select b.id, b.status, b.customer_id, b.worker_id, b.service_id, w.user_id as worker_user_id from bookings b left join workers w on w.id = b.worker_id where b.id = $1 for update of b`, [id]);
    const current = currentResult.rows[0];
    if (!current) { await client.query("rollback"); return { kind: "not_found" as const }; }
    const owns = ["society_admin", "federation_admin", "system_admin", "support_staff"].includes(role) || current.customer_id === actorId || current.worker_user_id === actorId;
    if (!owns) { await client.query("rollback"); return { kind: "forbidden" as const }; }
    if (!transitions[current.status as BookingStatus]?.includes(nextStatus)) { await client.query("rollback"); return { kind: "invalid_transition" as const, from: current.status }; }
    const customerAllowed = ["cancelled", "disputed"].includes(nextStatus);
    const workerAllowed = ["accepted", "en_route", "started", "completed", "disputed"].includes(nextStatus);
    const adminAllowed = ["assigned", "matching", "requested", "expired", "cancelled", "disputed", "refunded"].includes(nextStatus);
    const admin = ["society_admin", "federation_admin", "system_admin", "support_staff"].includes(role);
    if (admin && !adminAllowed) { await client.query("rollback"); return { kind: "forbidden" as const }; }
    if ((current.customer_id === actorId && !customerAllowed) || (current.worker_user_id === actorId && !workerAllowed) || (!current.customer_id && !adminAllowed)) { await client.query("rollback"); return { kind: "forbidden" as const }; }
    if (["accepted", "en_route", "started", "completed"].includes(nextStatus) && current.worker_user_id !== actorId && !["society_admin", "federation_admin", "system_admin"].includes(role)) { await client.query("rollback"); return { kind: "forbidden" as const }; }
    const updated = await client.query(`update bookings set status = $1, updated_at = now() where id = $2 returning id, status, updated_at as "updatedAt"`, [nextStatus, id]);
    await client.query("insert into booking_status_events (booking_id, status, actor_id, reason, request_id) values ($1, $2, $3, $4, $5)", [id, nextStatus, actorId, reason ?? null, requestId ?? null]);
    if (["completed", "cancelled", "expired", "refunded"].includes(nextStatus) && current.worker_id) {
      await client.query("update workers set current_status = 'available', updated_at = now() where id = $1 and verification_status = 'verified'", [current.worker_id]);
    }
    if (nextStatus === "completed" && current.worker_id) {
      // Single source of truth for the split: credits the worker their NET
      // share (not the gross base price this used to post), issues the invoice
      // and moves the welfare contribution into escrow. Idempotent, so the
      // payment-capture path reaching here first is harmless.
      await settleBooking(client, id);
    }
    await client.query("commit");
    return { kind: "ok" as const, booking: updated.rows[0] };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function listBookingsForUser(userId: string, role: string) {
  const result = await pool.query(`select distinct b.id, b.customer_id as "customerId", b.worker_id as "workerId", b.service_id as "serviceId", b.status, b.scheduled_at as "scheduledAt", b.is_emergency as "isEmergency", b.address, b.price, b.created_at as "createdAt" from bookings b left join workers w on w.id = b.worker_id where $1 in ('society_admin', 'federation_admin', 'system_admin', 'support_staff') or b.customer_id = $2 or w.user_id = $2 order by b.created_at desc limit 100`, [role, userId]);
  return result.rows;
}

export async function cancelBooking(id: string, actorId: string, role: string, reason?: string, requestId?: string) {
  return transitionBooking(id, actorId, role, "cancelled", reason ?? "cancelled_by_user", requestId);
}

export async function rescheduleBooking(id: string, actorId: string, role: string, scheduledAt: string, requestId?: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(`select b.id, b.status, b.customer_id, b.worker_id, w.user_id as worker_user_id from bookings b left join workers w on w.id = b.worker_id where b.id = $1 for update`, [id]);
    if (!current.rows[0]) { await client.query("rollback"); return { kind: "not_found" as const }; }
    const owns = ["society_admin", "federation_admin", "system_admin", "support_staff"].includes(role) || current.rows[0].customer_id === actorId;
    if (!owns) { await client.query("rollback"); return { kind: "forbidden" as const }; }
    if (!["requested", "assigned", "accepted"].includes(current.rows[0].status)) { await client.query("rollback"); return { kind: "invalid_transition" as const, from: current.rows[0].status }; }
    const updated = await client.query(`update bookings set scheduled_at = $1, updated_at = now() where id = $2 returning id, status, scheduled_at as "scheduledAt", updated_at as "updatedAt"`, [scheduledAt, id]);
    await client.query("insert into booking_status_events (booking_id, status, actor_id, reason, request_id) values ($1, $2, $3, $4, $5)", [id, current.rows[0].status, actorId, `rescheduled_to_${scheduledAt}`, requestId ?? null]);
    await client.query("commit");
    return { kind: "ok" as const, booking: updated.rows[0] };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function acceptBooking(id: string, workerUserId: string, requestId?: string) {
  return transitionBooking(id, workerUserId, "worker", "accepted", "accepted_by_worker", requestId);
}

/**
 * Worker declines an assigned job; the booking fails over to the next candidate.
 *
 * The previous implementation was broken in four ways: it read
 * `current.rows[0].service_id` from a SELECT that never selected service_id
 * (so the match ran with an undefined service), it searched from hard-coded
 * lat/lng 0,0 instead of the booking location, it did not exclude the rejecting
 * worker so the job could bounce straight back to them, and it never reserved
 * the newly chosen worker — two simultaneous rejections could hand the same
 * worker two jobs. `reassignToNextCandidate` does all four correctly and arms
 * the next acceptance timer.
 */
export async function rejectBooking(id: string, workerUserId: string, reason?: string, requestId?: string) {
  const client = await pool.connect();
  let rejectedWorkerId: string | null = null;

  try {
    await client.query("begin");

    const current = await client.query(
      `select b.id, b.status, b.worker_id, b.is_emergency, w.user_id as worker_user_id
         from bookings b
         left join workers w on w.id = b.worker_id
        where b.id = $1
          for update`,
      [id]
    );

    if (!current.rows[0]) { await client.query("rollback"); return { kind: "not_found" as const }; }
    if (current.rows[0].worker_user_id !== workerUserId) { await client.query("rollback"); return { kind: "forbidden" as const }; }
    if (current.rows[0].status !== "assigned") {
      await client.query("rollback");
      return { kind: "invalid_transition" as const, from: current.rows[0].status };
    }

    rejectedWorkerId = current.rows[0].worker_id;

    // Park the booking before releasing the row lock, so the reassignment below
    // never observes it still pinned to the rejecting worker.
    await client.query(
      "update bookings set status = 'requested', worker_id = null, assignment_expires_at = null, updated_at = now() where id = $1",
      [id]
    );
    await client.query(
      "insert into booking_status_events (booking_id, status, actor_id, reason, request_id) values ($1, 'requested', $2, $3, $4)",
      [id, workerUserId, `rejected_${reason ?? "no_reason"}`, requestId ?? null]
    );
    await client.query(
      `insert into emergency_escalations (booking_id, from_worker_id, reason, attempt_number)
       select $1, $2, 'rejected', coalesce(assignment_attempts, 0) from bookings where id = $1`,
      [id, rejectedWorkerId]
    );

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  // Cancel the timer armed for the worker who just declined.
  await clearAssignmentTimeout(id).catch(() => undefined);

  const outcome = await reassignToNextCandidate(id, rejectedWorkerId, "rejected");

  const booking = await pool.query(
    `select id, status, worker_id as "workerId", updated_at as "updatedAt" from bookings where id = $1`,
    [id]
  );

  return {
    kind: "ok" as const,
    booking: booking.rows[0],
    reassignedTo: outcome.assignedWorkerId ?? null,
  };
}

export async function startBooking(id: string, workerUserId: string, requestId?: string) {
  return transitionBooking(id, workerUserId, "worker", "started", "started_by_worker", requestId);
}

export async function completeBooking(id: string, workerUserId: string, requestId?: string) {
  return transitionBooking(id, workerUserId, "worker", "completed", "completed_by_worker", requestId);
}

export async function reassignBooking(id: string, newWorkerId: string, actorId: string, role: string, requestId?: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(`select b.id, b.status, b.worker_id, w.user_id as worker_user_id from bookings b left join workers w on w.id = b.worker_id where b.id = $1 for update`, [id]);
    if (!current.rows[0]) { await client.query("rollback"); return { kind: "not_found" as const }; }
    const admin = ["society_admin", "federation_admin", "system_admin", "support_staff"].includes(role);
    if (!admin) { await client.query("rollback"); return { kind: "forbidden" as const }; }
    if (current.rows[0].worker_id) {
      await client.query("update workers set current_status = 'available', updated_at = now() where id = $1", [current.rows[0].worker_id]);
    }
    const worker = await client.query("select id from workers where id = $1 and verification_status = 'verified' and current_status = 'available' for update", [newWorkerId]);
    if (!worker.rows[0]) { await client.query("rollback"); return { kind: "worker_not_available" as const }; }
    await client.query("update workers set current_status = 'busy', updated_at = now() where id = $1", [newWorkerId]);
    const updated = await client.query(`update bookings set status = 'assigned', worker_id = $1, updated_at = now() where id = $2 returning id, status, worker_id as "workerId", updated_at as "updatedAt"`, [newWorkerId, id]);
    await client.query("insert into booking_status_events (booking_id, status, actor_id, reason, request_id) values ($1, 'assigned', $2, $3, $4)", [id, actorId, `reassigned_to_${newWorkerId}`, requestId ?? null]);
    const workerUser = await client.query("select user_id from workers where id = $1", [newWorkerId]);
    if (workerUser.rows[0]) await import("./notificationService.js").then(m => m.writeNotification(client, { userId: workerUser.rows[0].user_id, type: "booking.assigned", title: "New service booking", body: "You have been assigned a new service request.", aggregateType: "booking", aggregateId: id }));
    await client.query("commit");
    return { kind: "ok" as const, booking: updated.rows[0] };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function getBookingTimeline(id: string) {
  const result = await pool.query(`select bse.*, u.name as actor_name from booking_status_events bse left join users u on u.id = bse.actor_id where bse.booking_id = $1 order by bse.created_at asc`, [id]);
  return result.rows;
}
