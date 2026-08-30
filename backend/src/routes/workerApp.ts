import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import logger from "../core/logger.js";
import { requireRoles } from "../middleware/auth.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";
import { recordAuditEvent } from "../services/auditService.js";
import {
  emitEmergencyEscalated,
  emitWorkerLocationToBookings,
  emitBookingStatusChange,
  emitToUser,
} from "../core/realtime.js";
import { listLiveOffers, getPayoutPreview, revokeLiveOffers } from "../services/offerService.js";
import {
  IST,
  getSchedule,
  replaceSchedule,
  listTimeOff,
  addTimeOff,
  removeTimeOff,
  isOnShift,
} from "../services/workerShiftService.js";

/**
 * The endpoints the worker app needs and the platform did not have.
 *
 * A separate router rather than another 600 lines in workers.ts, because these
 * belong to one client and one document (WORKER_APP_PLAN sections 4.1, 4.3,
 * 4.4, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11) and reading them together is the point.
 *
 * Two mount points, both under routers that already require authentication:
 *   workerAppRouter  -> /workers   (worker-scoped, `me` only)
 *   workerJobsRouter -> /bookings  (one booking, worker or customer side)
 */

export const workerAppRouter = Router();
export const workerJobsRouter = Router();

const workerOnly = requireRoles("worker");

workerAppRouter.param("timeOffId", rejectNonUuidParam);
workerAppRouter.param("customerId", rejectNonUuidParam);
workerJobsRouter.param("id", rejectNonUuidParam);
workerJobsRouter.param("extensionId", rejectNonUuidParam);

/** The caller's worker row, or null. Every route here needs it first. */
async function workerIdFor(userId: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>("select id from workers where user_id = $1", [userId]);
  return result.rows[0]?.id ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4.1  Live offers — a socket is not a source of truth
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /workers/me/offers:
 *   get:
 *     summary: Job offers live for the caller right now
 *     description: >
 *       What the app calls on cold start, on socket reconnect, and whenever an
 *       FCM data message arrives while the socket is down. Lapsed offers are
 *       swept before the read, so every row returned still has time on it.
 *       `serverNow` is the server's own clock: the client measures its skew
 *       against it and renders the countdown from `expiresAt`, never from a
 *       locally started timer.
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Live offers with their server deadlines }
 */
workerAppRouter.get("/me/offers", workerOnly, async (req, res, next) => {
  try {
    res.json(await listLiveOffers(req.user!.id));
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.4  Working hours and time off
// ═══════════════════════════════════════════════════════════════════════════

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

const scheduleSchema = z.object({
  entries: z
    .array(
      z
        .object({
          weekday: z.number().int().min(0).max(6),
          startsAt: timeOfDay,
          endsAt: timeOfDay,
        })
        // Rejected here rather than by the CHECK constraint, so the app gets a
        // field-level validation error instead of a 500 from Postgres.
        .refine((entry) => entry.endsAt > entry.startsAt, {
          message: "endsAt must be after startsAt",
          path: ["endsAt"],
        })
    )
    .max(28),
});

/**
 * @openapi
 * /workers/me/schedule:
 *   get:
 *     summary: The caller's weekly working hours
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 *   put:
 *     summary: Replace the caller's weekly working hours
 *     description: >
 *       A whole-week replace, because the grid is edited as a unit. An empty
 *       list means "no declared hours", which matching reads as always
 *       available — the duty toggle stays the primary control.
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 */
workerAppRouter.get("/me/schedule", workerOnly, async (req, res, next) => {
  try {
    const workerId = await workerIdFor(req.user!.id);
    if (!workerId) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }
    res.json({
      schedule: await getSchedule(workerId),
      onShift: await isOnShift(workerId),
      timezone: "Asia/Kolkata",
    });
  } catch (error) {
    next(error);
  }
});

workerAppRouter.put("/me/schedule", workerOnly, async (req, res, next) => {
  try {
    const workerId = await workerIdFor(req.user!.id);
    if (!workerId) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }
    const { entries } = scheduleSchema.parse(req.body);
    const schedule = await replaceSchedule(workerId, entries);
    res.json({ schedule, onShift: await isOnShift(workerId), timezone: "Asia/Kolkata" });
  } catch (error) {
    next(error);
  }
});

const timeOffSchema = z
  .object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((input) => new Date(input.endsAt) > new Date(input.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

workerAppRouter.get("/me/time-off", workerOnly, async (req, res, next) => {
  try {
    const workerId = await workerIdFor(req.user!.id);
    if (!workerId) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }
    const includePast = req.query.includePast === "true";
    res.json({ timeOff: await listTimeOff(workerId, includePast) });
  } catch (error) {
    next(error);
  }
});

workerAppRouter.post("/me/time-off", workerOnly, async (req, res, next) => {
  try {
    const workerId = await workerIdFor(req.user!.id);
    if (!workerId) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }
    res.status(201).json({ timeOff: await addTimeOff(workerId, timeOffSchema.parse(req.body)) });
  } catch (error) {
    next(error);
  }
});

workerAppRouter.delete("/me/time-off/:timeOffId", workerOnly, async (req, res, next) => {
  try {
    const workerId = await workerIdFor(req.user!.id);
    if (!workerId) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }
    const removed = await removeTimeOff(workerId, String(req.params.timeOffId));
    if (!removed) {
      res.status(404).json({ error: "Time off not found" });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.11  Offer preferences and blocked customers
// ═══════════════════════════════════════════════════════════════════════════

const preferencesSchema = z.object({
  maxTravelKm: z.number().positive().max(100).nullable().optional(),
  acceptEmergency: z.boolean().optional(),
  autoOfflineAtShiftEnd: z.boolean().optional(),
});

workerAppRouter.get("/me/preferences", workerOnly, async (req, res, next) => {
  try {
    const workerId = await workerIdFor(req.user!.id);
    if (!workerId) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }
    const result = await pool.query(
      `select max_travel_km as "maxTravelKm",
              accept_emergency as "acceptEmergency",
              auto_offline_at_shift_end as "autoOfflineAtShiftEnd"
         from worker_offer_preferences where worker_id = $1`,
      [workerId]
    );
    // The defaults are the same ones the matching query falls back to when the
    // row is absent, so a worker who has never opened this screen is shown
    // what is actually happening rather than an empty form.
    res.json({
      preferences: result.rows[0] ?? {
        maxTravelKm: null,
        acceptEmergency: true,
        autoOfflineAtShiftEnd: true,
      },
    });
  } catch (error) {
    next(error);
  }
});

workerAppRouter.put("/me/preferences", workerOnly, async (req, res, next) => {
  try {
    const workerId = await workerIdFor(req.user!.id);
    if (!workerId) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }
    const input = preferencesSchema.parse(req.body);
    const result = await pool.query(
      `insert into worker_offer_preferences (worker_id, max_travel_km, accept_emergency, auto_offline_at_shift_end)
       values ($1, $2, coalesce($3, true), coalesce($4, true))
       on conflict (worker_id) do update set
         max_travel_km             = coalesce($2, worker_offer_preferences.max_travel_km),
         accept_emergency          = coalesce($3, worker_offer_preferences.accept_emergency),
         auto_offline_at_shift_end = coalesce($4, worker_offer_preferences.auto_offline_at_shift_end),
         updated_at = now()
       returning max_travel_km as "maxTravelKm",
                 accept_emergency as "acceptEmergency",
                 auto_offline_at_shift_end as "autoOfflineAtShiftEnd"`,
      [
        workerId,
        // `undefined` means "leave it"; an explicit null means "no ceiling".
        input.maxTravelKm === undefined ? null : input.maxTravelKm,
        input.acceptEmergency ?? null,
        input.autoOfflineAtShiftEnd ?? null,
      ]
    );
    res.json({ preferences: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

workerAppRouter.get("/me/blocked-customers", workerOnly, async (req, res, next) => {
  try {
    const workerId = await workerIdFor(req.user!.id);
    if (!workerId) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }
    const result = await pool.query(
      `select bc.customer_id as "customerId", u.name, bc.reason, bc.created_at as "createdAt"
         from worker_blocked_customers bc
         join users u on u.id = bc.customer_id
        where bc.worker_id = $1
        order by bc.created_at desc`,
      [workerId]
    );
    res.json({ blocked: result.rows });
  } catch (error) {
    next(error);
  }
});

workerAppRouter.post("/me/blocked-customers", workerOnly, async (req, res, next) => {
  try {
    const workerId = await workerIdFor(req.user!.id);
    if (!workerId) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }
    const input = z
      .object({ customerId: z.string().uuid(), reason: z.string().trim().max(500).optional() })
      .parse(req.body);
    await pool.query(
      `insert into worker_blocked_customers (worker_id, customer_id, reason)
       values ($1, $2, $3) on conflict (worker_id, customer_id) do update set reason = excluded.reason`,
      [workerId, input.customerId, input.reason ?? null]
    );
    void recordAuditEvent({
      actorId: req.user!.id,
      action: "worker.customer_blocked",
      resourceType: "user",
      resourceId: input.customerId,
      requestId: req.header("x-request-id") ?? undefined,
    }).catch(() => undefined);
    res.status(201).json({ blocked: true });
  } catch (error) {
    next(error);
  }
});

workerAppRouter.delete("/me/blocked-customers/:customerId", workerOnly, async (req, res, next) => {
  try {
    const workerId = await workerIdFor(req.user!.id);
    if (!workerId) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }
    await pool.query("delete from worker_blocked_customers where worker_id = $1 and customer_id = $2", [
      workerId,
      req.params.customerId,
    ]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.7 / 4.9  Batched location, and the mock-location flag
// ═══════════════════════════════════════════════════════════════════════════

const locationBatchSchema = z.object({
  fixes: z
    .array(
      z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        accuracy: z.number().min(0).max(10_000).optional(),
        isMocked: z.boolean().optional(),
        recordedAt: z.string().datetime(),
      })
    )
    .min(1)
    .max(500),
  bookingId: z.string().uuid().optional(),
});

/**
 * A fix this imprecise is a cell-tower guess, not a position.
 *
 * 200m is roughly the point past which a fix cannot distinguish one street from
 * the next, which makes it useless for a tracking map and actively misleading
 * on an arrival check. Stored in the trail regardless — a gap in the trail is
 * itself evidence — but never promoted to the cursor the customer's map reads.
 */
const USABLE_ACCURACY_M = 200;

/**
 * @openapi
 * /workers/me/location/batch:
 *   post:
 *     summary: Drain a queue of position fixes
 *     description: >
 *       A worker in a lift, a basement or a 2G dead zone accumulates fixes with
 *       nowhere to send them. This takes the whole ordered queue, writes the
 *       trail, promotes the newest usable fix to the live cursor, and fans that
 *       one out to the customers currently waiting on this worker.
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: How many fixes were accepted, and the live cursor }
 */
workerAppRouter.post("/me/location/batch", workerOnly, async (req, res, next) => {
  try {
    const workerId = await workerIdFor(req.user!.id);
    if (!workerId) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }

    const input = locationBatchSchema.parse(req.body);
    // Ordered by the phone's own clock rather than by arrival: a queue drained
    // after a dead zone arrives in one request, and "newest" has to mean newest
    // recorded, not last in the array.
    const fixes = [...input.fixes].sort(
      (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
    );

    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const fix of fixes) {
        await client.query(
          `insert into worker_location_trail (worker_id, booking_id, location, accuracy_m, is_mocked, recorded_at)
           values ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, $6, $7)`,
          [
            workerId,
            input.bookingId ?? null,
            fix.longitude,
            fix.latitude,
            fix.accuracy ?? null,
            fix.isMocked ?? false,
            fix.recordedAt,
          ]
        );
      }

      const usable = fixes.filter(
        (fix) => !fix.isMocked && (fix.accuracy ?? 0) <= USABLE_ACCURACY_M
      );
      const newest = usable[usable.length - 1];

      if (newest) {
        await client.query(
          `insert into worker_locations (worker_id, location, accuracy_m, is_mocked, recorded_at, updated_at)
           values ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, false, $5, now())
           on conflict (worker_id) do update set
             location    = excluded.location,
             accuracy_m  = excluded.accuracy_m,
             is_mocked   = false,
             recorded_at = excluded.recorded_at,
             updated_at  = now()`,
          [workerId, newest.longitude, newest.latitude, newest.accuracy ?? null, newest.recordedAt]
        );
      }

      // 4.9. A mocked fix is not an error to reject — the app is honest about
      // it, and refusing the batch would only teach the next client to lie.
      // It is counted, and the count is what a dispute is read against.
      const mockedCount = fixes.filter((fix) => fix.isMocked).length;
      if (mockedCount > 0) {
        await client.query(
          `update workers
              set mock_location_flags = mock_location_flags + $2,
                  mock_location_flagged_at = now()
            where id = $1`,
          [workerId, mockedCount]
        );
      }

      await client.query("commit");

      if (newest) {
        const active = await pool.query<{ id: string }>(
          `select b.id
             from bookings b
            where b.worker_id = $1
              and b.status in ('assigned', 'accepted', 'en_route', 'arrived', 'started')`,
          [workerId]
        );
        emitWorkerLocationToBookings(
          active.rows.map((row) => row.id),
          {
            workerId: req.user!.id,
            latitude: newest.latitude,
            longitude: newest.longitude,
            accuracy: newest.accuracy ?? null,
            at: newest.recordedAt,
          }
        );
      }

      res.json({
        accepted: fixes.length,
        promoted: newest
          ? { latitude: newest.latitude, longitude: newest.longitude, recordedAt: newest.recordedAt }
          : null,
        mocked: mockedCount,
      });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.8  SOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /workers/me/sos:
 *   post:
 *     summary: Raise an SOS from the field
 *     description: >
 *       Records the incident with the last known fix and the active booking,
 *       puts it in front of the operations room immediately over
 *       `admin:operations`, and returns a number the app can dial. Distinct
 *       from POST /workers/me/safety-incidents, which is a form filed after the
 *       fact.
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: The incident, and who to call }
 */
workerAppRouter.post("/me/sos", workerOnly, async (req, res, next) => {
  try {
    const workerId = await workerIdFor(req.user!.id);
    if (!workerId) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }

    const input = z
      .object({
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        bookingId: z.string().uuid().optional(),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(req.body);

    // Fall back to the last known cursor. Someone pressing this button may not
    // have a fresh fix, and "we do not know where you are" is the wrong answer.
    const fallback = await pool.query<{ lat: number; lng: number }>(
      `select st_y(location::geometry) as lat, st_x(location::geometry) as lng
         from worker_locations where worker_id = $1`,
      [workerId]
    );
    const latitude = input.latitude ?? (fallback.rows[0] ? Number(fallback.rows[0].lat) : null);
    const longitude = input.longitude ?? (fallback.rows[0] ? Number(fallback.rows[0].lng) : null);

    const activeBooking =
      input.bookingId ??
      (
        await pool.query<{ id: string }>(
          `select id from bookings
            where worker_id = $1 and status in ('accepted', 'en_route', 'arrived', 'started')
            order by updated_at desc limit 1`,
          [workerId]
        )
      ).rows[0]?.id ??
      null;

    const incident = await pool.query<{ id: string; created_at: Date }>(
      `insert into worker_sos_incidents (worker_id, booking_id, location, note)
       values ($1, $2, case when $3::double precision is null then null
                            else ST_SetSRID(
                              -- Longitude first: ST_MakePoint is (x, y), and
                              -- the parameters arrive latitude-first. Both cast
                              -- explicitly because ST_MakePoint has three
                              -- overloads and an untyped parameter is ambiguous.
                              ST_MakePoint($4::double precision, $3::double precision), 4326
                            )::geography end, $5)
       returning id, created_at`,
      [workerId, activeBooking, latitude, longitude, input.note ?? null]
    );

    const worker = await pool.query<{ name: string; phone: string | null; emergency_phone: string | null }>(
      `select u.name, u.phone, c.contact_phone as emergency_phone
         from workers w
         join users u on u.id = w.user_id
         left join cooperatives c on c.id = w.cooperative_id
        where w.id = $1`,
      [workerId]
    );

    // The pipe that already exists and is already watched by the operations
    // room. An SOS that only writes a row is a form, not an alarm.
    emitEmergencyEscalated({
      kind: "worker_sos",
      incidentId: incident.rows[0].id,
      workerId,
      workerUserId: req.user!.id,
      workerName: worker.rows[0]?.name ?? null,
      workerPhone: worker.rows[0]?.phone ?? null,
      bookingId: activeBooking,
      latitude,
      longitude,
      note: input.note ?? null,
      at: incident.rows[0].created_at.toISOString(),
    });

    void recordAuditEvent({
      actorId: req.user!.id,
      action: "worker.sos_raised",
      resourceType: "worker",
      resourceId: workerId,
      requestId: req.header("x-request-id") ?? undefined,
      metadata: { bookingId: activeBooking },
    }).catch(() => undefined);

    logger.warn({ workerId, incidentId: incident.rows[0].id, bookingId: activeBooking }, "Worker SOS raised");

    res.status(201).json({
      incident: {
        id: incident.rows[0].id,
        createdAt: incident.rows[0].created_at.toISOString(),
        bookingId: activeBooking,
        latitude,
        longitude,
      },
      // The cooperative's own number where there is one; the national emergency
      // number otherwise. Never an empty response — this screen must always
      // give the worker something to press.
      callNumber: worker.rows[0]?.emergency_phone || "112",
    });
  } catch (error) {
    next(error);
  }
});

workerAppRouter.get("/me/sos", workerOnly, async (req, res, next) => {
  try {
    const workerId = await workerIdFor(req.user!.id);
    if (!workerId) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }
    const result = await pool.query(
      `select id, booking_id as "bookingId", note, status,
              acknowledged_at as "acknowledgedAt", resolved_at as "resolvedAt",
              resolution, created_at as "createdAt"
         from worker_sos_incidents
        where worker_id = $1
        order by created_at desc
        limit 50`,
      [workerId]
    );
    res.json({ incidents: result.rows });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.11  `me` aliases — reviews and statistics
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /workers/me/reviews:
 *   get:
 *     summary: Reviews the caller has received
 *     description: >
 *       Reviews were readable by worker *id* only, so the app had to fetch its
 *       own profile first purely to learn an id it should never need. Same
 *       data, one round trip.
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 */
workerAppRouter.get("/me/reviews", workerOnly, async (req, res, next) => {
  try {
    const workerId = await workerIdFor(req.user!.id);
    if (!workerId) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const result = await pool.query(
      `select r.id, r.rating, r.feedback as comment, r.created_at as "createdAt",
              s.name as "serviceName",
              -- First name only. A review is public to the worker; the
              -- customer's full identity is not part of it.
              split_part(u.name, ' ', 1) as "customerFirstName"
         from reviews r
         join bookings b on b.id = r.booking_id
         join services s on s.id = b.service_id
         join users    u on u.id = r.customer_id
        where r.worker_id = $1
        order by r.created_at desc
        limit $2`,
      [workerId, limit]
    );
    res.json({ reviews: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /workers/me/statistics:
 *   get:
 *     summary: The caller's own performance figures, with the window they cover
 *     description: >
 *       Acceptance rate feeds matching, so it must be visible to the worker it
 *       is measured on — together with the window it is measured over, or it is
 *       a number nobody can act on.
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 */
workerAppRouter.get("/me/statistics", workerOnly, async (req, res, next) => {
  try {
    const workerId = await workerIdFor(req.user!.id);
    if (!workerId) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }

    const windowDays = 30;
    const jobs = await pool.query<{
      total: number;
      completed: number;
      cancelled: number;
      no_show: number;
      rating: string | null;
    }>(
      `select count(*)::int                                          as total,
              count(*) filter (where status = 'completed')::int      as completed,
              count(*) filter (where status = 'cancelled')::int      as cancelled,
              count(*) filter (where status = 'no_show')::int        as no_show,
              (select rating from workers where id = $1)             as rating
         from bookings
        where worker_id = $1 and created_at > now() - ($2 || ' days')::interval`,
      [workerId, String(windowDays)]
    );

    const offers = await pool.query<{ offered: number; accepted: number; declined: number; expired: number; median_seconds: string | null }>(
      `select count(*)::int                                       as offered,
              count(*) filter (where status = 'accepted')::int    as accepted,
              count(*) filter (where status = 'declined')::int    as declined,
              count(*) filter (where status = 'expired')::int     as expired,
              percentile_cont(0.5) within group (
                order by extract(epoch from (responded_at - offered_at))
              ) filter (where responded_at is not null)           as median_seconds
         from job_offers
        where worker_id = $1 and offered_at > now() - ($2 || ' days')::interval`,
      [workerId, String(windowDays)]
    );

    const row = jobs.rows[0];
    const offerRow = offers.rows[0];
    // An offer that was revoked because someone else took it is not a decline,
    // and must not count against the worker. Only offers they could have
    // answered are in the denominator.
    const answerable = Number(offerRow.accepted) + Number(offerRow.declined) + Number(offerRow.expired);

    res.json({
      windowDays,
      jobs: {
        total: Number(row.total),
        completed: Number(row.completed),
        cancelled: Number(row.cancelled),
        noShow: Number(row.no_show),
        completionRate: row.total > 0 ? Number((Number(row.completed) / Number(row.total)).toFixed(3)) : null,
      },
      offers: {
        offered: Number(offerRow.offered),
        accepted: Number(offerRow.accepted),
        declined: Number(offerRow.declined),
        expired: Number(offerRow.expired),
        acceptanceRate: answerable > 0 ? Number((Number(offerRow.accepted) / answerable).toFixed(3)) : null,
        medianResponseSeconds: offerRow.median_seconds ? Math.round(Number(offerRow.median_seconds)) : null,
      },
      rating: row.rating === null ? null : Number(row.rating),
      // Said plainly, because the app shows it verbatim next to the figure.
      acceptanceRateAffects:
        "Acceptance rate is one input to which jobs you are offered. Offers that went to someone else before you could answer are not counted.",
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// The Earnings screen's own shape
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /workers/me/earnings/overview:
 *   get:
 *     summary: Today, this week, this month, and a seven-day strip
 *     description: >
 *       `/earnings/workers/me/earnings/summary` returns four rolling windows
 *       (7/30/365/all) with no `today`, no job counts and no per-day series —
 *       which is three of the four things the worker app's Earnings screen is
 *       made of. Rather than bend the screen to a shape it cannot use, this
 *       serves what it renders. The existing endpoint is untouched: the
 *       operator console reads it.
 *
 *       Windows are CALENDAR-aligned in Asia/Kolkata, not rolling: a worker
 *       asking "what did I make today" means since midnight, and "this week"
 *       means since Monday. A rolling seven days is a different question and
 *       answering it here would quietly disagree with their own arithmetic.
 *     tags: [Workers]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Figures and the seven-day series }
 */
workerAppRouter.get("/me/earnings/overview", workerOnly, async (req, res, next) => {
  try {
    const workerId = await workerIdFor(req.user!.id);
    if (!workerId) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }

    const [totals, daily, jobs] = await Promise.all([
      pool.query<{ today: string; week: string; month: string; pending: string }>(
        `select
           coalesce(sum(amount) filter (
             where entry_type = 'earning'
               and created_at >= date_trunc('day', now() at time zone $2) at time zone $2
           ), 0) as today,
           coalesce(sum(amount) filter (
             where entry_type = 'earning'
               and created_at >= date_trunc('week', now() at time zone $2) at time zone $2
           ), 0) as week,
           coalesce(sum(amount) filter (
             where entry_type = 'earning'
               and created_at >= date_trunc('month', now() at time zone $2) at time zone $2
           ), 0) as month,
           -- Earned, less what has already been released.
           --
           -- settlementService writes a payout as a POSITIVE worker_share
           -- row, not a negative one, so this has to subtract rather than sum:
           -- a plain sum over all three types would report a fully-settled
           -- worker as being owed twice what they earned.
           coalesce(sum(amount) filter (where entry_type in ('earning', 'adjustment')), 0)
             - coalesce(sum(amount) filter (where entry_type = 'payout'), 0) as pending
         from worker_earnings_ledger
        where worker_id = $1`,
        [workerId, IST]
      ),
      pool.query<{ date: string; amount: string; jobs: string }>(
        // A row per day for the last seven INCLUDING days with no work: a gap
        // in the strip reads as missing data rather than as a day off.
        `select d::date as date,
                coalesce(sum(l.amount) filter (where l.entry_type = 'earning'), 0) as amount,
                count(distinct l.booking_id) filter (where l.entry_type = 'earning') as jobs
           from generate_series(
                  (date_trunc('day', now() at time zone $2) - interval '6 days')::date,
                  (date_trunc('day', now() at time zone $2))::date,
                  interval '1 day'
                ) as d
           left join worker_earnings_ledger l
             on l.worker_id = $1
            and (l.created_at at time zone $2)::date = d::date
          group by d
          order by d`,
        [workerId, IST]
      ),
      pool.query<{ today: number; week: number }>(
        `select
           count(*) filter (
             where status = 'completed'
               and completed_at >= date_trunc('day', now() at time zone $2) at time zone $2
           )::int as today,
           count(*) filter (
             where status = 'completed'
               and completed_at >= date_trunc('week', now() at time zone $2) at time zone $2
           )::int as week
         from bookings where worker_id = $1`,
        [workerId, IST]
      ),
    ]);

    const row = totals.rows[0];
    res.json({
      today: Number(row.today),
      week: Number(row.week),
      month: Number(row.month),
      pending: Math.max(0, Number(row.pending)),
      jobsToday: Number(jobs.rows[0].today),
      jobsWeek: Number(jobs.rows[0].week),
      daily: daily.rows.map((d) => ({
        date: d.date,
        amount: Number(d.amount),
        jobs: Number(d.jobs),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.3  What the worker will actually be paid
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /bookings/{id}/payout-preview:
 *   get:
 *     summary: The worker's share of this booking, itemised
 *     description: >
 *       `computeSplit` was only ever called at settlement. This exposes the same
 *       arithmetic before and during the job: gross, tax out, platform 5%,
 *       cooperative 10%, welfare 2%, and what is left. Worker-scoped — the
 *       customer's own total is on their invoice.
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: The split, line by line }
 *       404: { description: Not your booking }
 */
workerJobsRouter.get("/:id/payout-preview", workerOnly, async (req, res, next) => {
  try {
    const preview = await getPayoutPreview(String(req.params.id), req.user!.id);
    if (!preview) {
      res.status(404).json({ error: "Booking not found or not assigned to you" });
      return;
    }
    res.json(preview);
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.10  The order this booking is part of
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /bookings/{id}/order-context:
 *   get:
 *     summary: The sibling services arriving at the same address
 *     description: >
 *       Since orders, a checkout produces one order and several bookings — a
 *       plumber and an electrician at the same address in the same hour, each
 *       matched separately. A worker who cannot see that has no way to plan
 *       parking, access or sequencing. Trades and their statuses only; never
 *       the other workers' phone numbers.
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 */
workerJobsRouter.get("/:id/order-context", workerOnly, async (req, res, next) => {
  try {
    const booking = await pool.query<{ order_id: string | null }>(
      `select b.order_id
         from bookings b
         join workers w on w.id = b.worker_id
        where b.id = $1 and w.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (!booking.rows[0]) {
      res.status(404).json({ error: "Booking not found or not assigned to you" });
      return;
    }
    if (!booking.rows[0].order_id) {
      res.json({ order: null, siblings: [] });
      return;
    }

    const order = await pool.query(
      `select id, mode, scheduled_at as "scheduledAt", address,
              contact_name as "contactName", contact_phone as "contactPhone"
         from service_orders where id = $1`,
      [booking.rows[0].order_id]
    );

    const siblings = await pool.query(
      `select b.id as "bookingId", s.name as "serviceName", s.category,
              b.status, b.scheduled_at as "scheduledAt", b.duration_minutes as "durationMinutes",
              -- First name only. Enough to say "Ravi is doing the wiring", not
              -- enough to be a directory of other workers.
              split_part(u.name, ' ', 1) as "workerFirstName"
         from bookings b
         join services s on s.id = b.service_id
         left join workers w on w.id = b.worker_id
         left join users   u on u.id = w.user_id
        where b.order_id = $1 and b.id <> $2
        order by b.scheduled_at nulls last, s.name`,
      [booking.rows[0].order_id, req.params.id]
    );

    res.json({ order: order.rows[0] ?? null, siblings: siblings.rows });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6  Arrival, waiting, and the no-show
// ═══════════════════════════════════════════════════════════════════════════

/**
 * How long a worker waits at the door before a no-show is allowed.
 *
 * Ten minutes is long enough that a customer coming down four floors is not
 * abandoned, and short enough that a worker is not standing outside a locked
 * gate for a quarter of an hour with nothing to press.
 */
const NO_SHOW_WAIT_MINUTES = 10;

/**
 * @openapi
 * /bookings/{id}/arrived:
 *   post:
 *     summary: Stamp arrival at the customer's door, with a GPS fix
 *     description: >
 *       The state that did not exist between en_route and started. Records the
 *       time and the position, and starts the waiting window after which a
 *       no-show may be declared. A mocked fix is refused and flagged — arrival
 *       is what gates the OTP and therefore the money.
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Arrival recorded, with the no-show window }
 *       409: { description: Wrong status, or a mocked position }
 */
workerJobsRouter.post("/:id/arrived", workerOnly, async (req, res, next) => {
  try {
    const input = z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        accuracy: z.number().min(0).max(10_000).optional(),
        isMocked: z.boolean().optional(),
      })
      .parse(req.body);

    const booking = await pool.query<{ id: string; status: string; worker_id: string; customer_id: string }>(
      `select b.id, b.status, b.worker_id, b.customer_id
         from bookings b
         join workers w on w.id = b.worker_id
        where b.id = $1 and w.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (!booking.rows[0]) {
      res.status(404).json({ error: "Booking not found or not assigned to you" });
      return;
    }
    if (!["accepted", "en_route"].includes(booking.rows[0].status)) {
      res.status(409).json({
        error: `Cannot record arrival from ${booking.rows[0].status}`,
        code: "BOOKING_TRANSITION_INVALID",
        from: booking.rows[0].status,
      });
      return;
    }

    // 4.9. Arrival is the gate on the start OTP, which is the gate on payment.
    // Accepting a mocked fix here is accepting a worker marking themselves at a
    // customer's door from their sofa.
    if (input.isMocked) {
      await pool.query(
        `update workers set mock_location_flags = mock_location_flags + 1,
                            mock_location_flagged_at = now()
          where id = $1`,
        [booking.rows[0].worker_id]
      );
      void recordAuditEvent({
        actorId: req.user!.id,
        action: "worker.mock_location_rejected",
        resourceType: "booking",
        resourceId: String(req.params.id),
        requestId: req.header("x-request-id") ?? undefined,
      }).catch(() => undefined);
      res.status(409).json({
        error: "Arrival cannot be recorded from a simulated location. Turn off any mock-location app and try again.",
        code: "MOCK_LOCATION_REJECTED",
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `update bookings
            set status = 'arrived',
                arrived_at = now(),
                arrival_location = ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
                arrival_accuracy_m = $4,
                updated_at = now()
          where id = $1`,
        [req.params.id, input.longitude, input.latitude, input.accuracy ?? null]
      );
      await client.query(
        `insert into booking_status_events (booking_id, status, actor_id, reason, request_id)
         values ($1, 'arrived', $2, 'worker_arrived', $3)`,
        [req.params.id, req.user!.id, req.header("x-request-id") ?? null]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    const noShowEligibleAt = new Date(Date.now() + NO_SHOW_WAIT_MINUTES * 60_000).toISOString();

    // Both rooms, deliberately. `booking:{id}` is where a customer watching the
    // tracking map is sitting; `user:{id}` reaches them when they are not on
    // that screen -- which, for "the worker is at your door", is most of the
    // time and is the whole point of the event.
    const arrivedPayload = { id: req.params.id, status: "arrived", arrivedAt: new Date().toISOString() };
    emitBookingStatusChange(String(req.params.id), arrivedPayload);
    emitToUser(booking.rows[0].customer_id, "booking:status_changed", arrivedPayload);

    res.json({
      booking: { id: req.params.id, status: "arrived", arrivedAt: new Date().toISOString() },
      noShowEligibleAt,
      waitMinutes: NO_SHOW_WAIT_MINUTES,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /bookings/{id}/no-show:
 *   post:
 *     summary: Release a job whose customer never appeared
 *     description: >
 *       Only after arrival has been stamped and the waiting window has run.
 *       Releases the worker, records a structured reason, and posts a
 *       compensation entry to the worker's ledger — a wasted journey is work.
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Released, with any compensation posted }
 *       409: { description: Not arrived yet, or still inside the waiting window }
 */
workerJobsRouter.post("/:id/no-show", workerOnly, async (req, res, next) => {
  try {
    const input = z.object({ note: z.string().trim().max(500).optional() }).parse(req.body ?? {});

    const booking = await pool.query<{
      id: string;
      status: string;
      worker_id: string;
      customer_id: string;
      arrived_at: Date | null;
      price: string | null;
    }>(
      `select b.id, b.status, b.worker_id, b.customer_id, b.arrived_at, b.price
         from bookings b
         join workers w on w.id = b.worker_id
        where b.id = $1 and w.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (!booking.rows[0]) {
      res.status(404).json({ error: "Booking not found or not assigned to you" });
      return;
    }

    const row = booking.rows[0];
    if (row.status !== "arrived" || !row.arrived_at) {
      res.status(409).json({
        error: "Record your arrival before reporting a no-show",
        code: "ARRIVAL_NOT_RECORDED",
        from: row.status,
      });
      return;
    }

    const waitedMs = Date.now() - row.arrived_at.getTime();
    if (waitedMs < NO_SHOW_WAIT_MINUTES * 60_000) {
      res.status(409).json({
        error: `Wait ${NO_SHOW_WAIT_MINUTES} minutes from arrival before reporting a no-show`,
        code: "NO_SHOW_TOO_EARLY",
        eligibleAt: new Date(row.arrived_at.getTime() + NO_SHOW_WAIT_MINUTES * 60_000).toISOString(),
      });
      return;
    }

    // A quarter of the job's value, floored at 50 rupees. The point is not to
    // make the worker whole — it is that a wasted journey is never worth zero,
    // which is what it was worth before.
    const compensation = Math.max(50, Math.round(Number(row.price ?? 0) * 0.25 * 100) / 100);

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `update bookings
            set status = 'no_show',
                cancellation_reason_code = 'no_show',
                work_finished_at = now(),
                updated_at = now()
          where id = $1`,
        [req.params.id]
      );
      await client.query(
        `insert into booking_status_events (booking_id, status, actor_id, reason, request_id)
         values ($1, 'no_show', $2, $3, $4)`,
        [req.params.id, req.user!.id, input.note ? `no_show:${input.note}` : "no_show", req.header("x-request-id") ?? null]
      );
      await client.query(
        `update workers set current_status = 'available', updated_at = now()
          where id = $1 and verification_status = 'verified'`,
        [row.worker_id]
      );
      await client.query(
        `insert into worker_earnings_ledger (worker_id, booking_id, entry_type, amount, reference)
         values ($1, $2, 'adjustment', $3, 'no_show_compensation')`,
        [row.worker_id, req.params.id, compensation]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    await revokeLiveOffers(String(req.params.id), "cancelled").catch(() => 0);
    emitBookingStatusChange(String(req.params.id), { id: req.params.id, status: "no_show" });
    emitToUser(row.customer_id, "booking:status_changed", { id: req.params.id, status: "no_show" });

    void recordAuditEvent({
      actorId: req.user!.id,
      action: "booking.no_show",
      resourceType: "booking",
      resourceId: String(req.params.id),
      requestId: req.header("x-request-id") ?? undefined,
      metadata: { compensation, waitedMinutes: Math.round(waitedMs / 60_000) },
    }).catch(() => undefined);

    res.json({
      booking: { id: req.params.id, status: "no_show" },
      compensation,
      waitedMinutes: Math.round(waitedMs / 60_000),
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5  Time extensions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /bookings/{id}/extensions:
 *   get:
 *     summary: Extension requests on this booking
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *   post:
 *     summary: Ask the customer for more time
 *     description: >
 *       Priced at the rate frozen onto the booking, never at today's rate. One
 *       pending request at a time — a second would leave the customer choosing
 *       between two prices for the same half hour.
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Requested, awaiting the customer }
 *       409: { description: Job not in progress, or a request is already pending }
 */
workerJobsRouter.post("/:id/extensions", workerOnly, async (req, res, next) => {
  try {
    const input = z
      .object({
        minutes: z.number().int().min(15).max(480),
        note: z.string().trim().max(500).optional(),
      })
      .parse(req.body);

    const booking = await pool.query<{
      status: string;
      customer_id: string;
      price: string | null;
      duration_minutes: number | null;
      price_per_minute: string | null;
      base_price: string;
    }>(
      `select b.status, b.customer_id, b.price, b.duration_minutes,
              s.price_per_minute, s.base_price
         from bookings b
         join services s on s.id = b.service_id
         join workers  w on w.id = b.worker_id
        where b.id = $1 and w.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (!booking.rows[0]) {
      res.status(404).json({ error: "Booking not found or not assigned to you" });
      return;
    }
    if (booking.rows[0].status !== "started") {
      res.status(409).json({
        error: "Extra time can only be requested while the job is in progress",
        code: "BOOKING_TRANSITION_INVALID",
        from: booking.rows[0].status,
      });
      return;
    }

    // The rate the customer actually agreed to: their frozen total divided by
    // the minutes they bought. Falling back to the catalogue rate only where a
    // booking predates time pricing.
    const row = booking.rows[0];
    const frozenRate =
      row.price && row.duration_minutes
        ? Number(row.price) / Number(row.duration_minutes)
        : Number(row.price_per_minute ?? Number(row.base_price) / 60);
    const amount = Math.round(frozenRate * input.minutes * 100) / 100;

    try {
      const extension = await pool.query(
        `insert into booking_time_extensions (booking_id, requested_by, minutes, amount, note)
         values ($1, $2, $3, $4, $5)
         returning id, minutes, amount, status, note, created_at as "createdAt"`,
        [req.params.id, req.user!.id, input.minutes, amount, input.note ?? null]
      );

      emitToUser(row.customer_id, "booking:extension_requested", {
        bookingId: req.params.id,
        ...extension.rows[0],
      });

      res.status(201).json({ extension: extension.rows[0] });
    } catch (error) {
      // The partial unique index on pending rows. Reported as a conflict rather
      // than a 500, because it is a legitimate thing for the worker to have
      // done twice on a bad connection.
      if ((error as { code?: string }).code === "23505") {
        res.status(409).json({ error: "A request for extra time is already awaiting the customer", code: "EXTENSION_PENDING" });
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

workerJobsRouter.get("/:id/extensions", async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    // Readable by both sides: the worker who asked and the customer who has to
    // decide. Admins too, because a dispute lands with them.
    const access = await pool.query(
      `select b.id
         from bookings b
         left join workers w on w.id = b.worker_id
        where b.id = $1
          and ($2 in ('society_admin', 'federation_admin', 'system_admin', 'support_staff')
               or b.customer_id = $3 or w.user_id = $3)`,
      [req.params.id, req.user.role, req.user.id]
    );
    if (!access.rows[0]) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    const result = await pool.query(
      `select id, minutes, amount, status, note,
              created_at as "createdAt", resolved_at as "resolvedAt"
         from booking_time_extensions
        where booking_id = $1
        order by created_at desc`,
      [req.params.id]
    );
    res.json({ extensions: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /bookings/{id}/extensions/{extensionId}/respond:
 *   post:
 *     summary: Customer approves or declines extra time
 *     description: >
 *       Approving re-freezes the booking: the minutes and the price both move,
 *       in one transaction, so the invoice and the settlement split cannot
 *       disagree about what was bought.
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Resolved, with the booking's new duration and price }
 */
workerJobsRouter.post("/:id/extensions/:extensionId/respond", async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const input = z.object({ approve: z.boolean() }).parse(req.body);

    const client = await pool.connect();
    try {
      await client.query("begin");

      const extension = await client.query<{
        id: string;
        booking_id: string;
        minutes: number;
        amount: string;
        status: string;
        customer_id: string;
        worker_user_id: string | null;
      }>(
        `select e.id, e.booking_id, e.minutes, e.amount, e.status,
                b.customer_id, w.user_id as worker_user_id
           from booking_time_extensions e
           join bookings b on b.id = e.booking_id
           left join workers w on w.id = b.worker_id
          where e.id = $1 and e.booking_id = $2
          for update of e`,
        [req.params.extensionId, req.params.id]
      );
      if (!extension.rows[0]) {
        await client.query("rollback");
        res.status(404).json({ error: "Extension request not found" });
        return;
      }

      const row = extension.rows[0];
      // The customer is paying for it, so the customer decides. Admins can act
      // on their behalf when a dispute reaches support.
      const isAdmin = ["society_admin", "federation_admin", "system_admin", "support_staff"].includes(req.user.role);
      if (row.customer_id !== req.user.id && !isAdmin) {
        await client.query("rollback");
        res.status(403).json({ error: "Only the customer can approve extra time" });
        return;
      }
      if (row.status !== "pending") {
        await client.query("rollback");
        res.status(409).json({ error: `Request already ${row.status}`, code: "EXTENSION_RESOLVED" });
        return;
      }

      await client.query(
        `update booking_time_extensions
            set status = $2, resolved_at = now(), resolved_by = $3
          where id = $1`,
        [row.id, input.approve ? "approved" : "declined", req.user.id]
      );

      let booking: { durationMinutes: number | null; price: number | null } | null = null;
      if (input.approve) {
        const updated = await client.query<{ duration_minutes: number | null; price: string | null }>(
          `update bookings
              set duration_minutes = coalesce(duration_minutes, 0) + $2,
                  price = coalesce(price, 0) + $3,
                  updated_at = now()
            where id = $1
            returning duration_minutes, price`,
          [row.booking_id, row.minutes, row.amount]
        );
        booking = {
          durationMinutes: updated.rows[0]?.duration_minutes ?? null,
          price: updated.rows[0]?.price === null ? null : Number(updated.rows[0].price),
        };
      }

      await client.query("commit");

      if (row.worker_user_id) {
        emitToUser(row.worker_user_id, "booking:extension_resolved", {
          bookingId: row.booking_id,
          extensionId: row.id,
          approved: input.approve,
          minutes: row.minutes,
          amount: Number(row.amount),
        });
      }

      res.json({ extension: { id: row.id, status: input.approve ? "approved" : "declined" }, booking });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5  The live timer on the in-progress screen
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /bookings/{id}/work-clock:
 *   post:
 *     summary: Stamp the real start and finish of the work
 *     description: >
 *       Distinct from the booking's status. `started` is a handshake with a
 *       customer holding an OTP; this is the clock the in-progress timer runs
 *       against and the record of how long the job really took, which is what
 *       "need more time?" and every duration forecast are read from.
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 */
workerJobsRouter.post("/:id/work-clock", workerOnly, async (req, res, next) => {
  try {
    const input = z.object({ event: z.enum(["start", "finish"]) }).parse(req.body);

    const column = input.event === "start" ? "work_started_at" : "work_finished_at";
    const result = await pool.query<{
      work_started_at: Date | null;
      work_finished_at: Date | null;
      duration_minutes: number | null;
    }>(
      // `coalesce` rather than an overwrite: the offline queue can replay this,
      // and a replayed "start" must not move the clock forward an hour.
      `update bookings b
          set ${column} = coalesce(b.${column}, now()), updated_at = now()
         from workers w
        where b.id = $1 and w.id = b.worker_id and w.user_id = $2
        returning b.work_started_at, b.work_finished_at, b.duration_minutes`,
      [req.params.id, req.user!.id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "Booking not found or not assigned to you" });
      return;
    }

    const row = result.rows[0];
    const elapsedMinutes = row.work_started_at
      ? Math.round(((row.work_finished_at ?? new Date()).getTime() - row.work_started_at.getTime()) / 60_000)
      : 0;

    res.json({
      workStartedAt: row.work_started_at?.toISOString() ?? null,
      workFinishedAt: row.work_finished_at?.toISOString() ?? null,
      purchasedMinutes: row.duration_minutes,
      elapsedMinutes,
      serverNow: new Date().toISOString(),
      // The threshold the app raises "need more time?" at, served rather than
      // hardcoded in the client so it can be tuned without a release.
      promptExtensionAtPercent: 85,
    });
  } catch (error) {
    next(error);
  }
});

/** Exposed for the app's clock-skew measurement on connect. */
export const workerAcceptWindowSeconds = env.WORKER_ACCEPT_TIMEOUT_SECONDS;
