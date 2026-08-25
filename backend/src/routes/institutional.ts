import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { createBooking } from "../services/bookingService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

export const institutionalRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
institutionalRouter.param("id", rejectNonUuidParam);

const bulkBookingSchema = z.object({
  organizationId: z.string().uuid(),
  bookings: z.array(z.object({
    serviceId: z.string().uuid(),
    addressId: z.string().uuid().optional(),
    address: z.string().min(3).max(500).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    description: z.string().max(2000).optional(),
    scheduledAt: z.string().datetime().optional(),
    isEmergency: z.boolean().default(false),
  })).min(1).max(50),
});

const createContractSchema = z.object({
  organizationId: z.string().uuid(),
  serviceId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  pricingRuleId: z.string().uuid().optional(),
  startDate: z.string().date(),
  endDate: z.string().date().optional(),
  terms: z.string().max(5000).optional(),
});

const createServicePlanSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2).max(200),
  services: z.array(z.object({
    serviceId: z.string().uuid(),
    quantity: z.number().int().positive().default(1),
  })).min(1),
  frequency: z.enum(["daily", "weekly", "monthly", "custom"]),
  preferredDays: z.array(z.number().int().min(0).max(6)).default([]),
  preferredTimeStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  preferredTimeEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
});

const createPurchaseOrderSchema = z.object({
  organizationId: z.string().uuid(),
  contractId: z.string().uuid().optional(),
  poNumber: z.string().min(3).max(50),
  amount: z.number().positive(),
  validUntil: z.string().datetime().optional(),
});

/**
 * @openapi
 * /institutions/bookings/bulk:
 *   post:
 *     summary: Create multiple bookings for an organization
 *     tags: [Institutional]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId, bookings]
 *             properties:
 *               organizationId: { type: string, format: uuid }
 *               bookings: { type: array, items: { type: object } }
 *     responses:
 *       201:
 *         description: Bulk bookings created
 */
institutionalRouter.post("/bookings/bulk", requireAuth, async (req, res, next) => {
  try {
    const input = bulkBookingSchema.parse(req.body);

    // Verify user is admin/member of organization
    const membership = await pool.query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [input.organizationId, req.user!.id]
    );
    if (!membership.rows[0] || !["admin", "member"].includes(membership.rows[0].role)) {
      res.status(403).json({ error: "Not authorized for this organization" });
      return;
    }

    // Get organization details for default address
    const org = await pool.query("SELECT * FROM organizations WHERE id = $1", [input.organizationId]);
    if (!org.rows[0]) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const results = [];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const bookingInput of input.bookings) {
        let finalAddress = bookingInput.address;
        let finalLat = bookingInput.latitude;
        let finalLng = bookingInput.longitude;

        if (bookingInput.addressId) {
          const addr = await client.query("SELECT * FROM addresses WHERE id = $1 AND organization_id = $2", [bookingInput.addressId, input.organizationId]);
          if (addr.rows[0]) {
            finalAddress = addr.rows[0].address;
            finalLat = addr.rows[0].latitude;
            finalLng = addr.rows[0].longitude;
          }
        } else if (!finalAddress || finalLat === undefined || finalLng === undefined) {
          // Use organization default address
          const defaultAddr = await client.query("SELECT * FROM organization_addresses WHERE organization_id = $1 AND is_default = true", [input.organizationId]);
          if (defaultAddr.rows[0]) {
            finalAddress = defaultAddr.rows[0].address;
            finalLat = defaultAddr.rows[0].latitude;
            finalLng = defaultAddr.rows[0].longitude;
          }
        }

        if (!finalAddress || finalLat === undefined || finalLng === undefined) {
          results.push({ success: false, error: "Address required", input: bookingInput });
          continue;
        }

        const idempotencyKey = `${req.user!.id}:bulk:${crypto.randomUUID()}`;
        const bookingResult = await createBooking({
          customerId: req.user!.id,
          serviceId: bookingInput.serviceId,
          address: finalAddress,
          description: bookingInput.description ?? "",
          latitude: finalLat,
          longitude: finalLng,
          scheduledAt: bookingInput.scheduledAt,
          isEmergency: bookingInput.isEmergency,
          idempotencyKey,
        });

        // Add organization reference to booking
        if (bookingResult.body.booking) {
          await client.query(
            "UPDATE bookings SET organization_id = $1 WHERE id = $2",
            [input.organizationId, bookingResult.body.booking.id]
          );
          results.push({ success: true, booking: bookingResult.body.booking });
        } else {
          results.push({ success: false, error: "Booking creation failed", input: bookingInput });
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    await recordAuditEvent({
      actorId: req.user!.id,
      action: "institutional.bulk_booking",
      resourceType: "organization",
      resourceId: input.organizationId,
      requestId: req.header("x-request-id"),
      metadata: { total: input.bookings.length, successful, failed }
    }).catch(() => undefined);

    res.status(201).json({ 
      results, 
      summary: { total: input.bookings.length, successful, failed } 
    });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /institutions/{id}/contracts:
 *   get:
 *     summary: Get service contracts for an organization
 *     tags: [Institutional]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [draft, active, expired, cancelled, all] }
 *     responses:
 *       200:
 *         description: List of contracts
 */
institutionalRouter.get("/:id/contracts", requireAuth, async (req, res, next) => {
  try {
    const organizationId = z.string().uuid().parse(req.params.id);
    const query = z.object({
      status: z.enum(["draft", "active", "expired", "cancelled", "all"]).default("active"),
    }).parse(req.query);

    // Verify access
    const membership = await pool.query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, req.user!.id]
    );
    if (!membership.rows[0]) {
      res.status(403).json({ error: "Not a member of this organization" });
      return;
    }

    const conditions: string[] = ["organization_id = $1"];
    const values: unknown[] = [organizationId];
    let index = 2;

    if (query.status !== "all") {
      conditions.push(`status = $${index++}`);
      values.push(query.status);
    }

    const result = await pool.query(
      `SELECT sc.*, s.name as service_name, s.category, s.base_price
       FROM service_contracts sc
       JOIN services s ON s.id = sc.service_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY sc.created_at DESC`,
      values
    );

    res.json({ contracts: result.rows });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /institutions/{id}/contracts:
 *   post:
 *     summary: Create a service contract
 *     tags: [Institutional]
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
 *             required: [serviceId, startDate]
 *             properties:
 *               serviceId: { type: string, format: uuid }
 *               variantId: { type: string, format: uuid }
 *               pricingRuleId: { type: string, format: uuid }
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *               terms: { type: string }
 *     responses:
 *       201:
 *         description: Contract created
 */
institutionalRouter.post("/:id/contracts", requireAuth, async (req, res, next) => {
  try {
    const organizationId = z.string().uuid().parse(req.params.id);
    const input = createContractSchema.parse(req.body);

    // Verify user is admin of organization
    const membership = await pool.query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND role = 'admin'`,
      [organizationId, req.user!.id]
    );
    if (!membership.rows[0]) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const result = await pool.query(
      `INSERT INTO service_contracts (id, organization_id, service_id, variant_id, pricing_rule_id, start_date, end_date, status, terms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8) RETURNING *`,
      [crypto.randomUUID(), organizationId, input.serviceId, input.variantId ?? null, input.pricingRuleId ?? null, input.startDate, input.endDate ?? null, input.terms ?? null]
    );

    await recordAuditEvent({
      actorId: req.user!.id,
      action: "service_contract.created",
      resourceType: "service_contract",
      resourceId: result.rows[0].id,
      requestId: req.header("x-request-id"),
      metadata: { organizationId, serviceId: input.serviceId }
    }).catch(() => undefined);

    res.status(201).json({ contract: result.rows[0] });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /institutions/{id}/service-plans:
 *   get:
 *     summary: Get service plans for an organization
 *     tags: [Institutional]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: List of service plans
 */
institutionalRouter.get("/:id/service-plans", requireAuth, async (req, res, next) => {
  try {
    const organizationId = z.string().uuid().parse(req.params.id);

    const membership = await pool.query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, req.user!.id]
    );
    if (!membership.rows[0]) {
      res.status(403).json({ error: "Not a member of this organization" });
      return;
    }

    const result = await pool.query(
      `SELECT sp.*, 
              (SELECT json_agg(jsonb_build_object('serviceId', s.id, 'name', s.name, 'quantity', item->>'quantity'))
               FROM jsonb_array_elements(sp.services) item
               JOIN services s ON s.id = (item->>'serviceId')::uuid) as service_details
       FROM service_plans sp
       WHERE sp.organization_id = $1
       ORDER BY sp.created_at DESC`,
      [organizationId]
    );

    res.json({ servicePlans: result.rows });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /institutions/{id}/service-plans:
 *   post:
 *     summary: Create a service plan
 *     tags: [Institutional]
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
 *             required: [name, services, frequency]
 *             properties:
 *               name: { type: string }
 *               services: { type: array, items: { type: object } }
 *               frequency: { type: string, enum: [daily, weekly, monthly, custom] }
 *               preferredDays: { type: array, items: { type: integer } }
 *               preferredTimeStart: { type: string }
 *               preferredTimeEnd: { type: string }
 *     responses:
 *       201:
 *         description: Service plan created
 */
institutionalRouter.post("/:id/service-plans", requireAuth, async (req, res, next) => {
  try {
    const organizationId = z.string().uuid().parse(req.params.id);
    const input = createServicePlanSchema.parse(req.body);

    const membership = await pool.query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND role = 'admin'`,
      [organizationId, req.user!.id]
    );
    if (!membership.rows[0]) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const result = await pool.query(
      `INSERT INTO service_plans (id, organization_id, name, services, frequency, preferred_days, preferred_time_start, preferred_time_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [crypto.randomUUID(), organizationId, input.name, JSON.stringify(input.services), input.frequency, input.preferredDays, input.preferredTimeStart ?? null, input.preferredTimeEnd ?? null]
    );

    await recordAuditEvent({
      actorId: req.user!.id,
      action: "service_plan.created",
      resourceType: "service_plan",
      resourceId: result.rows[0].id,
      requestId: req.header("x-request-id")
    }).catch(() => undefined);

    res.status(201).json({ servicePlan: result.rows[0] });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /institutions/{id}/purchase-orders:
 *   get:
 *     summary: Get purchase orders for an organization
 *     tags: [Institutional]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: List of purchase orders
 */
institutionalRouter.get("/:id/purchase-orders", requireAuth, async (req, res, next) => {
  try {
    const organizationId = z.string().uuid().parse(req.params.id);

    const membership = await pool.query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, req.user!.id]
    );
    if (!membership.rows[0]) {
      res.status(403).json({ error: "Not a member of this organization" });
      return;
    }

    const result = await pool.query(
      `SELECT po.*, sc.terms, s.name as service_name
       FROM purchase_orders po
       LEFT JOIN service_contracts sc ON sc.id = po.contract_id
       LEFT JOIN services s ON s.id = sc.service_id
       WHERE po.organization_id = $1
       ORDER BY po.created_at DESC`,
      [organizationId]
    );

    res.json({ purchaseOrders: result.rows });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /institutions/{id}/purchase-orders:
 *   post:
 *     summary: Create a purchase order
 *     tags: [Institutional]
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
 *             required: [poNumber, amount]
 *             properties:
 *               contractId: { type: string, format: uuid }
 *               poNumber: { type: string }
 *               amount: { type: number }
 *               validUntil: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Purchase order created
 */
institutionalRouter.post("/:id/purchase-orders", requireAuth, async (req, res, next) => {
  try {
    const organizationId = z.string().uuid().parse(req.params.id);
    const input = createPurchaseOrderSchema.parse(req.body);

    const membership = await pool.query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND role = 'admin'`,
      [organizationId, req.user!.id]
    );
    if (!membership.rows[0]) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    // Check PO number uniqueness
    const existing = await pool.query("SELECT 1 FROM purchase_orders WHERE po_number = $1", [input.poNumber]);
    if (existing.rows[0]) {
      res.status(409).json({ error: "PO number already exists" });
      return;
    }

    const result = await pool.query(
      `INSERT INTO purchase_orders (id, organization_id, contract_id, po_number, amount, status, valid_until)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6) RETURNING *`,
      [crypto.randomUUID(), organizationId, input.contractId ?? null, input.poNumber, input.amount, input.validUntil ?? null]
    );

    await recordAuditEvent({
      actorId: req.user!.id,
      action: "purchase_order.created",
      resourceType: "purchase_order",
      resourceId: result.rows[0].id,
      requestId: req.header("x-request-id"),
      metadata: { organizationId, poNumber: input.poNumber }
    }).catch(() => undefined);

    res.status(201).json({ purchaseOrder: result.rows[0] });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /institutions/{id}/analytics:
 *   get:
 *     summary: Get analytics for an organization
 *     tags: [Institutional]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: fromDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: toDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Organization analytics
 */
institutionalRouter.get("/:id/analytics", requireAuth, async (req, res, next) => {
  try {
    const organizationId = z.string().uuid().parse(req.params.id);
    const query = z.object({
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
    }).parse(req.query);

    const membership = await pool.query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, req.user!.id]
    );
    if (!membership.rows[0]) {
      res.status(403).json({ error: "Not a member of this organization" });
      return;
    }

    const filters: string[] = [];
    const values: unknown[] = [organizationId];
    if (query.fromDate) { values.push(query.fromDate); filters.push(`b.created_at >= $${values.length}`); }
    if (query.toDate) { values.push(query.toDate); filters.push(`b.created_at <= $${values.length}`); }
    const dateFilter = filters.length > 0 ? `AND ${filters.join(" AND ")}` : "";

    const [bookingStats, serviceBreakdown, spendingTrend, memberActivity] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as total_bookings,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
                COUNT(*) FILTER (WHERE is_emergency) as emergency,
                COALESCE(SUM(price) FILTER (WHERE status = 'completed'), 0) as total_spent
         FROM bookings b
         WHERE b.organization_id = $1 ${dateFilter}`,
        values
      ),
      pool.query(
        `SELECT s.name, s.category, COUNT(*) as count,
                COALESCE(SUM(b.price) FILTER (WHERE b.status = 'completed'), 0) as spent
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         WHERE b.organization_id = $1 ${dateFilter}
         GROUP BY s.id, s.name, s.category
         ORDER BY count DESC`,
        values
      ),
      pool.query(
        `SELECT DATE_TRUNC('week', b.created_at)::date as week,
                COUNT(*) as bookings,
                COALESCE(SUM(b.price) FILTER (WHERE b.status = 'completed'), 0) as spent
         FROM bookings b
         WHERE b.organization_id = $1 ${dateFilter}
         GROUP BY 1
         ORDER BY 1 DESC
         LIMIT 12`,
        values
      ),
      pool.query(
        `SELECT om.user_id, u.name, COUNT(b.id) as bookings_count
         FROM organization_members om
         JOIN users u ON u.id = om.user_id
         LEFT JOIN bookings b ON b.customer_id = u.id AND b.organization_id = $1 ${dateFilter}
         WHERE om.organization_id = $1
         GROUP BY om.user_id, u.name
         ORDER BY bookings_count DESC`,
        values
      ),
    ]);

    res.json({
      bookingStats: bookingStats.rows[0],
      serviceBreakdown: serviceBreakdown.rows,
      spendingTrend: spendingTrend.rows,
      memberActivity: memberActivity.rows,
    });
  } catch (error) { next(error); }
});

export default institutionalRouter;