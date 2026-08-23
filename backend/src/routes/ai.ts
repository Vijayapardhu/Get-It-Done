import { Router } from "express";
import { env } from "../config/env.js";
import { requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";

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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AIDemandForecast'
 *       500:
 *         description: AI service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @openapi
 * /ai/workforce-allocation:
 *   get:
 *     summary: Get workforce allocation recommendations
 *     description: Returns AI-powered workforce allocation recommendations
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Workforce allocation recommendations
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AIWorkforceAllocation'
 *       500:
 *         description: AI service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

export const aiRouter = Router();

async function loadDemandHistory() {
  const result = await pool.query(`select b.created_at::date as date, b.address as area, s.name as service, count(*)::int as requests from bookings b join services s on s.id = b.service_id where b.created_at >= current_date - interval '90 days' group by b.created_at::date, b.address, s.name order by date`);
  return result.rows.map((row) => ({ date: row.date, area: row.area, service: row.service, requests: row.requests }));
}

aiRouter.get("/demand-forecast", async (_req, res, next) => {
  try {
    const history = await loadDemandHistory();
    const response = await fetch(`${env.AI_SERVICE_URL}/forecast/demand`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days: 1, history }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) { res.status(502).json({ error: "AI service unavailable" }); return; }
    res.json(await response.json());
  } catch (error) {
    next(error);
  }
});

aiRouter.get("/workforce-allocation", requireRoles("society_admin", "federation_admin", "system_admin"), async (_req, res, next) => {
  try {
    const history = await loadDemandHistory();
    const response = await fetch(`${env.AI_SERVICE_URL}/allocation/recommend`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ horizonDays: 1, history }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) { res.status(502).json({ error: "AI service unavailable" }); return; }
    res.json(await response.json());
  } catch (error) {
    next(error);
  }
});

