import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { getUploadUrl, completeUpload, scanForMalware, deleteFile } from "../core/storage.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

/**
 * @openapi
 * /documents/types:
 *   get:
 *     summary: List document types
 *     tags: [Documents]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of document types }
 *   post:
 *     summary: Create document type (admin)
 *     tags: [Documents]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [name, category], properties: { name: { type: string }, category: { type: string }, requiredForSkills: { type: array, items: { type: string, format: uuid } }, maxSizeMb: { type: integer }, allowedMimeTypes: { type: array, items: { type: string } }, expires: { type: boolean } } }
 *     responses:
 *       201: { description: Document type created }
 * /documents/workers/{workerId}/documents/upload-url:
 *   post:
 *     summary: Get upload URL for document
 *     tags: [Documents]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [type, filename, contentType], properties: { type: { type: string }, filename: { type: string }, contentType: { type: string } } }
 *     responses:
 *       201: { description: Upload URL generated }
 * /documents/workers/{workerId}/documents:
 *   post:
 *     summary: Submit document for review
 *     tags: [Documents]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [type, fileKey], properties: { type: { type: string }, fileKey: { type: string }, issuedBy: { type: string }, issuedAt: { type: string, format: date }, expiresAt: { type: string, format: date } } }
 *     responses:
 *       201: { description: Document submitted }
 *   get:
 *     summary: List worker documents
 *     tags: [Documents]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: List of documents }
 * /documents/workers/{workerId}/documents/{documentId}:
 *   get:
 *     summary: Get document details with reviews
 *     tags: [Documents]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: documentId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Document with reviews }
 * /documents/documents/{id}/submit:
 *   post:
 *     summary: Submit document for review
 *     tags: [Documents]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Document submitted }
 * /documents/documents/{id}/approve:
 *   post:
 *     summary: Approve document (admin)
 *     tags: [Documents]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { reason: { type: string } } }
 *     responses:
 *       200: { description: Document approved }
 * /documents/documents/{id}/reject:
 *   post:
 *     summary: Reject document (admin)
 *     tags: [Documents]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [reason], properties: { reason: { type: string } } }
 *     responses:
 *       200: { description: Document rejected }
 * /documents/workers/{workerId}/certifications:
 *   get:
 *     summary: List worker certifications
 *     tags: [Documents]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: List of certifications }
 *   post:
 *     summary: Create certification
 *     tags: [Documents]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [skillId], properties: { skillId: { type: string, format: uuid }, documentId: { type: string, format: uuid }, expiresAt: { type: string, format: date } } }
 *     responses:
 *       201: { description: Certification created }
 * /documents/certifications/{id}:
 *   patch:
 *     summary: Update certification
 *     tags: [Documents]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { status: { type: string, enum: [active, expired, revoked] }, expiresAt: { type: string, format: date } } }
 *     responses:
 *       200: { description: Certification updated }
 *   delete:
 *     summary: Delete certification
 *     tags: [Documents]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Certification deleted }
 */

export const documentsRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
documentsRouter.param("id", rejectNonUuidParam);
documentsRouter.param("workerId", rejectNonUuidParam);
documentsRouter.param("documentId", rejectNonUuidParam);

const documentTypeCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(50),
  requiredForSkills: z.array(z.string().uuid()).default([]),
  maxSizeMb: z.number().int().positive().max(100).default(10),
  allowedMimeTypes: z.array(z.string()).default([]),
  expires: z.boolean().default(true),
});

const documentSubmitSchema = z.object({
  type: z.string().trim().min(2).max(50),
  fileKey: z.string().min(1),
  issuedBy: z.string().trim().optional(),
  issuedAt: z.string().date().optional(),
  expiresAt: z.string().date().optional(),
});

const documentReviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500).optional(),
});

const certificationCreateSchema = z.object({
  skillId: z.string().uuid(),
  documentId: z.string().uuid().optional(),
  expiresAt: z.string().date().optional(),
});

/**
 * Resolve the caller's own worker id and rewrite to the /workers/:workerId/...
 * form, so the self-service and admin spellings share one handler.
 *
 * The blueprint documents POST /documents/upload-url, POST /documents and
 * GET /documents/my; the codebase only had the admin-shaped paths.
 */
async function resolveOwnWorker(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const worker = await pool.query("SELECT id FROM workers WHERE user_id = $1", [req.user!.id]);
    if (!worker.rows[0]) {
      res.status(404).json({ error: "Worker profile not found for this account" });
      return;
    }

    const workerId = worker.rows[0].id;
    const queryIndex = req.url.indexOf("?");
    const path = queryIndex === -1 ? req.url : req.url.slice(0, queryIndex);
    const search = queryIndex === -1 ? "" : req.url.slice(queryIndex);

    if (path === "/upload-url") {
      req.url = `/workers/${workerId}/documents/upload-url${search}`;
    } else if (path === "/my") {
      req.url = `/workers/${workerId}/documents${search}`;
    } else {
      req.url = `/workers/${workerId}/documents${search}`;
    }

    next();
  } catch (error) { next(error); }
}

documentsRouter.post("/upload-url", requireAuth, resolveOwnWorker);
documentsRouter.get("/my", requireAuth, resolveOwnWorker);
// POST /documents with no sub-path registers the uploaded file for verification.
documentsRouter.post("/", requireAuth, resolveOwnWorker);

documentsRouter.get("/types", async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM document_types ORDER BY category, name`);
    res.json({ documentTypes: result.rows });
  } catch (error) { next(error); }
});

documentsRouter.post("/types", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const input = documentTypeCreateSchema.parse(req.body);
    let result;
    try {
      result = await pool.query(`INSERT INTO document_types (id, name, category, required_for_skills, max_size_mb, allowed_mime_types, expires) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [crypto.randomUUID(), input.name, input.category, input.requiredForSkills, input.maxSizeMb, input.allowedMimeTypes, input.expires]);
    } catch (insertError) {
      if ((insertError as { code?: string })?.code === "23505") { res.status(409).json({ error: "A document type with this name already exists" }); return; }
      throw insertError;
    }
    await recordAuditEvent({ actorId: req.user!.id, action: "document_type.created", resourceType: "document_type", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ documentType: result.rows[0] });
  } catch (error) { next(error); }
});

documentsRouter.post("/workers/:workerId/documents/upload-url", requireAuth, async (req, res, next) => {
  try {
    const workerId = String(req.params.workerId);
    const worker = await pool.query(`SELECT id, user_id FROM workers WHERE id = $1`, [workerId]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    const canUpload = req.user!.role === "worker" && worker.rows[0].user_id === req.user!.id || ["system_admin", "federation_admin", "society_admin"].includes(req.user!.role);
    if (!canUpload) { res.status(403).json({ error: "Cannot upload documents for this worker" }); return; }
    const input = z.object({ type: z.string().trim().min(2).max(50), filename: z.string().trim().min(1).max(255), contentType: z.string().trim().min(1).max(100) }).parse(req.body);
    const result = await getUploadUrl(worker.rows[0].user_id, `worker_documents/${input.type}`, input.filename, input.contentType);
    res.status(201).json(result);
  } catch (error) { next(error); }
});

documentsRouter.post("/workers/:workerId/documents", requireAuth, async (req, res, next) => {
  try {
    const workerId = String(req.params.workerId);
    const worker = await pool.query(`SELECT id, user_id FROM workers WHERE id = $1`, [workerId]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    const canSubmit = req.user!.role === "worker" && worker.rows[0].user_id === req.user!.id || ["system_admin", "federation_admin", "society_admin"].includes(req.user!.role);
    if (!canSubmit) { res.status(403).json({ error: "Cannot submit documents for this worker" }); return; }
    const input = documentSubmitSchema.parse(req.body);
    let scanResult, completeResult;
    try {
      scanResult = await scanForMalware(input.fileKey);
      if (!scanResult.clean) {
        await deleteFile(input.fileKey).catch(() => undefined);
        return res.status(400).json({ error: "FILE_FAILED_MALWARE_SCAN", details: scanResult.details });
      }
      completeResult = await completeUpload(input.fileKey);
    } catch (storageError) {
      const msg = String((storageError as Error)?.message ?? "");
      if ((storageError as Error)?.name === "NoSuchKey" || msg.includes("does not exist")) {
        return res.status(400).json({ error: "FILE_NOT_UPLOADED", fileKey: input.fileKey });
      }
      throw storageError;
    }
    const result = await pool.query(`INSERT INTO worker_documents (id, worker_id, type, file_url, file_hash, status, issued_by, issued_at, expires_at) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8) RETURNING *`, [crypto.randomUUID(), workerId, input.type, completeResult.fileUrl, null, input.issuedBy ?? null, input.issuedAt ?? null, input.expiresAt ?? null]);
    await pool.query(`INSERT INTO document_reviews (document_id, actor_id, action, reason) VALUES ($1, $2, 'submitted', $3)`, [result.rows[0].id, req.user!.id, "Submitted by worker"]);
    await recordAuditEvent({ actorId: req.user!.id, action: "document.submitted", resourceType: "document", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined, metadata: { workerId, type: input.type } }).catch(() => undefined);
    res.status(201).json({ document: result.rows[0] });
  } catch (error) { next(error); }
});

documentsRouter.get("/workers/:workerId/documents", requireAuth, async (req, res, next) => {
  try {
    const workerId = String(req.params.workerId);
    const worker = await pool.query(`SELECT id, user_id FROM workers WHERE id = $1`, [workerId]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    const canView = req.user!.role === "worker" && worker.rows[0].user_id === req.user!.id || ["system_admin", "federation_admin", "society_admin"].includes(req.user!.role);
    if (!canView) { res.status(403).json({ error: "Cannot view documents for this worker" }); return; }
    const result = await pool.query(`SELECT wd.*, dr.action as last_action, dr.created_at as last_action_at FROM worker_documents wd LEFT JOIN document_reviews dr ON dr.document_id = wd.id WHERE wd.worker_id = $1 ORDER BY wd.created_at DESC`, [workerId]);
    res.json({ documents: result.rows });
  } catch (error) { next(error); }
});

documentsRouter.get("/workers/:workerId/documents/:documentId", requireAuth, async (req, res, next) => {
  try {
    const workerId = String(req.params.workerId);
    const documentId = String(req.params.documentId);
    const result = await pool.query(`SELECT wd.*, dr.action as last_action, dr.created_at as last_action_at, dr.reason as last_reason, dr.actor_id as last_actor_id FROM worker_documents wd LEFT JOIN document_reviews dr ON dr.document_id = wd.id WHERE wd.id = $1 AND wd.worker_id = $2`, [documentId, workerId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Document not found" }); return; }
    const reviews = await pool.query(`SELECT * FROM document_reviews WHERE document_id = $1 ORDER BY created_at DESC`, [documentId]);
    res.json({ document: result.rows[0], reviews: reviews.rows });
  } catch (error) { next(error); }
});

documentsRouter.post("/:id/submit", requireAuth, async (req, res, next) => {
  try {
    const documentId = String(req.params.id);
    const result = await pool.query(`SELECT wd.*, w.user_id FROM worker_documents wd JOIN workers w ON w.id = wd.worker_id WHERE wd.id = $1`, [documentId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Document not found" }); return; }
    const canSubmit = req.user!.role === "worker" && result.rows[0].user_id === req.user!.id || ["system_admin", "federation_admin", "society_admin"].includes(req.user!.role);
    if (!canSubmit) { res.status(403).json({ error: "Cannot submit this document" }); return; }
    await pool.query(`UPDATE worker_documents SET status = 'pending' WHERE id = $1`, [documentId]);
    await pool.query(`INSERT INTO document_reviews (document_id, actor_id, action, reason) VALUES ($1, $2, 'submitted', $3)`, [documentId, req.user!.id, "Submitted for review"]);
    res.json({ message: "Document submitted for review" });
  } catch (error) { next(error); }
});

documentsRouter.post("/:id/approve", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const documentId = String(req.params.id);
    const input = documentReviewSchema.parse(req.body);
    const result = await pool.query(`UPDATE worker_documents SET status = 'approved', reviewed_by = $1, reviewed_at = now() WHERE id = $2 RETURNING *`, [req.user!.id, documentId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Document not found" }); return; }
    await pool.query(`INSERT INTO document_reviews (document_id, actor_id, action, reason) VALUES ($1, $2, 'approved', $3)`, [documentId, req.user!.id, input.reason ?? "Approved by admin"]);
    await recordAuditEvent({ actorId: req.user!.id, action: "document.approved", resourceType: "document", resourceId: documentId, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.json({ document: result.rows[0] });
  } catch (error) { next(error); }
});

documentsRouter.post("/:id/reject", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const documentId = String(req.params.id);
    const input = documentReviewSchema.parse(req.body);
    if (!input.reason) { res.status(400).json({ error: "Rejection reason is required" }); return; }
    const result = await pool.query(`UPDATE worker_documents SET status = 'rejected', reviewed_by = $1, reviewed_at = now(), rejection_reason = $2 WHERE id = $3 RETURNING *`, [req.user!.id, input.reason, documentId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Document not found" }); return; }
    await pool.query(`INSERT INTO document_reviews (document_id, actor_id, action, reason) VALUES ($1, $2, 'rejected', $3)`, [documentId, req.user!.id, input.reason]);
    await recordAuditEvent({ actorId: req.user!.id, action: "document.rejected", resourceType: "document", resourceId: documentId, requestId: req.header("x-request-id") ?? undefined, metadata: { reason: input.reason } }).catch(() => undefined);
    res.json({ document: result.rows[0] });
  } catch (error) { next(error); }
});

documentsRouter.get("/workers/:workerId/certifications", requireAuth, async (req, res, next) => {
  try {
    const workerId = String(req.params.workerId);
    const worker = await pool.query(`SELECT id, user_id FROM workers WHERE id = $1`, [workerId]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    const canView = req.user!.role === "worker" && worker.rows[0].user_id === req.user!.id || ["system_admin", "federation_admin", "society_admin"].includes(req.user!.role);
    if (!canView) { res.status(403).json({ error: "Cannot view certifications for this worker" }); return; }
    const result = await pool.query(`SELECT c.*, s.name as skill_name, s.category FROM certifications c JOIN skills s ON s.id = c.skill_id WHERE c.worker_id = $1 ORDER BY c.created_at DESC`, [workerId]);
    res.json({ certifications: result.rows });
  } catch (error) { next(error); }
});

documentsRouter.post("/workers/:workerId/certifications", requireAuth, async (req, res, next) => {
  try {
    const workerId = String(req.params.workerId);
    const worker = await pool.query(`SELECT id, user_id FROM workers WHERE id = $1`, [workerId]);
    if (!worker.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    const canCreate = req.user!.role === "worker" && worker.rows[0].user_id === req.user!.id || ["system_admin", "federation_admin", "society_admin"].includes(req.user!.role);
    if (!canCreate) { res.status(403).json({ error: "Cannot create certifications for this worker" }); return; }
    const input = certificationCreateSchema.parse(req.body);
    const result = await pool.query(`INSERT INTO certifications (id, worker_id, skill_id, document_id, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING *`, [crypto.randomUUID(), workerId, input.skillId, input.documentId ?? null, input.expiresAt ?? null]);
    await recordAuditEvent({ actorId: req.user!.id, action: "certification.created", resourceType: "certification", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined, metadata: { workerId, skillId: input.skillId } }).catch(() => undefined);
    res.status(201).json({ certification: result.rows[0] });
  } catch (error) { next(error); }
});

documentsRouter.patch("/certifications/:id", requireAuth, async (req, res, next) => {
  try {
    const certificationId = String(req.params.id);
    const result = await pool.query(`SELECT c.*, w.user_id FROM certifications c JOIN workers w ON w.id = c.worker_id WHERE c.id = $1`, [certificationId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Certification not found" }); return; }
    const canUpdate = req.user!.role === "worker" && result.rows[0].user_id === req.user!.id || ["system_admin", "federation_admin", "society_admin"].includes(req.user!.role);
    if (!canUpdate) { res.status(403).json({ error: "Cannot update this certification" }); return; }
    const input = z.object({ status: z.enum(["active", "expired", "revoked"]).optional(), expiresAt: z.string().date().optional() }).parse(req.body);
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) { fields.push(`${key === "expiresAt" ? "expires_at" : key} = $${index++}`); values.push(value); }
    }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(certificationId);
    const updateResult = await pool.query(`UPDATE certifications SET ${fields.join(", ")} WHERE id = $${index} RETURNING *`, values);
    await recordAuditEvent({ actorId: req.user!.id, action: "certification.updated", resourceType: "certification", resourceId: certificationId, requestId: req.header("x-request-id") ?? undefined, metadata: { fields: Object.keys(input) } }).catch(() => undefined);
    res.json({ certification: updateResult.rows[0] });
  } catch (error) { next(error); }
});

documentsRouter.delete("/certifications/:id", requireAuth, async (req, res, next) => {
  try {
    const certificationId = String(req.params.id);
    const result = await pool.query(`SELECT c.*, w.user_id FROM certifications c JOIN workers w ON w.id = c.worker_id WHERE c.id = $1`, [certificationId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Certification not found" }); return; }
    const canDelete = req.user!.role === "worker" && result.rows[0].user_id === req.user!.id || ["system_admin", "federation_admin", "society_admin"].includes(req.user!.role);
    if (!canDelete) { res.status(403).json({ error: "Cannot delete this certification" }); return; }
    await pool.query(`DELETE FROM certifications WHERE id = $1`, [certificationId]);
    await recordAuditEvent({ actorId: req.user!.id, action: "certification.deleted", resourceType: "certification", resourceId: certificationId, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(204).send();
  } catch (error) { next(error); }
});