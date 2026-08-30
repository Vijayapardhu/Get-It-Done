import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { territoryService } from "../services/territoryService.js";
import { recordAuditEvent } from "../services/auditService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";
import type { Request } from "express";

export const territoryRouter = Router();

territoryRouter.param("id", rejectNonUuidParam);
territoryRouter.param("cooperativeId", rejectNonUuidParam);

const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.array(z.number()))),
});

const territoryCreateSchema = z.object({
  cooperativeId: z.string().uuid(),
  polygon: polygonSchema,
  status: z.enum(["active", "draft"]).default("draft"),
});

const territoryUpdateSchema = z.object({
  polygon: polygonSchema.optional(),
  status: z.enum(["active", "inactive", "draft"]).optional(),
});

const validateTerritorySchema = z.object({
  cooperativeId: z.string().uuid().optional(),
  federationId: z.string().uuid(),
  polygon: polygonSchema,
});

const previewSchema = z.object({
  polygon: polygonSchema,
});

function param(req: Request, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] : (value as string);
}

async function canAccessFederation(userId: string, federationId: string): Promise<boolean> {
  const { pool } = await import("../db/pool.js");
  const result = await pool.query(
    `SELECT 1 FROM admin_scopes WHERE user_id = $1 AND federation_id = $2`,
    [userId, federationId]
  );
  return Boolean(result.rows[0]);
}

async function canAccessCooperative(userId: string, cooperativeId: string): Promise<boolean> {
  const { pool } = await import("../db/pool.js");
  const result = await pool.query(
    `SELECT 1 FROM admin_scopes WHERE user_id = $1 AND cooperative_id = $2`,
    [userId, cooperativeId]
  );
  return Boolean(result.rows[0]);
}

// ─── CREATE TERRITORY ──────────────────────────────────────────────────────
territoryRouter.post("/cooperatives/:cooperativeId/territory", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const cooperativeId = param(req, "cooperativeId");
    const input = territoryCreateSchema.parse({ ...req.body, cooperativeId });

    const { pool } = await import("../db/pool.js");
    const coopResult = await pool.query(`SELECT federation_id FROM cooperatives WHERE id = $1`, [cooperativeId]);
    if (!coopResult.rows[0]) { res.status(404).json({ error: "Cooperative not found" }); return; }

    const canEdit = req.user!.role === "system_admin" ||
      (req.user!.role === "federation_admin" && await canAccessFederation(req.user!.id, coopResult.rows[0].federation_id)) ||
      (req.user!.role === "society_admin" && await canAccessCooperative(req.user!.id, cooperativeId));
    if (!canEdit) { res.status(403).json({ error: "Cannot edit this cooperative" }); return; }

    const validation = await territoryService.validatePolygon(input.polygon);
    if (!validation.valid) { res.status(400).json({ error: "Invalid polygon", details: validation.errors }); return; }

    const conflicts = await territoryService.checkConflicts(input.polygon, coopResult.rows[0].federation_id, cooperativeId);
    if (conflicts.length > 0) {
      res.status(409).json({
        error: "Territory overlaps with existing societies",
        conflicts: conflicts.map(c => ({ cooperativeName: c.cooperativeName, intersectionAreaKm2: Math.round(c.intersectionAreaKm2 * 100) / 100 })),
      });
      return;
    }

    const territory = await territoryService.createTerritory({
      cooperativeId,
      polygon: input.polygon,
      status: input.status,
      createdBy: req.user!.id,
    });

    await recordAuditEvent({
      actorId: req.user!.id,
      action: "territory.created",
      resourceType: "cooperative_territory",
      resourceId: territory.id,
      metadata: { cooperativeId },
    }).catch(() => undefined);

    res.status(201).json({ territory });
  } catch (error) { next(error); }
});

// ─── GET TERRITORY ─────────────────────────────────────────────────────────
territoryRouter.get("/cooperatives/:cooperativeId/territory", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const cooperativeId = param(req, "cooperativeId");

    const { pool } = await import("../db/pool.js");
    const coopResult = await pool.query(`SELECT federation_id FROM cooperatives WHERE id = $1`, [cooperativeId]);
    if (!coopResult.rows[0]) { res.status(404).json({ error: "Cooperative not found" }); return; }

    const canView = req.user!.role === "system_admin" ||
      (req.user!.role === "federation_admin" && await canAccessFederation(req.user!.id, coopResult.rows[0].federation_id)) ||
      (req.user!.role === "society_admin" && await canAccessCooperative(req.user!.id, cooperativeId));
    if (!canView) { res.status(403).json({ error: "Cannot view this cooperative" }); return; }

    const territory = await territoryService.getTerritoryByCooperative(cooperativeId);
    res.json({ territory });
  } catch (error) { next(error); }
});

// ─── UPDATE TERRITORY ──────────────────────────────────────────────────────
territoryRouter.patch("/cooperatives/:cooperativeId/territory", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const cooperativeId = param(req, "cooperativeId");
    const input = territoryUpdateSchema.parse(req.body);

    const { pool } = await import("../db/pool.js");
    const coopResult = await pool.query(`SELECT federation_id FROM cooperatives WHERE id = $1`, [cooperativeId]);
    if (!coopResult.rows[0]) { res.status(404).json({ error: "Cooperative not found" }); return; }

    const canEdit = req.user!.role === "system_admin" ||
      (req.user!.role === "federation_admin" && await canAccessFederation(req.user!.id, coopResult.rows[0].federation_id)) ||
      (req.user!.role === "society_admin" && await canAccessCooperative(req.user!.id, cooperativeId));
    if (!canEdit) { res.status(403).json({ error: "Cannot edit this cooperative" }); return; }

    const existing = await territoryService.getTerritoryByCooperative(cooperativeId);
    if (!existing) { res.status(404).json({ error: "Territory not found" }); return; }

    if (input.polygon) {
      const validation = await territoryService.validatePolygon(input.polygon);
      if (!validation.valid) { res.status(400).json({ error: "Invalid polygon", details: validation.errors }); return; }

      const conflicts = await territoryService.checkConflicts(input.polygon, coopResult.rows[0].federation_id, cooperativeId);
      if (conflicts.length > 0) {
        res.status(409).json({
          error: "Territory overlaps with existing societies",
          conflicts: conflicts.map(c => ({ cooperativeName: c.cooperativeName, intersectionAreaKm2: Math.round(c.intersectionAreaKm2 * 100) / 100 })),
        });
        return;
      }
    }

    const territory = await territoryService.updateTerritory(existing.id, {
      polygon: input.polygon,
      status: input.status,
      updatedBy: req.user!.id,
    });

    await recordAuditEvent({
      actorId: req.user!.id,
      action: "territory.updated",
      resourceType: "cooperative_territory",
      resourceId: existing.id,
      metadata: { cooperativeId },
    }).catch(() => undefined);

    res.json({ territory });
  } catch (error) { next(error); }
});

// ─── VALIDATE TERRITORY ────────────────────────────────────────────────────
territoryRouter.post("/territories/validate", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const input = validateTerritorySchema.parse(req.body);

    if (req.user!.role === "federation_admin") {
      const hasAccess = await canAccessFederation(req.user!.id, input.federationId);
      if (!hasAccess) { res.status(403).json({ error: "Cannot access this federation" }); return; }
    }

    const validation = await territoryService.validatePolygon(input.polygon);
    const conflicts = validation.valid
      ? await territoryService.checkConflicts(input.polygon, input.federationId, input.cooperativeId)
      : [];

    res.json({
      valid: validation.valid && conflicts.length === 0,
      errors: validation.errors,
      warnings: validation.warnings,
      conflicts: conflicts.map(c => ({
        cooperativeId: c.cooperativeId,
        cooperativeName: c.cooperativeName,
        intersectionAreaKm2: Math.round(c.intersectionAreaKm2 * 100) / 100,
      })),
    });
  } catch (error) { next(error); }
});

// ─── PREVIEW TERRITORY ─────────────────────────────────────────────────────
territoryRouter.post("/territories/preview", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const input = previewSchema.parse(req.body);
    const preview = await territoryService.getTerritoryPreview(input.polygon);
    res.json(preview);
  } catch (error) { next(error); }
});

// ─── RESOLVE SOCIETY BY COORDINATES ────────────────────────────────────────
territoryRouter.get("/territories/resolve", requireAuth, async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      res.status(400).json({ error: "Invalid coordinates" });
      return;
    }

    const result = await territoryService.resolveSocietyByCoordinates(lat, lng);
    if (!result) {
      res.json({ matched: false });
      return;
    }

    res.json({
      matched: true,
      cooperative: {
        id: result.cooperative_id,
        name: result.cooperative_name,
        federationId: result.federation_id,
      },
      territory: {
        id: result.territory_id,
        version: result.version,
      },
    });
  } catch (error) { next(error); }
});

// ─── FEDERATION TERRITORIES MAP ────────────────────────────────────────────
territoryRouter.get("/federations/:federationId/territories", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const federationId = param(req, "federationId");

    if (req.user!.role === "federation_admin") {
      const hasAccess = await canAccessFederation(req.user!.id, federationId);
      if (!hasAccess) { res.status(403).json({ error: "Cannot access this federation" }); return; }
    }

    const territories = await territoryService.getFederationTerritories(federationId);
    res.json({ territories });
  } catch (error) { next(error); }
});

// ─── SOCIETY STATISTICS ────────────────────────────────────────────────────
territoryRouter.get("/cooperatives/:cooperativeId/territory/statistics", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const cooperativeId = param(req, "cooperativeId");

    const { pool } = await import("../db/pool.js");
    const coopResult = await pool.query(`SELECT federation_id FROM cooperatives WHERE id = $1`, [cooperativeId]);
    if (!coopResult.rows[0]) { res.status(404).json({ error: "Cooperative not found" }); return; }

    const canView = req.user!.role === "system_admin" ||
      (req.user!.role === "federation_admin" && await canAccessFederation(req.user!.id, coopResult.rows[0].federation_id)) ||
      (req.user!.role === "society_admin" && await canAccessCooperative(req.user!.id, cooperativeId));
    if (!canView) { res.status(403).json({ error: "Cannot view this cooperative" }); return; }

    const stats = await territoryService.getTerritoryStatistics(cooperativeId);
    res.json(stats);
  } catch (error) { next(error); }
});

// ─── UNASSIGNED BOOKINGS ──────────────────────────────────────────────────
territoryRouter.get("/unassigned", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    let federationId: string | undefined;
    if (req.user!.role === "federation_admin") {
      const { pool } = await import("../db/pool.js");
      const result = await pool.query(`SELECT federation_id FROM admin_scopes WHERE user_id = $1`, [req.user!.id]);
      federationId = result.rows[0]?.federation_id;
    }
    const bookings = await territoryService.getUnassignedBookings(federationId);
    res.json({ bookings });
  } catch (error) { next(error); }
});

// ─── ASSIGN BOOKING TO SOCIETY ────────────────────────────────────────────
territoryRouter.post("/assign-booking", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const { bookingId, cooperativeId } = z.object({
      bookingId: z.string().uuid(),
      cooperativeId: z.string().uuid(),
    }).parse(req.body);

    const { pool } = await import("../db/pool.js");
    const coopResult = await pool.query(`SELECT federation_id FROM cooperatives WHERE id = $1`, [cooperativeId]);
    if (!coopResult.rows[0]) { res.status(404).json({ error: "Cooperative not found" }); return; }

    const canAssign = req.user!.role === "system_admin" ||
      (req.user!.role === "federation_admin" && await canAccessFederation(req.user!.id, coopResult.rows[0].federation_id));
    if (!canAssign) { res.status(403).json({ error: "Cannot assign to this cooperative" }); return; }

    const result = await territoryService.assignBookingToSociety(bookingId, cooperativeId, req.user!.id);
    if (!result) { res.status(404).json({ error: "Booking not found" }); return; }

    await recordAuditEvent({
      actorId: req.user!.id,
      action: "booking.assigned_to_society",
      resourceType: "booking",
      resourceId: bookingId,
      metadata: { cooperativeId },
    }).catch(() => undefined);

    res.json({ success: true });
  } catch (error) { next(error); }
});

// ─── FEDERATION COVERAGE STATS ─────────────────────────────────────────────
territoryRouter.get("/federations/:federationId/coverage-stats", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const federationId = param(req, "federationId");

    if (req.user!.role === "federation_admin") {
      const hasAccess = await canAccessFederation(req.user!.id, federationId);
      if (!hasAccess) { res.status(403).json({ error: "Cannot access this federation" }); return; }
    }

    const stats = await territoryService.getFederationCoverageStats(federationId);
    res.json(stats);
  } catch (error) { next(error); }
});

// ─── TERRITORY GAP DETECTION ───────────────────────────────────────────────
territoryRouter.get("/federations/:federationId/gaps", requireAuth, requireRoles("system_admin", "federation_admin"), async (req, res, next) => {
  try {
    const federationId = param(req, "federationId");

    if (req.user!.role === "federation_admin") {
      const hasAccess = await canAccessFederation(req.user!.id, federationId);
      if (!hasAccess) { res.status(403).json({ error: "Cannot access this federation" }); return; }
    }

    const gaps = await territoryService.detectTerritoryGaps(federationId);
    res.json({ gaps });
  } catch (error) { next(error); }
});

// ─── WORKER TERRITORY RESOLUTION ───────────────────────────────────────────
territoryRouter.get("/worker/:workerId/resolve", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const workerId = param(req, "workerId");

    const { pool } = await import("../db/pool.js");
    const workerResult = await pool.query(
      `SELECT w.id, w.cooperative_id, c.federation_id
       FROM workers w
       JOIN cooperatives c ON c.id = w.cooperative_id
       WHERE w.id = $1`,
      [workerId]
    );
    if (!workerResult.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }

    const canView = req.user!.role === "system_admin" ||
      (req.user!.role === "federation_admin" && await canAccessFederation(req.user!.id, workerResult.rows[0].federation_id)) ||
      (req.user!.role === "society_admin" && await canAccessCooperative(req.user!.id, workerResult.rows[0].cooperative_id));
    if (!canView) { res.status(403).json({ error: "Cannot view this worker" }); return; }

    const territory = await territoryService.getTerritoryByCooperative(workerResult.rows[0].cooperative_id);
    res.json({ territory, cooperativeId: workerResult.rows[0].cooperative_id });
  } catch (error) { next(error); }
});
