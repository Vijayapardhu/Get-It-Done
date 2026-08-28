import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

/**
 * @openapi
 * /ai/demand-forecast:
 *   get:
 *     summary: Get demand forecast
 *     description: Returns AI-powered demand forecast for services
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Demand forecast
 *       500:
 *         description: AI service unavailable
 * /ai/workforce-allocation:
 *   get:
 *     summary: Get workforce allocation recommendations
 *     description: Returns AI-powered workforce allocation recommendations (persisted)
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Workforce allocation recommendations
 * /ai/recommendations:
 *   get:
 *     summary: List persisted AI recommendations
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [pending, approved, rejected, applied] }
 *     responses:
 *       200:
 *         description: List of AI recommendation records
 * /ai/recommendations/{id}/approve:
 *   post:
 *     summary: Approve an AI recommendation (admin)
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Recommendation approved
* /ai/recommendations/{id}/reject:
  *   post:
  *     summary: Reject an AI recommendation (admin)
  *     tags: [AI]
  *     security:
  *       - bearerAuth: []
  *     parameters:
  *       - name: id
  *         in: path
  *         required: true
  *         schema: { type: string, format: uuid }
  *     responses:
  *       200:
  *         description: Recommendation rejected
  * /ai/recommendations/{id}/apply:
  *   post:
  *     summary: Apply an approved AI recommendation (admin)
  *     tags: [AI]
  *     security:
  *       - bearerAuth: []
  *     parameters:
  *       - name: id
  *         in: path
  *         required: true
  *         schema: { type: string, format: uuid }
  *     responses:
  *       200:
  *         description: Recommendation applied
 */

export const aiRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
aiRouter.param("id", rejectNonUuidParam);

/**
 * Demand, grouped by an area that actually repeats.
 *
 * This used to `GROUP BY b.address` -- the free-text address the customer
 * typed. Every booking was therefore its own "area", the group-by returned one
 * row per booking, and the area dimension carried no signal. Downstream it was
 * worse: the sidecar filtered incoming history against its own hardcoded area
 * names, street addresses matched none of them, the history filtered to empty,
 * and the model was never fitted at all.
 *
 * `grid_cell` is a generated ~2km square derived from the booking's own
 * geography (migration_phase23), so it exists for every row including all
 * history, and neighbouring bookings land in the same bucket. `locality` is the
 * human name when reverse geocoding has supplied one -- shown to operators,
 * never grouped on, because it is nullable forever.
 */
async function loadDemandHistory() {
  const result = await pool.query(
    `SELECT b.created_at::date          AS date,
            b.grid_cell                 AS area,
            max(b.locality)             AS locality,
            s.name                      AS service,
            count(*)::int               AS requests
     FROM bookings b
     JOIN services s ON s.id = b.service_id
     WHERE b.created_at >= current_date - interval '90 days'
       AND b.grid_cell IS NOT NULL
     GROUP BY b.created_at::date, b.grid_cell, s.name
     ORDER BY date`
  );
  return result.rows.map((row) => ({
    date: row.date,
    area: row.area,
    locality: row.locality ?? null,
    service: row.service,
    requests: row.requests,
  }));
}

/**
 * How many workers could actually take a job in each area, per service.
 *
 * The sidecar used to compute this as `available = 12 + area_index +
 * service_index` -- a literal, in the file, that never touched the database.
 * `predicted_shortage` is `expected - available`, so that one line made the
 * entire output of the module, the allocation recommendations built on it, and
 * anything downstream that scores on shortage, fiction.
 *
 * Counted the way matching actually selects: verified, active, sharing
 * location, with a service area for the service's category that reaches the
 * cell. The cell centre is reconstructed from the key so a worker is only
 * counted for areas they would really be offered.
 */
async function loadWorkerSupply() {
  const result = await pool.query(
    `WITH cells AS (
       SELECT DISTINCT grid_cell,
              split_part(grid_cell, ',', 1)::double precision AS lat,
              split_part(grid_cell, ',', 2)::double precision AS lng
         FROM bookings
        WHERE grid_cell IS NOT NULL
          AND created_at >= current_date - interval '90 days'
     )
     SELECT c.grid_cell AS area,
            s.name      AS service,
            count(DISTINCT w.id)::int AS available
       FROM cells c
       CROSS JOIN services s
       LEFT JOIN worker_service_areas wsa
              ON wsa.service_id IN (SELECT id FROM services WHERE category = s.category)
       LEFT JOIN workers w
              ON w.id = wsa.worker_id
             AND w.verification_status = 'verified'
             AND w.location_sharing_enabled = true
       LEFT JOIN users u ON u.id = w.user_id AND u.status = 'active'
       LEFT JOIN worker_locations wl
              ON wl.worker_id = w.id
             AND ST_DWithin(
                   wl.location,
                   ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
                   (wsa.radius_km * 1000)::double precision
                 )
      WHERE u.id IS NOT NULL AND wl.worker_id IS NOT NULL
      GROUP BY c.grid_cell, s.name`
  );
  return result.rows.map((row) => ({ area: row.area, service: row.service, available: row.available }));
}

interface AiAllocation {
  area?: string;
  service?: string;
  service_id?: string;
  priority?: string;
  recommendation?: string;
  workers_needed?: number;
  recommended_workers?: number;
  drivers?: unknown[];
}

/** Call the Python sidecar, surfacing an unreachable engine as 502 rather than 500. */
async function callAiService(path: string, body: unknown): Promise<{ ok: true; data: unknown } | { ok: false; status: number; error: string }> {
  try {
    const response = await fetch(`${env.AI_SERVICE_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return { ok: false, status: 502, error: `AI service returned ${response.status}` };
    }
    return { ok: true, data: await response.json() };
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "AI service timed out" : "AI service unavailable";
    return { ok: false, status: 502, error: reason };
  }
}

/**
 * The sidecar reports a service by NAME; ai_recommendation_records stores a
 * service_id FK. Resolve once per batch rather than per row.
 */
async function resolveServiceIds(names: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const result = await pool.query("select id, name from services where name = any($1::text[])", [unique]);
  return new Map(result.rows.map((row) => [String(row.name).toLowerCase(), row.id]));
}

/**
 * Accept either the enveloped `{recommendations: [...]}` shape or a bare array.
 * The sidecar returned a bare list while this route only ever checked for the
 * envelope, so no recommendation was ever persisted; tolerate both so an older
 * sidecar deployment does not silently resurrect that failure.
 */
function extractAllocations(data: unknown): AiAllocation[] {
  if (Array.isArray(data)) return data as AiAllocation[];
  if (data && typeof data === "object") {
    const envelope = (data as { recommendations?: unknown }).recommendations;
    if (Array.isArray(envelope)) return envelope as AiAllocation[];
  }
  return [];
}

/**
 * Persist a batch for human approval.
 *
 * Upserts on (area, service_id) while a row is still pending, so polling the
 * endpoint does not pile up a duplicate row per call — the previous version
 * inserted unconditionally on every request.
 */
async function persistAllocations(allocations: AiAllocation[]): Promise<string[]> {
  if (allocations.length === 0) return [];

  const serviceIds = await resolveServiceIds(allocations.map((a) => a.service ?? ""));
  const saved: string[] = [];

  // The sidecar emits one row per (day, area, service) across the horizon, but
  // the approval queue is keyed on (area, service). Collapse to the PEAK
  // shortage — the number a society actually has to staff for. Upserting the
  // raw list instead would leave whichever day happened to be processed last.
  const peakByKey = new Map<string, AiAllocation>();
  for (const allocation of allocations) {
    const key = `${allocation.area ?? "unknown"}::${(allocation.service ?? "").toLowerCase()}`;
    const workers = Number(allocation.recommended_workers ?? allocation.workers_needed ?? 0);
    const current = peakByKey.get(key);
    const currentWorkers = current
      ? Number(current.recommended_workers ?? current.workers_needed ?? 0)
      : -1;
    if (workers > currentWorkers) peakByKey.set(key, allocation);
  }

  for (const allocation of peakByKey.values()) {
    const serviceId = allocation.service_id ?? serviceIds.get((allocation.service ?? "").toLowerCase()) ?? null;
    const workers = Number(allocation.recommended_workers ?? allocation.workers_needed ?? 0);
    const drivers = Array.isArray(allocation.drivers) && allocation.drivers.length > 0
      ? allocation.drivers
      : [allocation.recommendation].filter(Boolean);

    const inserted = await pool.query(
      `insert into ai_recommendation_records (id, area, service_id, recommended_workers, drivers, status)
       values (gen_random_uuid(), $1, $2, $3, $4, 'pending')
       on conflict (area, coalesce(service_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'pending'
       do update set recommended_workers = excluded.recommended_workers,
                     drivers = excluded.drivers,
                     updated_at = now()
       returning id`,
      [allocation.area ?? "unknown", serviceId, workers, JSON.stringify(drivers)]
    );
    if (inserted.rows[0]) saved.push(inserted.rows[0].id);
  }

  return saved;
}

/**
 * @openapi
 * /ai/health:
 *   get:
 *     summary: Check Python AI engine connectivity
 *     tags: [AI]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Engine reachable }
 *       502: { description: Engine unreachable }
 */
aiRouter.get("/health", requireAuth, async (_req, res, next) => {
  try {
    const started = Date.now();
    try {
      const response = await fetch(`${env.AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(5000) });
      const latencyMs = Date.now() - started;
      if (!response.ok) {
        res.status(502).json({ status: "unhealthy", url: env.AI_SERVICE_URL, upstreamStatus: response.status, latencyMs });
        return;
      }
      res.json({ status: "ok", url: env.AI_SERVICE_URL, latencyMs, engine: await response.json() });
    } catch (error) {
      res.status(502).json({
        status: "unreachable",
        url: env.AI_SERVICE_URL,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /ai/forecast:
 *   post:
 *     summary: Demand forecast by zone and service (blueprint spelling)
 *     tags: [AI]
 *     security: [{ bearerAuth: [] }]
 * /ai/demand-forecast:
 *   get:
 *     summary: Demand forecast by zone and service
 *     tags: [AI]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: days
 *         in: query
 *         schema: { type: integer, default: 7, minimum: 1, maximum: 14 }
 *       - name: area
 *         in: query
 *         schema: { type: string }
 *       - name: service
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200: { description: Forecast }
 *       502: { description: AI engine unavailable }
 */
async function handleForecast(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const source = req.method === "POST" ? (req.body ?? {}) : req.query;
    // Blueprint asks for a 7-14 day horizon; this used to always request 1 day.
    const days = Math.min(Math.max(parseInt(String(source.days ?? 7), 10) || 7, 1), 14);

    const [history, supply] = await Promise.all([loadDemandHistory(), loadWorkerSupply()]);
    const result = await callAiService("/forecast/demand", {
      days,
      history,
      // Real counts, so predicted_shortage stops being arithmetic on a literal.
      supply,
      area: typeof source.area === "string" ? source.area : undefined,
      service: typeof source.service === "string" ? source.service : undefined,
    });

    if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
    res.json(result.data);
  } catch (error) {
    next(error);
  }
}

aiRouter.get("/demand-forecast", handleForecast);
aiRouter.post("/forecast", requireAuth, handleForecast);

// ─── Workforce Allocation – persists recommendations for human approval ────────
/**
 * @openapi
 * /ai/workforce-allocation:
 *   get:
 *     summary: Request an AI workforce rebalancing recommendation
 *     description: >
 *       Advisory only. Each recommendation is persisted as 'pending' and takes
 *       effect only once an administrator approves and applies it.
 *     tags: [AI]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Recommendations, with the ids persisted for approval }
 *       502: { description: AI engine unavailable }
 * /ai/allocation:
 *   post:
 *     summary: Request an AI workforce rebalancing recommendation (blueprint spelling)
 *     tags: [AI]
 *     security: [{ bearerAuth: [] }]
 */
async function handleAllocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const source = req.method === "POST" ? (req.body ?? {}) : req.query;
    const horizonDays = Math.min(Math.max(parseInt(String(source.horizonDays ?? 7), 10) || 7, 1), 14);

    const history = await loadDemandHistory();
    const result = await callAiService("/allocation/recommend", { horizonDays, history });
    if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }

    const allocations = extractAllocations(result.data);
    const saved = await persistAllocations(allocations);

    void recordAuditEvent({
      // actor_id is a uuid FK; this used to pass the literal string "system".
      actorId: req.user?.id ?? null,
      action: "ai.workforce_recommendation_created",
      resourceType: "ai_recommendation_records",
      requestId: req.header("x-request-id") ?? undefined,
      metadata: { count: saved.length, horizonDays },
    }).catch(() => undefined);

    res.json({ recommendations: allocations, persistedIds: saved, pendingApproval: saved.length });
  } catch (error) {
    next(error);
  }
}

aiRouter.get("/workforce-allocation", requireRoles("society_admin", "federation_admin", "system_admin"), handleAllocation);
aiRouter.post("/allocation", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin"), handleAllocation);

// ─── List saved AI recommendations ────────────────────────────────────────────
aiRouter.get("/recommendations", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin"), async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const validStatuses = ["pending", "approved", "rejected", "applied"];
    
    let query = `SELECT r.*, s.name as service_name, u.name as approved_by_name
                 FROM ai_recommendation_records r
                 LEFT JOIN services s ON s.id = r.service_id
                 LEFT JOIN users u ON u.id = r.approved_by`;
    const values: any[] = [];
    
    if (status && validStatuses.includes(status)) {
      query += ` WHERE r.status = $1`;
      values.push(status);
    }
    
    query += ` ORDER BY r.created_at DESC LIMIT 100`;
    
    const result = await pool.query(query, values);
    res.json({ recommendations: result.rows });
  } catch (error) { next(error); }
});

// ─── Approve AI recommendation ─────────────────────────────────────────────────
aiRouter.post("/recommendations/:id/approve", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin"), async (req, res, next) => {
  try {
    const recId = String(req.params.id);
    const result = await pool.query(
      `UPDATE ai_recommendation_records SET status = 'approved', approved_by = $1, updated_at = now()
       WHERE id = $2 AND status = 'pending' RETURNING *`,
      [(req as any).user!.id, recId]
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Recommendation not found or not pending" }); return; }
    void recordAuditEvent({ actorId: (req as any).user!.id, action: "ai.recommendation_approved", resourceType: "ai_recommendation_records", resourceId: recId }).catch(() => undefined);
    res.json({ recommendation: result.rows[0] });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /ai/allocation/approve:
 *   post:
 *     summary: Authorize a workforce rebalancing recommendation (blueprint spelling)
 *     description: Same effect as POST /ai/recommendations/{id}/approve.
 *     tags: [AI]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recommendationId]
 *             properties:
 *               recommendationId: { type: string, format: uuid }
 *               apply: { type: boolean, description: Also mark it applied immediately }
 *     responses:
 *       200: { description: Recommendation approved }
 *       404: { description: Not found or not pending }
 */
aiRouter.post("/allocation/approve", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin"), async (req, res, next) => {
  try {
    const input = z.object({ recommendationId: z.string().uuid(), apply: z.boolean().default(false) }).parse(req.body);

    const result = await pool.query(
      `UPDATE ai_recommendation_records
          SET status = $1, approved_by = $2, applied_at = CASE WHEN $1 = 'applied' THEN now() ELSE applied_at END, updated_at = now()
        WHERE id = $3 AND status = 'pending'
      RETURNING *`,
      [input.apply ? "applied" : "approved", req.user!.id, input.recommendationId]
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Recommendation not found or not pending" }); return; }

    void recordAuditEvent({
      actorId: req.user!.id,
      action: input.apply ? "ai.recommendation_applied" : "ai.recommendation_approved",
      resourceType: "ai_recommendation_records",
      resourceId: input.recommendationId,
      requestId: req.header("x-request-id") ?? undefined,
    }).catch(() => undefined);

    res.json({ recommendation: result.rows[0] });
  } catch (error) { next(error); }
});

// ─── Reject AI recommendation ──────────────────────────────────────────────────
aiRouter.post("/recommendations/:id/reject", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin"), async (req, res, next) => {
  try {
    const recId = String(req.params.id);
    const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(req.body);
    const result = await pool.query(
      `UPDATE ai_recommendation_records SET status = 'rejected', updated_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [recId]
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Recommendation not found or not pending" }); return; }
    void recordAuditEvent({ actorId: (req as any).user!.id, action: "ai.recommendation_rejected", resourceType: "ai_recommendation_records", resourceId: recId, metadata: { reason } }).catch(() => undefined);
    res.json({ recommendation: result.rows[0] });
  } catch (error) { next(error); }
});

// ─── Apply approved AI recommendation ─────────────────────────────────────────
aiRouter.post("/recommendations/:id/apply", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin"), async (req, res, next) => {
  try {
    const recId = String(req.params.id);
    const result = await pool.query(
      `UPDATE ai_recommendation_records SET status = 'applied', applied_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'approved' RETURNING *`,
      [recId]
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Recommendation not found or not approved" }); return; }
    void recordAuditEvent({ actorId: (req as any).user!.id, action: "ai.recommendation_applied", resourceType: "ai_recommendation_records", resourceId: recId }).catch(() => undefined);
    res.json({ recommendation: result.rows[0], message: "Recommendation applied. Workforce adjustments should be scheduled manually or via operational tooling." });
  } catch (error) { next(error); }
});

// ─── Per-area demand forecast ──────────────────────────────────────────────────
aiRouter.get("/demand-forecast/:area/:serviceId", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin"), async (req, res, next) => {
  try {
    const area = decodeURIComponent(Array.isArray(req.params.area) ? req.params.area[0] : req.params.area);
    const serviceId = z.string().uuid().parse(Array.isArray(req.params.serviceId) ? req.params.serviceId[0] : req.params.serviceId);
    const days = Math.min(parseInt(String(req.query.days ?? 7)), 30);

    const history = await pool.query(
      `SELECT b.created_at::date as date, b.address as area, s.name as service, count(*)::int as requests
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       WHERE b.address ILIKE $1 AND s.id = $2
         AND b.created_at >= current_date - interval '90 days'
       GROUP BY b.created_at::date, b.address, s.name
       ORDER BY date`,
      [`%${area}%`, serviceId]
    );

    const response = await fetch(`${env.AI_SERVICE_URL}/forecast/demand`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days, history: history.rows.map(r => ({ date: r.date, area: r.area, service: r.service, requests: r.requests })) }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) { res.status(502).json({ error: "AI service unavailable" }); return; }
    res.json(await response.json());
  } catch (error) { next(error); }
});

// ─── Predicted worker shortages ─────────────────────────────────────────────────
aiRouter.get("/demand-forecast/shortages", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin"), async (req, res, next) => {
  try {
    const days = Math.min(parseInt(String(req.query.days ?? 7)), 30);
    const federationId = await getUserFederation(req.user!.id, req.user!.role);
    
    const fedFilter = federationId ? `AND c.federation_id = $1` : "";
    const params = federationId ? [federationId] : [];

    // Get recent demand per area/service
    const demandResult = await pool.query(
      `SELECT b.address as area, s.id as service_id, s.name as service_name,
              COUNT(*)::int as expected_requests,
              COUNT(DISTINCT w.id) FILTER (WHERE w.verification_status = 'verified' AND w.current_status = 'available') as available_workers
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       JOIN workers w ON w.id = b.worker_id
       JOIN cooperatives c ON c.id = w.cooperative_id
       WHERE b.created_at >= current_date - interval '7 days'
       ${fedFilter}
       GROUP BY b.address, s.id, s.name
       ORDER BY expected_requests DESC`,
      params
    );

    // Calculate shortages
    const shortages = demandResult.rows.map(row => {
      const availableWorkers = Number(row.available_workers);
      const expectedRequests = Number(row.expected_requests);
      // Assume each worker can handle ~4 jobs/day, 7 days = 28 jobs/week
      const capacity = availableWorkers * 4 * days;
      const shortage = Math.max(0, expectedRequests - capacity);
      
      return {
        area: row.area,
        serviceId: row.service_id,
        serviceName: row.service_name,
        expectedRequests,
        availableWorkers,
        capacity,
        predictedShortage: shortage,
        recommendation: shortage > 0 
          ? `Need ${shortage} more workers or redistribute from nearby areas`
          : "Adequate workforce",
      };
    }).filter(s => s.predictedShortage > 0);

    res.json({ shortages, periodDays: days });
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
