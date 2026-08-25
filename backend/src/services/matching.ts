import { pool } from "../db/pool.js";
import type { BookingUrgency, MatchingCandidate, WorkerMatch } from "../types.js";
import { recordAuditEvent } from "./auditService.js";
import { writeNotification } from "./notificationService.js";

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export interface MatchingCriteria {
  serviceId: string;
  latitude: number;
  longitude: number;
  urgency: BookingUrgency;
  radiusKm?: number;
  requiredSkills?: string[];
  maxDistanceKm?: number;
  minRating?: number;
  excludeWorkerIds?: string[];
}

export interface MatchingResult {
  workers: WorkerMatch[];
  totalCandidates: number;
  searchRadiusKm: number;
  searchTimeMs: number;
}

export interface MatchingAuditRecord {
  bookingId: string;
  candidatesEvaluated: number;
  selectedWorkerId: string | null;
  selectionReason: string;
  algorithmVersion: string;
  criteria: MatchingCriteria;
  scores: { workerId: string; score: number; rank: number }[];
  createdAt: string;
}

export function scoreCandidate(candidate: MatchingCandidate, urgency: BookingUrgency): WorkerMatch {
  const skillMatch = 1;
  const distanceScore = clamp(1 - candidate.distanceKm / (urgency === "emergency" ? 8 : 15));
  const availabilityScore = candidate.isAvailable ? 1 : 0;
  const certificationScore = candidate.hasCertification ? 1 : 0.55;
  const ratingScore = clamp(candidate.rating / 5);
  const workloadBalanceScore = clamp(1 - candidate.jobsToday / 10);

  const weights =
    urgency === "emergency"
      ? { skill: 0.25, distance: 0.30, availability: 0.20, certification: 0.10, rating: 0.05, workload: 0.10 }
      : { skill: 0.30, distance: 0.20, availability: 0.15, certification: 0.15, rating: 0.10, workload: 0.10 };

  const score =
    skillMatch * weights.skill +
    distanceScore * weights.distance +
    availabilityScore * weights.availability +
    certificationScore * weights.certification +
    ratingScore * weights.rating +
    workloadBalanceScore * weights.workload;

  return {
    ...candidate,
    score: Number((score * 100).toFixed(2)),
    reasons: [
      `${candidate.distanceKm.toFixed(1)} km away`,
      candidate.isAvailable ? "available now" : "not currently available",
      `${candidate.rating.toFixed(1)} rating`,
      `${candidate.jobsToday} jobs today`
    ]
  };
}

export async function findMatchingWorkers(params: MatchingCriteria): Promise<MatchingResult> {
  const startTime = Date.now();
  const radiusKm = params.radiusKm ?? (params.urgency === "emergency" ? 8 : 15);
  const effectiveRadius = params.maxDistanceKm ? Math.min(radiusKm, params.maxDistanceKm) : radiusKm;

let query = `
    select
      w.id as "workerId",
      u.name,
      st_distance(wl.location, st_setsrid(st_makepoint($1, $2), 4326)::geography) / 1000 as "distanceKm",
      coalesce(w.rating, 0) as rating,
      coalesce(today_jobs.jobs_today, 0) as "jobsToday",
      exists (
        select 1 from worker_skills_new ws
        join skills s on s.id = ws.skill_id
        where ws.worker_id = w.id
          and s.category = (select category from services where id = $3)
          and ws.verified = true
      ) as "hasCertification",
      w.current_status = 'available' as "isAvailable",
      w.current_status as "currentStatus"
    from workers w
    join users u on u.id = w.user_id
    join worker_locations wl on wl.worker_id = w.id
    join worker_service_areas wsa on wsa.worker_id = w.id
      and wsa.service_id in (
        select id from services where category = (select category from services where id = $3)
      )
    left join (
      select worker_id, count(*)::int as jobs_today
      from bookings
      where created_at::date = current_date
      group by worker_id
    ) today_jobs on today_jobs.worker_id = w.id
    where w.verification_status = 'verified'
      and u.status = 'active'
      and w.location_sharing_enabled = true
      and st_dwithin(
        wl.location,
        st_setsrid(st_makepoint($1, $2), 4326)::geography,
        ($4 * 1000)::double precision
      )
      and st_distance(wl.location, st_setsrid(st_makepoint($1, $2), 4326)::geography) <= (wsa.radius_km * 1000)::double precision
  `;

  const params_list: any[] = [params.longitude, params.latitude, params.serviceId, radiusKm];

  if (params.minRating) {
    query += ` and w.rating >= $${params_list.length + 1}`;
    params_list.push(params.minRating);
  }

  if (params.excludeWorkerIds && params.excludeWorkerIds.length > 0) {
    query += ` and w.id != ALL($${params_list.length + 1})`;
    params_list.push(params.excludeWorkerIds);
  }

  query += ` order by "distanceKm" asc limit 50`;

  const result = await pool.query<MatchingCandidate>(query, params_list);

  const searchTimeMs = Date.now() - startTime;
  const candidates = result.rows
    .map((candidate) => ({
      ...candidate,
      distanceKm: Number(candidate.distanceKm),
      rating: Number(candidate.rating),
      jobsToday: Number(candidate.jobsToday)
    }))
    .filter(c => {
      if (params.minRating && c.rating < params.minRating) return false;
      return true;
    })
    .map((candidate) => scoreCandidate(candidate, params.urgency))
    .sort((a, b) => b.score - a.score);

  return {
    workers: candidates,
    totalCandidates: candidates.length,
    searchRadiusKm: effectiveRadius,
    searchTimeMs: Date.now() - startTime
  };
}

export async function getMatchingCandidatesForBooking(
  bookingId: string,
  criteria: MatchingCriteria
): Promise<MatchingResult> {
  return findMatchingWorkers(criteria);
}

export async function recommendWorker(bookingId: string, criteria: MatchingCriteria): Promise<{ worker: WorkerMatch | null; reason: string }> {
  const result = await findMatchingWorkers(criteria);
  const availableWorkers = result.workers.filter(w => w.isAvailable);
  if (availableWorkers.length === 0) {
    return { worker: null, reason: "No available workers found" };
  }
  const best = availableWorkers[0];
  return { 
    worker: best, 
    reason: `Best match: ${best.reasons.join(", ")} (score: ${best.score})` 
  };
}

export async function assignWorker(
  bookingId: string,
  workerId: string,
  assignedBy: string,
  reason: string
): Promise<{ success: boolean; booking: any }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    // Check current booking status
    const bookingResult = await client.query(
      `SELECT id, status, worker_id FROM bookings WHERE id = $1 FOR UPDATE`,
      [bookingId]
    );
    if (!bookingResult.rows[0]) {
      await client.query("ROLLBACK");
      throw new Error("Booking not found");
    }
    const booking = bookingResult.rows[0];
    
    if (booking.worker_id) {
      // Release previous worker
      await client.query(
        `UPDATE workers SET current_status = 'available', updated_at = now() WHERE id = $1`,
        [booking.worker_id]
      );
    }
    
    // Check new worker availability
    const workerResult = await client.query(
      `SELECT id FROM workers WHERE id = $1 AND verification_status = 'verified' AND current_status = 'available' FOR UPDATE`,
      [workerId]
    );
    if (!workerResult.rows[0]) {
      await client.query("ROLLBACK");
      throw new Error("Worker not available");
    }
    
    // Assign worker
    await client.query(
      `UPDATE workers SET current_status = 'busy', updated_at = now() WHERE id = $1`,
      [workerId]
    );
    
    const updatedBooking = await client.query(
      `UPDATE bookings SET worker_id = $1, status = 'assigned', updated_at = now() WHERE id = $2 RETURNING *`,
      [workerId, bookingId]
    );
    
    await client.query(
      `INSERT INTO booking_status_events (booking_id, status, actor_id, reason, request_id) VALUES ($1, 'assigned', $2, $3, $4)`,
      [bookingId, assignedBy, `assigned_by_${assignedBy}_${reason}`, null]
    );
    
    await client.query("COMMIT");
    
    // Notify the assigned worker (manual/admin assignment path)
    try {
      const workerUser = await pool.query(`SELECT user_id FROM workers WHERE id = $1`, [workerId]);
      if (workerUser.rows[0]) {
        await writeNotification(pool, {
          userId: workerUser.rows[0].user_id,
          type: "booking.assigned",
          title: "New service booking",
          body: "You have been assigned a new service request.",
          aggregateType: "booking",
          aggregateId: bookingId,
        });
      }
    } catch (notifyError) {
      // Notification failure must not fail the assignment
    }
    
    // Record matching audit
    await recordMatchingAudit({
      bookingId,
      assignedWorkerId: workerId,
      assignedBy,
      reason,
      algorithmVersion: "1.0"
    });
    
    return { success: true, booking: updatedBooking.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function reassignWorker(
  bookingId: string,
  newWorkerId: string,
  reassignedBy: string,
  reason: string
): Promise<{ success: boolean; booking: any }> {
  return assignWorker(bookingId, newWorkerId, reassignedBy, `reassigned: ${reason}`);
}

export async function recordMatchingAudit(record: {
  bookingId: string;
  assignedWorkerId: string;
  assignedBy: string;
  reason: string;
  algorithmVersion: string;
}): Promise<void> {
  await recordAuditEvent({
    actorId: record.assignedBy,
    action: "matching.worker_assigned",
    resourceType: "booking",
    resourceId: record.bookingId,
    metadata: {
      assignedWorkerId: record.assignedWorkerId,
      reason: record.reason,
      algorithmVersion: record.algorithmVersion
    }
  });
}

export async function getMatchingAudit(bookingId: string): Promise<any> {
  const result = await pool.query(
    `SELECT * FROM audit_events 
     WHERE resource_type = 'booking' AND resource_id = $1 
     AND action LIKE 'matching.%'
     ORDER BY created_at DESC`,
    [bookingId]
  );
  return result.rows;
}

export async function getWorkerAvailability(workerId: string): Promise<{
  isAvailable: boolean;
  currentStatus: string;
  currentWorkload: number;
  nextAvailableAt?: string;
}> {
  const result = await pool.query(
    `SELECT current_status, current_workload FROM workers WHERE id = $1`,
    [workerId]
  );
  if (!result.rows[0]) return {
    isAvailable: false,
    currentStatus: 'offline',
    currentWorkload: 0
  };
  
  const worker = result.rows[0];
  return {
    isAvailable: worker.current_status === 'available',
    currentStatus: worker.current_status,
    currentWorkload: Number(worker.current_workload || 0)
  };
}

export async function updateWorkerAvailability(
  workerId: string,
  status: 'available' | 'busy' | 'offline'
): Promise<void> {
  await pool.query(
    `UPDATE workers SET current_status = $1, updated_at = now() WHERE id = $2`,
    [status, workerId]
  );
}

export async function getWorkerLocation(workerId: string): Promise<{
  latitude: number;
  longitude: number;
  accuracy?: number;
  updatedAt: string;
} | null> {
  const result = await pool.query(
    `SELECT ST_Y(location::geometry) as latitude, ST_X(location::geometry) as longitude, updated_at
     FROM worker_locations WHERE worker_id = $1`,
    [workerId]
  );
  if (!result.rows[0]) return null;
  return {
    latitude: Number(result.rows[0].latitude),
    longitude: Number(result.rows[0].longitude),
    updatedAt: result.rows[0].updated_at
  };
}

export async function updateWorkerLocation(
  workerId: string,
  latitude: number,
  longitude: number,
  accuracy?: number
): Promise<void> {
  await pool.query(
    `INSERT INTO worker_locations (worker_id, location, updated_at)
     VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, now())
     ON CONFLICT (worker_id) DO UPDATE SET
       location = EXCLUDED.location,
       updated_at = now()`,
    [workerId, longitude, latitude]
  );
}

export async function getNearbyWorkers(params: {
  serviceId: string;
  latitude: number;
  longitude: number;
  urgency: BookingUrgency;
  radiusKm?: number;
}): Promise<any[]> {
  const result = await findMatchingWorkers({
    ...params,
    radiusKm: params.radiusKm || (params.urgency === "emergency" ? 8 : 15)
  });
  return result.workers;
}

