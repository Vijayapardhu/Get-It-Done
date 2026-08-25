import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { emitNotification } from "../core/realtime.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

const chatCreateSchema = z.object({ bookingId: z.string().uuid() });
const chatMessageCreateSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  messageType: z.enum(["text", "image", "file"]).default("text"),
  attachments: z.array(z.object({ url: z.string(), name: z.string(), type: z.string(), size: z.number().int().nonnegative() })).default([]),
});
const chatListQuerySchema = z.object({ limit: z.number().int().min(1).max(100).default(20), offset: z.number().int().min(0).default(0) });

export const chatRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
chatRouter.param("id", rejectNonUuidParam);

// Get user's chats
chatRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { limit, offset } = chatListQuerySchema.parse(req.query);
    const result = await pool.query(
      `SELECT c.id, c.booking_id, c.created_at, c.updated_at,
              b.status as booking_status,
              cm.content as last_message_content,
              cm.created_at as last_message_at,
              u.name as last_message_sender_name
         FROM chats c
         LEFT JOIN bookings b ON c.booking_id = b.id
         LEFT JOIN LATERAL (
           SELECT cm2.content, cm2.created_at, cm2.sender_id, u2.name
           FROM chat_messages cm2
           JOIN users u2 ON cm2.sender_id = u2.id
           WHERE cm2.chat_id = c.id
           ORDER BY cm2.created_at DESC
           LIMIT 1
         ) cm ON true
         LEFT JOIN users u ON cm.sender_id = u.id
         WHERE (
           EXISTS (SELECT 1 FROM bookings b2 WHERE b2.id = c.booking_id AND b2.customer_id = $1)
           OR EXISTS (SELECT 1 FROM bookings b2 JOIN workers w ON b2.worker_id = w.id WHERE b2.id = c.booking_id AND w.user_id = $2)
         )
         ORDER BY c.updated_at DESC
         LIMIT $3 OFFSET $4`,
      [userId, userId, limit, offset]
    );
    res.json({ chats: result.rows, count: result.rows.length, limit, offset });
  } catch (error) { next(error); }
});

// Get chat with messages
chatRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const chatId = z.string().uuid().parse(req.params.id);
    const userId = req.user!.id;
    const chatResult = await pool.query(
      `SELECT c.id, c.booking_id, c.created_at, c.updated_at
       FROM chats c
       WHERE c.id = $1
         AND (
           EXISTS (SELECT 1 FROM bookings b WHERE b.id = c.booking_id AND b.customer_id = $2)
           OR EXISTS (SELECT 1 FROM bookings b JOIN workers w ON b.worker_id = w.id WHERE b.id = c.booking_id AND w.user_id = $3)
         )`,
      [chatId, userId, userId]
    );
    if (chatResult.rowCount === 0) {
      return res.status(404).json({ error: "CHAT_NOT_FOUND", message: "Chat not found or access denied" });
    }
    const chat = chatResult.rows[0];
    const messagesResult = await pool.query(
      `SELECT m.id, m.sender_id, m.content, m.message_type, m.attachments,
              m.created_at, m.read_at,
              u.name as sender_name
       FROM chat_messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.chat_id = $1
       ORDER BY m.created_at ASC`,
      [chatId]
    );
    res.json({
      chat: { id: chat.id, bookingId: chat.booking_id, createdAt: chat.created_at, updatedAt: chat.updated_at },
      messages: messagesResult.rows
    });
  } catch (error) { next(error); }
});

// Create chat
chatRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const { bookingId } = chatCreateSchema.parse(req.body);
    const userId = req.user!.id;
    const bookingResult = await pool.query(
      `SELECT b.id, b.customer_id, w.user_id as worker_user_id
       FROM bookings b
       LEFT JOIN workers w ON b.worker_id = w.id
       WHERE b.id = $1
         AND (b.customer_id = $2 OR w.user_id = $3)`,
      [bookingId, userId, userId]
    );
    if (bookingResult.rowCount === 0) {
      return res.status(403).json({ error: "BOOKING_ACCESS_DENIED", message: "Access denied to booking" });
    }
    const existingChatResult = await pool.query("SELECT id FROM chats WHERE booking_id = $1", [bookingId]);
    let chatId;
    if (existingChatResult.rowCount! > 0) {
      chatId = existingChatResult.rows[0].id;
    } else {
      const chatResult = await pool.query("INSERT INTO chats (booking_id) VALUES ($1) RETURNING id", [bookingId]);
      chatId = chatResult.rows[0].id;
    }
    await recordAuditEvent({ actorId: userId, action: "chat_created", resourceType: "chat", resourceId: chatId }).catch(() => {});
    res.status(201).json({ id: chatId });
  } catch (error) { next(error); }
});

// Send message
chatRouter.post("/:id/messages", requireAuth, async (req, res, next) => {
  try {
    const chatId = z.string().uuid().parse(req.params.id);
    const { content, messageType, attachments } = chatMessageCreateSchema.parse(req.body);
    const userId = req.user!.id;
    const accessResult = await pool.query(
      `SELECT c.id, c.booking_id
       FROM chats c
       WHERE c.id = $1
         AND (
           EXISTS (SELECT 1 FROM bookings b WHERE b.id = c.booking_id AND b.customer_id = $2)
           OR EXISTS (SELECT 1 FROM bookings b JOIN workers w ON b.worker_id = w.id WHERE b.id = c.booking_id AND w.user_id = $3)
         )`,
      [chatId, userId, userId]
    );
    if (accessResult.rowCount === 0) {
      return res.status(403).json({ error: "CHAT_ACCESS_DENIED", message: "Access denied to chat" });
    }
    const chat = accessResult.rows[0];
    const messageResult = await pool.query(
      `INSERT INTO chat_messages (chat_id, sender_id, content, message_type, attachments)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [chatId, userId, content, messageType, JSON.stringify(attachments)]
    );
    const message = { id: messageResult.rows[0].id, chatId, senderId: userId, content, messageType, attachments, createdAt: messageResult.rows[0].created_at };
    await recordAuditEvent({ actorId: userId, action: "chat_message_sent", resourceType: "chat_message", resourceId: message.id }).catch(() => {});
    const participantResult = await pool.query(
      `SELECT u.id as user_id
       FROM bookings b
       JOIN users u ON (
         (b.customer_id = u.id AND $1 != u.id) OR
         (b.worker_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM workers w
           JOIN users u2 ON w.user_id = u2.id
           WHERE b.worker_id = w.id AND u2.id = u.id AND $1 != u2.id
         ))
       )
       WHERE b.id = $2`,
      [userId, chat.booking_id]
    );
    if (participantResult.rowCount! > 0) {
      const otherUserId = participantResult.rows[0].user_id;
      await emitNotification(otherUserId, {
        type: "new_chat_message",
        chatId,
        messageId: message.id,
        senderId: userId,
        preview: content.substring(0, 100) + (content.length > 100 ? "..." : "")
      });
    }
    res.status(201).json(message);
  } catch (error) { next(error); }
});

// Get messages (paginated)
chatRouter.get("/:id/messages", requireAuth, async (req, res, next) => {
  try {
    const chatId = z.string().uuid().parse(req.params.id);
    const userId = req.user!.id;
    const { limit, offset } = chatListQuerySchema.parse(req.query);
    const accessResult = await pool.query(
      `SELECT 1 FROM chats c
       WHERE c.id = $1
         AND (
           EXISTS (SELECT 1 FROM bookings b WHERE b.id = c.booking_id AND b.customer_id = $2)
           OR EXISTS (SELECT 1 FROM bookings b JOIN workers w ON b.worker_id = w.id WHERE b.id = c.booking_id AND w.user_id = $3)
         )`,
      [chatId, userId, userId]
    );
    if (accessResult.rowCount === 0) {
      return res.status(403).json({ error: "CHAT_ACCESS_DENIED", message: "Access denied to chat" });
    }
    const messagesResult = await pool.query(
      `SELECT m.id, m.sender_id, m.content, m.message_type, m.attachments,
              m.created_at, m.read_at,
              u.name as sender_name
       FROM chat_messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.chat_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [chatId, limit, offset]
    );
    res.json({ messages: messagesResult.rows, count: messagesResult.rows.length, limit, offset });
  } catch (error) { next(error); }
});/**
 * @openapi
 * /chats:
 *   get:
 *     summary: Get user's chats
 *     description: Returns a list of chats for the current user
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *   post:
 *     summary: Create a new chat
 *     description: Creates a new chat for a booking (customer or worker only)
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 * /chats/{id}:
 *   get:
 *     summary: Get chat with messages
 *     description: Returns a specific chat with its messages
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 * /chats/{id}/messages:
 *   get:
 *     summary: Get chat messages (paginated)
 *     description: Returns paginated messages for a specific chat
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *   post:
 *     summary: Send a message in a chat
 *     description: Sends a new message in a specific chat
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 */
