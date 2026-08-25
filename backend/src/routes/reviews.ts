import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

export const reviewsRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
reviewsRouter.param("id", rejectNonUuidParam);
reviewsRouter.param("workerId", rejectNonUuidParam);

const createReviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  feedback: z.string().trim().max(2000).optional(),
});

const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  feedback: z.string().trim().max(2000).optional(),
});

const reportReviewSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});

/**
 * @openapi
 * /reviews:
 *   post:
 *     summary: Create a review for a completed booking
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bookingId, rating]
 *             properties:
 *               bookingId: { type: string, format: uuid }
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               feedback: { type: string, maxLength: 2000 }
 *     responses:
 *       201:
 *         description: Review created
 *       409:
 *         description: Review already exists or booking not eligible
 */
reviewsRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    if (!["customer", "institutional_customer"].includes(req.user!.role)) {
      res.status(403).json({ error: "Only customers can create reviews" });
      return;
    }
    const input = createReviewSchema.parse(req.body);
    
    const result = await pool.query(
      `insert into reviews (booking_id, customer_id, worker_id, rating, feedback)
       select b.id, b.customer_id, b.worker_id, $2, $3
       from bookings b
       where b.id = $1 and b.customer_id = $4 and b.status = 'completed' and b.worker_id is not null
       on conflict (booking_id) do nothing
       returning *`,
      [input.bookingId, input.rating, input.feedback ?? null, req.user!.id]
    );
    
    if (!result.rows[0]) {
      res.status(409).json({ error: "Review already exists or booking not eligible for review" });
      return;
    }
    
    await recordAuditEvent({ actorId: req.user!.id, action: "review.created", resourceType: "review", resourceId: result.rows[0].id, requestId: req.header("x-request-id") ?? undefined, metadata: { bookingId: input.bookingId } }).catch(() => undefined);
    res.status(201).json({ review: result.rows[0] });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /reviews/workers/{workerId}/reviews:
 *   get:
 *     summary: Get reviews for a worker
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: page
 *         in: query
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 20 }
 *     responses:
 *       200:
 *         description: List of reviews
 */
reviewsRouter.get("/workers/:workerId/reviews", requireAuth, async (req, res, next) => {
  try {
    const workerId = String(req.params.workerId);
    const page = Math.max(parseInt(String(req.query.page ?? 1)), 1);
    const limit = Math.min(parseInt(String(req.query.limit ?? 20)), 50);
    const offset = (page - 1) * limit;
    
    const [reviewsResult, summaryResult] = await Promise.all([
      pool.query(`select r.*, u.name as customer_name from reviews r join users u on u.id = r.customer_id where r.worker_id = $1 order by r.created_at desc limit $2 offset $3`, [workerId, limit, offset]),
      pool.query(`select avg(rating)::numeric(2,1) as avg_rating, count(*) as total_reviews, count(*) filter (where rating = 5) as five_star, count(*) filter (where rating = 4) as four_star, count(*) filter (where rating = 3) as three_star, count(*) filter (where rating = 2) as two_star, count(*) filter (where rating = 1) as one_star from reviews where worker_id = $1`, [workerId])
    ]);
    
    res.json({ reviews: reviewsResult.rows, summary: summaryResult.rows[0], page, limit });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /reviews/workers/{workerId}/rating-summary:
 *   get:
 *     summary: Get worker rating summary
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: workerId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Rating summary
 */
reviewsRouter.get("/workers/:workerId/rating-summary", requireAuth, async (req, res, next) => {
  try {
    const workerId = String(req.params.workerId);
    const result = await pool.query(`select avg(rating)::numeric(2,1) as avg_rating, count(*) as total_reviews, count(*) filter (where rating = 5) as five_star, count(*) filter (where rating = 4) as four_star, count(*) filter (where rating = 3) as three_star, count(*) filter (where rating = 2) as two_star, count(*) filter (where rating = 1) as one_star from reviews where worker_id = $1`, [workerId]);
    res.json({ summary: result.rows[0] });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /reviews/{id}:
 *   patch:
 *     summary: Update a review (time-limited)
 *     tags: [Reviews]
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
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               feedback: { type: string, maxLength: 2000 }
 *     responses:
 *       200:
 *         description: Review updated
 *       404:
 *         description: Review not found
 *       403:
 *         description: Forbidden
 */
reviewsRouter.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const reviewId = String(req.params.id);
    const input = updateReviewSchema.parse(req.body);
    
    const reviewResult = await pool.query(`select * from reviews where id = $1`, [reviewId]);
    if (!reviewResult.rows[0]) { res.status(404).json({ error: "Review not found" }); return; }
    const review = reviewResult.rows[0];
    
    if (review.customer_id !== req.user!.id && !["system_admin", "federation_admin", "society_admin"].includes(req.user!.role)) {
      res.status(403).json({ error: "Cannot update another user's review" });
      return;
    }
    
    // Only allow updates within 24 hours
    const createdAt = new Date(review.created_at);
    const now = new Date();
    if (now.getTime() - createdAt.getTime() > 24 * 60 * 60 * 1000) {
      res.status(403).json({ error: "Review can only be updated within 24 hours" });
      return;
    }
    
    const fields: string[] = [];
    const values: any[] = [];
    let index = 1;
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        fields.push(`${key} = $${index++}`);
        values.push(value);
      }
    }
    if (fields.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    
    values.push(reviewId);
    const updateResult = await pool.query(`update reviews set ${fields.join(", ")}, updated_at = now() where id = $${index} returning *`, values);
    
    await recordAuditEvent({ actorId: req.user!.id, action: "review.updated", resourceType: "review", resourceId: reviewId, requestId: req.header("x-request-id") ?? undefined, metadata: { fields: Object.keys(input) } }).catch(() => undefined);
    res.json({ review: updateResult.rows[0] });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /reviews/{id}:
 *   delete:
 *     summary: Delete a review (admin)
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Review deleted
 *       404:
 *         description: Review not found
 */
reviewsRouter.delete("/:id", requireAuth, requireRoles("system_admin", "federation_admin", "society_admin"), async (req, res, next) => {
  try {
    const reviewId = String(req.params.id);
    const result = await pool.query(`delete from reviews where id = $1 returning id`, [reviewId]);
    if (!result.rows[0]) { res.status(404).json({ error: "Review not found" }); return; }
    await recordAuditEvent({ actorId: req.user!.id, action: "review.deleted", resourceType: "review", resourceId: reviewId, requestId: req.header("x-request-id") ?? undefined }).catch(() => undefined);
    res.status(204).send();
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /reviews/{id}/report:
 *   post:
 *     summary: Report a review
 *     tags: [Reviews]
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
 *             required: [reason]
 *             properties:
 *               reason: { type: string, minLength: 10, maxLength: 500 }
 *     responses:
 *       201:
 *         description: Review reported
 */
reviewsRouter.post("/:id/report", requireAuth, async (req, res, next) => {
  try {
    const reviewId = String(req.params.id);
    const input = reportReviewSchema.parse(req.body);
    
    const review = await pool.query(`select * from reviews where id = $1`, [reviewId]);
    if (!review.rows[0]) { res.status(404).json({ error: "Review not found" }); return; }
    
    await pool.query(`insert into review_reports (id, review_id, reporter_id, reason) values ($1, $2, $3, $4)`, [crypto.randomUUID(), reviewId, req.user!.id, input.reason]);
    await recordAuditEvent({ actorId: req.user!.id, action: "review.reported", resourceType: "review", resourceId: reviewId, requestId: req.header("x-request-id") ?? undefined, metadata: { reason: input.reason } }).catch(() => undefined);
    
    res.status(201).json({ message: "Review reported" });
  } catch (error) { next(error); }
});