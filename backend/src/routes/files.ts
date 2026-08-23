import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getUploadUrl, completeUpload, getDownloadUrl, deleteFile, scanForMalware, MAX_FILE_SIZE } from "../core/storage.js";
import { recordAuditEvent } from "../services/auditService.js";

export const filesRouter = Router();

filesRouter.post("/upload-url", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({
      type: z.string().trim().min(2).max(50),
      filename: z.string().trim().min(1).max(255),
      contentType: z.string().trim().min(1).max(100),
    }).parse(req.body);

    const result = await getUploadUrl(req.user!.id, input.type, input.filename, input.contentType);
    res.status(201).json(result);
  } catch (error) { next(error); }
});

filesRouter.post("/:id/complete", requireAuth, async (req, res, next) => {
  try {
    const fileKey = z.string().min(1).parse(req.params.id);
    const scanResult = await scanForMalware(fileKey);
    if (!scanResult.clean) {
      await deleteFile(fileKey);
      return res.status(400).json({ error: "FILE_FAILED_MALWARE_SCAN", details: scanResult.details });
    }
    const result = await completeUpload(fileKey);
    await recordAuditEvent({ actorId: req.user!.id, action: "file.uploaded", resourceType: "file", resourceId: fileKey, requestId: req.header("x-request-id") ?? undefined, metadata: { type: req.body.type } }).catch(() => undefined);
    res.json(result);
  } catch (error) { next(error); }
});

filesRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const fileKey = z.string().min(1).parse(req.params.id);
    const downloadUrl = await getDownloadUrl(fileKey);
    res.redirect(downloadUrl);
  } catch (error) { next(error); }
});

filesRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const fileKey = z.string().min(1).parse(req.params.id);
    await deleteFile(fileKey);
    res.status(204).send();
  } catch (error) { next(error); }
});