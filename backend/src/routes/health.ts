import { Router } from "express";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     description: Returns the health status of the API and database connection
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       500:
 *         description: Database connection failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

export const healthRouter = Router();

healthRouter.get("/", async (_req, res, next) => {
  try {
    if (env.USE_MOCK_DB) {
      res.json({ status: "ok", database: "mock" });
      return;
    }

    await pool.query("select 1");
    res.json({ status: "ok", database: "ok" });
  } catch (error) {
    next(error);
  }
});

healthRouter.get("/ready", async (_req, res, next) => {
  try {
    if (!env.USE_MOCK_DB) await pool.query("select 1");
    res.json({ status: "ready" });
  } catch (error) { next(error); }
});
