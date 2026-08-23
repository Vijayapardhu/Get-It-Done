import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";

/**
 * @openapi
 * /users/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: User profile }
 *       401: { description: Unauthorized }
 *   patch:
 *     summary: Update current user profile
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { name: { type: string }, displayName: { type: string }, phone: { type: string }, email: { type: string }, avatarUrl: { type: string }, dateOfBirth: { type: string, format: date }, gender: { type: string, enum: [male, female, other, prefer_not_to_say] }, preferredLanguage: { type: string }, timezone: { type: string } } }
 *     responses:
 *       200: { description: Updated profile }
 *       401: { description: Unauthorized }
 * /users/me/avatar:
 *   post:
 *     summary: Update user avatar
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [fileKey], properties: { fileKey: { type: string } } }
 *     responses:
 *       200: { description: Avatar updated }
 *   delete:
 *     summary: Remove user avatar
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Avatar removed }
 * /users/me/language:
 *   patch:
 *     summary: Update user language
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [language], properties: { language: { type: string } } }
 *     responses:
 *       200: { description: Language updated }
 * /users/me/preferences:
 *   get:
 *     summary: Get user preferences
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: User preferences }
 *   patch:
 *     summary: Update user preferences
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { notifications: { type: object }, ui: { type: object }, privacy: { type: object } } }
 *     responses:
 *       200: { description: Preferences updated }
 * /users/{id}:
 *   get:
 *     summary: Get public user profile
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Public user profile }
 *       404: { description: User not found }
 *   patch:
 *     summary: Admin update user
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { status: { type: string, enum: [active, inactive, suspended] }, role: { type: string, enum: [customer, worker, institutional_customer, society_admin, federation_admin, support_staff, system_admin] } } }
 *     responses:
 *       200: { description: Updated user }
 *       404: { description: User not found }
 *       403: { description: Forbidden }
 */

export const usersRouter = Router();

const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  displayName: z.string().trim().max(100).optional(),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/).optional(),
  email: z.string().email().max(320).optional(),
  avatarUrl: z.string().url().max(2000).optional(),
  dateOfBirth: z.string().date().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  preferredLanguage: z.string().max(10).optional(),
  timezone: z.string().max(50).optional(),
});

const preferencesSchema = z.object({
  notifications: z.object({ push: z.boolean(), sms: z.boolean(), email: z.boolean(), inApp: z.boolean() }).optional(),
  ui: z.record(z.unknown()).optional(),
  privacy: z.record(z.unknown()).optional(),
});

usersRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT id, name, display_name, phone, email, role, language, status, date_of_birth, gender, preferred_language, timezone, last_login_at, avatar_url, created_at, updated_at FROM users WHERE id = $1`, [req.user!.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ user: result.rows[0] });
  } catch (error) { next(error); }
});

usersRouter.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const input = profileUpdateSchema.parse(req.body);
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    const fieldMap: Record<string, string> = { displayName: "display_name", preferredLanguage: "preferred_language", avatarUrl: "avatar_url", dateOfBirth: "date_of_birth" };
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        fields.push(`${fieldMap[key] ?? key} = $${index++}`);
        values.push(value);
      }
    }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(req.user!.id);
    const result = await pool.query(`UPDATE users SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} RETURNING id, name, display_name, phone, email, role, language, status, date_of_birth, gender, preferred_language, timezone, last_login_at, avatar_url, updated_at`, values);
    await recordAuditEvent({ actorId: req.user!.id, action: "user.profile.updated", resourceType: "user", resourceId: req.user!.id, requestId: req.header("x-request-id") ?? undefined, metadata: { fields: Object.keys(input) } }).catch(() => undefined);
    res.json({ user: result.rows[0] });
  } catch (error) { next(error); }
});

usersRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT id, name, display_name, phone, email, role, language, status, avatar_url, created_at FROM users WHERE id = $1`, [req.params.id]);
    if (!result.rows[0]) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ user: result.rows[0] });
  } catch (error) { next(error); }
});

usersRouter.patch("/:id", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(["active", "inactive", "suspended"]).optional(), role: z.enum(["customer", "worker", "institutional_customer", "society_admin", "federation_admin", "support_staff", "system_admin"]).optional() }).parse(req.body);
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) { fields.push(`${key} = $${index++}`); values.push(value); }
    }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(req.params.id);
    const result = await pool.query(`UPDATE users SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} RETURNING id, name, display_name, phone, email, role, language, status, updated_at`, values);
    if (!result.rows[0]) { res.status(404).json({ error: "User not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "user.admin_updated", resourceType: "user", resourceId: String(req.params.id), requestId: req.header("x-request-id") ?? undefined, metadata: { fields: Object.keys(input) } }).catch(() => undefined);
    res.json({ user: result.rows[0] });
  } catch (error) { next(error); }
});

usersRouter.post("/me/avatar", requireAuth, async (req, res, next) => {
  try {
    const { fileKey } = z.object({ fileKey: z.string().min(1) }).parse(req.body);
    const result = await pool.query(`UPDATE users SET avatar_url = $1, updated_at = now() WHERE id = $2 RETURNING avatar_url`, [fileKey, req.user!.id]);
    await recordAuditEvent({ actorId: req.user!.id, action: "user.avatar.updated", resourceType: "user", resourceId: req.user!.id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.json({ avatarUrl: result.rows[0].avatar_url });
  } catch (error) { next(error); }
});

usersRouter.delete("/me/avatar", requireAuth, async (req, res, next) => {
  try {
    await pool.query(`UPDATE users SET avatar_url = NULL, updated_at = now() WHERE id = $1`, [req.user!.id]);
    res.status(204).send();
  } catch (error) { next(error); }
});

usersRouter.patch("/me/language", requireAuth, async (req, res, next) => {
  try {
    const { language } = z.object({ language: z.string().max(10) }).parse(req.body);
    const result = await pool.query(`UPDATE users SET preferred_language = $1, updated_at = now() WHERE id = $2 RETURNING preferred_language`, [language, req.user!.id]);
    res.json({ language: result.rows[0].preferred_language });
  } catch (error) { next(error); }
});

usersRouter.get("/me/preferences", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT notifications, ui, privacy FROM user_preferences WHERE user_id = $1`, [req.user!.id]);
    if (!result.rows[0]) { res.json({ preferences: { notifications: { push: true, sms: true, email: true, inApp: true }, ui: {}, privacy: {} } }); return; }
    res.json({ preferences: result.rows[0] });
  } catch (error) { next(error); }
});

usersRouter.patch("/me/preferences", requireAuth, async (req, res, next) => {
  try {
    const input = preferencesSchema.parse(req.body);
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) { fields.push(`${key} = $${index++}`); values.push(JSON.stringify(value)); }
    }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(req.user!.id);
    await pool.query(`INSERT INTO user_preferences (user_id, ${fields.map(f => f.split(" = ")[0]).join(", ")}) VALUES ($1, ${fields.map(() => `$${index++}`).join(", ")}) ON CONFLICT (user_id) DO UPDATE SET ${fields.join(", ")}, updated_at = now()`, values);
    res.json({ message: "Preferences updated" });
  } catch (error) { next(error); }
});

export default usersRouter;