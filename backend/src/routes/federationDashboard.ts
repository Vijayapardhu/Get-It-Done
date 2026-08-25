import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";

export const federationDashboardRouter = Router();

// All routes require federation_admin or system_admin
const fedAuth = [requireAuth, requireRoles("federation_admin", "system_admin")] as const;

/**
 * @openapi
 * /admin/federation/overview:
 *   get:
 *     summary: Get federation dashboard overview
 *     tags: [Federation Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Federation overview metrics
 */
federationDashboardRouter.get("/overview", ...fedAuth, async (req, res, next) => {
  try {
    const federationId = await getUserFederation(req.user!.id, req.user!.role);
    if (!federationId && req.user!.role !== "system_admin") {
      res.status(403).json({ error: "No federation access" });
      return;
    }

    const fedFilter = federationId ? `AND c.federation_id = $1` : "";
    const params = federationId ? [federationId] : [];

    const [
      totalSocieties,
      totalWorkers,
      totalCustomers,
      totalBookings,
      totalEarnings,
      activeEmergencies,
      workerUtilization,
      welfareStats
    ] = await Promise.all([
      pool.query(`SELECT count(*)::int as total FROM cooperatives ${fedFilter ? `WHERE federation_id = $1` : ""}`, params),
      pool.query(`SELECT count(*)::int as total FROM workers w JOIN cooperatives c ON c.id = w.cooperative_id WHERE w.verification_status = 'verified' ${fedFilter}`, params),
      pool.query(`SELECT count(*)::int as total FROM users WHERE role = 'customer'`),
      pool.query(`SELECT count(*)::int as total FROM bookings b JOIN workers w ON w.id = b.worker_id JOIN cooperatives c ON c.id = w.cooperative_id ${fedFilter}`, params),
      pool.query(`SELECT COALESCE(SUM(b.price), 0)::numeric(14,2) as total FROM bookings b JOIN workers w ON w.id = b.worker_id JOIN cooperatives c ON c.id = w.cooperative_id WHERE b.status = 'completed' ${fedFilter}`, params),
      pool.query(`SELECT count(*)::int as total FROM emergency_bookings eb JOIN bookings b ON b.id = eb.booking_id JOIN workers w ON w.id = b.worker_id JOIN cooperatives c ON c.id = w.cooperative_id WHERE b.status NOT IN ('completed', 'cancelled') ${fedFilter}`, params),
      pool.query(
        `SELECT 
           COUNT(DISTINCT w.id) as total_verified,
           COUNT(DISTINCT job_counts.worker_id) as workers_with_jobs,
           AVG(job_counts.jobs)::numeric(4,2) as avg_jobs_per_worker,
           STDDEV(job_counts.jobs)::numeric(4,2) as stddev_jobs
         FROM workers w
         JOIN cooperatives c ON c.id = w.cooperative_id
         LEFT JOIN (
           SELECT worker_id, COUNT(*) as jobs
           FROM bookings
           WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '30 days'
           GROUP BY worker_id
         ) job_counts ON job_counts.worker_id = w.id
         WHERE w.verification_status = 'verified'
         ${fedFilter}`,
        params
      ),
      pool.query(
        `SELECT 
           COUNT(DISTINCT w.id) as total_workers,
           COUNT(DISTINCT it.worker_id) FILTER (WHERE it.status = 'active') as insured_workers,
           COUNT(DISTINCT tr.worker_id) FILTER (WHERE tr.status = 'completed') as trained_workers,
           COUNT(DISTINCT si.worker_id) FILTER (WHERE si.severity IN ('high', 'critical')) as critical_incidents
         FROM workers w
         JOIN cooperatives c ON c.id = w.cooperative_id
         LEFT JOIN worker_insurance_records it ON it.worker_id = w.id
         LEFT JOIN worker_training_records tr ON tr.worker_id = w.id
         LEFT JOIN safety_incidents si ON si.worker_id = w.id
         ${fedFilter}`,
        params
      ),
    ]);

    res.json({
      overview: {
        totalSocieties: totalSocieties.rows[0].total,
        totalWorkers: totalWorkers.rows[0].total,
        totalCustomers: totalCustomers.rows[0].total,
        totalBookings: totalBookings.rows[0].total,
        totalEarnings: totalEarnings.rows[0].total,
        activeEmergencyRequests: activeEmergencies.rows[0].total,
        workerUtilization: workerUtilization.rows[0],
        welfare: welfareStats.rows[0],
      },
    });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /admin/federation/regional-demand:
 *   get:
 *     summary: Get regional demand analytics across societies
 *     tags: [Federation Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Regional demand data
 */
federationDashboardRouter.get("/regional-demand", ...fedAuth, async (req, res, next) => {
  try {
    const federationId = await getUserFederation(req.user!.id, req.user!.role);
    if (!federationId && req.user!.role !== "system_admin") {
      res.status(403).json({ error: "No federation access" });
      return;
    }

    const fedFilter = federationId ? `AND c.federation_id = $1` : "";
    const params = federationId ? [federationId] : [];

    const result = await pool.query(
      `SELECT c.id as cooperative_id, c.name as cooperative_name, c.district, c.state,
              COUNT(DISTINCT b.id) as total_bookings,
              COUNT(DISTINCT b.id) FILTER (WHERE b.is_emergency) as emergency_bookings,
              COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'completed') as completed,
              COUNT(DISTINCT b.id) FILTER (WHERE b.status IN ('requested', 'matching')) as unassigned,
              COUNT(DISTINCT w.id) as total_workers,
              COUNT(DISTINCT w.id) FILTER (WHERE w.verification_status = 'verified') as verified_workers,
              COUNT(DISTINCT w.id) FILTER (WHERE w.current_status = 'available') as available_workers,
              COALESCE(SUM(b.price) FILTER (WHERE b.status = 'completed'), 0) as earnings
       FROM cooperatives c
       LEFT JOIN workers w ON w.cooperative_id = c.id
       LEFT JOIN bookings b ON b.worker_id = w.id AND b.created_at >= NOW() - INTERVAL '30 days'
       ${federationId ? "WHERE c.federation_id = $1" : ""}
       GROUP BY c.id, c.name, c.district, c.state
       ORDER BY total_bookings DESC`,
      params
    );

    res.json({ regionalDemand: result.rows });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /admin/federation/ai-forecasts:
 *   get:
 *     summary: Get AI demand forecasts across societies
 *     tags: [Federation Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: AI forecasts
 */
federationDashboardRouter.get("/ai-forecasts", ...fedAuth, async (req, res, next) => {
  try {
    const federationId = await getUserFederation(req.user!.id, req.user!.role);
    if (!federationId && req.user!.role !== "system_admin") {
      res.status(403).json({ error: "No federation access" });
      return;
    }

    // Get persisted AI recommendations for this federation
    const fedFilter = federationId ? `AND c.federation_id = $1` : "";
    const params = federationId ? [federationId] : [];

    const result = await pool.query(
      `SELECT arr.*, s.name as service_name, c.name as cooperative_name, c.district, c.state
       FROM ai_recommendation_records arr
       LEFT JOIN services s ON s.id = arr.service_id
       LEFT JOIN cooperatives c ON c.id = (
         SELECT cooperative_id FROM workers WHERE id = (
           SELECT worker_id FROM bookings WHERE service_id = arr.service_id LIMIT 1
         )
       )
       WHERE arr.status IN ('pending', 'approved')
       ${fedFilter}
       ORDER BY arr.created_at DESC
       LIMIT 50`,
      params
    );

    // Also get demand forecast from AI service
    const forecasts = await getDemandForecasts(federationId);

    res.json({
      recommendations: result.rows,
      forecasts,
    });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /admin/federation/society-performance:
 *   get:
 *     summary: Get society performance comparison
 *     tags: [Federation Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Society performance data
 */
federationDashboardRouter.get("/society-performance", ...fedAuth, async (req, res, next) => {
  try {
    const federationId = await getUserFederation(req.user!.id, req.user!.role);
    if (!federationId && req.user!.role !== "system_admin") {
      res.status(403).json({ error: "No federation access" });
      return;
    }

    const fedFilter = federationId ? `AND c.federation_id = $1` : "";
    const params = federationId ? [federationId] : [];

    const result = await pool.query(
      `SELECT c.id, c.name, c.code, c.district, c.state, c.commission_rate,
              COUNT(DISTINCT w.id) as total_workers,
              COUNT(DISTINCT w.id) FILTER (WHERE w.verification_status = 'verified') as verified_workers,
              COUNT(DISTINCT w.id) FILTER (WHERE w.current_status = 'available') as available_workers,
              COUNT(DISTINCT b.id) FILTER (WHERE b.created_at >= NOW() - INTERVAL '30 days') as bookings_last_30d,
              COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'completed' AND b.created_at >= NOW() - INTERVAL '30 days') as completed_last_30d,
              COALESCE(SUM(b.price) FILTER (WHERE b.status = 'completed' AND b.created_at >= NOW() - INTERVAL '30 days'), 0) as earnings_last_30d,
              AVG(w.rating)::numeric(2,1) as avg_worker_rating,
              COUNT(DISTINCT r.id) FILTER (WHERE r.rating <= 2) as negative_reviews,
              COUNT(DISTINCT cm.user_id) as admin_count
       FROM cooperatives c
       LEFT JOIN workers w ON w.cooperative_id = c.id
       LEFT JOIN bookings b ON b.worker_id = w.id
       LEFT JOIN reviews r ON r.booking_id = b.id
       LEFT JOIN cooperative_members cm ON cm.cooperative_id = c.id AND cm.role IN ('admin', 'supervisor')
       ${federationId ? "WHERE c.federation_id = $1" : ""}
       GROUP BY c.id, c.name, c.code, c.district, c.state, c.commission_rate
       ORDER BY bookings_last_30d DESC`,
      params
    );

    res.json({ societyPerformance: result.rows });
  } catch (error) { next(error); }
});

async function getUserFederation(userId: string, role: string): Promise<string | null> {
  if (role === "system_admin") return null;
  const result = await pool.query(
    `SELECT federation_id FROM admin_scopes WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0]?.federation_id ?? null;
}

async function getDemandForecasts(federationId: string | null): Promise<any[]> {
  try {
    const fedFilter = federationId ? `AND c.federation_id = $1` : "";
    const params = federationId ? [federationId] : [];

    // Get recent booking history for AI forecast
    const history = await pool.query(
      `SELECT DATE_TRUNC('day', b.created_at)::date as date,
              b.address as area,
              s.name as service,
              COUNT(*)::int as requests
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       JOIN workers w ON w.id = b.worker_id
       JOIN cooperatives c ON c.id = w.cooperative_id
       WHERE b.created_at >= CURRENT_DATE - INTERVAL '90 days'
       ${fedFilter}
       GROUP BY DATE_TRUNC('day', b.created_at), b.address, s.name
       ORDER BY date`,
      params
    );

    // Call AI service if available
    const env = (await import("../config/env.js")).env;
    if (env.AI_SERVICE_URL) {
      try {
        const response = await fetch(`${env.AI_SERVICE_URL}/forecast/demand`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ days: 7, history: history.rows }),
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) {
          return (await response.json()).predictions ?? [];
        }
      } catch (e) {
        console.warn("AI service unavailable for forecasts:", e);
      }
    }

    return [];
  } catch (error) {
    console.error("Error getting demand forecasts:", error);
    return [];
  }
}

export default federationDashboardRouter;