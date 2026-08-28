import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";

export const cooperativeDashboardRouter = Router();

// All routes require society_admin, federation_admin, or system_admin
const adminAuth = [requireAuth, requireRoles("society_admin", "federation_admin", "system_admin")] as const;

/**
 * @openapi
 * /admin/dashboard/overview:
 *   get:
 *     summary: Get cooperative dashboard overview
 *     tags: [Cooperative Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Dashboard overview metrics
 */
cooperativeDashboardRouter.get("/overview", ...adminAuth, async (req, res, next) => {
  try {
    const cooperativeId = await getUserCooperative(req.user!.id, req.user!.role);
    if (!cooperativeId && req.user!.role !== "system_admin") {
      res.status(403).json({ error: "No cooperative access" });
      return;
    }

    const coopFilter = cooperativeId ? `AND w.cooperative_id = $1` : "";
    const params = cooperativeId ? [cooperativeId] : [];

    const [
      totalWorkers,
      verifiedWorkers,
      activeWorkers,
      totalBookings,
      completedJobs,
      pendingJobs,
      activeEmergencies,
      totalEarnings,
      avgRating
    ] = await Promise.all([
      pool.query(`SELECT count(*)::int as total FROM workers ${coopFilter ? `WHERE cooperative_id = $1` : ""}`, params),
      pool.query(`SELECT count(*)::int as total FROM workers WHERE verification_status = 'verified' ${coopFilter ? `AND cooperative_id = $1` : ""}`, params),
      pool.query(`SELECT count(*)::int as total FROM workers WHERE current_status = 'available' ${coopFilter ? `AND cooperative_id = $1` : ""}`, params),
      pool.query(`SELECT count(*)::int as total FROM bookings b JOIN workers w ON w.id = b.worker_id ${coopFilter ? `WHERE w.cooperative_id = $1` : ""}`, params),
      pool.query(`SELECT count(*)::int as total FROM bookings b JOIN workers w ON w.id = b.worker_id WHERE b.status = 'completed' ${coopFilter ? `AND w.cooperative_id = $1` : ""}`, params),
      pool.query(`SELECT count(*)::int as total FROM bookings b JOIN workers w ON w.id = b.worker_id WHERE b.status IN ('requested', 'matching', 'assigned', 'accepted', 'en_route', 'started') ${coopFilter ? `AND w.cooperative_id = $1` : ""}`, params),
      pool.query(`SELECT count(*)::int as total FROM emergency_bookings eb JOIN bookings b ON b.id = eb.booking_id JOIN workers w ON w.id = b.worker_id WHERE b.status NOT IN ('completed', 'cancelled') ${coopFilter ? `AND w.cooperative_id = $1` : ""}`, params),
      pool.query(`SELECT COALESCE(SUM(b.price), 0)::numeric(14,2) as total FROM bookings b JOIN workers w ON w.id = b.worker_id WHERE b.status = 'completed' ${coopFilter ? `AND w.cooperative_id = $1` : ""}`, params),
      pool.query(`SELECT AVG(w.rating)::numeric(2,1) as avg FROM workers w WHERE w.verification_status = 'verified' ${coopFilter ? `AND w.cooperative_id = $1` : ""}`, params),
    ]);

    res.json({
      overview: {
        totalWorkers: totalWorkers.rows[0].total,
        verifiedWorkers: verifiedWorkers.rows[0].total,
        activeWorkers: activeWorkers.rows[0].total,
        totalBookings: totalBookings.rows[0].total,
        completedJobs: completedJobs.rows[0].total,
        pendingJobs: pendingJobs.rows[0].total,
        activeEmergencyRequests: activeEmergencies.rows[0].total,
        totalEarnings: totalEarnings.rows[0].total,
        averageRating: avgRating.rows[0].avg ?? 0,
      },
    });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /admin/dashboard/workforce:
 *   get:
 *     summary: Get workforce details (workers, skills, certifications, workload)
 *     tags: [Cooperative Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - name: verificationStatus
 *         in: query
 *         schema: { type: string, enum: [pending, under_review, verified, rejected, suspended, expired] }
 *       - name: availability
 *         in: query
 *         schema: { type: string, enum: [available, busy, offline] }
 *     responses:
 *       200:
 *         description: Paginated workforce list
 */
cooperativeDashboardRouter.get("/workforce", ...adminAuth, async (req, res, next) => {
  try {
    const cooperativeId = await getUserCooperative(req.user!.id, req.user!.role);
    if (!cooperativeId && req.user!.role !== "system_admin") {
      res.status(403).json({ error: "No cooperative access" });
      return;
    }

    const query = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
      verificationStatus: z.enum(["pending", "under_review", "verified", "rejected", "suspended", "expired"]).optional(),
      availability: z.enum(["available", "busy", "offline"]).optional(),
      minRating: z.coerce.number().min(0).max(5).optional(),
    }).parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (cooperativeId) {
      conditions.push(`w.cooperative_id = $${index++}`);
      values.push(cooperativeId);
    }
    if (query.verificationStatus) {
      conditions.push(`w.verification_status = $${index++}`);
      values.push(query.verificationStatus);
    }
    if (query.availability) {
      conditions.push(`w.current_status = $${index++}`);
      values.push(query.availability);
    }
    if (query.minRating) {
      conditions.push(`w.rating >= $${index++}`);
      values.push(query.minRating);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query(
      `SELECT w.id, w.worker_code, w.verification_status, w.rating, w.current_status,
              w.experience_years, w.service_radius_km,
              u.name, u.phone, u.email, u.avatar_url,
              c.name as cooperative_name,
              COUNT(b.id) FILTER (WHERE b.status IN ('assigned', 'accepted', 'en_route', 'started')) as active_jobs,
              COUNT(b.id) FILTER (WHERE b.status = 'completed' AND b.created_at >= CURRENT_DATE - INTERVAL '30 days') as jobs_last_30_days,
              COALESCE(
                 (SELECT json_agg(json_build_object('skillId', ws.service_id, 'name', s.name, 'category', s.category, 'level', ws.level, 'verified', ws.verified))
                 FROM worker_skills ws
                 JOIN services s ON s.id = ws.service_id
                 WHERE ws.worker_id = w.id
                 LIMIT 10),
                '[]'::json
              ) as skills
       FROM workers w
       JOIN users u ON u.id = w.user_id
       LEFT JOIN cooperatives c ON c.id = w.cooperative_id
       LEFT JOIN bookings b ON b.worker_id = w.id
       ${whereClause}
       GROUP BY w.id, u.name, u.phone, u.email, u.avatar_url, c.name
       ORDER BY w.rating DESC NULLS LAST, w.verification_status
       LIMIT $${index++} OFFSET $${index}`,
      values
    );

    const countResult = await pool.query(
      `SELECT count(*)::int as total FROM workers w ${whereClause}`,
      values.slice(0, -2)
    );

    res.json({
      workers: result.rows,
      pagination: { page: query.page, limit: query.limit, total: countResult.rows[0].total },
    });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /admin/dashboard/operations:
 *   get:
 *     summary: Get current operations (bookings, jobs, complaints, emergencies)
 *     tags: [Cooperative Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Operations data
 */
cooperativeDashboardRouter.get("/operations", ...adminAuth, async (req, res, next) => {
  try {
    const cooperativeId = await getUserCooperative(req.user!.id, req.user!.role);
    if (!cooperativeId && req.user!.role !== "system_admin") {
      res.status(403).json({ error: "No cooperative access" });
      return;
    }

    const coopFilter = cooperativeId ? `AND w.cooperative_id = $1` : "";
    const params = cooperativeId ? [cooperativeId] : [];

    const [
      currentBookings,
      activeJobs,
      delayedJobs,
      complaints,
      emergencyRequests
    ] = await Promise.all([
      // Current bookings (not completed/cancelled)
      pool.query(
        `SELECT b.id, b.booking_number, b.status, b.scheduled_at as "scheduledAt", b.is_emergency as "isEmergency",
                b.address, b.description, b.price, b.created_at as "createdAt",
                s.name as service_name,
                w.id as worker_id, u.name as worker_name, u.phone as worker_phone,
                cu.name as customer_name, cu.phone as customer_phone
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         JOIN workers w ON w.id = b.worker_id
         JOIN users u ON u.id = w.user_id
         JOIN users cu ON cu.id = b.customer_id
         WHERE b.status NOT IN ('completed', 'cancelled', 'expired', 'refunded')
         ${coopFilter}
         ORDER BY b.created_at DESC
         LIMIT 50`,
        params
      ),
      // Active jobs (started)
      pool.query(
        `SELECT b.id, b.booking_number, b.started_at, b.address,
                s.name as service_name,
                w.id as worker_id, u.name as worker_name,
                EXTRACT(EPOCH FROM (NOW() - b.started_at))/60 as duration_minutes
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         JOIN workers w ON w.id = b.worker_id
         JOIN users u ON u.id = w.user_id
         WHERE b.status = 'started'
         ${coopFilter}
         ORDER BY b.started_at ASC`,
        params
      ),
      // Delayed jobs (assigned/accepted/en_route for > 30 min)
      pool.query(
        `SELECT b.id, b.booking_number, b.status, b.created_at,
                s.name as service_name,
                w.id as worker_id, u.name as worker_name,
                EXTRACT(EPOCH FROM (NOW() - b.created_at))/60 as minutes_pending
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         JOIN workers w ON w.id = b.worker_id
         JOIN users u ON u.id = w.user_id
         WHERE b.status IN ('requested', 'matching', 'assigned', 'accepted')
           AND b.created_at < NOW() - INTERVAL '30 minutes'
         ${coopFilter}
         ORDER BY b.created_at ASC`,
        params
      ),
      // Complaints
      pool.query(
        `SELECT c.id, c.status, c.description, c.created_at,
                b.id as booking_id, b.booking_number,
                cu.name as customer_name,
                w.id as worker_id, u.name as worker_name
         FROM complaints c
         JOIN bookings b ON b.id = c.booking_id
         JOIN workers w ON w.id = b.worker_id
         JOIN users u ON u.id = w.user_id
         JOIN users cu ON cu.id = c.raised_by
         WHERE c.status IN ('open', 'investigating')
         ${coopFilter}
         ORDER BY c.created_at DESC
         LIMIT 20`,
        params
      ),
      // Emergency requests
      pool.query(
        `SELECT b.id, b.booking_number, b.status, b.address, b.description, b.created_at,
                eb.priority, eb.radius_km, eb.max_response_minutes, eb.escalation_level,
                s.name as service_name,
                cu.name as customer_name, cu.phone as customer_phone
         FROM emergency_bookings eb
         JOIN bookings b ON b.id = eb.booking_id
         JOIN services s ON s.id = b.service_id
         JOIN users cu ON cu.id = b.customer_id
         JOIN workers w ON w.id = b.worker_id
         WHERE b.status NOT IN ('completed', 'cancelled')
         ${coopFilter}
         ORDER BY eb.priority DESC, b.created_at ASC`,
        params
      ),
    ]);

    res.json({
      currentBookings: currentBookings.rows,
      activeJobs: activeJobs.rows,
      delayedJobs: delayedJobs.rows,
      complaints: complaints.rows,
      emergencyRequests: emergencyRequests.rows,
    });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /admin/dashboard/analytics:
 *   get:
 *     summary: Get analytics (service demand, popular services, worker utilization, earnings)
 *     tags: [Cooperative Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Analytics data
 */
cooperativeDashboardRouter.get("/analytics", ...adminAuth, async (req, res, next) => {
  try {
    const cooperativeId = await getUserCooperative(req.user!.id, req.user!.role);
    if (!cooperativeId && req.user!.role !== "system_admin") {
      res.status(403).json({ error: "No cooperative access" });
      return;
    }

    const coopFilter = cooperativeId ? `AND w.cooperative_id = $1` : "";
    const params = cooperativeId ? [cooperativeId] : [];

    const [
      serviceDemand,
      popularServices,
      workerUtilization,
      areaDemand,
      earningsTrend
    ] = await Promise.all([
      // Service demand (last 30 days)
      pool.query(
        `SELECT s.id, s.name, s.category, COUNT(b.id) as demand
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         JOIN workers w ON w.id = b.worker_id
         WHERE b.created_at >= CURRENT_DATE - INTERVAL '30 days'
         ${coopFilter}
         GROUP BY s.id, s.name, s.category
         ORDER BY demand DESC`,
        params
      ),
      // Popular services
      pool.query(
        `SELECT s.id, s.name, s.category, COUNT(b.id) as total_bookings,
                COUNT(b.id) FILTER (WHERE b.status = 'completed') as completed,
                AVG(r.rating)::numeric(2,1) as avg_rating
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         JOIN workers w ON w.id = b.worker_id
         LEFT JOIN reviews r ON r.booking_id = b.id
         WHERE b.created_at >= CURRENT_DATE - INTERVAL '30 days'
         ${coopFilter}
         GROUP BY s.id, s.name, s.category
         ORDER BY total_bookings DESC
         LIMIT 20`,
        params
      ),
      // Worker utilization
      pool.query(
        `SELECT w.id, u.name, w.rating, w.current_status,
                COUNT(b.id) as total_assigned,
                COUNT(b.id) FILTER (WHERE b.status = 'completed') as completed,
                COUNT(b.id) FILTER (WHERE b.status = 'cancelled') as cancelled,
                COALESCE(SUM(b.price) FILTER (WHERE b.status = 'completed'), 0) as earnings
         FROM workers w
         JOIN users u ON u.id = w.user_id
         LEFT JOIN bookings b ON b.worker_id = w.id AND b.created_at >= CURRENT_DATE - INTERVAL '30 days'
         WHERE w.verification_status = 'verified'
         ${coopFilter}
         GROUP BY w.id, u.name, w.rating, w.current_status
         ORDER BY completed DESC`,
        params
      ),
      // Area-wise demand
      pool.query(
        `SELECT b.address as area, COUNT(*) as total_bookings,
                COUNT(*) FILTER (WHERE b.is_emergency) as emergency_count,
                COUNT(DISTINCT b.service_id) as unique_services
         FROM bookings b
         JOIN workers w ON w.id = b.worker_id
         WHERE b.created_at >= CURRENT_DATE - INTERVAL '30 days'
         ${coopFilter}
         GROUP BY b.address
         ORDER BY total_bookings DESC
         LIMIT 20`,
        params
      ),
      // Earnings trend (last 30 days)
      pool.query(
        `SELECT DATE_TRUNC('day', b.completed_at)::date as day,
                COUNT(*) as completed_jobs,
                COALESCE(SUM(b.price), 0) as daily_earnings
         FROM bookings b
         JOIN workers w ON w.id = b.worker_id
         WHERE b.status = 'completed'
           AND b.completed_at >= CURRENT_DATE - INTERVAL '30 days'
         ${coopFilter}
         GROUP BY 1
         ORDER BY 1 DESC`,
        params
      ),
    ]);

    res.json({
      serviceDemand: serviceDemand.rows,
      popularServices: popularServices.rows,
      workerUtilization: workerUtilization.rows,
      areaDemand: areaDemand.rows,
      earningsTrend: earningsTrend.rows,
    });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /admin/dashboard/area-demand:
 *   get:
 *     summary: Get area-wise demand breakdown
 *     tags: [Cooperative Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Area-wise demand data
 */
cooperativeDashboardRouter.get("/area-demand", ...adminAuth, async (req, res, next) => {
  try {
    const cooperativeId = await getUserCooperative(req.user!.id, req.user!.role);
    if (!cooperativeId && req.user!.role !== "system_admin") {
      res.status(403).json({ error: "No cooperative access" });
      return;
    }

    const coopFilter = cooperativeId ? `AND w.cooperative_id = $1` : "";
    const params = cooperativeId ? [cooperativeId] : [];

    const result = await pool.query(
      `SELECT b.address as area,
              COUNT(*) as total_requests,
              COUNT(*) FILTER (WHERE b.is_emergency) as emergency_requests,
              COUNT(DISTINCT b.service_id) as services_requested,
              COUNT(DISTINCT b.worker_id) as workers_needed,
              COUNT(*) FILTER (WHERE b.status = 'completed') as completed,
              COUNT(*) FILTER (WHERE b.status IN ('requested', 'matching')) as unassigned
       FROM bookings b
       JOIN workers w ON w.id = b.worker_id
       WHERE b.created_at >= CURRENT_DATE - INTERVAL '7 days'
       ${coopFilter}
       GROUP BY b.address
       ORDER BY total_requests DESC`,
      params
    );

    res.json({ areaDemand: result.rows });
  } catch (error) { next(error); }
});

async function getUserCooperative(userId: string, role: string): Promise<string | null> {
  if (role === "system_admin") return null;
  const result = await pool.query(
    `SELECT cooperative_id FROM admin_scopes WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0]?.cooperative_id ?? null;
}

export default cooperativeDashboardRouter;