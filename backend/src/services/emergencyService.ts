import { pool } from "../db/pool.js";
import { findMatchingWorkers } from "./matching.js";
import { writeNotification } from "./notificationService.js";
import { emitEmergencyEscalated } from "../core/realtime.js";
import { enqueue, cancelByDedupeKey } from "../core/jobQueue.js";
import { env } from "../config/env.js";
import logger from "../core/logger.js";

/**
 * Emergency dispatch escalation.
 *
 * Lifted out of routes/emergency.ts so the background runner can drive it. The
 * route previously scheduled escalation with a bare `setTimeout` up to an hour
 * out — a restart or deploy silently dropped every pending escalation, which on
 * an emergency queue means a request that nobody is ever dispatched to.
 */

export interface EscalationResult {
  escalated: boolean;
  reason?: string;
  escalationLevel?: number;
  radiusKm?: number;
  assignedWorkerId?: string | null;
}

/** Dedupe key for the pending failover timer of one booking. */
export function assignmentTimeoutKey(bookingId: string): string {
  return `booking-assignment-timeout:${bookingId}`;
}

/**
 * Arm the acceptance timer. The assigned worker has
 * WORKER_ACCEPT_TIMEOUT_SECONDS (blueprint: 45s) to accept before the booking
 * is handed to the next candidate.
 */
export async function scheduleAssignmentTimeout(bookingId: string, workerId: string): Promise<void> {
  const timeoutSeconds = env.WORKER_ACCEPT_TIMEOUT_SECONDS;

  await pool.query(
    `update bookings
        set assignment_expires_at = now() + ($1 || ' seconds')::interval,
            assignment_attempts = assignment_attempts + 1,
            updated_at = now()
      where id = $2`,
    [String(timeoutSeconds), bookingId]
  );

  await enqueue(
    "booking.assignment_timeout",
    { bookingId, workerId },
    { delaySeconds: timeoutSeconds, dedupeKey: assignmentTimeoutKey(bookingId), maxAttempts: 2 }
  );
}

/** Worker accepted (or the booking moved on): disarm the timer. */
export async function clearAssignmentTimeout(bookingId: string): Promise<void> {
  await cancelByDedupeKey(assignmentTimeoutKey(bookingId));
  await pool.query(
    "update bookings set assignment_expires_at = null, updated_at = now() where id = $1",
    [bookingId]
  );
}

/**
 * Widen the search radius and try to assign the next-best worker.
 *
 * `newRadiusKm` overrides the automatic 1.5x widening (used by the manual admin
 * escalate endpoint). Bounded at 50km and MAX_ASSIGNMENT_ATTEMPTS levels so a
 * booking nobody can serve stops consuming dispatch cycles.
 */
export async function escalateEmergency(
  bookingId: string,
  newRadiusKm?: number,
  notifySupervisors = true,
  reason = "escalation"
): Promise<EscalationResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const emergency = await client.query(
      "select * from emergency_bookings where booking_id = $1 for update",
      [bookingId]
    );
    if (!emergency.rows[0]) {
      await client.query("rollback");
      return { escalated: false, reason: "NOT_AN_EMERGENCY_BOOKING" };
    }
    if (emergency.rows[0].resolved_at) {
      await client.query("rollback");
      return { escalated: false, reason: "ALREADY_RESOLVED" };
    }

    const previousLevel = Number(emergency.rows[0].escalation_level ?? 0);
    if (previousLevel >= env.MAX_ASSIGNMENT_ATTEMPTS) {
      await client.query("rollback");
      logger.warn({ bookingId, previousLevel }, "Emergency escalation ceiling reached; leaving for manual dispatch");
      return { escalated: false, reason: "MAX_ESCALATIONS_REACHED", escalationLevel: previousLevel };
    }

    const newLevel = previousLevel + 1;
    const radius = Math.min(newRadiusKm ?? Number(emergency.rows[0].radius_km) * 1.5, 50);

    await client.query(
      "update emergency_bookings set escalation_level = $1, radius_km = $2, escalated_at = now(), updated_at = now() where booking_id = $3",
      [newLevel, radius, bookingId]
    );
    await client.query(
      "update bookings set status = 'matching', updated_at = now() where id = $1 and status in ('requested', 'assigned')",
      [bookingId]
    );

    const booking = await client.query(
      `select service_id, customer_id, worker_id, address,
              st_y(location::geometry) as latitude,
              st_x(location::geometry) as longitude
         from bookings where id = $1`,
      [bookingId]
    );

    let assignedWorkerId: string | null = null;
    const previousWorkerId: string | null = booking.rows[0]?.worker_id ?? null;

    if (booking.rows[0]?.latitude !== null && booking.rows[0]?.longitude !== null) {
      // Release the worker who did not respond, so they are bookable again and
      // are not re-offered the same job below.
      if (previousWorkerId) {
        await client.query(
          "update workers set current_status = 'available', updated_at = now() where id = $1 and current_status = 'busy'",
          [previousWorkerId]
        );
      }

      const matches = await findMatchingWorkers({
        serviceId: booking.rows[0].service_id,
        latitude: Number(booking.rows[0].latitude),
        longitude: Number(booking.rows[0].longitude),
        urgency: "emergency",
        radiusKm: radius,
        excludeWorkerIds: previousWorkerId ? [previousWorkerId] : [],
      });

      for (const candidate of matches.workers) {
        const reserved = await client.query(
          `update workers set current_status = 'busy', updated_at = now()
            where id = $1 and current_status = 'available' and verification_status = 'verified'
            returning id`,
          [candidate.workerId]
        );
        if (!reserved.rows[0]) continue;

        assignedWorkerId = candidate.workerId;
        await client.query(
          "update bookings set worker_id = $1, status = 'assigned', updated_at = now() where id = $2",
          [assignedWorkerId, bookingId]
        );
        // actor_id is a uuid FK to users; this used to insert the string
        // 'system', which threw and rolled the whole escalation back.
        await client.query(
          `insert into booking_status_events (booking_id, status, actor_id, reason, request_id)
           values ($1, 'assigned', null, $2, null)`,
          [bookingId, `escalated_assigned_${assignedWorkerId}`]
        );

        const workerUser = await client.query("select user_id from workers where id = $1", [assignedWorkerId]);
        if (workerUser.rows[0]) {
          await writeNotification(client, {
            userId: workerUser.rows[0].user_id,
            type: "emergency.assigned",
            title: "Emergency service request",
            body: "You have been assigned an emergency service request.",
            aggregateType: "booking",
            aggregateId: bookingId,
          });
        }
        break;
      }
    }

    await client.query(
      `insert into emergency_escalations (booking_id, from_worker_id, to_worker_id, reason, attempt_number)
       values ($1, $2, $3, $4, $5)`,
      [bookingId, previousWorkerId, assignedWorkerId, reason, newLevel]
    );

    await client.query("commit");

    if (notifySupervisors && newLevel >= 2) {
      emitEmergencyEscalated({
        bookingId,
        priority: emergency.rows[0].priority,
        escalationLevel: newLevel,
        radiusKm: radius,
        assigned: Boolean(assignedWorkerId),
      });
    }

    // Still unassigned: arm the next attempt rather than dropping the request.
    if (!assignedWorkerId && newLevel < env.MAX_ASSIGNMENT_ATTEMPTS) {
      await enqueue(
        "emergency.escalate",
        { bookingId, reason: "no_worker_available" },
        {
          delaySeconds: Number(emergency.rows[0].max_response_minutes ?? 15) * 60,
          dedupeKey: `emergency-escalate:${bookingId}`,
        }
      );
    } else if (assignedWorkerId) {
      await scheduleAssignmentTimeout(bookingId, assignedWorkerId);
    }

    return { escalated: true, escalationLevel: newLevel, radiusKm: radius, assignedWorkerId };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The assigned worker let the acceptance window lapse. Hand the job to the next
 * candidate in the fair-match queue.
 */
export async function handleAssignmentTimeout(bookingId: string, workerId: string): Promise<EscalationResult> {
  const booking = await pool.query(
    "select status, worker_id, is_emergency, assignment_attempts from bookings where id = $1",
    [bookingId]
  );
  const row = booking.rows[0];
  if (!row) return { escalated: false, reason: "BOOKING_NOT_FOUND" };

  // Accepted (or moved on) in the meantime — nothing to do.
  if (row.status !== "assigned" || row.worker_id !== workerId) {
    return { escalated: false, reason: "ALREADY_PROGRESSED" };
  }

  if (Number(row.assignment_attempts ?? 0) >= env.MAX_ASSIGNMENT_ATTEMPTS) {
    await pool.query(
      "update bookings set status = 'requested', worker_id = null, assignment_expires_at = null, updated_at = now() where id = $1",
      [bookingId]
    );
    await pool.query(
      "update workers set current_status = 'available', updated_at = now() where id = $1 and current_status = 'busy'",
      [workerId]
    );
    logger.warn({ bookingId, attempts: row.assignment_attempts }, "Assignment attempts exhausted; returning booking to the open queue");
    return { escalated: false, reason: "MAX_ASSIGNMENT_ATTEMPTS" };
  }

  await pool.query(
    `insert into emergency_escalations (booking_id, from_worker_id, reason, attempt_number)
     values ($1, $2, 'timeout', $3)`,
    [bookingId, workerId, Number(row.assignment_attempts ?? 0) + 1]
  );

  if (row.is_emergency) {
    return escalateEmergency(bookingId, undefined, true, "timeout");
  }

  return reassignToNextCandidate(bookingId, workerId, "timeout");
}

/**
 * Non-emergency failover: release the unresponsive worker and offer the job to
 * the next-best candidate at the same radius.
 */
export async function reassignToNextCandidate(
  bookingId: string,
  fromWorkerId: string | null,
  reason: string
): Promise<EscalationResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const booking = await client.query(
      `select service_id, status,
              st_y(location::geometry) as latitude,
              st_x(location::geometry) as longitude
         from bookings where id = $1 for update`,
      [bookingId]
    );
    if (!booking.rows[0] || booking.rows[0].latitude === null || booking.rows[0].longitude === null) {
      await client.query("rollback");
      return { escalated: false, reason: "BOOKING_NOT_DISPATCHABLE" };
    }

    if (fromWorkerId) {
      await client.query(
        "update workers set current_status = 'available', updated_at = now() where id = $1 and current_status = 'busy'",
        [fromWorkerId]
      );
    }

    const matches = await findMatchingWorkers({
      serviceId: booking.rows[0].service_id,
      latitude: Number(booking.rows[0].latitude),
      longitude: Number(booking.rows[0].longitude),
      urgency: "regular",
      excludeWorkerIds: fromWorkerId ? [fromWorkerId] : [],
    });

    let assignedWorkerId: string | null = null;
    for (const candidate of matches.workers) {
      const reserved = await client.query(
        `update workers set current_status = 'busy', updated_at = now()
          where id = $1 and current_status = 'available' and verification_status = 'verified'
          returning id`,
        [candidate.workerId]
      );
      if (!reserved.rows[0]) continue;
      assignedWorkerId = candidate.workerId;
      break;
    }

    if (assignedWorkerId) {
      await client.query(
        "update bookings set worker_id = $1, status = 'assigned', updated_at = now() where id = $2",
        [assignedWorkerId, bookingId]
      );
      await client.query(
        `insert into booking_status_events (booking_id, status, actor_id, reason, request_id)
         values ($1, 'assigned', null, $2, null)`,
        [bookingId, `reassigned_${reason}`]
      );
      const workerUser = await client.query("select user_id from workers where id = $1", [assignedWorkerId]);
      if (workerUser.rows[0]) {
        await writeNotification(client, {
          userId: workerUser.rows[0].user_id,
          type: "booking.assigned",
          title: "New service booking",
          body: "You have been assigned a service request.",
          aggregateType: "booking",
          aggregateId: bookingId,
        });
      }
    } else {
      // Nobody available: return it to the open queue rather than leaving it
      // pinned to a worker who never responded.
      await client.query(
        "update bookings set worker_id = null, status = 'requested', assignment_expires_at = null, updated_at = now() where id = $1",
        [bookingId]
      );
    }

    await client.query("commit");

    if (assignedWorkerId) await scheduleAssignmentTimeout(bookingId, assignedWorkerId);

    return { escalated: Boolean(assignedWorkerId), assignedWorkerId, reason: assignedWorkerId ? undefined : "NO_CANDIDATE_AVAILABLE" };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
