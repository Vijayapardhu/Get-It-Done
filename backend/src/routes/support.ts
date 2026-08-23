import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";

/**
 * @openapi
 * /support/tickets:
 *   post:
 *     summary: Create support ticket
 *     tags: [Support]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [subject, description], properties: { categoryId: { type: string, format: uuid }, subject: { type: string }, description: { type: string }, priority: { type: string, enum: [low, medium, high, urgent] } } }
 *     responses:
 *       201: { description: Ticket created }
 *   get:
 *     summary: List support tickets
 *     tags: [Support]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [open, in_progress, resolved, closed] }
 *       - name: categoryId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: priority
 *         in: query
 *         schema: { type: string, enum: [low, medium, high, urgent] }
 *       - name: page
 *         in: query
 *         schema: { type: integer }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Paginated tickets }
 * /support/tickets/{id}:
 *   get:
 *     summary: Get ticket with messages
 *     tags: [Support]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Ticket with messages }
 *       404: { description: Not found }
 *   patch:
 *     summary: Update ticket
 *     tags: [Support]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { status: { type: string, enum: [open, in_progress, resolved, closed] }, priority: { type: string, enum: [low, medium, high, urgent] }, assignedTo: { type: string, format: uuid } } }
 *     responses:
 *       200: { description: Updated ticket }
 * /support/tickets/{id}/messages:
 *   post:
 *     summary: Add message to ticket
 *     tags: [Support]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [body], properties: { body: { type: string }, isInternal: { type: boolean } } }
 *     responses:
 *       201: { description: Message added }
 * /support/tickets/{id}/assign:
 *   post:
 *     summary: Assign ticket (support_staff, admin)
 *     tags: [Support]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [assignedTo], properties: { assignedTo: { type: string, format: uuid } } }
 *     responses:
 *       200: { description: Ticket assigned }
 * /support/tickets/{id}/close:
 *   post:
 *     summary: Close ticket
 *     tags: [Support]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Ticket closed }
 * /support/categories:
 *   get:
 *     summary: List support categories
 *     tags: [Support]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of categories }
 *   post:
 *     summary: Create support category (system_admin)
 *     tags: [Support]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [name], properties: { name: { type: string }, description: { type: string } } }
 *     responses:
 *       201: { description: Category created }
 */

export const supportRouter = Router();

const ticketQuerySchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  categoryId: z.string().uuid().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const createTicketSchema = z.object({
  categoryId: z.string().uuid().optional(),
  subject: z.string().trim().min(5).max(200),
  description: z.string().trim().min(10).max(5000),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
});

const updateTicketSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignedTo: z.string().uuid().optional(),
});

const messageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  isInternal: z.boolean().default(false),
});

supportRouter.post("/tickets", requireAuth, async (req, res, next) => {
  try {
    const input = createTicketSchema.parse(req.body);
    const ticketNumber = `TKT-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const result = await pool.query(`INSERT INTO support_tickets (id, ticket_number, user_id, category_id, subject, description, priority, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'open') RETURNING *`, [crypto.randomUUID(), ticketNumber, req.user!.id, input.categoryId ?? null, input.subject, input.description, input.priority]);
    await recordAuditEvent({ actorId: req.user!.id, action: "support_ticket.created", resourceType: "support_ticket", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ ticket: result.rows[0] });
  } catch (error) { next(error); }
});

supportRouter.get("/tickets", requireAuth, async (req, res, next) => {
  try {
    const query = ticketQuerySchema.parse(req.query);
    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (req.user!.role !== "support_staff" && !["system_admin", "federation_admin", "society_admin"].includes(req.user!.role)) {
      conditions.push(`user_id = $${index++}`); values.push(req.user!.id);
    }
    if (query.status) { conditions.push(`status = $${index++}`); values.push(query.status); }
    if (query.categoryId) { conditions.push(`category_id = $${index++}`); values.push(query.categoryId); }
    if (query.priority) { conditions.push(`priority = $${index++}`); values.push(query.priority); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

    const result = await pool.query(`SELECT st.*, u.name as user_name, c.name as category_name FROM support_tickets st JOIN users u ON u.id = st.user_id LEFT JOIN support_categories c ON c.id = st.category_id ${whereClause} ORDER BY st.created_at DESC LIMIT $${index++} OFFSET $${index}`, values);
    const countResult = await pool.query(`SELECT count(*)::int as total FROM support_tickets ${whereClause}`, values.slice(0, -2));

    res.json({ tickets: result.rows, total: countResult.rows[0].total, page: query.page, limit: query.limit });
  } catch (error) { next(error); }
});

supportRouter.get("/tickets/:id", requireAuth, async (req, res, next) => {
  try {
    const ticketId = String(req.params.id);
    const result = await pool.query(`SELECT st.*, u.name as user_name, c.name as category_name, a.name as assigned_name FROM support_tickets st JOIN users u ON u.id = st.user_id LEFT JOIN support_categories c ON c.id = st.category_id LEFT JOIN users a ON a.id = st.assigned_to WHERE st.id = $1`, [ticketId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Ticket not found" }); return; }
    const ticket = result.rows[0];
    if (req.user!.role !== "support_staff" && !["system_admin", "federation_admin", "society_admin"].includes(req.user!.role) && ticket.user_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const messages = await pool.query(`SELECT tm.*, u.name as author_name FROM ticket_messages tm JOIN users u ON u.id = tm.author_id WHERE tm.ticket_id = $1 ORDER BY tm.created_at ASC`, [ticketId]);
    res.json({ ticket, messages: messages.rows });
  } catch (error) { next(error); }
});

supportRouter.patch("/tickets/:id", requireAuth, async (req, res, next) => {
  try {
    const ticketId = String(req.params.id);
    const ticket = await pool.query(`SELECT * FROM support_tickets WHERE id = $1`, [ticketId]);
    if (!ticket.rows[0]) { res.status(404).json({ error: "Ticket not found" }); return; }
    if (req.user!.role !== "support_staff" && !["system_admin", "federation_admin", "society_admin"].includes(req.user!.role) && ticket.rows[0].user_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const input = updateTicketSchema.parse(req.body);
    const fields: string[] = []; const values: unknown[] = []; let index = 1;
    for (const [key, value] of Object.entries(input)) { if (value !== undefined) { fields.push(`${key} = $${index++}`); values.push(value); } }
    if (input.status === "resolved" || input.status === "closed") { fields.push(`resolved_at = now()`); }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    values.push(ticketId);
    const result = await pool.query(`UPDATE support_tickets SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} RETURNING *`, values);
    await recordAuditEvent({ actorId: req.user!.id, action: "support_ticket.updated", resourceType: "support_ticket", resourceId: ticketId, requestId: req.header("x-request-id") ?? undefined, metadata: { fields: Object.keys(input) } }).catch(() => undefined);
    res.json({ ticket: result.rows[0] });
  } catch (error) { next(error); }
});

supportRouter.post("/tickets/:id/messages", requireAuth, async (req, res, next) => {
  try {
    const ticketId = String(req.params.id);
    const ticket = await pool.query(`SELECT * FROM support_tickets WHERE id = $1`, [ticketId]);
    if (!ticket.rows[0]) { res.status(404).json({ error: "Ticket not found" }); return; }
    if (req.user!.role !== "support_staff" && !["system_admin", "federation_admin", "society_admin"].includes(req.user!.role) && ticket.rows[0].user_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const input = messageSchema.parse(req.body);
    const result = await pool.query(`INSERT INTO ticket_messages (id, ticket_id, author_id, body, is_internal) VALUES ($1, $2, $3, $4, $5) RETURNING *`, [crypto.randomUUID(), ticketId, req.user!.id, input.body, input.isInternal]);
    await recordAuditEvent({ actorId: req.user!.id, action: "support_ticket.message_added", resourceType: "ticket_message", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(201).json({ message: result.rows[0] });
  } catch (error) { next(error); }
});

supportRouter.post("/tickets/:id/assign", requireAuth, requireRoles("support_staff", "system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const ticketId = String(req.params.id);
    const input = z.object({ assignedTo: z.string().uuid() }).parse(req.body);
    const result = await pool.query(`UPDATE support_tickets SET assigned_to = $1, status = 'in_progress', updated_at = now() WHERE id = $2 RETURNING *`, [input.assignedTo, ticketId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Ticket not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "support_ticket.assigned", resourceType: "support_ticket", resourceId: ticketId, requestId: req.header("x-request-id") ?? undefined, metadata: { assignedTo: input.assignedTo } }).catch(() => undefined);
    res.json({ ticket: result.rows[0] });
  } catch (error) { next(error); }
});

supportRouter.post("/tickets/:id/close", requireAuth, async (req, res, next) => {
  try {
    const ticketId = String(req.params.id);
    const ticket = await pool.query(`SELECT * FROM support_tickets WHERE id = $1`, [ticketId]);
    if (!ticket.rows[0]) { res.status(404).json({ error: "Ticket not found" }); return; }
    if (req.user!.role !== "support_staff" && !["system_admin", "federation_admin", "society_admin"].includes(req.user!.role) && ticket.rows[0].user_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const result = await pool.query(`UPDATE support_tickets SET status = 'closed', resolved_at = now(), updated_at = now() WHERE id = $1 RETURNING *`, [ticketId]);
    await recordAuditEvent({ actorId: req.user!.id, action: "support_ticket.closed", resourceType: "support_ticket", resourceId: ticketId, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.json({ ticket: result.rows[0] });
  } catch (error) { next(error); }
});

supportRouter.get("/categories", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM support_categories ORDER BY name`);
    res.json({ categories: result.rows });
  } catch (error) { next(error); }
});

supportRouter.post("/categories", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(100), description: z.string().trim().max(500).optional() }).parse(req.body);
    const result = await pool.query(`INSERT INTO support_categories (id, name, description) VALUES ($1, $2, $3) RETURNING *`, [crypto.randomUUID(), input.name, input.description ?? null]);
    res.status(201).json({ category: result.rows[0] });
  } catch (error) { next(error); }
});