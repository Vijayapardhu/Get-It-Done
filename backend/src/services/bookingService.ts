import crypto from "node:crypto";
import { pool } from "../db/pool.js";
import type { PoolClient } from "pg";
import { findMatchingWorkers } from "./matching.js";
import { writeNotification } from "./notificationService.js";

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

    const result = await client.query(`insert into bookings (customer_id, worker_id, service_id, status, scheduled_at, is_emergency, location, address, description) values ($1, $2, $3, $4, $5, $6, st_setsrid(st_makepoint($7, $8), 4326)::geography, $9, $10) returning id`, [input.customerId, confirmedWorkerId, input.serviceId, confirmedWorkerId ? "assigned" : "requested", input.scheduledAt ?? null, input.isEmergency, input.longitude, input.latitude, input.address, input.description]);
    const booking = await getBooking(client, result.rows[0].id);
    await client.query("insert into booking_status_events (booking_id, status, actor_id, reason, request_id) values ($1, $2, $3, $4, $5)", [result.rows[0].id, status, input.customerId, confirmedWorkerId ? "matched_verified_worker" : "awaiting_worker", input.idempotencyKey ?? null]);
    if (confirmedWorkerId) {
      const workerUser = await client.query("select user_id from workers where id = $1", [confirmedWorkerId]);
      if (workerUser.rows[0]) await writeNotification(client, { userId: workerUser.rows[0].user_id, type: "booking.assigned", title: "New service booking", body: "You have been assigned a new service request.", aggregateType: "booking", aggregateId: result.rows[0].id });
    }
    const response = { booking, recommendedWorker: confirmedWorkerId ? matches.workers[0] ?? null : null, alternatives: matches.workers.slice(1, 4) };
    if (input.idempotencyKey) await client.query("insert into idempotency_keys (user_id, endpoint, key, request_hash, response_status, response_body, expires_at) values ($1, 'create-booking', $2, $3, 201, $4, now() + interval '24 hours')", [input.customerId, input.idempotencyKey, bodyHash, response]);
    await client.query("commit");
    return { replay: false, status: 201, body: response };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function getBookingForUser(id: string, userId: string, role: string) {
  const result = await pool.query(`select b.id, b.customer_id as "customerId", b.worker_id as "workerId", b.service_id as "serviceId", b.status, b.scheduled_at as "scheduledAt", b.is_emergency as "isEmergency", b.address, b.description, b.price, b.created_at as "createdAt", b.updated_at as "updatedAt" from bookings b left join workers w on w.id = b.worker_id where b.id = $1 and ($2 in ('society_admin', 'federation_admin', 'system_admin', 'support_staff') or b.customer_id = $3 or w.user_id = $3)`, [id, role, userId]);
  return result.rows[0] ?? null;
}

export async function transitionBooking(id: string, actorId: string, role: string, nextStatus: BookingStatus, reason?: string, requestId?: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const currentResult = await client.query(`select b.id, b.status, b.customer_id, b.worker_id, b.service_id, w.user_id as worker_user_id from bookings b left join workers w on w.id = b.worker_id where b.id = $1 for update`, [id]);
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
      const service = await client.query("select base_price from services where id = $1", [current.service_id]);
      const amount = Number(service.rows[0]?.base_price ?? 0);
      if (amount > 0) await client.query("insert into worker_earnings_ledger (worker_id, booking_id, entry_type, amount, reference) values ($1, $2, 'earning', $3, $4)", [current.worker_id, id, amount, "booking.completed"]);
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

export async function rejectBooking(id: string, workerUserId: string, reason?: string, requestId?: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(`select b.id, b.status, b.worker_id, w.user_id as worker_user_id from bookings b left join workers w on w.id = b.worker_id where b.id = $1 for update`, [id]);
    if (!current.rows[0]) { await client.query("rollback"); return { kind: "not_found" as const }; }
    if (current.rows[0].worker_user_id !== workerUserId) { await client.query("rollback"); return { kind: "forbidden" as const }; }
    if (current.rows[0].status !== "assigned") { await client.query("rollback"); return { kind: "invalid_transition" as const, from: current.rows[0].status }; }
    await client.query("update workers set current_status = 'available', updated_at = now() where id = $1", [current.rows[0].worker_id]);
    const matches = await import("./matching.js").then(m => m.findMatchingWorkers({ serviceId: current.rows[0].service_id, latitude: 0, longitude: 0, urgency: "regular" }));
    const newWorkerId = matches.workers[0]?.workerId ?? null;
    const newStatus: BookingStatus = newWorkerId ? "assigned" : "requested";
    const updated = await client.query(`update bookings set status = $1, worker_id = $2, updated_at = now() where id = $3 returning id, status, worker_id as "workerId", updated_at as "updatedAt"`, [newStatus, newWorkerId, id]);
    await client.query("insert into booking_status_events (booking_id, status, actor_id, reason, request_id) values ($1, $2, $3, $4, $5)", [id, newStatus, workerUserId, `rejected_${reason ?? "no_reason"}`, requestId ?? null]);
    if (newWorkerId) {
      const workerUser = await client.query("select user_id from workers where id = $1", [newWorkerId]);
      if (workerUser.rows[0]) await import("./notificationService.js").then(m => m.writeNotification(client, { userId: workerUser.rows[0].user_id, type: "booking.assigned", title: "New service booking", body: "You have been assigned a new service request.", aggregateType: "booking", aggregateId: id }));
    }
    await client.query("commit");
    return { kind: "ok" as const, booking: updated.rows[0] };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
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
