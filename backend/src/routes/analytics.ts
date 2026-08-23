import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";

/**
 * @openapi
 * /analytics/overview:
 *   get:
 *     summary: Get analytics overview
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Overview metrics }
 * /analytics/bookings:
 *   get:
 *     summary: Get bookings analytics
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: fromDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: toDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: serviceId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: cooperativeId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: area
 *         in: query
 *         schema: { type: string }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *       - name: offset
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Bookings analytics }
 * /analytics/workers:
 *   get:
 *     summary: Get workers analytics
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: fromDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: toDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: serviceId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: cooperativeId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: area
 *         in: query
 *         schema: { type: string }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *       - name: offset
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Workers analytics }
 * /analytics/revenue:
 *   get:
 *     summary: Get revenue analytics
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: fromDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: toDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: serviceId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: cooperativeId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: area
 *         in: query
 *         schema: { type: string }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *       - name: offset
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Revenue analytics }
 * /analytics/services:
 *   get:
 *     summary: Get services analytics
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Services analytics }
 * /analytics/geography:
 *   get:
 *     summary: Get geography analytics
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Geography analytics }
 * /analytics/customer-satisfaction:
 *   get:
 *     summary: Get customer satisfaction analytics
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Customer satisfaction analytics }
 * /analytics/welfare:
 *   get:
 *     summary: Get welfare analytics
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Welfare analytics }
 * /analytics/fairness:
 *   get:
 *     summary: Get fairness analytics
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Fairness analytics }
 * /analytics/refresh:
 *   post:
 *     summary: Refresh analytics views (system_admin)
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Views refreshed }
 */

export const analyticsRouter = Router();

const analyticsQuerySchema = z.object({
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  serviceId: z.string().uuid().optional(),
  cooperativeId: z.string().uuid().optional(),
  area: z.string().optional(),
  limit: z.coerce.number().int().positive().max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

function addMeta(period: string) {
  return {
    period,
    comparison: "previous_period",
    dataFreshness: new Date().toISOString(),
    calculationVersion: "1.0",
  };
}

analyticsRouter.get("/overview", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const [totalWorkers, totalBookings, activeEmergency, revenue, avgRating] = await Promise.all([
      pool.query("select count(*)::int as total from workers where verification_status = 'verified'"),
      pool.query("select count(*)::int as total from bookings"),
      pool.query("select count(*)::int as total from bookings where is_emergency = true and status not in ('completed', 'cancelled')"),
      pool.query("select sum(amount)::numeric(14,2) as total from payment_orders where status = 'paid'"),
      pool.query("select avg(rating)::numeric(2,1) as avg from reviews"),
    ]);

    res.json({
      overview: {
        totalVerifiedWorkers: totalWorkers.rows[0].total,
        totalBookings: totalBookings.rows[0].total,
        activeEmergencyRequests: activeEmergency.rows[0].total,
        totalRevenue: revenue.rows[0].total ?? 0,
        averageRating: avgRating.rows[0].avg ?? 0,
      },
      meta: addMeta("all_time"),
    });
  } catch (error) { next(error); }
});

analyticsRouter.get("/bookings", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const query = analyticsQuerySchema.parse(req.query);
    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.fromDate) { conditions.push(`day >= $${index++}`); values.push(query.fromDate); }
    if (query.toDate) { conditions.push(`day <= $${index++}`); values.push(query.toDate); }
    if (query.serviceId) { conditions.push(`service_id = $${index++}`); values.push(query.serviceId); }
    if (query.cooperativeId) {
      conditions.push(`service_id in (select id from services where id in (select service_id from worker_service_areas where worker_id in (select id from workers where cooperative_id = $${index++})))`);
      values.push(query.cooperativeId);
    }
    if (query.area) { conditions.push(`area = $${index++}`); values.push(query.area); }

    const whereClause = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    values.push(query.limit, query.offset);

    const result = await pool.query(`select * from mv_booking_stats ${whereClause} order by day desc, total_bookings desc limit $${index++} offset $${index}`, values);

    res.json({
      bookings: result.rows,
      meta: addMeta(`${query.fromDate ?? "all"} to ${query.toDate ?? "now"}`),
      pagination: { limit: query.limit, offset: query.offset },
    });
  } catch (error) { next(error); }
});

analyticsRouter.get("/workers", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const query = analyticsQuerySchema.parse(req.query);
    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.cooperativeId) { conditions.push(`user_id in (select id from workers where cooperative_id = $${index++})`); values.push(query.cooperativeId); }

    const whereClause = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    values.push(query.limit, query.offset);

    const result = await pool.query(`select * from mv_worker_performance ${whereClause} order by completed_jobs desc nulls last limit $${index++} offset $${index}`, values);

    res.json({
      workers: result.rows,
      meta: addMeta("last_30_days"),
      pagination: { limit: query.limit, offset: query.offset },
    });
  } catch (error) { next(error); }
});

analyticsRouter.get("/revenue", requireAuth, requireRoles("system_admin", "federation_admin", "support_staff"), async (req, res, next) => {
  try {
    const query = analyticsQuerySchema.parse(req.query);
    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.fromDate) { conditions.push(`day >= $${index++}`); values.push(query.fromDate); }
    if (query.toDate) { conditions.push(`day <= $${index++}`); values.push(query.toDate); }

    const whereClause = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    values.push(query.limit, query.offset);

    const result = await pool.query(`select * from mv_revenue ${whereClause} order by day desc limit $${index++} offset $${index}`, values);

    res.json({
      revenue: result.rows,
      meta: addMeta(`${query.fromDate ?? "all"} to ${query.toDate ?? "now"}`),
      pagination: { limit: query.limit, offset: query.offset },
    });
  } catch (error) { next(error); }
});

analyticsRouter.get("/services", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`
      select s.id, s.name, s.category, s.base_price,
        count(b.id) as total_bookings,
        count(b.id) filter (where b.status = 'completed') as completed_bookings,
        avg(r.rating)::numeric(2,1) as avg_rating
      from services s
      left join bookings b on b.service_id = s.id
      left join reviews r on r.booking_id = b.id
      group by s.id
      order by total_bookings desc
    `);

    res.json({
      services: result.rows,
      meta: addMeta("all_time"),
    });
  } catch (error) { next(error); }
});

analyticsRouter.get("/geography", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`select * from mv_geography order by total_bookings desc limit 100`);
    res.json({
      geography: result.rows,
      meta: addMeta("last_30_days"),
    });
  } catch (error) { next(error); }
});

analyticsRouter.get("/customer-satisfaction", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"), async (req, res, next) => {
  try {
    const result = await pool.query(`select * from mv_customer_satisfaction order by week_start desc limit 52`);
    res.json({
      satisfaction: result.rows,
      meta: addMeta("last_52_weeks"),
    });
  } catch (error) { next(error); }
});

analyticsRouter.get("/welfare", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`select * from mv_welfare order by verified_workers desc`);
    res.json({
      welfare: result.rows,
      meta: addMeta("current"),
    });
  } catch (error) { next(error); }
});

analyticsRouter.get("/fairness", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const result = await pool.query(`select * from mv_fairness order by workers desc`);
    res.json({
      fairness: result.rows,
      meta: addMeta("last_30_days"),
    });
  } catch (error) { next(error); }
});

analyticsRouter.post("/refresh", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    await pool.query(`select refresh_analytics_views()`);
    res.json({ message: "Analytics views refreshed" });
  } catch (error) { next(error); }
});