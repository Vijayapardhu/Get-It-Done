import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

export const customerDashboardRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
customerDashboardRouter.param("id", rejectNonUuidParam);
customerDashboardRouter.param("workerId", rejectNonUuidParam);

const addFavoriteSchema = z.object({
  workerId: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

const removeFavoriteSchema = z.object({
  workerId: z.string().uuid(),
});

async function getDashboardData(req: Request, res: Response, next: NextFunction) {
  try {
    if (!["customer", "institutional_customer"].includes(req.user!.role)) {
      res.status(403).json({ error: "Only customers can access this dashboard" });
      return;
    }

    const [upcomingBookings, recentBookings, favorites, notifications] = await Promise.all([
      pool.query(
        `SELECT b.id, b.status, b.scheduled_at as "scheduledAt", b.address, b.description, b.is_emergency as "isEmergency",
                s.name as service_name, s.category,
                w.id as worker_id, u.name as worker_name, u.phone as worker_phone,
                wl.location
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         LEFT JOIN workers w ON w.id = b.worker_id
         LEFT JOIN users u ON u.id = w.user_id
         LEFT JOIN worker_locations wl ON wl.worker_id = w.id
         WHERE b.customer_id = $1
           AND b.status IN ('requested', 'matching', 'assigned', 'accepted', 'en_route', 'started')
         ORDER BY b.scheduled_at ASC NULLS FIRST, b.created_at ASC
         LIMIT 5`,
        [req.user!.id]
      ),
      pool.query(
        `SELECT b.id, b.status, b.completion_verified_at as "completedAt", b.address, b.price,
                s.name as service_name,
                w.id as worker_id, u.name as worker_name,
                r.rating, r.feedback
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         LEFT JOIN workers w ON w.id = b.worker_id
         LEFT JOIN users u ON u.id = w.user_id
         LEFT JOIN reviews r ON r.booking_id = b.id
         WHERE b.customer_id = $1
           AND b.status IN ('completed', 'cancelled')
         ORDER BY b.updated_at DESC
         LIMIT 10`,
        [req.user!.id]
      ),
      pool.query(
        `SELECT cf.worker_id as "workerId", cf.notes, cf.created_at as "createdAt",
                u.name, u.avatar_url as "avatarUrl",
                w.rating, w.verification_status as "verificationStatus",
                w.current_status as "currentStatus"
         FROM customer_favorites cf
         JOIN workers w ON w.id = cf.worker_id
         JOIN users u ON u.id = w.user_id
         WHERE cf.customer_id = $1
         ORDER BY cf.created_at DESC
         LIMIT 20`,
        [req.user!.id]
      ),
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
      upcomingBookings: upcomingBookings.rows,
      recentBookings: recentBookings.rows,
      favorites: favorites.rows,
      notifications: notifications.rows,
    });
  } catch (error) { next(error); }
}

/**
 * @openapi
 * /customer/dashboard:
 *   get:
 *     summary: Get customer dashboard overview
 *     tags: [Customer Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Customer dashboard data
 */
customerDashboardRouter.get("/", requireAuth, getDashboardData);
customerDashboardRouter.get("/dashboard", requireAuth, getDashboardData);

/**
 * @openapi
 * /customer/bookings/{id}/track:
 *   get:
 *     summary: Track booking with real-time worker location
 *     tags: [Customer Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Booking tracking data
 *       404:
 *         description: Booking not found
 */
customerDashboardRouter.get("/bookings/:id/track", requireAuth, async (req, res, next) => {
  try {
    const booking = await pool.query(
      `SELECT b.*, s.name as service_name, s.category,
              w.id as worker_id, u.name as worker_name, u.phone as worker_phone, u.avatar_url as worker_avatar,
              ST_Y(wl.location::geometry) as worker_lat, ST_X(wl.location::geometry) as worker_lng,
              wl.updated_at as location_updated_at
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       LEFT JOIN workers w ON w.id = b.worker_id
       LEFT JOIN users u ON u.id = w.user_id
       LEFT JOIN worker_locations wl ON wl.worker_id = w.id
       WHERE b.id = $1 AND b.customer_id = $2`,
      [req.params.id, req.user!.id]
    );

    if (!booking.rows[0]) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    const b = booking.rows[0];
    
    // Calculate ETA if worker has location
    let etaMinutes: number | null = null;
    let distanceKm: number | null = null;
    if (b.worker_lat != null && b.worker_lng != null) {
      const distResult = await pool.query(
        `SELECT ST_Distance(b.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) / 1000 as distance_km
         FROM bookings b WHERE b.id = $3`,
        [b.worker_lat, b.worker_lng, req.params.id]
      );
      distanceKm = distResult.rows[0]?.distance_km != null ? Number(distResult.rows[0].distance_km) : null;
      // Rough ETA: assume 30 km/h average speed in city
      if (distanceKm != null) etaMinutes = Math.round((distanceKm / 30) * 60);
    }

    // Get status timeline
    const timeline = await pool.query(
      `SELECT bse.status, bse.created_at as "timestamp", u.name as actor_name, bse.reason
       FROM booking_status_events bse
       LEFT JOIN users u ON u.id = bse.actor_id
       WHERE bse.booking_id = $1
       ORDER BY bse.created_at ASC`,
      [req.params.id]
    );

    res.json({
      booking: {
        id: b.id,
        status: b.status,
        scheduledAt: b.scheduled_at,
        address: b.address,
        description: b.description,
        isEmergency: b.is_emergency,
        serviceName: b.service_name,
        serviceCategory: b.category,
      },
      worker: b.worker_id ? {
        id: b.worker_id,
        name: b.worker_name,
        phone: b.worker_phone,
        avatarUrl: b.worker_avatar,
        location: b.worker_lat != null && b.worker_lng != null ? {
          type: "Point",
          coordinates: [b.worker_lng, b.worker_lat]
        } : null,
        locationUpdatedAt: b.location_updated_at,
      } : null,
      tracking: {
        distanceKm,
        etaMinutes,
        status: b.status,
      },
      timeline: timeline.rows,
    });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /customer/favorites:
 *   get:
 *     summary: List customer's favorite workers
 *     tags: [Customer Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: List of favorite workers
 */
customerDashboardRouter.get("/favorites", requireAuth, async (req, res, next) => {
  try {
    if (!["customer", "institutional_customer"].includes(req.user!.role)) {
      res.status(403).json({ error: "Only customers can access favorites" });
      return;
    }

    const page = Math.max(parseInt(String(req.query.page ?? 1)), 1);
    const limit = Math.min(parseInt(String(req.query.limit ?? 20)), 50);
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT cf.worker_id as "workerId", cf.notes, cf.created_at as "createdAt",
              u.name, u.avatar_url as "avatarUrl",
              w.rating, w.verification_status as "verificationStatus",
              w.current_status as "currentStatus",
              COALESCE(
                (SELECT json_agg(json_build_object('serviceId', ws.service_id, 'name', s.name, 'category', s.category))
                 FROM worker_skills ws
                 JOIN services s ON s.id = ws.service_id
                 WHERE ws.worker_id = w.id
                 LIMIT 5),
                '[]'::json
              ) as skills
       FROM customer_favorites cf
       JOIN workers w ON w.id = cf.worker_id
       JOIN users u ON u.id = w.user_id
       WHERE cf.customer_id = $1
       ORDER BY cf.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user!.id, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT count(*)::int as total FROM customer_favorites WHERE customer_id = $1`,
      [req.user!.id]
    );

    res.json({
      favorites: result.rows,
      pagination: { page, limit, total: countResult.rows[0].total },
    });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /customer/favorites:
 *   post:
 *     summary: Add worker to favorites
 *     tags: [Customer Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [workerId]
 *             properties:
 *               workerId: { type: string, format: uuid }
 *               notes: { type: string, maxLength: 500 }
 *     responses:
 *       201:
 *         description: Worker added to favorites
 *       409:
 *         description: Already in favorites
 */
customerDashboardRouter.post("/favorites", requireAuth, async (req, res, next) => {
  try {
    if (!["customer", "institutional_customer"].includes(req.user!.role)) {
      res.status(403).json({ error: "Only customers can add favorites" });
      return;
    }

    const input = addFavoriteSchema.parse(req.body);

    // Verify worker exists
    const worker = await pool.query("SELECT id FROM workers WHERE id = $1", [input.workerId]);
    if (!worker.rows[0]) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }

    const result = await pool.query(
      `INSERT INTO customer_favorites (customer_id, worker_id, notes)
       VALUES ($1, $2, $3)
       ON CONFLICT (customer_id, worker_id) DO UPDATE SET notes = EXCLUDED.notes
       RETURNING *`,
      [req.user!.id, input.workerId, input.notes ?? null]
    );

    await recordAuditEvent({
      actorId: req.user!.id,
      action: "favorite.added",
      resourceType: "customer_favorite",
      resourceId: input.workerId,
      requestId: req.header("x-request-id"),
      metadata: { workerId: input.workerId }
    }).catch(() => undefined);

    res.status(201).json({ favorite: result.rows[0] });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /customer/favorites/{workerId}:
 *   delete:
 *     summary: Remove worker from favorites
 *     tags: [Customer Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Worker removed from favorites
 *       404:
 *         description: Favorite not found
 */
customerDashboardRouter.delete("/favorites/:workerId", requireAuth, async (req, res, next) => {
  try {
    if (!["customer", "institutional_customer"].includes(req.user!.role)) {
      res.status(403).json({ error: "Only customers can remove favorites" });
      return;
    }

    const workerId = z.string().uuid().parse(req.params.workerId);

    const result = await pool.query(
      `DELETE FROM customer_favorites WHERE customer_id = $1 AND worker_id = $2 RETURNING id`,
      [req.user!.id, workerId]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: "Favorite not found" });
      return;
    }

    await recordAuditEvent({
      actorId: req.user!.id,
      action: "favorite.removed",
      resourceType: "customer_favorite",
      resourceId: workerId,
      requestId: req.header("x-request-id")
    }).catch(() => undefined);

    res.status(204).send();
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /customer/bookings/history:
 *   get:
 *     summary: Get customer booking history with filters
 *     tags: [Customer Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [completed, cancelled, all] }
 *       - name: serviceId
 *         in: query
 *         schema: { type: string, format: uuid }
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
 *         description: Paginated booking history
 */
customerDashboardRouter.get("/bookings/history", requireAuth, async (req, res, next) => {
  try {
    if (!["customer", "institutional_customer"].includes(req.user!.role)) {
      res.status(403).json({ error: "Only customers can access booking history" });
      return;
    }

    const query = z.object({
      status: z.enum(["completed", "cancelled", "all"]).default("all"),
      serviceId: z.string().uuid().optional(),
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(50).default(20),
    }).parse(req.query);

    const conditions: string[] = ["b.customer_id = $1"];
    const values: unknown[] = [req.user!.id];
    let index = 2;

    if (query.status !== "all") {
      conditions.push(`b.status = $${index++}`);
      values.push(query.status);
    }
    if (query.serviceId) {
      conditions.push(`b.service_id = $${index++}`);
      values.push(query.serviceId);
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
      `SELECT b.id, b.status, b.scheduled_at as "scheduledAt", b.completion_verified_at as "completedAt",
              b.address, b.description, b.price, b.is_emergency as "isEmergency",
              s.name as service_name, s.category,
              w.id as worker_id, u.name as worker_name,
              r.rating, r.feedback
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       LEFT JOIN workers w ON w.id = b.worker_id
       LEFT JOIN users u ON u.id = w.user_id
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
      bookings: result.rows,
      pagination: { page: query.page, limit: query.limit, total: countResult.rows[0].total },
    });
  } catch (error) { next(error); }
});

export default customerDashboardRouter;