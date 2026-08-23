import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { demoServices } from "../data/demoStore.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { getAllServices, getServicesByCategory, getServiceById, createService, updateService, deleteService } from "../services/services.js";

/**
 * @openapi
 * /services:
 *   get:
 *     summary: List all services
 *     description: Returns a list of all available services, optionally filtered by category, emergency support, or search term
 *     tags: [Services]
 *     parameters:
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by service category
 *       - name: emergencyOnly
 *         in: query
 *         schema:
 *           type: boolean
 *         description: Only show services that support emergency bookings
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *         description: Search in service name and description
 *     responses:
 *       200:
 *         description: List of services
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 services:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Service'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @openapi
 * /services/categories:
 *   get:
 *     summary: Get services grouped by category
 *     description: Returns services organized by category for easier browsing
 *     tags: [Services]
 *     responses:
 *       200:
 *         description: Services grouped by category
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 categories:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ServiceCategory'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @openapi
 * /services/{id}:
 *   get:
 *     summary: Get service by ID
 *     description: Returns details of a specific service
 *     tags: [Services]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Service details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 service:
 *                   $ref: '#/components/schemas/Service'
 *       404:
 *         description: Service not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @openapi
 * /services:
 *   post:
 *     summary: Create a new service (admin only)
 *     description: Creates a new service. Requires admin authentication.
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateService'
 *     responses:
 *       201:
 *         description: Service created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 service:
 *                   $ref: '#/components/schemas/Service'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @openapi
 * /services/{id}:
 *   patch:
 *     summary: Update a service (admin only)
 *     description: Updates an existing service. Requires admin authentication.
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateService'
 *     responses:
 *       200:
 *         description: Service updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 service:
 *                   $ref: '#/components/schemas/Service'
 *       404:
 *         description: Service not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @openapi
 * /services/{id}:
 *   delete:
 *     summary: Delete a service (admin only)
 *     description: Deletes a service. Requires admin authentication.
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Service deleted
 *       404:
 *         description: Service not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

export const servicesRouter = Router();

const listQuerySchema = z.object({
  category: z.string().optional(),
  emergencyOnly: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

const createServiceSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(50),
  description: z.string().max(500).optional(),
  basePrice: z.number().nonnegative(),
  emergencySupported: z.boolean().default(false),
});

const updateServiceSchema = createServiceSchema.partial();

servicesRouter.get("/", async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    if (env.USE_MOCK_DB) {
      const search = query.search?.toLowerCase();
      const services = demoServices.filter((service) =>
        (!query.category || service.category === query.category) &&
        (!query.emergencyOnly || service.emergencySupported) &&
        (!search || `${service.name} ${service.description ?? ""}`.toLowerCase().includes(search))
      );
      res.json({ services });
      return;
    }
    const services = await getAllServices(query);
    res.json({ services });
  } catch (error) {
    next(error);
  }
});

servicesRouter.get("/categories", async (_req, res, next) => {
  try {
    if (env.USE_MOCK_DB) {
      const categories = new Map<string, typeof demoServices>();
      for (const service of demoServices) categories.set(service.category, [...(categories.get(service.category) ?? []), service]);
      res.json({ categories: Array.from(categories, ([category, services]) => ({ category, services })) });
      return;
    }
    const categories = await getServicesByCategory();
    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

servicesRouter.get("/:id", async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    if (env.USE_MOCK_DB) {
      const service = demoServices.find((item) => item.id === id);
      if (!service) { res.status(404).json({ error: "Service not found" }); return; }
      res.json({ service });
      return;
    }
    const service = await getServiceById(id);

    if (!service) {
      res.status(404).json({ error: "Service not found" });
      return;
    }

    res.json({ service });
  } catch (error) {
    next(error);
  }
});

servicesRouter.post("/", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin"), async (req, res, next) => {
  try {
    if (env.USE_MOCK_DB) {
      res.status(501).json({ error: "Not implemented in mock mode" });
      return;
    }

    const body = createServiceSchema.parse(req.body);
    const service = await createService(body);
    res.status(201).json({ service });
  } catch (error) {
    next(error);
  }
});

servicesRouter.patch("/:id", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin"), async (req, res, next) => {
  try {
    if (env.USE_MOCK_DB) {
      res.status(501).json({ error: "Not implemented in mock mode" });
      return;
    }

    const id = z.string().uuid().parse(req.params.id);
    const body = updateServiceSchema.parse(req.body);
    const service = await updateService(id, body);

    if (!service) {
      res.status(404).json({ error: "Service not found" });
      return;
    }

    res.json({ service });
  } catch (error) {
    next(error);
  }
});

servicesRouter.delete("/:id", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin"), async (req, res, next) => {
  try {
    if (env.USE_MOCK_DB) {
      res.status(501).json({ error: "Not implemented in mock mode" });
      return;
    }

    const id = z.string().uuid().parse(req.params.id);
    const deleted = await deleteService(id);

    if (!deleted) {
      res.status(404).json({ error: "Service not found" });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});