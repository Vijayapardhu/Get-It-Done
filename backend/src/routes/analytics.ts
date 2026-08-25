import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

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

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
analyticsRouter.param("id", rejectNonUuidParam);

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

/**
 * @openapi
 * /analytics/cooperative/{id}:
 *   get:
 *     summary: Local demand, response times and revenue for one society
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: days
 *         in: query
 *         schema: { type: integer, default: 30, minimum: 1, maximum: 365 }
 *     responses:
 *       200: { description: Cooperative analytics }
 *       403: { description: Outside the caller's administrative scope }
 *       404: { description: Cooperative not found }
 */
analyticsRouter.get(
  "/cooperative/:id",
  requireAuth,
  requireRoles("system_admin", "federation_admin", "society_admin", "support_staff"),
  async (req, res, next) => {
    try {
      const cooperativeId = String(req.params.id);
      const days = Math.min(Math.max(parseInt(String(req.query.days ?? 30), 10) || 30, 1), 365);

      const cooperative = await pool.query(
        `select c.id, c.name, c.federation_id, f.name as federation_name
           from cooperatives c
           left join federations f on f.id = c.federation_id
          where c.id = $1`,
        [cooperativeId]
      );
      if (!cooperative.rows[0]) { res.status(404).json({ error: "Cooperative not found" }); return; }

      // A society admin may only read their own society.
      if (req.user!.role === "society_admin") {
        const scope = await pool.query(
          "select 1 from admin_scopes where user_id = $1 and cooperative_id = $2",
          [req.user!.id, cooperativeId]
        );
        if (!scope.rows[0]) { res.status(403).json({ error: "Outside your administrative scope" }); return; }
      }

      const window = `$2 || ' days'`;
      const [workforce, demand, responsiveness, revenue, topServices] = await Promise.all([
        pool.query(
          `select count(*)::int                                                as total_workers,
                  count(*) filter (where verification_status = 'verified')::int as verified_workers,
                  count(*) filter (where current_status = 'available')::int     as available_now,
                  round(avg(rating)::numeric, 2)::float8                        as average_rating
             from workers where cooperative_id = $1`,
          [cooperativeId]
        ),
        pool.query(
          `select count(*)::int                                            as total_bookings,
                  count(*) filter (where b.status = 'completed')::int      as completed,
                  count(*) filter (where b.status = 'cancelled')::int      as cancelled,
                  count(*) filter (where b.is_emergency)::int              as emergency
             from bookings b
             join workers w on w.id = b.worker_id
            where w.cooperative_id = $1
              and b.created_at >= now() - (${window})::interval`,
          [cooperativeId, String(days)]
        ),
        pool.query(
          `select round(avg(extract(epoch from (assigned.created_at - b.created_at)) / 60)::numeric, 1)::float8 as avg_assign_minutes,
                  round(avg(extract(epoch from (done.created_at - b.created_at)) / 60)::numeric, 1)::float8     as avg_completion_minutes
             from bookings b
             join workers w on w.id = b.worker_id
             left join lateral (
               select min(created_at) as created_at from booking_status_events
                where booking_id = b.id and status = 'assigned'
             ) assigned on true
             left join lateral (
               select min(created_at) as created_at from booking_status_events
                where booking_id = b.id and status = 'completed'
             ) done on true
            where w.cooperative_id = $1
              and b.created_at >= now() - (${window})::interval`,
          [cooperativeId, String(days)]
        ),
        pool.query(
          `select coalesce(sum(i.subtotal), 0)::float8          as gross_revenue,
                  coalesce(sum(i.cooperative_share), 0)::float8 as cooperative_share,
                  coalesce(sum(i.worker_share), 0)::float8      as worker_share,
                  coalesce(sum(i.platform_fee), 0)::float8      as platform_fee,
                  coalesce(sum(i.welfare_fund), 0)::float8      as welfare_fund
             from invoices i
             join workers w on w.id = i.worker_id
            where w.cooperative_id = $1
              and i.issued_at >= now() - (${window})::interval`,
          [cooperativeId, String(days)]
        ),
        pool.query(
          `select s.id, s.name, count(*)::int as bookings
             from bookings b
             join workers w on w.id = b.worker_id
             join services s on s.id = b.service_id
            where w.cooperative_id = $1
              and b.created_at >= now() - (${window})::interval
            group by s.id, s.name
            order by bookings desc
            limit 10`,
          [cooperativeId, String(days)]
        ),
      ]);

      const d = demand.rows[0];
      const total = Number(d.total_bookings ?? 0);

      res.json({
        cooperative: cooperative.rows[0],
        windowDays: days,
        workforce: workforce.rows[0],
        demand: {
          ...d,
          // Guard the divide: a society with no bookings has no rate to report.
          completionRate: total > 0 ? Math.round((Number(d.completed) / total) * 1000) / 10 : null,
          cancellationRate: total > 0 ? Math.round((Number(d.cancelled) / total) * 1000) / 10 : null,
        },
        responsiveness: responsiveness.rows[0],
        revenue: revenue.rows[0],
        topServices: topServices.rows,
      });
    } catch (error) { next(error); }
  }
);

/**
 * @openapi
 * /analytics/federation:
 *   get:
 *     summary: Cross-society benchmark metrics for a federation
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: federationId
 *         in: query
 *         description: Defaults to the caller's own federation scope.
 *         schema: { type: string, format: uuid }
 *       - name: days
 *         in: query
 *         schema: { type: integer, default: 30, minimum: 1, maximum: 365 }
 *     responses:
 *       200: { description: Federation benchmark }
 *       403: { description: Outside the caller's administrative scope }
 */
analyticsRouter.get(
  "/federation",
  requireAuth,
  requireRoles("system_admin", "federation_admin"),
  async (req, res, next) => {
    try {
      const days = Math.min(Math.max(parseInt(String(req.query.days ?? 30), 10) || 30, 1), 365);
      let federationId = typeof req.query.federationId === "string" ? req.query.federationId : undefined;

      if (req.user!.role === "federation_admin") {
        const scope = await pool.query("select federation_id from admin_scopes where user_id = $1", [req.user!.id]);
        const scoped = scope.rows[0]?.federation_id;
        if (!scoped) { res.status(403).json({ error: "NO_ADMIN_SCOPE" }); return; }
        if (federationId && federationId !== scoped) { res.status(403).json({ error: "OUT_OF_SCOPE" }); return; }
        federationId = scoped;
      }

      const filter = federationId ? "where c.federation_id = $2" : "";
      const values: unknown[] = federationId ? [String(days), federationId] : [String(days)];

      // One row per society, so the federation can rank and compare them.
      const societies = await pool.query(
        `select c.id,
                c.name,
                c.federation_id,
                count(distinct w.id)::int                                     as workers,
                count(distinct w.id) filter (where w.verification_status = 'verified')::int as verified_workers,
                count(b.id)::int                                              as bookings,
                count(b.id) filter (where b.status = 'completed')::int        as completed,
                count(b.id) filter (where b.status = 'cancelled')::int        as cancelled,
                round(avg(w.rating)::numeric, 2)::float8                      as average_rating,
                coalesce(sum(i.subtotal), 0)::float8                          as gross_revenue,
                coalesce(sum(i.welfare_fund), 0)::float8                      as welfare_fund
           from cooperatives c
           left join workers w on w.cooperative_id = c.id
           left join bookings b on b.worker_id = w.id and b.created_at >= now() - ($1 || ' days')::interval
           left join invoices i on i.booking_id = b.id
           ${filter}
          group by c.id, c.name, c.federation_id
          order by bookings desc, c.name`,
        values
      );

      const totals = societies.rows.reduce(
        (acc, row) => ({
          societies: acc.societies + 1,
          workers: acc.workers + Number(row.workers ?? 0),
          bookings: acc.bookings + Number(row.bookings ?? 0),
          completed: acc.completed + Number(row.completed ?? 0),
          grossRevenue: acc.grossRevenue + Number(row.gross_revenue ?? 0),
          welfareFund: acc.welfareFund + Number(row.welfare_fund ?? 0),
        }),
        { societies: 0, workers: 0, bookings: 0, completed: 0, grossRevenue: 0, welfareFund: 0 }
      );

      res.json({
        federationId: federationId ?? null,
        windowDays: days,
        totals: {
          ...totals,
          completionRate:
            totals.bookings > 0 ? Math.round((totals.completed / totals.bookings) * 1000) / 10 : null,
        },
        societies: societies.rows,
      });
    } catch (error) { next(error); }
  }
);

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