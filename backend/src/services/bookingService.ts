import crypto from "node:crypto";
import { pool } from "../db/pool.js";
import { quoteBookingAmount } from "./pricingService.js";
import type { PoolClient } from "pg";
import { findMatchingWorkers } from "./matching.js";
import { writeNotification } from "./notificationService.js";
import { territoryService } from "./territoryService.js";
import { settleBooking } from "./revenueSplit.js";
import { generateBookingOtps } from "../core/otp.js";
import { scheduleAssignmentTimeout, clearAssignmentTimeout, reassignToNextCandidate } from "./emergencyService.js";
import { dispatchOffer, revokeLiveOffers, resolveOffer, type OfferDeclineReason } from "./offerService.js";

export const bookingStatuses = ["requested", "matching", "assigned", "accepted", "en_route", "arrived", "started", "completed", "cancelled", "expired", "disputed", "refunded", "no_show"] as const;
export type BookingStatus = typeof bookingStatuses[number];

const transitions: Record<BookingStatus, BookingStatus[]> = {
  requested: ["matching", "assigned", "cancelled", "expired"],
  matching: ["assigned", "requested", "cancelled", "expired"],
  assigned: ["accepted", "cancelled", "expired"],
  accepted: ["en_route", "arrived", "cancelled", "disputed"],
  en_route: ["arrived", "started", "cancelled", "disputed"],
  // WORKER_APP_PLAN 4.6: `arrived` is the state that records the worker was at
  // the door at 10:02 and the customer opened it at 10:19. `no_show` is the
  // button that did not exist -- the previous failure mode was a worker outside
  // a locked gate with nothing to press.
  arrived: ["started", "no_show", "cancelled", "disputed"],
  started: ["completed", "disputed"],
  completed: ["disputed", "refunded"],
  cancelled: [], expired: [], disputed: ["refunded"], refunded: [], no_show: ["disputed"]
};

function requestHash(input: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function getBooking(client: typeof pool | PoolClient, id: string) {
  const result = await client.query(`select id, customer_id as "customerId", worker_id as "workerId", service_id as "serviceId", status, scheduled_at as "scheduledAt", is_emergency as "isEmergency", address, description, price, created_at as "createdAt", updated_at as "updatedAt" from bookings where id = $1`, [id]);
  return result.rows[0] ?? null;
}

type BookingSeed = {
  customerId: string;
  serviceId: string;
  latitude: number;
  longitude: number;
  address: string;
  description: string;
  scheduledAt?: string | null;
  isEmergency: boolean;
  addressId?: string | null;
  orderId?: string | null;

  /// How long the customer bought. Frozen onto the booking so the quote and
  /// the invoice both price the time actually purchased.
  minutes?: number | null;
};

type PlacedBooking = {
  bookingId: string;
  workerId: string | null;
  otps: { startOtp: string; completionOtp: string };
  matches: Awaited<ReturnType<typeof findMatchingWorkers>>;
};

/**
 * Place one booking inside an existing transaction.
 *
 * Extracted so a multi-service order runs exactly this, once per service,
 * rather than growing a second implementation that would drift from it. Every
 * consequential step lives here: matching, reserving the worker, the OTP
 * handshake codes, and freezing the price.
 *
 * It deliberately does NOT commit, write idempotency records, or arm the
 * accept timeout. The caller owns the transaction, and a timeout armed before
 * commit could fire against a row that gets rolled back.
 */
async function placeBooking(client: PoolClient, input: BookingSeed): Promise<PlacedBooking> {
  const service = await client.query("select id, emergency_supported from services where id = $1", [input.serviceId]);
  if (!service.rows[0]) throw new Error("SERVICE_NOT_FOUND");
  if (input.isEmergency && !service.rows[0].emergency_supported) throw new Error("EMERGENCY_NOT_SUPPORTED");

  const matches = await findMatchingWorkers({ serviceId: input.serviceId, latitude: input.latitude, longitude: input.longitude, urgency: input.isEmergency ? "emergency" : "regular", customerId: input.customerId });
  const workerId: string | null = matches.workers[0]?.workerId ?? null;
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
  const status: BookingStatus = confirmedWorkerId ? "assigned" : "requested";

  const result = await client.query(
    `INSERT INTO bookings (customer_id, worker_id, service_id, status, scheduled_at, is_emergency, location, address, address_id, description, start_otp_hash, completion_otp_hash, order_id, duration_minutes)
     VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography, $9, $10, $11, $12, $13, $14, $15)
     RETURNING id`,
    [input.customerId, confirmedWorkerId, input.serviceId, status, input.scheduledAt ?? null, input.isEmergency, input.longitude, input.latitude, input.address, input.addressId ?? null, input.description, startOtpHash, completionOtpHash, input.orderId ?? null, input.minutes ?? null]
  );

  const bookingId: string = result.rows[0].id;

  // Resolve territory for this booking location
  try {
    const territoryResult = await territoryService.resolveAndAssignBooking(bookingId, input.latitude, input.longitude, client);
    if (territoryResult.assigned) {
      // Booking was assigned to a society based on territory
    }
  } catch (territoryError) {
    // Territory resolution failure should not block booking creation
    console.warn("Territory resolution failed for booking:", bookingId, territoryError);
  }

  // Freeze the price now, in this transaction. The customer is committing to a
  // booking, so this is the moment the number becomes a promise -- leaving it
  // until payment let surge and the assigned worker's cooperative move it out
  // from under them.
  await quoteBookingAmount(bookingId, client);

  await client.query("insert into booking_status_events (booking_id, status, actor_id, reason) values ($1, $2, $3, $4)", [bookingId, status, input.customerId, confirmedWorkerId ? "matched_verified_worker" : "awaiting_worker"]);

  if (confirmedWorkerId) {
    const workerUser = await client.query("select user_id from workers where id = $1", [confirmedWorkerId]);
    if (workerUser.rows[0]) await writeNotification(client, { userId: workerUser.rows[0].user_id, type: "booking.assigned", title: "New service booking", body: "You have been assigned a new service request.", aggregateType: "booking", aggregateId: bookingId });
  }

  return { bookingId, workerId: confirmedWorkerId, otps: { startOtp, completionOtp }, matches };
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

    const placed = await placeBooking(client, input);
    const booking = await getBooking(client, placed.bookingId);

    const response = {
      booking,
      recommendedWorker: placed.workerId ? placed.matches.workers[0] ?? null : null,
      alternatives: placed.matches.workers.slice(1, 4),
      // OTPs are shown ONCE at booking creation; customer shares with worker on-site
      otps: placed.otps,
    };
    if (input.idempotencyKey) await client.query("insert into idempotency_keys (user_id, endpoint, key, request_hash, response_status, response_body, expires_at) values ($1, 'create-booking', $2, $3, 201, $4, now() + interval '24 hours')", [input.customerId, input.idempotencyKey, bodyHash, response]);
    await client.query("commit");

    // Blueprint 5.4: the assigned worker has WORKER_ACCEPT_TIMEOUT_SECONDS to
    // accept before the booking is offered to the next candidate. Armed after
    // commit so the job can never reference a rolled-back row.
    if (placed.workerId) {
      await scheduleAssignmentTimeout(placed.bookingId, placed.workerId).catch(() => undefined);
      // WORKER_APP_PLAN 4.1. The timer above is the server's half of the
      // 45-second window; this is the half the worker can see. Both are armed
      // after commit, in that order, so the deadline exists on the row before
      // any phone is told about it.
      await dispatchOffer(placed.bookingId, placed.workerId);
    }

    return { replay: false, status: 201, body: response };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

/**
 * One service, for a length of time.
 *
 * Not a quantity. A customer needing two hours of cleaning wants ONE worker for
 * two hours, not two workers for an hour each -- which is what a quantity of
 * two meant, and it is a different job with a different price and a different
 * person at the door.
 */
export type OrderLine = { serviceId: string; minutes: number };

export type CreateOrderInput = {
  customerId: string;
  lines: OrderLine[];
  mode: "instant" | "scheduled" | "recurring";
  latitude: number;
  longitude: number;
  address: string;
  addressId?: string | null;
  description?: string;
  scheduledAt?: string | null;

  /// Who the worker should ask for and ring. Falls back to the account when
  /// absent -- see migration_phase20_order_contact.sql for why this is not
  /// simply read from the customer record at dispatch time.
  contactName?: string | null;
  contactPhone?: string | null;

  idempotencyKey?: string;
};

/**
 * Check out a cart: one order, one booking per service.
 *
 * All or nothing. Half an order -- the plumber booked, the electrician
 * silently dropped because nobody was free -- is worse than a clear failure,
 * because the customer believes both are coming and finds out only when one
 * does not arrive. Any line that cannot be placed rolls the whole thing back.
 *
 * One booking per line, and the line carries its duration. A service can only
 * appear once in a cart: asking for it twice is asking for longer, and that is
 * what the minutes are for.
 */
export async function createOrder(input: CreateOrderInput) {
  if (input.lines.length === 0) throw new Error("ORDER_EMPTY");
  if (input.mode === "scheduled" && !input.scheduledAt) throw new Error("ORDER_SCHEDULE_REQUIRED");

  const client = await pool.connect();
  try {
    await client.query("begin");
    const bodyHash = requestHash(input);

    if (input.idempotencyKey) {
      const existing = await client.query("select request_hash, response_status, response_body from idempotency_keys where user_id = $1 and endpoint = 'create-order' and key = $2 for update", [input.customerId, input.idempotencyKey]);
      if (existing.rows[0]) {
        if (existing.rows[0].request_hash !== bodyHash) throw new Error("IDEMPOTENCY_KEY_REUSED");
        await client.query("commit");
        return { replay: true, status: existing.rows[0].response_status, body: existing.rows[0].response_body };
      }
    }

    const order = await client.query(
      `insert into service_orders (customer_id, mode, scheduled_at, address, address_id, location, notes, contact_name, contact_phone)
       values ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, $8, $9, $10)
       returning id, created_at as "createdAt"`,
      [input.customerId, input.mode, input.scheduledAt ?? null, input.address, input.addressId ?? null, input.longitude, input.latitude, input.description ?? null, input.contactName ?? null, input.contactPhone ?? null]
    );
    const orderId: string = order.rows[0].id;

    // A service must not appear twice: two lines for the same service would
    // place two bookings for one address at one time, and the customer meant
    // to ask for longer.
    const seen = new Set<string>();
    for (const line of input.lines) {
      if (seen.has(line.serviceId)) throw new Error("ORDER_DUPLICATE_SERVICE");
      seen.add(line.serviceId);
    }

    const placed: PlacedBooking[] = [];
    for (const line of input.lines) {
      placed.push(await placeBooking(client, {
        customerId: input.customerId,
        serviceId: line.serviceId,
        latitude: input.latitude,
        longitude: input.longitude,
        address: input.address,
        addressId: input.addressId ?? null,
        description: input.description ?? "",
        scheduledAt: input.scheduledAt ?? null,
        // A cart checked out as "instant" is matched now, but it is not an
        // EMERGENCY: that is its own screen, its own endpoint and its own
        // pricing, and quietly charging emergency rates here would be theft.
        isEmergency: false,
        orderId,
        // Clamped again by the pricing service against the service's own
        // bounds; this is only what the customer asked for.
        minutes: line.minutes
      }));
    }

    const bookings = [];
    for (const item of placed) bookings.push(await getBooking(client, item.bookingId));

    const total = bookings.reduce((sum, booking) => sum + Number(booking?.price ?? 0), 0);

    const response = {
      order: {
        id: orderId,
        mode: input.mode,
        scheduledAt: input.scheduledAt ?? null,
        address: input.address,
        createdAt: order.rows[0].createdAt,
        bookingCount: bookings.length,
        // The sum of prices frozen a moment ago in this transaction, not a
        // figure the client sent us.
        total
      },
      bookings,
      // One pair per booking, in the same order. Shown once; the customer
      // gives them to each worker on arrival.
      otps: placed.map((item, index) => ({ bookingId: item.bookingId, startOtp: item.otps.startOtp, completionOtp: item.otps.completionOtp, index }))
    };

    if (input.idempotencyKey) await client.query("insert into idempotency_keys (user_id, endpoint, key, request_hash, response_status, response_body, expires_at) values ($1, 'create-order', $2, $3, 201, $4, now() + interval '24 hours')", [input.customerId, input.idempotencyKey, bodyHash, response]);
    await client.query("commit");

    for (const item of placed) {
      if (!item.workerId) continue;
      await scheduleAssignmentTimeout(item.bookingId, item.workerId).catch(() => undefined);
      await dispatchOffer(item.bookingId, item.workerId);
    }

    return { replay: false, status: 201, body: response };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function getBookingForUser(id: string, userId: string, role: string) {
  const result = await pool.query(
    `SELECT b.id, b.customer_id as "customerId", b.worker_id as "workerId", b.service_id as "serviceId",
            b.status, b.scheduled_at as "scheduledAt", b.is_emergency as "isEmergency",
            b.address, b.description, b.price, b.order_id as "orderId", b.created_at as "createdAt", b.updated_at as "updatedAt",
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
    const workerAllowed = ["accepted", "en_route", "arrived", "started", "completed", "disputed", "no_show"].includes(nextStatus);
    const adminAllowed = ["assigned", "matching", "requested", "expired", "cancelled", "disputed", "refunded"].includes(nextStatus);
    const admin = ["society_admin", "federation_admin", "system_admin", "support_staff"].includes(role);
    if (admin && !adminAllowed) { await client.query("rollback"); return { kind: "forbidden" as const }; }
    if ((current.customer_id === actorId && !customerAllowed) || (current.worker_user_id === actorId && !workerAllowed) || (!current.customer_id && !adminAllowed)) { await client.query("rollback"); return { kind: "forbidden" as const }; }
    if (["accepted", "en_route", "arrived", "started", "completed", "no_show"].includes(nextStatus) && current.worker_user_id !== actorId && !["society_admin", "federation_admin", "system_admin"].includes(role)) { await client.query("rollback"); return { kind: "forbidden" as const }; }
    const updated = await client.query(`update bookings set status = $1, updated_at = now() where id = $2 returning id, status, updated_at as "updatedAt"`, [nextStatus, id]);
    await client.query("insert into booking_status_events (booking_id, status, actor_id, reason, request_id) values ($1, $2, $3, $4, $5)", [id, nextStatus, actorId, reason ?? null, requestId ?? null]);
    if (["completed", "cancelled", "expired", "refunded", "no_show"].includes(nextStatus) && current.worker_id) {
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

    // An offer for a job that is now cancelled, expired or finished must come
    // off every screen still counting down on it. Emitted after commit so a
    // rolled-back transition cannot revoke a live offer.
    if (["cancelled", "expired", "refunded", "completed"].includes(nextStatus)) {
      await revokeLiveOffers(id, "cancelled").catch(() => 0);
    }
    if (nextStatus === "accepted") {
      await revokeLiveOffers(id, "taken", { exceptUserId: actorId }).catch(() => 0);
    }

    return { kind: "ok" as const, booking: updated.rows[0] };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function listBookingsForUser(userId: string, role: string) {
  const result = await pool.query(`select distinct b.id, b.customer_id as "customerId", b.worker_id as "workerId", b.service_id as "serviceId", b.status, b.scheduled_at as "scheduledAt", b.is_emergency as "isEmergency", b.address, b.price, b.order_id as "orderId", b.created_at as "createdAt" from bookings b left join workers w on w.id = b.worker_id where $1 in ('society_admin', 'federation_admin', 'system_admin', 'support_staff') or b.customer_id = $2 or w.user_id = $2 order by b.created_at desc limit 100`, [role, userId]);
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
export async function rejectBooking(id: string, workerUserId: string, reason?: string, requestId?: string, declineReason?: OfferDeclineReason) {
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

  // Cancel the timer armed for the worker who just declined, and close their
  // offer with the reason they gave. Four buttons, not free text: matching has
  // to be able to count "too far" separately from "not my trade".
  await clearAssignmentTimeout(id).catch(() => undefined);
  await resolveOffer(id, workerUserId, "declined", declineReason).catch(() => null);

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

    await revokeLiveOffers(id, "reassigned").catch(() => 0);
    await scheduleAssignmentTimeout(id, newWorkerId).catch(() => undefined);
    await dispatchOffer(id, newWorkerId);

    return { kind: "ok" as const, booking: updated.rows[0] };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function getBookingTimeline(id: string) {
  const result = await pool.query(`select bse.*, u.name as actor_name from booking_status_events bse left join users u on u.id = bse.actor_id where bse.booking_id = $1 order by bse.created_at asc`, [id]);
  return result.rows;
}
