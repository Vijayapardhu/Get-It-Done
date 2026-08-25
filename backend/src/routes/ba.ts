import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { getUploadUrl, completeUpload, scanForMalware, deleteFile } from "../core/storage.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

export const bookingAttachmentsRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
bookingAttachmentsRouter.param("bookingId", rejectNonUuidParam);
bookingAttachmentsRouter.param("attachmentId", rejectNonUuidParam);
bookingAttachmentsRouter.param("noteId", rejectNonUuidParam);

const bookingAttachmentUploadSchema = z.object({
  type: z.string().trim().min(2).max(50),
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(100),
});

const bookingNoteCreateSchema = z.object({
  note: z.string().trim().min(1).max(5000),
});

// Helper for permission check
async function checkBookingAccess(bookingId: string, userId: string, userRole: string) {
  const booking = await pool.query(
    "SELECT id, customer_id, worker_id FROM bookings WHERE id = $1",
    [bookingId]
  );
  
  if (!booking.rows[0]) return { found: false, allowed: false };
  
  const isOwner = booking.rows[0].customer_id === userId;
  let isAssignedWorker = false;
  if (booking.rows[0].worker_id) {
    const worker = await pool.query(
      "SELECT user_id FROM workers WHERE id = $1",
      [booking.rows[0].worker_id]
    );
    isAssignedWorker = worker.rows[0]?.user_id === userId;
  }
  
  const isAdmin = ["system_admin", "federation_admin", "society_admin", "support_staff"].includes(userRole);
  return { found: true, allowed: isOwner || isAssignedWorker || isAdmin, booking: booking.rows[0] };
}

// Get upload URL for booking attachment
bookingAttachmentsRouter.post(
  "/:bookingId/attachments/upload-url",
  requireAuth,
  async (req, res, next) => {
    try {
      const bookingId = String(req.params.bookingId);
      const access = await checkBookingAccess(bookingId, req.user!.id, req.user!.role);
      
      if (!access.found) {
        res.status(404).json({ error: "Booking not found" });
        return;
      }
      if (!access.allowed) {
        res.status(403).json({ error: "Unauthorized" });
        return;
      }
      
      const input = bookingAttachmentUploadSchema.parse(req.body);
      const result = await getUploadUrl(
        req.user!.id,
        `booking_attachments/${input.type}`,
        input.filename,
        input.contentType
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

// Submit booking attachment
bookingAttachmentsRouter.post(
  "/:bookingId/attachments",
  requireAuth,
  async (req, res, next) => {
    try {
      const bookingId = String(req.params.bookingId);
      const access = await checkBookingAccess(bookingId, req.user!.id, req.user!.role);
      
      if (!access.found) {
        res.status(404).json({ error: "Booking not found" });
        return;
      }
      if (!access.allowed) {
        res.status(403).json({ error: "Unauthorized" });
        return;
      }
      
      const input = z.object({
        type: z.string().trim().min(2).max(50),
        fileKey: z.string().min(1),
      }).parse(req.body);
      
      const scanResult = await scanForMalware(input.fileKey);
      if (!scanResult.clean) {
        await deleteFile(input.fileKey);
        res.status(400).json({
          error: "FILE_FAILED_MALWARE_SCAN",
          details: scanResult.details,
        });
        return;
      }
      
      const completeResult = await completeUpload(input.fileKey);
      
      const result = await pool.query(
        `INSERT INTO booking_attachments 
         (id, booking_id, type, filename, file_url, uploaded_by) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          crypto.randomUUID(),
          bookingId,
          input.type,
          input.fileKey.split("/").pop(),
          completeResult.fileUrl,
          req.user!.id,
        ]
      );
      
      await recordAuditEvent({
        actorId: req.user!.id,
        action: "booking_attachment.created",
        resourceType: "booking_attachment",
        resourceId: result.rows[0].id,
        requestId: req.header("x-request-id") ?? undefined,
        metadata: { bookingId, type: input.type },
      }).catch(() => undefined);
      
      res.status(201).json({ attachment: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Get attachments for a booking
bookingAttachmentsRouter.get(
  "/:bookingId/attachments",
  requireAuth,
  async (req, res, next) => {
    try {
      const bookingId = String(req.params.bookingId);
      const access = await checkBookingAccess(bookingId, req.user!.id, req.user!.role);
      
      if (!access.found) {
        res.status(404).json({ error: "Booking not found" });
        return;
      }
      if (!access.allowed) {
        res.status(403).json({ error: "Unauthorized" });
        return;
      }
      
      const result = await pool.query(
        `SELECT ba.*, u.name as uploaded_by_name 
         FROM booking_attachments ba 
         LEFT JOIN users u ON u.id = ba.uploaded_by 
         WHERE ba.booking_id = $1 
         ORDER BY ba.created_at DESC`,
        [bookingId]
      );
      
      res.json({ attachments: result.rows });
    } catch (error) {
      next(error);
    }
  }
);

// Delete booking attachment
bookingAttachmentsRouter.delete(
  "/:bookingId/attachments/:attachmentId",
  requireAuth,
  async (req, res, next) => {
    try {
      const bookingId = String(req.params.bookingId);
      const attachmentId = String(req.params.attachmentId);
      const access = await checkBookingAccess(bookingId, req.user!.id, req.user!.role);
      
      if (!access.found) {
        res.status(404).json({ error: "Booking not found" });
        return;
      }
      if (!access.allowed) {
        res.status(403).json({ error: "Unauthorized" });
        return;
      }
      
      const attachment = await pool.query(
        "SELECT * FROM booking_attachments WHERE id = $1 AND booking_id = $2",
        [attachmentId, bookingId]
      );
      
      if (!attachment.rows[0]) {
        res.status(404).json({ error: "Attachment not found" });
        return;
      }
      
      const fileKey = attachment.rows[0].file_url.split("/").pop();
      await deleteFile(fileKey);
      
      await pool.query(
        "DELETE FROM booking_attachments WHERE id = $1",
        [attachmentId]
      );
      
      await recordAuditEvent({
        actorId: req.user!.id,
        action: "booking_attachment.deleted",
        resourceType: "booking_attachment",
        resourceId: attachmentId,
        requestId: req.header("x-request-id") ?? undefined,
        metadata: { bookingId },
      }).catch(() => undefined);
      
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// Create booking note
bookingAttachmentsRouter.post(
  "/:bookingId/notes",
  requireAuth,
  async (req, res, next) => {
    try {
      const bookingId = String(req.params.bookingId);
      const access = await checkBookingAccess(bookingId, req.user!.id, req.user!.role);
      
      if (!access.found) {
        res.status(404).json({ error: "Booking not found" });
        return;
      }
      if (!access.allowed) {
        res.status(403).json({ error: "Unauthorized" });
        return;
      }
      
      const input = bookingNoteCreateSchema.parse(req.body);
      
      const result = await pool.query(
        `INSERT INTO booking_notes 
         (id, booking_id, note, created_by) 
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [
          crypto.randomUUID(),
          bookingId,
          input.note,
          req.user!.id,
        ]
      );
      
      await recordAuditEvent({
        actorId: req.user!.id,
        action: "booking_note.created",
        resourceType: "booking_note",
        resourceId: result.rows[0].id,
        requestId: req.header("x-request-id") ?? undefined,
        metadata: { bookingId },
      }).catch(() => undefined);
      
      res.status(201).json({ note: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Get notes for a booking
bookingAttachmentsRouter.get(
  "/:bookingId/notes",
  requireAuth,
  async (req, res, next) => {
    try {
      const bookingId = String(req.params.bookingId);
      const access = await checkBookingAccess(bookingId, req.user!.id, req.user!.role);
      
      if (!access.found) {
        res.status(404).json({ error: "Booking not found" });
        return;
      }
      if (!access.allowed) {
        res.status(403).json({ error: "Unauthorized" });
        return;
      }
      
      const result = await pool.query(
        `SELECT bn.*, u.name as created_by_name 
         FROM booking_notes bn 
         LEFT JOIN users u ON u.id = bn.created_by 
         WHERE bn.booking_id = $1 
         ORDER BY bn.created_at DESC`,
        [bookingId]
      );
      
      res.json({ notes: result.rows });
    } catch (error) {
      next(error);
    }
  }
);

// Update booking note
bookingAttachmentsRouter.patch(
  "/:bookingId/notes/:noteId",
  requireAuth,
  async (req, res, next) => {
    try {
      const bookingId = String(req.params.bookingId);
      const noteId = String(req.params.noteId);
      const access = await checkBookingAccess(bookingId, req.user!.id, req.user!.role);
      
      if (!access.found) {
        res.status(404).json({ error: "Booking not found" });
        return;
      }
      if (!access.allowed) {
        res.status(403).json({ error: "Unauthorized" });
        return;
      }
      
      const note = await pool.query(
        "SELECT * FROM booking_notes WHERE id = $1 AND booking_id = $2",
        [noteId, bookingId]
      );
      
      if (!note.rows[0]) {
        res.status(404).json({ error: "Note not found" });
        return;
      }
      
      const isAdmin = ["system_admin", "federation_admin", "society_admin", "support_staff"].includes(req.user!.role);
      const isOwnNote = note.rows[0].created_by === req.user!.id;
      if (!(isOwnNote || isAdmin)) {
        res.status(403).json({ error: "Unauthorized to edit this note" });
        return;
      }
      
      const input = z.object({
        note: z.string().trim().min(1).max(5000),
      }).parse(req.body);
      
      const result = await pool.query(
        `UPDATE booking_notes 
         SET note = $1, updated_at = now() 
         WHERE id = $2 RETURNING *`,
        [input.note, noteId]
      );
      
      await recordAuditEvent({
        actorId: req.user!.id,
        action: "booking_note.updated",
        resourceType: "booking_note",
        resourceId: noteId,
        requestId: req.header("x-request-id") ?? undefined,
        metadata: { bookingId },
      }).catch(() => undefined);
      
      res.json({ note: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Delete booking note
bookingAttachmentsRouter.delete(
  "/:bookingId/notes/:noteId",
  requireAuth,
  async (req, res, next) => {
    try {
      const bookingId = String(req.params.bookingId);
      const noteId = String(req.params.noteId);
      const access = await checkBookingAccess(bookingId, req.user!.id, req.user!.role);
      
      if (!access.found) {
        res.status(404).json({ error: "Booking not found" });
        return;
      }
      if (!access.allowed) {
        res.status(403).json({ error: "Unauthorized" });
        return;
      }
      
      const note = await pool.query(
        "SELECT * FROM booking_notes WHERE id = $1 AND booking_id = $2",
        [noteId, bookingId]
      );
      
      if (!note.rows[0]) {
        res.status(404).json({ error: "Note not found" });
        return;
      }
      
      const isAdmin = ["system_admin", "federation_admin", "society_admin", "support_staff"].includes(req.user!.role);
      const isOwnNote = note.rows[0].created_by === req.user!.id;
      if (!(isOwnNote || isAdmin)) {
        res.status(403).json({ error: "Unauthorized to delete this note" });
        return;
      }
      
      await pool.query(
        "DELETE FROM booking_notes WHERE id = $1",
        [noteId]
      );
      
      await recordAuditEvent({
        actorId: req.user!.id,
        action: "booking_note.deleted",
        resourceType: "booking_note",
        resourceId: noteId,
        requestId: req.header("x-request-id") ?? undefined,
        metadata: { bookingId },
      }).catch(() => undefined);
      
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);