import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

/**
 * @openapi
 * /trust/payments:
 *   post:
 *     summary: Create a payment record
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 * /trust/reviews:
 *   post:
 *     summary: Review a completed booking
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 * /trust/complaints:
 *   post:
 *     summary: Raise a complaint
 *     tags: [Complaints]
 *     security: [{ bearerAuth: [] }]
 *   get:
 *     summary: List complaints
 *     tags: [Complaints]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [open, investigating, resolved, rejected] }
 *       - name: bookingId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: raisedBy
 *         in: query
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: List of complaints
 * /trust/complaints/{id}:
 *   get:
 *     summary: Get complaint by ID
 *     tags: [Complaints]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Complaint details
 *       404:
 *         description: Complaint not found
 *   patch:
 *     summary: Update complaint status
 *     tags: [Complaints]
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
*             required: [status]
*             properties:
*               status:
*                 type: string
*                 enum: [open, investigating, resolved, rejected]
*               description:
*                 type: string
*                 description: Optional updated description
*     responses:
*       200:
*         description: Complaint updated
*       400:
*         description: Invalid status
*       404:
*         description: Complaint not found
*/

const trustRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
trustRouter.param("id", rejectNonUuidParam);

trustRouter.post("/payments", async (req, res, next) => {
  try {
    const input = z.object({ bookingId: z.string().uuid(), provider: z.string().trim().min(2).max(30), providerOrderId: z.string().trim().max(200).optional(), amount: z.number().positive().max(10000000) }).parse(req.body);
    const booking = await pool.query("select b.customer_id, s.base_price from bookings b join services s on s.id = b.service_id where b.id = $1", [input.bookingId]);
    if (!booking.rows[0]) { res.status(404).json({ error: "Booking not found" }); return; }
    if (booking.rows[0].customer_id !== req.user!.id) { res.status(403).json({ error: "Forbidden" }); return; }
    if (input.providerOrderId) {
      const existing = await pool.query("select id, booking_id as \"bookingId\", amount, status from payments where provider = $1 and provider_order_id = $2", [input.provider, input.providerOrderId]);
      if (existing.rows[0]) {
        if (existing.rows[0].bookingId !== input.bookingId || Number(existing.rows[0].amount) !== input.amount) { res.status(409).json({ error: "Payment order conflict" }); return; }
        res.json({ payment: existing.rows[0] });
        return;
      }
    }
    const expectedAmount = Number(booking.rows[0].base_price);
    if (input.amount !== expectedAmount) { res.status(409).json({ error: "Payment amount does not match the booking" }); return; }
    const result = await pool.query(`insert into payments (booking_id, provider, provider_order_id, amount) values ($1, $2, $3, $4) returning id, booking_id as "bookingId", provider, provider_order_id as "providerOrderId", amount, status`, [input.bookingId, input.provider, input.providerOrderId ?? null, expectedAmount]);
    void recordAuditEvent({ actorId: req.user!.id, action: "payment.created", resourceType: "payment", resourceId: result.rows[0].id, metadata: { bookingId: input.bookingId, provider: input.provider } }).catch(() => undefined);
    res.status(201).json({ payment: result.rows[0] });
  } catch (error) { next(error); }
});

trustRouter.post("/reviews", async (req, res, next) => {
  try {
    const input = z.object({ bookingId: z.string().uuid(), rating: z.number().int().min(1).max(5), feedback: z.string().trim().max(2000).optional() }).parse(req.body);
    const result = await pool.query(`insert into reviews (booking_id, customer_id, worker_id, rating, feedback) select b.id, b.customer_id, b.worker_id, $2, $3 from bookings b where b.id = $1 and b.customer_id = $4 and b.status = 'completed' and b.worker_id is not null on conflict (booking_id) do nothing returning id, booking_id as "bookingId", rating, feedback, created_at as "createdAt"`, [input.bookingId, input.rating, input.feedback ?? null, req.user!.id]);
    if (!result.rows[0]) { res.status(409).json({ error: "Only completed bookings can be reviewed" }); return; }
    void recordAuditEvent({ actorId: req.user!.id, action: "review.created", resourceType: "review", resourceId: result.rows[0].id, metadata: { bookingId: input.bookingId } }).catch(() => undefined);
    res.status(201).json({ review: result.rows[0] });
  } catch (error) { next(error); }
});

trustRouter.post("/complaints", async (req, res, next) => {
  try {
    const input = z.object({ bookingId: z.string().uuid().optional(), description: z.string().trim().min(10).max(4000) }).parse(req.body);
    const result = await pool.query(`insert into complaints (booking_id, raised_by, description) values ($1, $2, $3) returning id, booking_id as "bookingId", status, description, created_at as "createdAt"`, [input.bookingId ?? null, req.user!.id, input.description]);
    void recordAuditEvent({ actorId: req.user!.id, action: "complaint.created", resourceType: "complaint", resourceId: result.rows[0].id, metadata: { bookingId: input.bookingId ?? null } }).catch(() => undefined);
    res.status(201).json({ complaint: result.rows[0] });
  } catch (error) { next(error); }
});

// Get complaints list with filtering
trustRouter.get("/complaints", async (req, res, next) => {
  try {
    const { status, bookingId, raisedBy } = req.query;
    let query = `SELECT c.*, u.name as raised_by_name, b.id as booking_id, b.address as booking_address 
                 FROM complaints c 
                 LEFT JOIN users u ON u.id = c.raised_by 
                 LEFT JOIN bookings b ON b.id = c.booking_id`;
    const conditions: string[] = [];
    const values: any[] = [];
    let index = 1;
    
    if (status) {
      conditions.push(`c.status = $${index++}`);
      values.push(status);
    }
    
    if (bookingId) {
      conditions.push(`c.booking_id = $${index++}`);
      values.push(bookingId);
    }
    
    if (raisedBy) {
      conditions.push(`c.raised_by = $${index++}`);
      values.push(raisedBy);
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }
    
    query += ` ORDER BY c.created_at DESC`;
    
    const result = await pool.query(query, values);
    res.json({ complaints: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get specific complaint by ID
trustRouter.get("/complaints/:id", async (req, res, next) => {
  try {
    const complaintId = String(req.params.id);
    const result = await pool.query(
      `SELECT c.*, u.name as raised_by_name, b.id as booking_id, b.address as booking_address 
       FROM complaints c 
       LEFT JOIN users u ON u.id = c.raised_by 
       LEFT JOIN bookings b ON b.id = c.booking_id 
       WHERE c.id = $1`,
      [complaintId]
    );
    
    if (!result.rows[0]) {
      res.status(404).json({ error: "Complaint not found" });
      return;
    }
    
    res.json({ complaint: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Update complaint status
trustRouter.patch("/complaints/:id", async (req, res, next) => {
  try {
    const complaintId = String(req.params.id);
    const input = z.object({
      status: z.enum(["open", "investigating", "resolved", "rejected"]),
      description: z.string().trim().max(4000).optional(),
    }).parse(req.body);
    
    const existing = await pool.query("SELECT * FROM complaints WHERE id = $1", [complaintId]);
    if (!existing.rows[0]) {
      res.status(404).json({ error: "Complaint not found" });
      return;
    }
    
    const fields: string[] = [];
    const values: any[] = [];
    let index = 1;
    
    if (input.status !== undefined) {
      fields.push(`status = $${index++}`);
      values.push(input.status);
    }
    
    if (input.description !== undefined) {
      fields.push(`description = $${index++}`);
      values.push(input.description);
    }
    
    if (fields.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    
    values.push(complaintId);
    
    const result = await pool.query(
      `UPDATE complaints SET ${fields.join(", ")}, updated_at = now() WHERE id = $${index} RETURNING *`,
      values
    );
    
    await recordAuditEvent({
      actorId: req.user!.id,
      action: "complaint.updated",
      resourceType: "complaint",
      resourceId: complaintId,
      requestId: req.header("x-request-id") ?? undefined,
      metadata: { status: input.status },
    }).catch(() => undefined);
    
    res.json({ complaint: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /trust/workers/{id}:
 *   get:
 *     summary: Public Cooperative Trust Graph for a worker
 *     description: >
 *       Cooperative pillar #1. Publishes the trust signals a customer needs to
 *       decide — verification tier, society membership, certified skills,
 *       insurance and training standing, safety record and rating distribution —
 *       without exposing any document URL, identity number or contact detail.
 *     tags: [Trust]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Worker id.
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Trust graph }
 *       404: { description: Worker not found }
 */
trustRouter.get("/workers/:id", async (req, res, next) => {
  try {
    const workerId = String(req.params.id);

    const workerResult = await pool.query(
      `select w.id,
              w.verification_status,
              w.rating,
              w.experience_years,
              w.employment_type,
              w.worker_code,
              w.completed_jobs,
              w.cancelled_jobs,
              w.created_at as member_since,
              u.name,
              u.avatar_url,
              c.id   as cooperative_id,
              c.name as cooperative_name,
              f.name as federation_name
         from workers w
         join users u on u.id = w.user_id
         left join cooperatives c on c.id = w.cooperative_id
         left join federations f on f.id = c.federation_id
        where w.id = $1`,
      [workerId]
    );

    if (!workerResult.rows[0]) { res.status(404).json({ error: "Worker not found" }); return; }
    const worker = workerResult.rows[0];

    const [skills, certifications, welfare, insurance, training, incidents, ratings, documents] = await Promise.all([
      pool.query(
        `select s.id as service_id, s.name as service_name, ws.certification_level
           from worker_skills ws
           join services s on s.id = ws.service_id
          where ws.worker_id = $1
          order by s.name`,
        [workerId]
      ),
      // Counts only — certificate documents themselves stay private.
      pool.query(
        `select count(*) filter (where status = 'active')::int  as active,
                count(*) filter (where status = 'expired')::int as expired,
                max(issued_at) as latest_issued_at
           from certifications where worker_id = $1`,
        [workerId]
      ),
      pool.query("select insurance_status, training_status, updated_at from welfare_records where worker_id = $1", [workerId]),
      pool.query(
        `select count(*)::int as total,
                count(*) filter (where status = 'active' and expires_on >= current_date)::int as active
           from worker_insurance_records where worker_id = $1`,
        [workerId]
      ),
      pool.query(
        `select count(*) filter (where status = 'completed')::int as completed, max(completed_on) as latest_completed_at
           from worker_training_records where worker_id = $1`,
        [workerId]
      ),
      pool.query(
        `select count(*)::int as total,
                count(*) filter (where created_at >= now() - interval '365 days')::int as last_12_months
           from safety_incidents where worker_id = $1`,
        [workerId]
      ),
      pool.query(
        `select count(*)::int as review_count,
                round(avg(rating)::numeric, 2)::float8 as average_rating,
                count(*) filter (where rating = 5)::int as five_star,
                count(*) filter (where rating = 4)::int as four_star,
                count(*) filter (where rating = 3)::int as three_star,
                count(*) filter (where rating = 2)::int as two_star,
                count(*) filter (where rating = 1)::int as one_star
           from reviews where worker_id = $1`,
        [workerId]
      ),
      // Which KYC document TYPES are verified — never the file_url.
      pool.query(
        `select type, status from worker_documents where worker_id = $1 order by type`,
        [workerId]
      ),
    ]);

    const completed = Number(worker.completed_jobs ?? 0);
    const cancelled = Number(worker.cancelled_jobs ?? 0);
    const totalJobs = completed + cancelled;

    // Badges are derived, never stored, so they cannot drift from the facts.
    const badges: string[] = [];
    if (worker.verification_status === "verified") badges.push("identity_verified");
    if (worker.cooperative_id) badges.push("society_member");
    if (Number(certifications.rows[0]?.active ?? 0) > 0) badges.push("certified_skills");
    if (Number(insurance.rows[0]?.active ?? 0) > 0) badges.push("insured");
    if (Number(training.rows[0]?.completed ?? 0) > 0) badges.push("trained");
    if (completed >= 50 && Number(ratings.rows[0]?.average_rating ?? 0) >= 4.5) badges.push("top_rated");
    if (Number(incidents.rows[0]?.last_12_months ?? 0) === 0 && completed > 0) badges.push("clean_safety_record");

    res.json({
      worker: {
        id: worker.id,
        name: worker.name,
        avatarUrl: worker.avatar_url,
        workerCode: worker.worker_code,
        experienceYears: worker.experience_years,
        employmentType: worker.employment_type,
        memberSince: worker.member_since,
      },
      verification: {
        status: worker.verification_status,
        documentTypes: documents.rows.map((d) => ({ type: d.type, status: d.status })),
      },
      cooperative: worker.cooperative_id
        ? { id: worker.cooperative_id, name: worker.cooperative_name, federation: worker.federation_name }
        : null,
      skills: skills.rows.map((s) => ({
        serviceId: s.service_id,
        serviceName: s.service_name,
        certificationLevel: s.certification_level,
      })),
      certifications: {
        active: Number(certifications.rows[0]?.active ?? 0),
        expired: Number(certifications.rows[0]?.expired ?? 0),
        latestIssuedAt: certifications.rows[0]?.latest_issued_at ?? null,
      },
      welfare: {
        insuranceStatus: welfare.rows[0]?.insurance_status ?? "unknown",
        trainingStatus: welfare.rows[0]?.training_status ?? "not_started",
        activeInsurancePolicies: Number(insurance.rows[0]?.active ?? 0),
        completedTrainings: Number(training.rows[0]?.completed ?? 0),
        latestTrainingAt: training.rows[0]?.latest_completed_at ?? null,
      },
      safety: {
        totalIncidents: Number(incidents.rows[0]?.total ?? 0),
        incidentsLast12Months: Number(incidents.rows[0]?.last_12_months ?? 0),
      },
      performance: {
        rating: Number(worker.rating ?? 0),
        reviewCount: Number(ratings.rows[0]?.review_count ?? 0),
        averageRating: ratings.rows[0]?.average_rating ?? null,
        completedJobs: completed,
        cancelledJobs: cancelled,
        // Guard the divide: a brand-new worker has no jobs to divide by.
        completionRate: totalJobs > 0 ? Math.round((completed / totalJobs) * 1000) / 10 : null,
        ratingBreakdown: {
          5: Number(ratings.rows[0]?.five_star ?? 0),
          4: Number(ratings.rows[0]?.four_star ?? 0),
          3: Number(ratings.rows[0]?.three_star ?? 0),
          2: Number(ratings.rows[0]?.two_star ?? 0),
          1: Number(ratings.rows[0]?.one_star ?? 0),
        },
      },
      badges,
    });
  } catch (error) { next(error); }
});

export default trustRouter;
