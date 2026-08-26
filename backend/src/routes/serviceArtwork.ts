import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { getServiceById } from "../services/services.js";
import { recordAuditEvent } from "../services/auditService.js";
import {
  saveArtworkImage,
  saveArtworkAnimation,
  normaliseArtworkUrl,
} from "../services/artworkService.js";

/**
 * Artwork administration for services and categories.
 *
 * Its own router, mounted at `/services` BEFORE `servicesRouter`, so
 * `/services/categories/:name/artwork` is matched before `servicesRouter`'s
 * `/:id` can capture "categories" as a uuid and 404 it. Route-ordering bugs of
 * exactly this shape have bitten this codebase twice already.
 *
 * @openapi
 * /services/{id}/artwork:
 *   put:
 *     summary: Set service artwork (admin)
 *     tags: [Services]
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
 *               imageUrl: { type: string, nullable: true, description: "https URL, or null to clear" }
 *               imageBase64: { type: string, description: "PNG/JPEG/WebP bytes; stored and served by us" }
 *               animationUrl: { type: string, nullable: true }
 *               animationBase64: { type: string, description: "Lottie JSON" }
 *     responses:
 *       200: { description: Updated service }
 *       400: { description: Unsupported or malformed artwork }
 *       404: { description: Service not found }
 * /services/categories/{name}/artwork:
 *   put:
 *     summary: Set category artwork (admin)
 *     tags: [Services]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: name
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated category }
 */
export const serviceArtworkRouter = Router();

const artworkSchema = z.object({
  imageUrl: z.string().nullable().optional(),
  imageBase64: z.string().min(1).optional(),
  animationUrl: z.string().nullable().optional(),
  animationBase64: z.string().min(1).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
});

type ArtworkInput = z.infer<typeof artworkSchema>;

/**
 * Collapse the four possible inputs into two column values.
 *
 * Three states matter and must stay distinct:
 *   undefined — the caller did not mention this field; leave it alone
 *   null      — clear it
 *   string    — set it
 *
 * Without that distinction, a request that only sets an animation would wipe
 * the image.
 */
async function resolveArtwork(input: ArtworkInput): Promise<{
  image: string | null | undefined;
  animation: string | null | undefined;
}> {
  let image: string | null | undefined;
  if (input.imageBase64) image = await saveArtworkImage(input.imageBase64);
  else if (input.imageUrl !== undefined) image = normaliseArtworkUrl(input.imageUrl);

  let animation: string | null | undefined;
  if (input.animationBase64) animation = await saveArtworkAnimation(input.animationBase64);
  else if (input.animationUrl !== undefined) animation = normaliseArtworkUrl(input.animationUrl);

  return { image, animation };
}

/** Artwork failures are the caller's fault, not a server fault. */
const ARTWORK_MESSAGES: Record<string, string> = {
  ARTWORK_EMPTY: "The uploaded file was empty.",
  ARTWORK_TOO_LARGE: "Artwork is too large.",
  ARTWORK_UNSUPPORTED_TYPE: "Only PNG, JPEG and WebP images are accepted.",
  ARTWORK_NOT_JSON: "The animation was not valid JSON.",
  ARTWORK_NOT_LOTTIE: "The animation was not a Lottie file.",
  ARTWORK_INVALID_URL: "That is not a valid URL.",
  ARTWORK_INSECURE_URL: "Artwork URLs must use https.",
};

function artworkError(error: unknown): { error: string; message: string } | null {
  const code = error instanceof Error ? error.message : "";
  const message = ARTWORK_MESSAGES[code];
  return message ? { error: code, message } : null;
}

/**
 * Build a partial UPDATE.
 *
 * `coalesce($n, column)` cannot express "set to null", so only the columns the
 * caller actually named are written, each with its literal value.
 */
function buildSet(
  fields: Array<[column: string, value: string | null | undefined]>,
  startIndex: number
): { clause: string; values: Array<string | null> } {
  const parts: string[] = [];
  const values: Array<string | null> = [];
  let index = startIndex;

  for (const [column, value] of fields) {
    if (value === undefined) continue;
    parts.push(`${column} = $${index++}`);
    values.push(value);
  }

  return { clause: parts.join(", "), values };
}

serviceArtworkRouter.put(
  "/categories/:name/artwork",
  requireAuth,
  requireRoles("society_admin", "federation_admin", "system_admin"),
  async (req, res, next) => {
    try {
      const name = z.string().trim().min(1).max(120).parse(req.params.name);
      const input = artworkSchema.parse(req.body);
      const { image, animation } = await resolveArtwork(input);

      // `services.category` is free text, so a category can be in active use
      // with no row here yet. Upsert rather than 404 on the first artwork.
      const existing = await pool.query(`select name from service_categories where name = $1`, [name]);

      if (!existing.rows[0]) {
        await pool.query(
          `insert into service_categories (name, image_url, animation_url, accent_color)
           values ($1, $2, $3, $4)
           on conflict (name) do nothing`,
          [name, image ?? null, animation ?? null, input.accentColor ?? null]
        );
      } else {
        const { clause, values } = buildSet(
          [
            ["image_url", image],
            ["animation_url", animation],
            ["accent_color", input.accentColor],
          ],
          2
        );
        if (clause) {
          await pool.query(
            `update service_categories set ${clause}, updated_at = now() where name = $1`,
            [name, ...values]
          );
        }
      }

      await recordAuditEvent({
        actorId: req.user!.id,
        action: "service_category.artwork.updated",
        resourceType: "service_category",
        resourceId: name,
        requestId: req.header("x-request-id") ?? undefined,
      }).catch(() => undefined);

      const result = await pool.query(
        `select name, image_url, animation_url, accent_color from service_categories where name = $1`,
        [name]
      );
      const row = result.rows[0];
      res.json({
        category: {
          name: row.name,
          imageUrl: row.image_url,
          animationUrl: row.animation_url,
          accentColor: row.accent_color,
        },
      });
    } catch (error) {
      const mapped = artworkError(error);
      if (mapped) { res.status(400).json(mapped); return; }
      next(error);
    }
  }
);

serviceArtworkRouter.put(
  "/:id/artwork",
  requireAuth,
  requireRoles("society_admin", "federation_admin", "system_admin"),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const input = artworkSchema.parse(req.body);
      const { image, animation } = await resolveArtwork(input);

      const { clause, values } = buildSet(
        [
          ["image_url", image],
          ["animation_url", animation],
        ],
        2
      );

      if (clause) {
        const updated = await pool.query(
          `update services set ${clause} where id = $1 returning id`,
          [id, ...values]
        );
        if (!updated.rows[0]) { res.status(404).json({ error: "Service not found" }); return; }
      }

      const service = await getServiceById(id);
      if (!service) { res.status(404).json({ error: "Service not found" }); return; }

      await recordAuditEvent({
        actorId: req.user!.id,
        action: "service.artwork.updated",
        resourceType: "service",
        resourceId: id,
        requestId: req.header("x-request-id") ?? undefined,
      }).catch(() => undefined);

      res.json({ service });
    } catch (error) {
      const mapped = artworkError(error);
      if (mapped) { res.status(400).json(mapped); return; }
      next(error);
    }
  }
);
