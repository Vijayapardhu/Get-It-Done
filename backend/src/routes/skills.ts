import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

/**
 * @openapi
 * /skills:
 *   get:
 *     summary: List all skills
 *     tags: [Skills]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of skills }
 *   post:
 *     summary: Create skill (admin)
 *     tags: [Skills]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [name, category], properties: { name: { type: string }, category: { type: string }, description: { type: string }, requiresCertification: { type: boolean } } }
 *     responses:
 *       201: { description: Skill created }
 * /skills/{id}:
 *   patch:
 *     summary: Update skill (admin)
 *     tags: [Skills]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { name: { type: string }, category: { type: string }, description: { type: string }, requiresCertification: { type: boolean } } }
 *     responses:
 *       200: { description: Skill updated }
 * /skills/workers/{workerId}/skills:
 *   get:
 *     summary: Get worker skills
 *     tags: [Skills]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Worker skills }
 *   post:
 *     summary: Add skill to worker
 *     tags: [Skills]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [skillId], properties: { skillId: { type: string, format: uuid }, level: { type: string, enum: [beginner, intermediate, expert, master] }, yearsExperience: { type: integer } } }
 *     responses:
 *       201: { description: Skill added }
 * /skills/workers/{workerId}/skills/{skillId}:
 *   patch:
 *     summary: Update worker skill
 *     tags: [Skills]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: skillId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { level: { type: string, enum: [beginner, intermediate, expert, master] }, yearsExperience: { type: integer } } }
 *     responses:
 *       200: { description: Skill updated }
 *   delete:
 *     summary: Remove worker skill
 *     tags: [Skills]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: skillId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Skill removed }
 * /skills/workers/{workerId}/skills/{skillId}/verify:
 *   post:
 *     summary: Verify worker skill (admin)
 *     tags: [Skills]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: skillId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { level: { type: string, enum: [beginner, intermediate, expert, master] }, verified: { type: boolean } } }
 *     responses:
 *       200: { description: Skill verified }
 */

export const skillsRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
skillsRouter.param("id", rejectNonUuidParam);
skillsRouter.param("workerId", rejectNonUuidParam);
skillsRouter.param("skillId", rejectNonUuidParam);

const skillCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(50),
  description: z.string().trim().max(500).optional(),
  requiresCertification: z.boolean().default(false),
});

const skillUpdateSchema = skillCreateSchema.partial();

const workerSkillSchema = z.object({
  skillId: z.string().uuid(),
  level: z.enum(["beginner", "intermediate", "expert", "master"]).default("beginner"),
  yearsExperience: z.number().int().min(0).max(80).default(0),
});

const workerSkillUpdateSchema = z.object({
  level: z.enum(["beginner", "intermediate", "expert", "master"]).optional(),
  yearsExperience: z.number().int().min(0).max(80).optional(),
});

skillsRouter.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM skills WHERE status = 'active' ORDER BY category, name`);
    const categorized = result.rows.reduce((acc: Record<string, typeof result.rows>, skill) => {
      if (!acc[skill.category]) acc[skill.category] = [];
      acc[skill.category].push(skill);
      return acc;
    }, {});
    res.json({ skills: result.rows, categorized });
  } catch (error) { next(error); }
});

skillsRouter.post("/", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = skillCreateSchema.parse(req.body);
    let result;
    try {
      result = await pool.query(`INSERT INTO skills (id, name, category, description, requires_certification) VALUES ($1, $2, $3, $4, $5) RETURNING *`, [crypto.randomUUID(), input.name, input.category, input.description ?? null, input.requiresCertification]);
    } catch (insertError) {
      if ((insertError as { code?: string })?.code === "23505") { res.status(409).json({ error: "A skill with this name already exists" }); return; }
      throw insertError;
    }
    await recordAuditEvent({ actorId: req.user!.id, action: "skill.created", resourceType: "skill", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ skill: result.rows[0] });
  } catch (error) { next(error); }
});

skillsRouter.patch("/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = skillUpdateSchema.parse(req.body);
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) { fields.push(`${key} = $${index++}`); values.push(value); }
    }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(req.params.id);
    const result = await pool.query(`UPDATE skills SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} RETURNING *`, values);
    if (!result.rows[0]) { res.status(404).json({ error: "Skill not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "skill.updated", resourceType: "skill", resourceId: String(req.params.id), requestId: req.header("x-request-id") ?? undefined, metadata: { fields: Object.keys(input) } }).catch(() => undefined);
    res.json({ skill: result.rows[0] });
  } catch (error) { next(error); }
});

skillsRouter.get("/workers/:workerId/skills", requireAuth, async (req, res, next) => {
  try {
    const workerId = String(req.params.workerId);
    const result = await pool.query(`SELECT ws.*, s.name, s.category, s.requires_certification FROM worker_skills_new ws JOIN skills s ON s.id = ws.skill_id WHERE ws.worker_id = $1 ORDER BY s.category, s.name`, [workerId]);
    res.json({ skills: result.rows });
  } catch (error) { next(error); }
});

skillsRouter.post("/workers/:workerId/skills", requireAuth, async (req, res, next) => {
  try {
    const workerId = String(req.params.workerId);
    const input = workerSkillSchema.parse(req.body);
    const worker = await pool.query(`SELECT id FROM workers WHERE id = $1`, [workerId]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    const canManage = req.user!.role === "worker" && worker.rows[0].id === req.user!.id || ["system_admin", "federation_admin", "society_admin"].includes(req.user!.role);
    if (!canManage) { res.status(403).json({ error: "Cannot manage skills for this worker" }); return; }
    const result = await pool.query(`INSERT INTO worker_skills_new (worker_id, skill_id, level, years_experience) VALUES ($1, $2, $3, $4) ON CONFLICT (worker_id, skill_id) DO UPDATE SET level = EXCLUDED.level, years_experience = EXCLUDED.years_experience RETURNING *`, [workerId, input.skillId, input.level, input.yearsExperience]);
    await recordAuditEvent({ actorId: req.user!.id, action: "worker_skill.added", resourceType: "worker_skill", resourceId: workerId, requestId: req.header("x-request-id") ?? undefined, metadata: { skillId: input.skillId } }).catch(() => undefined);
    res.status(201).json({ skill: result.rows[0] });
  } catch (error) { next(error); }
});

skillsRouter.patch("/workers/:workerId/skills/:skillId", requireAuth, async (req, res, next) => {
  try {
    const workerId = String(req.params.workerId);
    const skillId = String(req.params.skillId);
    const input = workerSkillUpdateSchema.parse(req.body);
    const worker = await pool.query(`SELECT id FROM workers WHERE id = $1`, [workerId]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    const canManage = req.user!.role === "worker" && worker.rows[0].id === req.user!.id || ["system_admin", "federation_admin", "society_admin"].includes(req.user!.role);
    if (!canManage) { res.status(403).json({ error: "Cannot manage skills for this worker" }); return; }
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) { fields.push(`${key} = $${index++}`); values.push(value); }
    }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(workerId, skillId);
    const result = await pool.query(`UPDATE worker_skills_new SET ${fields.join(", ")} WHERE worker_id = $${index++} AND skill_id = $${index} RETURNING *`, values);
    if (!result.rows[0]) { res.status(404).json({ error: "Worker skill not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "worker_skill.updated", resourceType: "worker_skill", resourceId: workerId, requestId: req.header("x-request-id") ?? undefined, metadata: { skillId, fields: Object.keys(input) } }).catch(() => undefined);
    res.json({ skill: result.rows[0] });
  } catch (error) { next(error); }
});

skillsRouter.delete("/workers/:workerId/skills/:skillId", requireAuth, async (req, res, next) => {
  try {
    const workerId = String(req.params.workerId);
    const skillId = String(req.params.skillId);
    const worker = await pool.query(`SELECT id FROM workers WHERE id = $1`, [workerId]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    const canManage = req.user!.role === "worker" && worker.rows[0].id === req.user!.id || ["system_admin", "federation_admin", "society_admin"].includes(req.user!.role);
    if (!canManage) { res.status(403).json({ error: "Cannot manage skills for this worker" }); return; }
    await pool.query(`DELETE FROM worker_skills_new WHERE worker_id = $1 AND skill_id = $2`, [workerId, skillId]);
    await recordAuditEvent({ actorId: req.user!.id, action: "worker_skill.removed", resourceType: "worker_skill", resourceId: workerId, requestId: req.header("x-request-id") ?? undefined, metadata: { skillId } }).catch(() => undefined);
    res.status(204).send();
  } catch (error) { next(error); }
});

skillsRouter.post("/workers/:workerId/skills/:skillId/verify", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const workerId = String(req.params.workerId);
    const skillId = String(req.params.skillId);
    const input = z.object({ level: z.enum(["beginner", "intermediate", "expert", "master"]).optional(), verified: z.boolean().default(true) }).parse(req.body);
    const current = await pool.query(`SELECT * FROM worker_skills_new WHERE worker_id = $1 AND skill_id = $2`, [workerId, skillId]);
    if (!current.rows[0]) { res.status(404).json({ error: "Worker skill not found" }); return; }
    const result = await pool.query(`UPDATE worker_skills_new SET verified = $1, verified_at = CASE WHEN $1 THEN now() ELSE null END, verified_by = CASE WHEN $1 THEN $3 ELSE null END, level = COALESCE($2, level) WHERE worker_id = $3 AND skill_id = $4 RETURNING *`, [input.verified, input.level ?? null, req.user!.id, workerId, skillId]);
    await pool.query(`INSERT INTO skill_verifications (worker_id, skill_id, actor_id, from_level, to_level, from_verified, to_verified, reason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [workerId, skillId, req.user!.id, current.rows[0].level, result.rows[0].level, current.rows[0].verified, result.rows[0].verified, `Verified by admin`]);
    await recordAuditEvent({ actorId: req.user!.id, action: "worker_skill.verified", resourceType: "worker_skill", resourceId: workerId, requestId: req.header("x-request-id") ?? undefined, metadata: { skillId, verified: input.verified } }).catch(() => undefined);
    res.json({ skill: result.rows[0] });
  } catch (error) { next(error); }
});