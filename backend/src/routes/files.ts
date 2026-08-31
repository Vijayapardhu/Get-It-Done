import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { requireAuth } from "../middleware/auth.js";
import { getUploadUrl, completeUpload, getDownloadUrl, deleteFile, scanForMalware, MAX_FILE_SIZE, putObject, BUCKET, s3Client } from "../core/storage.js";
import { recordAuditEvent } from "../services/auditService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";
import crypto from "node:crypto";

export const filesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

filesRouter.post("/upload", requireAuth, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const type = z.string().trim().min(2).max(50).parse(req.body.type ?? "general");
    const ext = req.file.originalname.split(".").pop()?.toLowerCase() ?? "bin";
    const hash = crypto.randomBytes(16).toString("hex");
    const fileKey = `private/${type}/${req.user!.id}/${hash}.${ext}`;

    const result = await putObject(fileKey, req.file.buffer, req.file.mimetype);

    await recordAuditEvent({
      actorId: req.user!.id,
      action: "file.uploaded",
      resourceType: "file",
      resourceId: fileKey,
      requestId: req.header("x-request-id") ?? undefined,
      metadata: { type, size: req.file.size },
    }).catch(() => undefined);

    res.status(201).json({ fileKey: result.fileKey, url: `/files/${result.fileKey}` });
  } catch (error) { next(error); }
});

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
filesRouter.param("id", rejectNonUuidParam);

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
    let scanResult;
    try {
      scanResult = await scanForMalware(fileKey);
    } catch (scanError) {
      if ((scanError as Error)?.name === "NoSuchKey") { res.status(400).json({ error: "FILE_NOT_UPLOADED" }); return; }
      throw scanError;
    }
    if (!scanResult.clean) {
      await deleteFile(fileKey).catch(() => undefined);
      return res.status(400).json({ error: "FILE_FAILED_MALWARE_SCAN", details: scanResult.details });
    }
    let result;
    try {
      result = await completeUpload(fileKey);
    } catch (completeError) {
      if ((completeError as Error)?.name === "NoSuchKey") { res.status(400).json({ error: "FILE_NOT_UPLOADED" }); return; }
      throw completeError;
    }
    await recordAuditEvent({ actorId: req.user!.id, action: "file.uploaded", resourceType: "file", resourceId: fileKey, requestId: req.header("x-request-id") ?? undefined, metadata: { type: req.body.type } }).catch(() => undefined);
    res.json(result);
  } catch (error) { next(error); }
});

filesRouter.get("*", async (req, res, next) => {
  try {
    const fileKey = decodeURIComponent(req.path.slice(1));
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: fileKey });
    const object = await s3Client.send(command);
    res.set("Content-Type", object.ContentType ?? "application/octet-stream");
    res.set("Content-Length", object.ContentLength?.toString() ?? "0");
    res.set("Cache-Control", "public, max-age=31536000");
    if (object.Body) {
      (object.Body as NodeJS.ReadableStream).pipe(res);
    } else {
      res.status(404).json({ error: "File not found" });
    }
  } catch (error) { next(error); }
});

filesRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const fileKey = decodeURIComponent(String(req.params.id));
    await deleteFile(fileKey);
    res.status(204).send();
  } catch (error) { next(error); }
});