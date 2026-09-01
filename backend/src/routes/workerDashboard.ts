import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { getDirections, getDistanceMatrix, getNavigationUrl, getEmbedMapUrl } from "../services/googleMaps.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

export const workerDashboardRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
workerDashboardRouter.param("bookingId", rejectNonUuidParam);

/**
 * @openapi
 * /worker/dashboard:
 *   get:
 *     summary: Get worker dashboard overview
 *     tags: [Worker Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Worker dashboard data
 */
const getWorkerDashboard = async (req: any, res: any, next: any) => {
  try {
    const workerResult = await pool.query(
      `SELECT w.id, w.user_id as "userId", w.cooperative_id as "cooperativeId",
              w.experience_years as "experienceYears", w.verification_status as "verificationStatus",
              w.rating, w.current_status as "currentStatus", w.address,
              w.profile_photo_url as "profilePhotoUrl", w.location_sharing_enabled as "locationSharingEnabled",
              w.location_updated_at as "locationUpdatedAt", u.name, u.phone, u.email, u.language
       FROM workers w
       JOIN users u ON u.id = w.user_id
       WHERE w.user_id = $1`,
      [req.user!.id]
    );

    if (!workerResult.rows[0]) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }

    const worker = workerResult.rows[0];

    const [
      upcomingJobs,
      todayStats,
      earningsSummary,
      welfareSummary,
      notifications
    ] = await Promise.all([
      // Upcoming/active jobs
      pool.query(
        `SELECT b.id, b.status, b.scheduled_at as "scheduledAt", b.address, b.description, b.is_emergency as "isEmergency",
                s.name as service_name, s.category,
                ST_Y(b.location::geometry) as customer_lat, ST_X(b.location::geometry) as customer_lng
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         WHERE b.worker_id = $1
           AND b.status IN ('assigned', 'accepted', 'en_route', 'started')
         ORDER BY b.scheduled_at ASC NULLS FIRST, b.created_at ASC
         LIMIT 10`,
        [worker.id]
      ),
      // Today's stats
      pool.query(
        `SELECT 
           COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= CURRENT_DATE) as completed_today,
           COUNT(*) FILTER (WHERE status = 'started') as in_progress,
           COUNT(*) FILTER (WHERE status IN ('assigned', 'accepted', 'en_route')) as upcoming,
           COALESCE(SUM(price) FILTER (WHERE status = 'completed' AND completed_at >= CURRENT_DATE), 0) as earnings_today
         FROM bookings
         WHERE worker_id = $1`,
        [worker.id]
      ),
      // Earnings summary (today, week, month)
      pool.query(
        `SELECT 
           COALESCE(SUM(amount) FILTER (WHERE entry_type = 'earning' AND created_at >= CURRENT_DATE), 0) as today_earnings,
           COALESCE(SUM(amount) FILTER (WHERE entry_type = 'earning' AND created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as week_earnings,
           COALESCE(SUM(amount) FILTER (WHERE entry_type = 'earning' AND created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) as month_earnings,
           COALESCE(SUM(amount) FILTER (WHERE entry_type = 'earning'), 0) as total_earnings,
           COALESCE(SUM(amount) FILTER (WHERE entry_type = 'payout'), 0) as total_payouts,
           COALESCE(SUM(amount) FILTER (WHERE entry_type = 'earning'), 0) - COALESCE(SUM(amount) FILTER (WHERE entry_type = 'payout'), 0) as pending_payout
         FROM worker_earnings_ledger
         WHERE worker_id = $1`,
        [worker.id]
      ),
      // Welfare summary
      pool.query(
        `SELECT 
           wr.insurance_status as "insuranceStatus",
           wr.training_status as "trainingStatus",
           COUNT(DISTINCT it.id) FILTER (WHERE it.status = 'active') as active_insurance,
           COUNT(DISTINCT tr.id) FILTER (WHERE tr.status = 'completed') as completed_trainings,
           COUNT(DISTINCT si.id) FILTER (WHERE si.severity IN ('high', 'critical')) as critical_incidents
         FROM welfare_records wr
         LEFT JOIN worker_insurance_records it ON it.worker_id = wr.worker_id
         LEFT JOIN worker_training_records tr ON tr.worker_id = wr.worker_id
         LEFT JOIN safety_incidents si ON si.worker_id = wr.worker_id
         WHERE wr.worker_id = $1
         GROUP BY wr.worker_id`,
        [worker.id]
      ),
      // Recent notifications
      pool.query(
        `SELECT id, type, title, body, read_at as "readAt", created_at as "createdAt"
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [req.user!.id]
      ),
    ]);

    res.json({
      worker: {
        id: worker.id,
        name: worker.name,
        phone: worker.phone,
        email: worker.email,
        language: worker.language,
        experienceYears: worker.experienceYears,
        verificationStatus: worker.verificationStatus,
        rating: worker.rating,
        currentStatus: worker.currentStatus,
        address: worker.address,
        profilePhotoUrl: worker.profilePhotoUrl,
        locationSharingEnabled: worker.locationSharingEnabled,
        cooperativeId: worker.cooperativeId,
        locationUpdatedAt: worker.locationUpdatedAt,
      },
      upcomingJobs: upcomingJobs.rows,
      todayStats: todayStats.rows[0],
      earningsSummary: earningsSummary.rows[0],
      welfareSummary: welfareSummary.rows[0] ?? {
        insuranceStatus: "unknown",
        trainingStatus: "not_started",
        activeInsurance: 0,
        completedTrainings: 0,
        criticalIncidents: 0
      },
      notifications: notifications.rows,
    });
  } catch (error) { next(error); }
};

workerDashboardRouter.get("/", requireAuth, requireRoles("worker"), getWorkerDashboard);
workerDashboardRouter.get("/dashboard", requireAuth, requireRoles("worker"), getWorkerDashboard);

/**
 * @openapi
 * /worker/upcoming-jobs:
 *   get:
 *     summary: Get worker's upcoming/active jobs
 *     tags: [Worker Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: List of upcoming jobs
 */
workerDashboardRouter.get("/upcoming-jobs", requireAuth, requireRoles("worker"), async (req, res, next) => {
  try {
    const workerResult = await pool.query("SELECT id FROM workers WHERE user_id = $1", [req.user!.id]);
    if (!workerResult.rows[0]) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }

    const workerId = workerResult.rows[0].id;

    const [activeJobs, scheduledJobs] = await Promise.all([
      // Currently active jobs.
      //
      // Phase 26 changed two things here, both of which the worker app depends
      // on absolutely:
      //
      //  1. `arrived` is in the status list. Without it, a worker who pressed
      //     "I'm here" watched the job vanish from their own screen, because
      //     this is the query the active-job state machine reads.
      //  2. The contact comes from the ORDER, not the account. Somebody books a
      //     clean for their parents' flat; the person answering the door is not
      //     the account holder, and asking for the wrong name at a stranger's
      //     door is a bad start. See migration_phase20_order_contact.sql.
      //
      // The extra columns (duration, arrival, work clock, price) are what the
      // in-progress timer, the waiting window and the payout line render from.
      pool.query(
        `SELECT b.id, b.status, b.scheduled_at as "scheduledAt", b.address, b.description,
                b.is_emergency as "isEmergency", b.order_id as "orderId",
                b.duration_minutes as "durationMinutes",
                b.arrived_at as "arrivedAt", b.work_started_at as "workStartedAt",
                b.price,
                s.name as service_name, s.category,
                ST_Y(b.location::geometry) as latitude, ST_X(b.location::geometry) as longitude,
                coalesce(o.contact_name,  u.name)  as "contactName",
                coalesce(o.contact_phone, u.phone) as "contactPhone"
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         JOIN users u ON u.id = b.customer_id
         LEFT JOIN service_orders o ON o.id = b.order_id
         WHERE b.worker_id = $1
           AND b.status IN ('assigned', 'accepted', 'en_route', 'arrived', 'started')
         ORDER BY
           CASE b.status
             WHEN 'started'  THEN 1
             WHEN 'arrived'  THEN 2
             WHEN 'en_route' THEN 3
             WHEN 'accepted' THEN 4
             WHEN 'assigned' THEN 5
             ELSE 6
           END,
           b.scheduled_at ASC NULLS FIRST, b.created_at ASC`,
        [workerId]
      ),
      // Future scheduled jobs
      pool.query(
        `SELECT b.id, b.status, b.scheduled_at as "scheduledAt", b.address, b.description,
                s.name as service_name, s.category
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         WHERE b.worker_id = $1
           AND b.status IN ('requested', 'matching')
           AND b.scheduled_at > NOW()
         ORDER BY b.scheduled_at ASC
         LIMIT 20`,
        [workerId]
      ),
    ]);

    // `jobs` is the flat list the worker app reads: on that screen the
    // distinction between "active" and "scheduled" is a sort order, not two
    // sections. The original two keys stay for the operator views that already
    // read them.
    res.json({
      jobs: [...activeJobs.rows, ...scheduledJobs.rows],
      activeJobs: activeJobs.rows,
      scheduledJobs: scheduledJobs.rows,
    });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /worker/earnings/summary:
 *   get:
 *     summary: Get worker earnings summary (today, week, month, total)
 *     tags: [Worker Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Earnings summary
 */
workerDashboardRouter.get("/earnings/summary", requireAuth, requireRoles("worker"), async (req, res, next) => {
  try {
    const workerResult = await pool.query("SELECT id FROM workers WHERE user_id = $1", [req.user!.id]);
    if (!workerResult.rows[0]) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }

    const workerId = workerResult.rows[0].id;

    const [summary, recentEarnings, payoutAccount] = await Promise.all([
      pool.query(
        `SELECT 
           COALESCE(SUM(amount) FILTER (WHERE entry_type = 'earning' AND created_at >= CURRENT_DATE), 0) as today_earnings,
           COALESCE(SUM(amount) FILTER (WHERE entry_type = 'earning' AND created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as week_earnings,
           COALESCE(SUM(amount) FILTER (WHERE entry_type = 'earning' AND created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) as month_earnings,
           COALESCE(SUM(amount) FILTER (WHERE entry_type = 'earning'), 0) as total_earnings,
           COALESCE(SUM(amount) FILTER (WHERE entry_type = 'payout'), 0) as total_payouts,
           COALESCE(SUM(amount) FILTER (WHERE entry_type = 'adjustment'), 0) as total_adjustments,
           COALESCE(SUM(amount) FILTER (WHERE entry_type = 'refund'), 0) as total_refunds,
           COALESCE(SUM(amount) FILTER (WHERE entry_type = 'earning'), 0) - COALESCE(SUM(amount) FILTER (WHERE entry_type = 'payout'), 0) as pending_payout
         FROM worker_earnings_ledger
         WHERE worker_id = $1`,
        [workerId]
      ),
      pool.query(
        `SELECT entry_type, amount, reference, created_at, booking_id
         FROM worker_earnings_ledger
         WHERE worker_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [workerId]
      ),
      pool.query(
        `SELECT provider, account_reference, verified_at
         FROM payout_accounts
         WHERE worker_id = $1`,
        [workerId]
      ),
    ]);

    res.json({
      summary: summary.rows[0],
      recentEarnings: recentEarnings.rows,
      payoutAccount: payoutAccount.rows[0] ?? null,
    });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /worker/welfare/summary:
 *   get:
 *     summary: Get worker welfare summary (insurance, training, safety)
 *     tags: [Worker Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Welfare summary
 */
workerDashboardRouter.get("/welfare/summary", requireAuth, requireRoles("worker"), async (req, res, next) => {
  try {
    const workerResult = await pool.query("SELECT id FROM workers WHERE user_id = $1", [req.user!.id]);
    if (!workerResult.rows[0]) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }

    const workerId = workerResult.rows[0].id;

    const [welfare, insurance, trainings, incidents, benefits] = await Promise.all([
      pool.query(
        `SELECT * FROM welfare_records WHERE worker_id = $1`,
        [workerId]
      ),
      pool.query(
        `SELECT * FROM worker_insurance_records 
         WHERE worker_id = $1 
         ORDER BY expires_on DESC`,
        [workerId]
      ),
      pool.query(
        `SELECT * FROM worker_training_records 
         WHERE worker_id = $1 
         ORDER BY completed_on DESC NULLS LAST
         LIMIT 10`,
        [workerId]
      ),
      pool.query(
        `SELECT * FROM safety_incidents 
         WHERE worker_id = $1 
         ORDER BY reported_at DESC
         LIMIT 10`,
        [workerId]
      ),
      pool.query(
        `SELECT b.*, be.eligible, be.determined_at as "determinedAt", be.expires_at as "expiresAt"
         FROM benefits b
         LEFT JOIN benefit_eligibility be ON be.benefit_id = b.id AND be.worker_id = $1
         WHERE b.status = 'active'
         ORDER BY b.name`,
        [workerId]
      ),
    ]);

    res.json({
      welfare: welfare.rows[0] ?? { insuranceStatus: "unknown", trainingStatus: "not_started" },
      insurance: insurance.rows,
      trainings: trainings.rows,
      incidents: incidents.rows,
      benefits: benefits.rows,
    });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /worker/navigate/{bookingId}:
 *   post:
 *     summary: Get navigation details for a booking
 *     tags: [Worker Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: bookingId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Navigation details
 *       404:
 *         description: Booking not found or not assigned to worker
 */
workerDashboardRouter.post("/navigate/:bookingId", requireAuth, requireRoles("worker"), async (req, res, next) => {
  try {
    const workerResult = await pool.query("SELECT id FROM workers WHERE user_id = $1", [req.user!.id]);
    if (!workerResult.rows[0]) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }

    const workerId = workerResult.rows[0].id;
    const bookingId = z.string().uuid().parse(req.params.bookingId);

    const booking = await pool.query(
      `SELECT b.id, b.status, b.address, b.description, b.is_emergency as "isEmergency",
              s.name as service_name,
              ST_Y(b.location::geometry) as customer_lat, ST_X(b.location::geometry) as customer_lng,
              u.name as customer_name, u.phone as customer_phone
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       JOIN users u ON u.id = b.customer_id
       WHERE b.id = $1 AND b.worker_id = $2`,
      [bookingId, workerId]
    );

    if (!booking.rows[0]) {
      res.status(404).json({ error: "Booking not found or not assigned to you" });
      return;
    }

    const b = booking.rows[0];

    // Get worker's current location
    const workerLoc = await pool.query(
      `SELECT ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng FROM worker_locations WHERE worker_id = $1`,
      [workerId]
    );

    let distanceKm: number | null = null;
    let etaMinutes: number | null = null;
    let directions: any = null;
    let embedMapUrl: string | null = null;
    let navigationUrl: string | null = null;

    const customerLocation = { lat: b.customer_lat, lng: b.customer_lng };

    if (workerLoc.rows[0]?.lat != null && workerLoc.rows[0].lng != null && customerLocation.lat != null && customerLocation.lng != null) {
      const workerLocation = {
        lat: Number(workerLoc.rows[0].lat),
        lng: Number(workerLoc.rows[0].lng),
      };

      try {
        // Get distance matrix with traffic
        const distanceResult = await getDistanceMatrix([workerLocation], [customerLocation], {
          mode: "driving",
          departureTime: Math.floor(Date.now() / 1000),
          trafficModel: "best_guess",
        });

        if (distanceResult.length > 0 && distanceResult[0].distance) {
          distanceKm = distanceResult[0].distance.value / 1000;
          etaMinutes = Math.round(distanceResult[0].duration.value / 60);
        }
      } catch (mapsError) {
        // Navigation aids are best-effort; fall back to straight-line ETA below
      }

      // Get detailed directions with steps
      try {
        const directionsResult = await getDirections(workerLocation, customerLocation, {
          mode: "driving",
          departureTime: Math.floor(Date.now() / 1000),
          avoid: ["tolls"],
        });
        directions = directionsResult;
      } catch (e) {
        console.warn("Failed to get directions:", e);
      }

      // Generate embed map URL for iframe
      try {
        embedMapUrl = getEmbedMapUrl(workerLocation, customerLocation, "driving");
      } catch (e) {
        console.warn("Failed to get embed map:", e);
      }
    }

    // Generate navigation URL
    navigationUrl = getNavigationUrl(customerLocation);

    res.json({
      booking: {
        id: b.id,
        status: b.status,
        address: b.address,
        description: b.description,
        isEmergency: b.is_emergency,
        serviceName: b.service_name,
      },
      customer: {
        name: b.customer_name,
        phone: b.customer_phone,
        location: {
          latitude: b.customer_lat,
          longitude: b.customer_lng,
        },
      },
      worker: workerLoc.rows[0]?.lat != null ? {
        latitude: Number(workerLoc.rows[0].lat),
        longitude: Number(workerLoc.rows[0].lng),
      } : null,
      navigation: {
        distanceKm,
        etaMinutes,
        mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${b.customer_lat},${b.customer_lng}`,
        navigationUrl,
        embedMapUrl,
        directions: directions?.routes?.[0]?.legs?.[0] ? {
          distance: directions.routes[0].legs[0].distance.text,
          duration: directions.routes[0].legs[0].duration.text,
          steps: directions.routes[0].legs[0].steps.map((step: any) => ({
            instruction: step.html_instructions,
            distance: step.distance.text,
            duration: step.duration.text,
            startLocation: step.start_location,
            endLocation: step.end_location,
          })),
        } : null,
        startOtp: b.status === "accepted" || b.status === "en_route" ? "Share OTP with customer to start job" : null,
      },
    });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /worker/jobs/history:
 *   get:
 *     summary: Get worker job history with filters
 *     tags: [Worker Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [completed, cancelled, all] }
 *       - name: fromDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: toDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: page
 *         in: query
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated job history
 */
workerDashboardRouter.get("/jobs/history", requireAuth, requireRoles("worker"), async (req, res, next) => {
  try {
    const workerResult = await pool.query("SELECT id FROM workers WHERE user_id = $1", [req.user!.id]);
    if (!workerResult.rows[0]) {
      res.status(404).json({ error: "Worker profile not found" });
      return;
    }

    const workerId = workerResult.rows[0].id;
    const query = z.object({
      status: z.enum(["completed", "cancelled", "all"]).default("all"),
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(50).default(20),
    }).parse(req.query);

    const conditions: string[] = ["b.worker_id = $1"];
    const values: unknown[] = [workerId];
    let index = 2;

    if (query.status !== "all") {
      conditions.push(`b.status = $${index++}`);
      values.push(query.status);
    }
    if (query.fromDate) {
      conditions.push(`b.created_at >= $${index++}`);
      values.push(query.fromDate);
    }
    if (query.toDate) {
      conditions.push(`b.created_at <= $${index++}`);
      values.push(query.toDate);
    }

    const whereClause = conditions.join(" AND ");
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query(
      `SELECT b.id, b.booking_number, b.status, b.scheduled_at as "scheduledAt", b.completed_at as "completedAt",
              b.address, b.description, b.price, b.is_emergency as "isEmergency",
              s.name as service_name, s.category,
              u.name as customer_name,
              r.rating, r.feedback
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       LEFT JOIN users u ON u.id = b.customer_id
       LEFT JOIN reviews r ON r.booking_id = b.id
       WHERE ${whereClause}
       ORDER BY b.created_at DESC
       LIMIT $${index++} OFFSET $${index}`,
      values
    );

    const countResult = await pool.query(
      `SELECT count(*)::int as total FROM bookings b WHERE ${whereClause}`,
      values.slice(0, -2)
    );

    res.json({
      jobs: result.rows,
      pagination: { page: query.page, limit: query.limit, total: countResult.rows[0].total },
    });
  } catch (error) { next(error); }
});

export default workerDashboardRouter;