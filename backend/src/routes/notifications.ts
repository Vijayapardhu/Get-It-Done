import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  registerDeviceToken,
  removeDeviceToken,
  getDeviceTokens,
} from "../services/notificationService.js";

export const notificationsRouter = Router();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  unreadOnly: z.coerce.boolean().default(false),
});

const preferencesSchema = z.object({
  push: z.boolean().optional(),
  sms: z.boolean().optional(),
  email: z.boolean().optional(),
  inApp: z.boolean().optional(),
});

const deviceTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android", "web"]),
  appVersion: z.string().min(1),
});

/**
 * @openapi
 * /notifications:
 *   get:
 *     summary: List notifications for the current user
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 50 }
 *       - name: offset
 *         in: query
 *         schema: { type: integer, minimum: 0, default: 0 }
 *       - name: unreadOnly
 *         in: query
 *         schema: { type: boolean, default: false }
 *     responses:
 *       200:
 *         description: Paginated list of notifications
 */
notificationsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const result = await listNotifications(req.user!.id, query);
    res.json({ notifications: result.notifications, total: result.total, limit: query.limit, offset: query.offset });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark a notification as read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404:
 *         description: Notification not found
 */
notificationsRouter.patch("/:id/read", requireAuth, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const notification = await markNotificationRead(req.user!.id, id);
    if (!notification) { res.status(404).json({ error: "Notification not found" }); return; }
    res.json({ notification });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /notifications/read-all:
 *   post:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Number of notifications marked as read
 */
notificationsRouter.post("/read-all", requireAuth, async (req, res, next) => {
  try {
    const count = await markAllNotificationsRead(req.user!.id);
    res.json({ markedAsRead: count });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /notifications/preferences:
 *   get:
 *     summary: Get notification preferences
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: User notification preferences
 */
notificationsRouter.get("/preferences", requireAuth, async (req, res, next) => {
  try {
    const preferences = await getNotificationPreferences(req.user!.id);
    res.json({ preferences });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /notifications/preferences:
 *   patch:
 *     summary: Update notification preferences
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               push: { type: boolean }
 *               sms: { type: boolean }
 *               email: { type: boolean }
 *               inApp: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated preferences
 */
notificationsRouter.patch("/preferences", requireAuth, async (req, res, next) => {
  try {
    const input = preferencesSchema.parse(req.body);
    const preferences = await updateNotificationPreferences(req.user!.id, input);
    res.json({ preferences });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /notifications/devices:
 *   get:
 *     summary: List registered device tokens
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: List of device tokens
 *   post:
 *     summary: Register a new device token
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, platform, appVersion]
 *             properties:
 *               token: { type: string }
 *               platform: { type: string, enum: [ios, android, web] }
 *               appVersion: { type: string }
 *     responses:
 *       201:
 *         description: Device token registered
 *       409:
 *         description: Token already exists
 */
notificationsRouter.get("/devices", requireAuth, async (req, res, next) => {
  try {
    const tokens = await getDeviceTokens(req.user!.id);
    res.json({ devices: tokens });
  } catch (error) { next(error); }
});

notificationsRouter.post("/devices", requireAuth, async (req, res, next) => {
  try {
    const input = deviceTokenSchema.parse(req.body);
    const device = await registerDeviceToken(req.user!.id, input.token, input.platform, input.appVersion);
    res.status(201).json({ device });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /notifications/devices/{token}:
 *   delete:
 *     summary: Remove a device token
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Device token removed
 */
notificationsRouter.delete("/devices/:token", requireAuth, async (req, res, next) => {
  try {
    const token = String(req.params.token);
    await removeDeviceToken(req.user!.id, token);
    res.status(204).send();
  } catch (error) { next(error); }
});

export default notificationsRouter;