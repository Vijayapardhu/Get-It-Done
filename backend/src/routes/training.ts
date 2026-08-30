import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

const moduleCreateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(100).optional(),
  durationMinutes: z.number().int().positive().max(480).optional(),
  passingScore: z.number().int().min(50).max(100).default(70),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

const questionCreateSchema = z.object({
  text: z.string().trim().min(5).max(1000),
  options: z.array(z.object({ text: z.string().trim().min(1).max(500), isCorrect: z.boolean() })).min(2).max(6),
  explanation: z.string().trim().max(1000).optional(),
  orderIndex: z.number().int().min(0).default(0),
});

export const trainingRouter = Router();

trainingRouter.param("moduleId", rejectNonUuidParam);

// Get all published training modules (worker-facing)
trainingRouter.get("/modules", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const workerResult = await pool.query("SELECT id FROM workers WHERE user_id = $1", [userId]);
    if (workerResult.rowCount === 0) {
      return res.json({ modules: [] });
    }
    const workerId = workerResult.rows[0].id;

    // Get published modules with worker's progress
    const result = await pool.query(
      `SELECT tm.id, tm.title, tm.description, tm.category, tm.duration_minutes as "durationMinutes",
              tm.passing_score as "passingScore",
              COALESCE(wtr.status, 'not_started') as status,
              COALESCE(wtr.completed_on, NULL) as "completedOn",
              COALESCE(wtr.score, NULL) as score,
              tm.created_at as "createdAt"
         FROM training_modules tm
         LEFT JOIN worker_training_records wtr
           ON wtr.training_module_id = tm.id AND wtr.worker_id = $1
        WHERE tm.status = 'published'
        ORDER BY tm.created_at DESC`,
      [workerId]
    );
    res.json({ modules: result.rows });
  } catch (error) { next(error); }
});

// Get module with quiz questions
trainingRouter.get("/modules/:moduleId", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const workerResult = await pool.query("SELECT id FROM workers WHERE user_id = $1", [userId]);
    if (workerResult.rowCount === 0) {
      return res.status(404).json({ error: "WORKER_NOT_FOUND" });
    }
    const workerId = workerResult.rows[0].id;
    const moduleId = z.string().uuid().parse(req.params.moduleId);

    const moduleResult = await pool.query(
      `SELECT tm.id, tm.title, tm.description, tm.category, tm.duration_minutes as "durationMinutes",
              tm.passing_score as "passingScore", tm.status,
              COALESCE(wtr.status, 'not_started') as status,
              COALESCE(wtr.completed_on, NULL) as "completedOn",
              COALESCE(wtr.score, NULL) as score
         FROM training_modules tm
         LEFT JOIN worker_training_records wtr
           ON wtr.training_module_id = tm.id AND wtr.worker_id = $1
        WHERE tm.id = $2 AND tm.status = 'published'`,
      [workerId, moduleId]
    );
    if (moduleResult.rowCount === 0) {
      return res.status(404).json({ error: "MODULE_NOT_FOUND" });
    }

    const questionsResult = await pool.query(
      `SELECT id, text, options, explanation, order_index as "orderIndex"
         FROM training_questions
        WHERE module_id = $1
        ORDER BY order_index ASC`,
      [moduleId]
    );

    res.json({
      module: moduleResult.rows[0],
      questions: questionsResult.rows.map(q => ({
        id: q.id,
        text: q.text,
        options: q.options,
        explanation: q.explanation,
      })),
    });
  } catch (error) { next(error); }
});

// Submit quiz
trainingRouter.post("/modules/:moduleId/submit", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const workerResult = await pool.query("SELECT id FROM workers WHERE user_id = $1", [userId]);
    if (workerResult.rowCount === 0) {
      return res.status(404).json({ error: "WORKER_NOT_FOUND" });
    }
    const workerId = workerResult.rows[0].id;
    const moduleId = z.string().uuid().parse(req.params.moduleId);
    const { answers, retake } = z.object({
      answers: z.array(z.object({ questionId: z.string().uuid(), optionIndex: z.number().int().min(0) })).min(1),
      retake: z.boolean().default(false),
    }).parse(req.body);

    // Get module and correct answers
    const moduleResult = await pool.query(
      `SELECT id, passing_score FROM training_modules WHERE id = $1 AND status = 'published'`,
      [moduleId]
    );
    if (moduleResult.rowCount === 0) {
      return res.status(404).json({ error: "MODULE_NOT_FOUND" });
    }
    const passingScore = moduleResult.rows[0].passing_score;

    const questionsResult = await pool.query(
      `SELECT id, options FROM training_questions WHERE module_id = $1 ORDER BY order_index ASC`,
      [moduleId]
    );
    const questions = questionsResult.rows;
    if (questions.length === 0) {
      return res.status(400).json({ error: "NO_QUESTIONS" });
    }

    // Calculate score
    let correct = 0;
    for (const ans of answers) {
      const q = questions.find(qq => qq.id === ans.questionId);
      if (q && q.options[ans.optionIndex]?.isCorrect) correct++;
    }
    const score = Math.round((correct / questions.length) * 100);
    const passed = score >= passingScore;

    // Check if already completed
    const existingResult = await pool.query(
      `SELECT id, status FROM worker_training_records WHERE worker_id = $1 AND training_module_id = $2`,
      [workerId, moduleId]
    );

    let recordId;
    if ((existingResult.rowCount ?? 0) > 0) {
      if (!retake && existingResult.rows[0].status === 'completed') {
        return res.status(409).json({ error: "ALREADY_COMPLETED", message: "Use retake=true to retry" });
      }
      recordId = existingResult.rows[0].id;
      await pool.query(
        `UPDATE worker_training_records
            SET status = 'completed', score = $3, completed_on = CURRENT_DATE, retake_count = COALESCE(retake_count, 0) + 1, updated_at = NOW()
          WHERE id = $1`,
        [recordId, workerId, score]
      );
    } else {
      const insertResult = await pool.query(
        `INSERT INTO worker_training_records (worker_id, training_module_id, course_name, status, score, completed_on)
         VALUES ($1, $2, (SELECT title FROM training_modules WHERE id = $2), 'completed', $3, CURRENT_DATE)
         RETURNING id`,
        [workerId, moduleId, score]
      );
      recordId = insertResult.rows[0].id;
    }

    await recordAuditEvent({
      actorId: userId,
      action: "training_quiz_submitted",
      resourceType: "training_module",
      resourceId: moduleId,
      metadata: { score, passed, retake: !!retake },
    }).catch(() => {});

    res.json({ passed, score, passingScore, certificateUrl: passed ? `/training/modules/${moduleId}/certificate` : null });
  } catch (error) { next(error); }
});

// Get certificate (placeholder)
trainingRouter.get("/modules/:moduleId/certificate", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const workerResult = await pool.query("SELECT id FROM workers WHERE user_id = $1", [userId]);
    if (workerResult.rowCount === 0) return res.status(404).json({ error: "WORKER_NOT_FOUND" });
    const workerId = workerResult.rows[0].id;
    const moduleId = z.string().uuid().parse(req.params.moduleId);

    const recordResult = await pool.query(
      `SELECT completed_on, score FROM worker_training_records
       WHERE worker_id = $1 AND training_module_id = $2 AND status = 'completed'`,
      [workerId, moduleId]
    );
    if (recordResult.rowCount === 0) {
      return res.status(404).json({ error: "CERTIFICATE_NOT_EARNED" });
    }
    // TODO: Generate PDF certificate
    res.json({ message: "Certificate generation not yet implemented" });
  } catch (error) { next(error); }
});

// Admin: Create module
trainingRouter.post("/admin/modules", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = moduleCreateSchema.parse(req.body);
    const result = await pool.query(
      `INSERT INTO training_modules (title, description, category, duration_minutes, passing_score, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [input.title, input.description, input.category, input.durationMinutes, input.passingScore, input.status]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) { next(error); }
});

// Admin: Add question to module
trainingRouter.post("/admin/modules/:moduleId/questions", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const moduleId = z.string().uuid().parse(req.params.moduleId);
    const input = questionCreateSchema.parse(req.body);
    const correctCount = input.options.filter(o => o.isCorrect).length;
    if (correctCount !== 1) {
      return res.status(400).json({ error: "EXACTLY_ONE_CORRECT_OPTION" });
    }
    const result = await pool.query(
      `INSERT INTO training_questions (module_id, text, options, explanation, order_index)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [moduleId, input.text, JSON.stringify(input.options), input.explanation, input.orderIndex]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) { next(error); }
});

export default trainingRouter;