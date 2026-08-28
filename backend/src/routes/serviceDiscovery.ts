import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { geocodeAddress, reverseGeocode, searchPlaces, getDistanceMatrix, calculateDistance } from "../services/googleMaps.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

export const serviceDiscoveryRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
serviceDiscoveryRouter.param("id", rejectNonUuidParam);

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200).optional(),
  category: z.string().max(50).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(100).optional(),
  emergencyOnly: z.coerce.boolean().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  sortBy: z.enum(["relevance", "price_asc", "price_desc", "rating", "distance"]).default("relevance"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

/**
 * @openapi
 * /services/discovery/search:
 *   get:
 *     summary: Advanced service search with filters
 *     tags: [Service Discovery]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: q
 *         in: query
 *         schema: { type: string }
 *         description: Search query
 *       - name: category
 *         in: query
 *         schema: { type: string }
 *         description: Filter by category
 *       - name: latitude
 *         in: query
 *         schema: { type: number }
 *         description: User latitude for distance sorting
 *       - name: longitude
 *         in: query
 *         schema: { type: number }
 *         description: User longitude for distance sorting
 *       - name: radiusKm
 *         in: query
 *         schema: { type: number }
 *         description: Search radius in km
 *       - name: emergencyOnly
 *         in: query
 *         schema: { type: boolean }
 *         description: Only show emergency-supported services
 *       - name: minPrice
 *         in: query
 *         schema: { type: number }
 *       - name: maxPrice
 *         in: query
 *         schema: { type: number }
 *       - name: sortBy
 *         in: query
 *         schema: { type: string, enum: [relevance, price_asc, price_desc, rating, distance] }
 *       - name: page
 *         in: query
 *         schema: { type: integer }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Search results
 */
serviceDiscoveryRouter.get("/search", requireAuth, async (req, res, next) => {
  try {
    const query = searchQuerySchema.parse(req.query);
    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (query.q) {
      conditions.push(`(s.name ILIKE $${index} OR s.description ILIKE $${index} OR s.category ILIKE $${index})`);
      values.push(`%${query.q}%`);
      index++;
    }
    if (query.category) {
      conditions.push(`s.category = $${index++}`);
      values.push(query.category);
    }
    if (query.emergencyOnly) {
      conditions.push(`s.emergency_supported = true`);
    }
    if (query.minPrice !== undefined) {
      conditions.push(`s.base_price >= $${index++}`);
      values.push(query.minPrice);
    }
    if (query.maxPrice !== undefined) {
      conditions.push(`s.base_price <= $${index++}`);
      values.push(query.maxPrice);
    }

    const whereClause = conditions.join(" AND ");
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    let orderBy = "s.name";
    if (query.sortBy === "price_asc") orderBy = "s.base_price ASC";
    else if (query.sortBy === "price_desc") orderBy = "s.base_price DESC";
    else if (query.sortBy === "rating") orderBy = "avg_rating DESC NULLS LAST";
    else if (query.sortBy === "distance" && query.latitude && query.longitude) {
      // For distance sorting, we'd need to join with workers - complex, fallback to relevance
      orderBy = "s.name";
    }

    // Get services with worker availability info
    const result = await pool.query(
      `SELECT s.id, s.name, s.category, s.description, s.base_price, s.emergency_supported,
              COUNT(DISTINCT w.id) FILTER (WHERE w.verification_status = 'verified' AND w.current_status = 'available') as available_workers,
              AVG(r.rating)::numeric(2,1) as avg_rating,
              COUNT(r.id) as review_count
       FROM services s
       LEFT JOIN worker_service_areas wsa ON wsa.service_id = s.id
       LEFT JOIN workers w ON w.id = wsa.worker_id
       LEFT JOIN reviews r ON r.worker_id = w.id
       WHERE ${whereClause}
       GROUP BY s.id
       ORDER BY ${orderBy}
       LIMIT $${index++} OFFSET $${index}`,
      values
    );

    // Add distance if location provided
    let services = result.rows;
    if (query.latitude && query.longitude) {
      // Get min distance for each service
      const serviceIds = services.map(s => s.id);
      if (serviceIds.length > 0) {
        const distResult = await pool.query(
          `SELECT s.id, MIN(ST_Distance(wl.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography))/1000 as min_distance_km
           FROM services s
           JOIN worker_service_areas wsa ON wsa.service_id = s.id
           JOIN workers w ON w.id = wsa.worker_id
           JOIN worker_locations wl ON wl.worker_id = w.id
           WHERE s.id = ANY($3) AND w.verification_status = 'verified' AND w.location_sharing_enabled = true
           GROUP BY s.id`,
          [query.longitude, query.latitude, serviceIds]
        );
        const distMap = new Map(distResult.rows.map(r => [r.id, Number(r.min_distance_km)]));
        services = services.map(s => ({ ...s, distanceKm: distMap.get(s.id) ?? null }));
        if (query.sortBy === "distance") {
          services.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
        }
      }
    }

    const countResult = await pool.query(
      `SELECT count(*)::int as total FROM services s WHERE ${whereClause}`,
      values.slice(0, -2)
    );

    res.json({
      services,
      pagination: { page: query.page, limit: query.limit, total: countResult.rows[0].total },
    });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /services/discovery/nearby:
 *   get:
 *     summary: Get services available near a location
 *     tags: [Service Discovery]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: latitude
 *         in: query
 *         required: true
 *         schema: { type: number }
 *       - name: longitude
 *         in: query
 *         required: true
 *         schema: { type: number }
 *       - name: radiusKm
 *         in: query
 *         schema: { type: number, default: 15 }
 *       - name: category
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Nearby services
 */
serviceDiscoveryRouter.get("/nearby", requireAuth, async (req, res, next) => {
  try {
    const query = z.object({
      latitude: z.coerce.number().min(-90).max(90),
      longitude: z.coerce.number().min(-180).max(180),
      radiusKm: z.coerce.number().positive().max(100).default(15),
      category: z.string().optional(),
    }).parse(req.query);

    const conditions: string[] = [
      "w.verification_status = 'verified'",
      "w.location_sharing_enabled = true",
      "ST_DWithin(wl.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3 * 1000)"
    ];
    const values: unknown[] = [query.longitude, query.latitude, query.radiusKm];
    let index = 4;

    if (query.category) {
      conditions.push(`s.category = $${index++}`);
      values.push(query.category);
    }

    const result = await pool.query(
      `SELECT DISTINCT s.id, s.name, s.category, s.description, s.base_price, s.emergency_supported,
              COUNT(DISTINCT w.id) as available_workers,
              MIN(ST_Distance(wl.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography))/1000 as min_distance_km,
              AVG(r.rating)::numeric(2,1) as avg_rating
       FROM services s
       JOIN worker_service_areas wsa ON wsa.service_id = s.id
       JOIN workers w ON w.id = wsa.worker_id
       JOIN worker_locations wl ON wl.worker_id = w.id
       LEFT JOIN reviews r ON r.worker_id = w.id
       WHERE ${conditions.join(" AND ")}
       GROUP BY s.id
       ORDER BY min_distance_km ASC
       LIMIT 50`,
      values
    );

    res.json({ services: result.rows });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /services/discovery/{id}/workers:
 *   get:
 *     summary: Get workers offering a specific service
 *     tags: [Service Discovery]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: latitude
 *         in: query
 *         schema: { type: number }
 *       - name: longitude
 *         in: query
 *         schema: { type: number }
 *       - name: radiusKm
 *         in: query
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: Workers for service
 */
serviceDiscoveryRouter.get("/:id/workers", requireAuth, async (req, res, next) => {
  try {
    const serviceId = z.string().uuid().parse(req.params.id);
    const query = z.object({
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      radiusKm: z.coerce.number().positive().max(100).optional(),
    }).parse(req.query);

    // Verify service exists
    const service = await pool.query("SELECT id, name FROM services WHERE id = $1", [serviceId]);
    if (!service.rows[0]) {
      res.status(404).json({ error: "Service not found" });
      return;
    }

    let whereClause = "w.verification_status = 'verified' AND ws.service_id = $1";
    const values: unknown[] = [serviceId];
    let index = 2;

    if (query.latitude && query.longitude) {
      whereClause += ` AND ST_DWithin(wl.location, ST_SetSRID(ST_MakePoint($${index}, $${index + 1}), 4326)::geography, $${index + 2} * 1000)`;
      values.push(query.longitude, query.latitude, query.radiusKm ?? 15);
      index += 3;
    }

    const result = await pool.query(
      `SELECT w.id, w.rating, w.current_status as "currentStatus", w.experience_years as "experienceYears",
              u.name, u.avatar_url as "avatarUrl", u.phone,
              ws.level, ws.years_experience as "yearsExperience", ws.verified as "skillVerified",
              wl.location,
              CASE WHEN $2 IS NOT NULL AND $3 IS NOT NULL 
                   THEN ST_Distance(wl.location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography)/1000 
              END as distance_km
       FROM workers w
       JOIN users u ON u.id = w.user_id
       JOIN worker_skills ws ON ws.worker_id = w.id
       LEFT JOIN worker_locations wl ON wl.worker_id = w.id
       WHERE ${whereClause}
       ORDER BY w.rating DESC NULLS LAST, distance_km ASC NULLS LAST
       LIMIT 50`,
      values
    );

    res.json({ 
      service: service.rows[0],
      workers: result.rows 
    });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /services/discovery/categories:
 *   get:
 *     summary: Get all service categories with counts
 *     tags: [Service Discovery]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Service categories
 */
serviceDiscoveryRouter.get("/categories", requireAuth, async (_req, res, next) => {
  try {
 const result = await pool.query(
       `SELECT s.category, 
               COUNT(DISTINCT s.id) as service_count,
               COUNT(DISTINCT w.id) FILTER (WHERE w.verification_status = 'verified') as available_workers,
               JSON_AGG(DISTINCT jsonb_build_object('id', s.id, 'name', s.name, 'basePrice', s.base_price, 'emergency', s.emergency_supported)) FILTER (WHERE s.id IS NOT NULL) as services
          FROM services s
          LEFT JOIN worker_service_areas wsa ON wsa.service_id = s.id
          LEFT JOIN workers w ON w.id = wsa.worker_id AND w.verification_status = 'verified'
          GROUP BY s.category
          ORDER BY s.category`
     );

    res.json({ categories: result.rows });
  } catch (error) { next(error); }
});

// ─── Google Maps Integration Endpoints ────────────────────────────────────────

/**
 * @openapi
 * /services/discovery/geocode:
 *   post:
 *     summary: Convert address to coordinates using Google Maps
 *     tags: [Service Discovery]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [address]
 *             properties:
 *               address: { type: string }
 *     responses:
 *       200:
 *         description: Geocoded results
 */
serviceDiscoveryRouter.post("/geocode", requireAuth, async (req, res, next) => {
  try {
    const { address } = z.object({ address: z.string().min(3).max(500) }).parse(req.body);
    const results = await geocodeAddress(address);
    res.json({ results });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /services/discovery/reverse-geocode:
 *   post:
 *     summary: Convert coordinates to address using Google Maps
 *     tags: [Service Discovery]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lat, lng]
 *             properties:
 *               lat: { type: number }
 *               lng: { type: number }
 *     responses:
 *       200:
 *         description: Reverse geocoded results
 */
serviceDiscoveryRouter.post("/reverse-geocode", requireAuth, async (req, res, next) => {
  try {
    const { lat, lng } = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(req.body);
    const results = await reverseGeocode(lat, lng);
    res.json({ results });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /services/discovery/places/search:
 *   post:
 *     summary: Search for places using Google Places API
 *     tags: [Service Discovery]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query]
 *             properties:
 *               query: { type: string }
 *               lat: { type: number }
 *               lng: { type: number }
 *               radius: { type: integer }
 *     responses:
 *       200:
 *         description: Place search results
 */
serviceDiscoveryRouter.post("/places/search", requireAuth, async (req, res, next) => {
  try {
    const { query, lat, lng, radius } = z.object({
      query: z.string().min(1).max(200),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      radius: z.number().int().positive().max(50000).optional(),
    }).parse(req.body);
    const location = lat && lng ? { lat, lng } : undefined;
    const results = await searchPlaces(query, { lat: lat!, lng: lng! }, radius);
    res.json({ results });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /services/discovery/distance-matrix:
 *   post:
 *     summary: Get travel distance and duration between locations using Google Maps
 *     tags: [Service Discovery]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [origins, destinations]
 *             properties:
 *               origins: { type: array, items: { type: object, properties: { lat: { type: number }, lng: { type: number } } } }
 *               destinations: { type: array, items: { type: object, properties: { lat: { type: number }, lng: { type: number } } } }
 *               mode: { type: string, enum: [driving, walking, bicycling, transit] }
 *               departureTime: { type: integer }
 *               trafficModel: { type: string, enum: [best_guess, pessimistic, optimistic] }
 *     responses:
 *       200:
 *         description: Distance matrix results
 */
serviceDiscoveryRouter.post("/distance-matrix", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({
      origins: z.array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })).min(1).max(25),
      destinations: z.array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })).min(1).max(25),
      mode: z.enum(["driving", "walking", "bicycling", "transit"]).optional(),
      departureTime: z.number().int().optional(),
      trafficModel: z.enum(["best_guess", "pessimistic", "optimistic"]).optional(),
    }).parse(req.body);

    const results = await getDistanceMatrix(input.origins, input.destinations, {
      mode: input.mode,
      departureTime: input.departureTime,
      trafficModel: input.trafficModel,
    });
    res.json({ results });
  } catch (error) { next(error); }
});

export default serviceDiscoveryRouter;