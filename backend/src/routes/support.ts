import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { writeNotification } from "../services/notificationService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

export const supportRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
supportRouter.param("id", rejectNonUuidParam);

const createTicketSchema = z.object({
  bookingId: z.string().uuid().optional(),
  subject: z.string().min(5).max(200),
  description: z.string().min(10).max(5000),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  category: z.enum(["booking", "payment", "worker", "service", "technical", "billing", "other"]).default("other"),
});

const updateTicketSchema = z.object({
  status: z.enum(["open", "investigating", "resolved", "rejected"]).optional(),
  assignedTo: z.string().uuid().optional(),
  resolution: z.string().max(2000).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
});

const addCommentSchema = z.object({
  comment: z.string().min(1).max(2000),
  isInternal: z.boolean().default(false),
});

/**
 * @openapi
 * /support/tickets:
 *   post:
 *     summary: Create a support ticket/complaint
 *     tags: [Support]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subject, description]
 *             properties:
 *               bookingId: { type: string, format: uuid }
 *               subject: { type: string }
 *               description: { type: string }
 *               priority: { type: string, enum: [low, medium, high, critical] }
 *               category: { type: string, enum: [booking, payment, worker, service, technical, billing, other] }
 *     responses:
 *       201:
 *         description: Ticket created
 */
supportRouter.post("/tickets", requireAuth, async (req, res, next) => {
  try {
    const input = createTicketSchema.parse(req.body);

    // If bookingId provided, verify user has access
    if (input.bookingId) {
      const booking = await pool.query(
        `SELECT b.id, b.customer_id, w.user_id as worker_user_id
         FROM bookings b
         LEFT JOIN workers w ON w.id = b.worker_id
         WHERE b.id = $1`,
        [input.bookingId]
      );
      if (!booking.rows[0]) {
        res.status(404).json({ error: "Booking not found" });
        return;
      }
      const b = booking.rows[0];
      const isCustomer = b.customer_id === req.user!.id;
      const isWorker = b.worker_user_id === req.user!.id;
      const isAdmin = ["society_admin", "federation_admin", "system_admin", "support_staff"].includes(req.user!.role);
      
      if (!isCustomer && !isWorker && !isAdmin) {
        res.status(403).json({ error: "Not authorized for this booking" });
        return;
      }
    }

    const result = await pool.query(
      `INSERT INTO complaints (id, booking_id, raised_by, status, description, priority, category)
       VALUES ($1, $2, $3, 'open', $4, $5, $6) RETURNING *`,
      [crypto.randomUUID(), input.bookingId ?? null, req.user!.id, input.description, input.priority, input.category]
    );

    // Notify relevant parties
    if (input.bookingId) {
      const booking = await pool.query(
        `SELECT b.customer_id, w.user_id as worker_user_id
         FROM bookings b
         LEFT JOIN workers w ON w.id = b.worker_id
         WHERE b.id = $1`,
        [input.bookingId]
      );
      if (booking.rows[0]) {
        const b = booking.rows[0];
        // Notify the other party (not the one who created the ticket)
        if (b.customer_id !== req.user!.id) {
          await writeNotification(pool, {
            userId: b.customer_id,
            type: "support.ticket_created",
            title: "New Support Ticket",
            body: `A support ticket has been created for booking ${input.bookingId}`,
            aggregateType: "complaint",
            aggregateId: result.rows[0].id,
          });
        }
        if (b.worker_user_id && b.worker_user_id !== req.user!.id) {
          await writeNotification(pool, {
            userId: b.worker_user_id,
            type: "support.ticket_created",
            title: "New Support Ticket",
            body: `A support ticket has been created for booking ${input.bookingId}`,
            aggregateType: "complaint",
            aggregateId: result.rows[0].id,
          });
        }
        // Notify support staff
        // Same fix as below: users keys on "id", not "user_id".
        const supportStaff = await pool.query(
          "SELECT id FROM users WHERE role IN ('support_staff', 'system_admin')"
        );
        for (const staff of supportStaff.rows) {
          await writeNotification(pool, {
            userId: staff.id,
            type: "support.ticket_created",
            title: "New Support Ticket Assigned",
            body: `${input.subject} - ${input.category}`,
            aggregateType: "complaint",
            aggregateId: result.rows[0].id,
          });
        }
      }
    }

    await recordAuditEvent({
      actorId: req.user!.id,
      action: "support.ticket.created",
      resourceType: "complaint",
      resourceId: result.rows[0].id,
      requestId: req.header("x-request-id"),
      metadata: { bookingId: input.bookingId, category: input.category, priority: input.priority }
    }).catch(() => undefined);

    res.status(201).json({ ticket: result.rows[0] });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /support/tickets:
 *   get:
 *     summary: List support tickets
 *     tags: [Support]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [open, investigating, resolved, rejected, all] }
 *       - name: category
 *         in: query
 *         schema: { type: string }
 *       - name: bookingId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: page
 *         in: query
 *         schema: { type: integer }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated tickets
 */
supportRouter.get("/tickets", requireAuth, async (req, res, next) => {
  try {
    const query = z.object({
      status: z.enum(["open", "investigating", "resolved", "rejected", "all"]).default("all"),
      category: z.string().optional(),
      bookingId: z.string().uuid().optional(),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(50).default(20),
    }).parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    // Filter based on role
    if (["society_admin", "federation_admin", "system_admin", "support_staff"].includes(req.user!.role)) {
      // Admins see all tickets
    } else {
      conditions.push(`raised_by = $${index++}`);
      values.push(req.user!.id);
    }

    if (query.status !== "all") {
      conditions.push(`c.status = $${index++}`);
      values.push(query.status);
    }
    if (query.category) {
      conditions.push(`c.category = $${index++}`);
      values.push(query.category);
    }
    if (query.bookingId) {
      conditions.push(`booking_id = $${index++}`);
      values.push(query.bookingId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    values.push(query.limit, offset);

const result = await pool.query(
      `SELECT c.*, b.id as booking_id, s.name as service_name,
              u.name as raised_by_name, u.phone as raised_by_phone,
              a.name as assigned_to_name
         FROM complaints c
         LEFT JOIN bookings b ON b.id = c.booking_id
         LEFT JOIN services s ON s.id = b.service_id
         JOIN users u ON u.id = c.raised_by
         LEFT JOIN users a ON a.id = c.assigned_to
         ${whereClause}
         ORDER BY c.created_at DESC
         LIMIT $${index++} OFFSET $${index}`,
      values
    );

    const countResult = await pool.query(
      `SELECT count(*)::int as total FROM complaints c ${whereClause}`,
      values.slice(0, -2)
    );

    res.json({
      tickets: result.rows,
      pagination: { page: query.page, limit: query.limit, total: countResult.rows[0].total },
    });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /support/tickets/stats:
 *   get:
 *     summary: Get support ticket statistics (admin)
 *     tags: [Support]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Ticket statistics
 */
supportRouter.get("/tickets/stats", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin", "support_staff"), async (req, res, next) => {
  try {
    const [byStatus, byCategory, byPriority, avgResolutionTime, recentTrend] = await Promise.all([
      pool.query(`SELECT status, count(*)::int as count FROM complaints GROUP BY status`),
      pool.query(`SELECT category, count(*)::int as count FROM complaints GROUP BY category`),
      pool.query(`SELECT priority, count(*)::int as count FROM complaints GROUP BY priority`),
      pool.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600)::numeric(6,2) as avg_hours
         FROM complaints WHERE status = 'resolved' AND resolved_at IS NOT NULL`
      ),
      pool.query(
        `SELECT DATE_TRUNC('day', created_at)::date as day, count(*)::int as count
         FROM complaints
         WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY 1 ORDER BY 1 DESC`
      ),
    ]);

    res.json({
      byStatus: byStatus.rows,
      byCategory: byCategory.rows,
      byPriority: byPriority.rows,
      avgResolutionTimeHours: avgResolutionTime.rows[0].avg_hours ?? 0,
      recentTrend: recentTrend.rows,
    });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /support/tickets/{id}:
 *   get:
 *     summary: Get ticket details with comments
 *     tags: [Support]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Ticket details
 */
supportRouter.get("/tickets/:id", requireAuth, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);

const ticketResult = await pool.query(
      `SELECT c.*, b.id as booking_id, b.address, b.status as booking_status,
              s.name as service_name, s.category,
              u.name as raised_by_name, u.email as raised_by_email, u.phone as raised_by_phone,
              a.name as assigned_to_name
         FROM complaints c
         LEFT JOIN bookings b ON b.id = c.booking_id
         LEFT JOIN services s ON s.id = b.service_id
         JOIN users u ON u.id = c.raised_by
         LEFT JOIN users a ON a.id = c.assigned_to
         WHERE c.id = $1`,
      [id]
    );

    if (!ticketResult.rows[0]) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const ticket = ticketResult.rows[0];

    // Check access
    const isAdmin = ["society_admin", "federation_admin", "system_admin", "support_staff"].includes(req.user!.role);
    const isOwner = ticket.raised_by === req.user!.id;
    const isAssigned = ticket.assigned_to === req.user!.id;
    
    if (!isAdmin && !isOwner && !isAssigned) {
      res.status(403).json({ error: "Not authorized to view this ticket" });
      return;
    }

    // Get comments
    const comments = await pool.query(
      `SELECT cc.*, u.name as author_name, u.role as author_role
       FROM complaint_comments cc
       JOIN users u ON u.id = cc.author_id
       WHERE cc.complaint_id = $1
       ORDER BY cc.created_at ASC`,
      [id]
    );

    res.json({ ticket, comments: comments.rows });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /support/tickets/{id}:
 *   patch:
 *     summary: Update ticket (admin/support staff)
 *     tags: [Support]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: [open, investigating, resolved, rejected] }
 *               assignedTo: { type: string, format: uuid }
 *               resolution: { type: string }
 *               priority: { type: string, enum: [low, medium, high, critical] }
 *     responses:
 *       200:
 *         description: Ticket updated
 */
supportRouter.patch("/tickets/:id", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin", "support_staff"), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const input = updateTicketSchema.parse(req.body);

    const current = await pool.query("SELECT * FROM complaints WHERE id = $1", [id]);
    if (!current.rows[0]) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        const column = key === "assignedTo" ? "assigned_to" : key;
        fields.push(`${column} = $${index++}`);
        values.push(value);
      }
    }
    if (fields.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    // If resolving, set resolved_at
    if (input.status === "resolved" && current.rows[0].status !== "resolved") {
      fields.push(`resolved_at = now()`);
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE complaints SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} RETURNING *`,
      values
    );

    // Notify ticket creator if status changed
    if (input.status && input.status !== current.rows[0].status) {
      await writeNotification(pool, {
        userId: current.rows[0].raised_by,
        type: "support.ticket_updated",
        title: `Ticket ${input.status === "resolved" ? "Resolved" : "Updated"}`,
        body: `Your ticket "${current.rows[0].description.substring(0, 50)}..." has been ${input.status}`,
        aggregateType: "complaint",
        aggregateId: id,
      });
    }

    await recordAuditEvent({
      actorId: req.user!.id,
      action: "support.ticket.updated",
      resourceType: "complaint",
      resourceId: id,
      requestId: req.header("x-request-id"),
      metadata: { fields: Object.keys(input) }
    }).catch(() => undefined);

    res.json({ ticket: result.rows[0] });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /support/tickets/{id}/comments:
 *   post:
 *     summary: Add comment to ticket
 *     tags: [Support]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [comment]
 *             properties:
 *               comment: { type: string }
 *               isInternal: { type: boolean }
 *     responses:
 *       201:
 *         description: Comment added
 */
supportRouter.post("/tickets/:id/comments", requireAuth, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const input = addCommentSchema.parse(req.body);

    const ticket = await pool.query("SELECT * FROM complaints WHERE id = $1", [id]);
    if (!ticket.rows[0]) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const t = ticket.rows[0];
    const isAdmin = ["society_admin", "federation_admin", "system_admin", "support_staff"].includes(req.user!.role);
    const isOwner = t.raised_by === req.user!.id;
    const isAssigned = t.assigned_to === req.user!.id;

    if (!isAdmin && !isOwner && !isAssigned) {
      res.status(403).json({ error: "Not authorized to comment on this ticket" });
      return;
    }

    // Internal comments only for admins/support
    if (input.isInternal && !isAdmin) {
      res.status(403).json({ error: "Only support staff can add internal comments" });
      return;
    }

    const result = await pool.query(
      `INSERT INTO complaint_comments (id, complaint_id, author_id, comment, is_internal)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [crypto.randomUUID(), id, req.user!.id, input.comment, input.isInternal]
    );

    // Notify relevant parties (not the author)
    const notifyUsers = new Set<string>();
    if (t.raised_by !== req.user!.id) notifyUsers.add(t.raised_by);
    if (t.assigned_to && t.assigned_to !== req.user!.id) notifyUsers.add(t.assigned_to);
    if (isAdmin) {
      // Also notify other support staff
      // The users table keys on "id"; this selected a non-existent "user_id"
      // column, so every comment on a ticket 500'd for admins.
      const staff = await pool.query("SELECT id FROM users WHERE role IN ('support_staff', 'system_admin') AND id != $1", [req.user!.id]);
      for (const s of staff.rows) notifyUsers.add(s.id);
    }

    for (const userId of notifyUsers) {
      await writeNotification(pool, {
        userId,
        type: "support.comment_added",
        title: "New Comment on Ticket",
        body: `${req.user!.role === "customer" ? "Customer" : req.user!.role} commented on your ticket`,
        aggregateType: "complaint",
        aggregateId: id,
      });
    }

    await recordAuditEvent({
      actorId: req.user!.id,
      action: "support.comment.added",
      resourceType: "complaint",
      resourceId: id,
      requestId: req.header("x-request-id")
    }).catch(() => undefined);

    res.status(201).json({ comment: result.rows[0] });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /support/tickets/{id}/resolve:
 *   post:
 *     summary: Resolve a ticket with resolution details
 *     tags: [Support]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resolution]
 *             properties:
 *               resolution: { type: string }
 *     responses:
 *       200:
 *         description: Ticket resolved
 */
supportRouter.post("/tickets/:id/resolve", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin", "support_staff"), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const { resolution } = z.object({ resolution: z.string().min(10).max(2000) }).parse(req.body);

    const result = await pool.query(
      `UPDATE complaints SET status = 'resolved', resolution = $1, resolved_at = now(), updated_at = now()
       WHERE id = $2 RETURNING *`,
      [resolution, id]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    // Notify ticket creator
    await writeNotification(pool, {
      userId: result.rows[0].raised_by,
      type: "support.ticket_resolved",
      title: "Ticket Resolved",
      body: `Your ticket has been resolved: ${resolution.substring(0, 100)}`,
      aggregateType: "complaint",
      aggregateId: id,
    });

    await recordAuditEvent({
      actorId: req.user!.id,
      action: "support.ticket.resolved",
      resourceType: "complaint",
      resourceId: id,
      requestId: req.header("x-request-id"),
      metadata: { resolution: resolution.substring(0, 200) }
    }).catch(() => undefined);

    res.json({ ticket: result.rows[0] });
  } catch (error) { next(error); }
});


export default supportRouter;