import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

export const addressesRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
addressesRouter.param("id", rejectNonUuidParam);

const addressCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  address: z.string().trim().min(5).max(500),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  is_default: z.boolean().default(false),
  instructions: z.string().trim().max(1000).optional(),
});

const addressUpdateSchema = addressCreateSchema.partial();

/**
 * @openapi
 * /addresses:
 *   get:
 *     summary: List the caller's saved addresses
 *     tags: [Addresses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: name
 *         in: query
 *         schema: { type: string }
 *       - name: is_default
 *         in: query
 *         schema: { type: boolean }
 *     responses:
 *       200: { description: List of addresses }
 *   post:
 *     summary: Create a saved address
 *     tags: [Addresses]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, address]
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 100 }
 *               address: { type: string, minLength: 5, maxLength: 500 }
 *               latitude: { type: number, minimum: -90, maximum: 90 }
 *               longitude: { type: number, minimum: -180, maximum: 180 }
 *               is_default: { type: boolean, default: false }
 *               instructions: { type: string, maxLength: 1000 }
 *     responses:
 *       201: { description: Address created }
 *       400: { description: Validation error }
 * /addresses/{id}:
 *   get:
 *     summary: Get address details
 *     tags: [Addresses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Address details }
 *       404: { description: Not found }
 *   patch:
 *     summary: Update an address
 *     tags: [Addresses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               address: { type: string }
 *               latitude: { type: number }
 *               longitude: { type: number }
 *               is_default: { type: boolean }
 *               instructions: { type: string }
 *     responses:
 *       200: { description: Address updated }
 *       404: { description: Not found }
 *   delete:
 *     summary: Delete an address
 *     tags: [Addresses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Address deleted }
 *       404: { description: Not found }
 */

// Get all addresses for the authenticated user
addressesRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const { name, is_default } = req.query;
    const isAdmin = ["system_admin", "federation_admin"].includes(req.user!.role);
    
    let query = "SELECT * FROM addresses WHERE (user_id = $1" + (isAdmin ? " OR $1 = $1)" : ")");
    const values: any[] = [req.user!.id];
    let index = 2;
    
    if (name) {
      query += ` AND name ILIKE $${index++}`;
      values.push(`%${name}%`);
    }
    
    if (is_default !== undefined) {
      query += ` AND is_default = $${index++}`;
      values.push(is_default === "true");
    }
    
    query += ` ORDER BY is_default DESC, created_at DESC`;
    
    const result = await pool.query(query, values);
    res.json({ addresses: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get address by ID
addressesRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const addressId = String(req.params.id);
    const isAdmin = ["system_admin", "federation_admin"].includes(req.user!.role);
    
    const result = await pool.query(
      "SELECT * FROM addresses WHERE id = $1 AND (user_id = $2 OR $3 = true)",
      [addressId, req.user!.id, isAdmin]
    );
    
    if (!result.rows[0]) {
      res.status(404).json({ error: "Address not found" });
      return;
    }
    
    res.json({ address: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Create new address
addressesRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const input = addressCreateSchema.parse(req.body);
    
    // If setting as default, unset other defaults for this user first
    if (input.is_default) {
      await pool.query(
        "UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default = true",
        [req.user!.id]
      );
    }
    
    const result = await pool.query(
      `INSERT INTO addresses 
       (id, user_id, name, address, latitude, longitude, is_default, instructions) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        crypto.randomUUID(),
        req.user!.id,
        input.name,
        input.address,
        input.latitude ?? null,
        input.longitude ?? null,
        input.is_default,
        input.instructions ?? null,
      ]
    );
    
    await recordAuditEvent({
      actorId: req.user!.id,
      action: "address.created",
      resourceType: "address",
      resourceId: result.rows[0].id,
      requestId: req.header("x-request-id") ?? undefined,
      metadata: { name: input.name },
    }).catch(() => undefined);
    
    res.status(201).json({ address: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Update address
addressesRouter.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const addressId = String(req.params.id);
    const input = addressUpdateSchema.parse(req.body);
    const isAdmin = ["system_admin", "federation_admin"].includes(req.user!.role);
    
    const existing = await pool.query(
      "SELECT * FROM addresses WHERE id = $1 AND (user_id = $2 OR $3 = true)",
      [addressId, req.user!.id, isAdmin]
    );
    
    if (!existing.rows[0]) {
      res.status(404).json({ error: "Address not found" });
      return;
    }
    
    if (input.is_default) {
      await pool.query(
        "UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default = true",
        [req.user!.id]
      );
    }
    
    const updates: string[] = [];
    const values: any[] = [];
    let index = 1;
    
    if (input.name !== undefined) { updates.push(`name = $${index++}`); values.push(input.name); }
    if (input.address !== undefined) { updates.push(`address = $${index++}`); values.push(input.address); }
    if (input.latitude !== undefined) { updates.push(`latitude = $${index++}`); values.push(input.latitude); }
    if (input.longitude !== undefined) { updates.push(`longitude = $${index++}`); values.push(input.longitude); }
    if (input.is_default !== undefined) { updates.push(`is_default = $${index++}`); values.push(input.is_default); }
    if (input.instructions !== undefined) { updates.push(`instructions = $${index++}`); values.push(input.instructions); }
    
    if (updates.length === 0) {
      res.json({ address: existing.rows[0] });
      return;
    }
    
    updates.push(`updated_at = now()`);
    values.push(addressId);
    
    const result = await pool.query(
      `UPDATE addresses SET ${updates.join(", ")} WHERE id = $${index} RETURNING *`,
      values
    );
    
    await recordAuditEvent({
      actorId: req.user!.id,
      action: "address.updated",
      resourceType: "address",
      resourceId: addressId,
      requestId: req.header("x-request-id") ?? undefined,
      metadata: { fields: Object.keys(input) },
    }).catch(() => undefined);
    
    res.json({ address: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Delete address
addressesRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const addressId = String(req.params.id);
    const isAdmin = ["system_admin", "federation_admin"].includes(req.user!.role);
    
    const existing = await pool.query(
      "SELECT * FROM addresses WHERE id = $1 AND (user_id = $2 OR $3 = true)",
      [addressId, req.user!.id, isAdmin]
    );
    
    if (!existing.rows[0]) {
      res.status(404).json({ error: "Address not found" });
      return;
    }
    
    await pool.query("DELETE FROM addresses WHERE id = $1", [addressId]);
    
    await recordAuditEvent({
      actorId: req.user!.id,
      action: "address.deleted",
      resourceType: "address",
      resourceId: addressId,
      requestId: req.header("x-request-id") ?? undefined,
    }).catch(() => undefined);
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});