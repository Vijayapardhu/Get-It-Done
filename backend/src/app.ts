import cors from "cors";
import path from "node:path";
import express, { type Express } from "express";
import helmet from "helmet";
import crypto from "node:crypto";
import swaggerUi from "swagger-ui-express";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { requireAuth, requireRoles } from "./middleware/auth.js";
import { env } from "./config/env.js";
import { adminRouter } from "./routes/admin.js";
import { aiRouter } from "./routes/ai.js";
import { authRouter } from "./routes/auth.js";
import { bookingsRouter } from "./routes/bookings.js";
import { servicesRouter } from "./routes/services.js";
import { workersRouter } from "./routes/workers.js";
import trustRouter from "./routes/trust.js";
import { notificationsRouter } from "./routes/notifications.js";
import { filesRouter } from "./routes/files.js";
import { configRouter } from "./routes/config.js";
import { serviceArtworkRouter } from "./routes/serviceArtwork.js";
import { ordersRouter } from "./routes/orders.js";
import { usersRouter } from "./routes/users.js";
import { cooperativesRouter } from "./routes/cooperatives.js";
import { skillsRouter } from "./routes/skills.js";
import { documentsRouter } from "./routes/documents.js";
import { pricingRouter } from "./routes/pricing.js";
import { emergencyRouter } from "./routes/emergency.js";
import { paymentsRouter } from "./routes/payments.js";
import { settlementsRouter } from "./routes/settlements.js";
import { earningsRouter } from "./routes/earnings.js";
import { invoicesRouter } from "./routes/invoices.js";
import { analyticsRouter } from "./routes/analytics.js";
import { institutionsRouter } from "./routes/institutions.js";
import { institutionalRouter } from "./routes/institutional.js";
import { recurringRouter } from "./routes/recurring.js";
import { reportsRouter } from "./routes/reports.js";
import { supportRouter } from "./routes/support.js";
import { matchingRouter } from "./routes/matching.js";
import { welfareRouter } from "./routes/welfare.js";
import { reviewsRouter } from "./routes/reviews.js";
import { serviceAreasRouter } from "./routes/serviceAreas.js";
import { bookingAttachmentsRouter } from "./routes/ba.js";
import { workerAppRouter, workerJobsRouter } from "./routes/workerApp.js";
import { addressesRouter } from "./routes/addresses.js";
import { chatRouter } from "./routes/chat.js";
import { trainingRouter } from "./routes/training.js";
import { customerDashboardRouter } from "./routes/customerDashboard.js";
import { workerDashboardRouter } from "./routes/workerDashboard.js";
import { cooperativeDashboardRouter } from "./routes/cooperativeDashboard.js";
import { federationDashboardRouter } from "./routes/federationDashboard.js";
import { i18nRouter } from "./routes/i18n.js";
import { serviceDiscoveryRouter } from "./routes/serviceDiscovery.js";
import { googleMapsRouter } from "./routes/googleMaps.js";
import { healthRouter } from "./routes/health.js";
import { compatRewrite } from "./routes/compat.js";
import { getLiveness, getReadiness } from "./core/health.js";
import { getMetrics, getMetricsContentType } from "./core/metrics.js";
import { errorHandler, notFoundHandler } from "./core/errors.js";
import { authLimiter, strictLimiter, meteredLimiter, writeLimiter } from "./core/rateLimits.js";
import logger from "./core/logger.js";
import { httpRequestDuration, httpRequestTotal } from "./core/metrics.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const swaggerSpec = JSON.parse(readFileSync(resolve(__dirname, "../swagger.json"), "utf-8"));

/**
 * Docs styling.
 *
 * Swagger UI's default is a grey wall of identical rows, which for 270
 * operations is close to unusable. This is not decoration: the colour-coded
 * method pills, the sticky filter and the readable monospace are what make it
 * possible to find one endpoint by eye.
 *
 * Brand tokens are the app's own (mobile/lib/design/tokens/colors.dart), so the
 * reference looks like the product it documents. Both colour schemes are
 * defined because the topbar is hidden and there is no theme switch to offer.
 */
const DOCS_CSS = `
  :root {
    --gid-blue-900: #14285C;
    --gid-blue-600: #2E5FD9;
    --gid-surface:  #FFFFFF;
    --gid-canvas:   #F4F6FB;
    --gid-border:   #DCE3F2;
    --gid-text:     #14285C;
    --gid-muted:    #5B6B8F;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --gid-surface: #131A2B;
      --gid-canvas:  #0C111C;
      --gid-border:  #26314A;
      --gid-text:    #E8EDF9;
      --gid-muted:   #9AA9C7;
    }
  }

  /* The default topbar is a spec-URL input we do not want the reader editing. */
  .swagger-ui .topbar { display: none; }

  body { background: var(--gid-canvas); }
  .swagger-ui, .swagger-ui .info .title, .swagger-ui .scheme-container { color: var(--gid-text); }

  /* Masthead */
  .swagger-ui .info {
    background: linear-gradient(135deg, var(--gid-blue-900) 0%, var(--gid-blue-600) 100%);
    color: #fff;
    padding: 32px 28px;
    border-radius: 16px;
    margin: 24px 0;
  }
  .swagger-ui .info .title,
  .swagger-ui .info p,
  .swagger-ui .info li,
  .swagger-ui .info a { color: #fff !important; }
  .swagger-ui .info .title small { background: rgba(255,255,255,.18); border-radius: 999px; }

  /* Server picker and auth sit together above the operations. */
  .swagger-ui .scheme-container {
    background: var(--gid-surface);
    border: 1px solid var(--gid-border);
    border-radius: 12px;
    box-shadow: none;
    margin-bottom: 20px;
  }

  /* Keep the filter reachable while scrolling 270 operations. */
  .swagger-ui .filter .operation-filter-input {
    border-radius: 10px;
    border: 1px solid var(--gid-border);
    padding: 10px 14px;
  }
  .swagger-ui .filter { position: sticky; top: 0; z-index: 5; padding: 12px 0; background: var(--gid-canvas); }

  /* Tag sections as cards, so the eye can find a boundary. */
  .swagger-ui .opblock-tag {
    border-bottom: 1px solid var(--gid-border);
    color: var(--gid-text);
    font-size: 20px;
    padding: 16px 8px;
  }
  .swagger-ui .opblock {
    border-radius: 12px;
    border: 1px solid var(--gid-border);
    box-shadow: none;
    margin: 0 0 10px;
    background: var(--gid-surface);
  }
  .swagger-ui .opblock .opblock-summary { border-bottom: none; }

  /* Method pills: the fastest way to read a long list is by colour. */
  .swagger-ui .opblock .opblock-summary-method {
    border-radius: 8px;
    font-weight: 700;
    letter-spacing: .04em;
    min-width: 84px;
  }
  .swagger-ui .opblock.opblock-get    { border-left: 4px solid #2E5FD9; }
  .swagger-ui .opblock.opblock-post   { border-left: 4px solid #1E9E6A; }
  .swagger-ui .opblock.opblock-patch  { border-left: 4px solid #C2871B; }
  .swagger-ui .opblock.opblock-put    { border-left: 4px solid #7A5AF8; }
  .swagger-ui .opblock.opblock-delete { border-left: 4px solid #D6455D; }

  .swagger-ui .btn.authorize {
    background: var(--gid-blue-600);
    border-color: var(--gid-blue-600);
    color: #fff;
    border-radius: 10px;
  }
  .swagger-ui .btn.authorize svg { fill: #fff; }

  .swagger-ui .opblock-summary-path,
  .swagger-ui .response-col_status,
  .swagger-ui code {
    font-family: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;
  }
`;

export function createApp(): Express {
  const app = express();

  // Must be set before anything reads req.ip -- the rate limiters key on it
  // and the audit trail records it. See TRUST_PROXY_HOPS in config/env.ts for
  // why the count is explicit rather than `true`.
  app.set("trust proxy", env.TRUST_PROXY_HOPS);

  const allowedOrigins = new Set(env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean));
  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
    credentials: true,
  }));
  // Payment gateways sign the RAW body. Re-serialising the parsed object never
  // reproduces it byte-for-byte, so stash the untouched Buffer on the request
  // for the webhook routes before the JSON parser discards it.
  const jsonParser = express.json({
    limit: "256kb",
    verify: (req, _res, buf) => {
      if (req.url?.startsWith("/payments/webhooks")) {
        (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      }
    },
  });

  // Artwork arrives as base64 in the JSON body, so 256kb caps it far below the
  // 2MB image / 1MB animation the route documents and enforces: a legal upload
  // would be rejected by the parser before the route ever saw it. Base64
  // inflates by 4/3 and an image and an animation can be sent together, so 5mb
  // clears both caps combined.
  //
  // This has to be chosen HERE rather than mounted on the artwork router: the
  // first parser to see the request is the one that reads the stream, and a
  // route-level parser mounted later never gets the chance.
  const artworkJsonParser = express.json({ limit: "5mb" });
  const artworkUpload = /^\/services\/(categories\/)?[^/]+\/artwork\/?$/;

  app.use((req, res, next) =>
    artworkUpload.test(req.path) ? artworkJsonParser(req, res, next) : jsonParser(req, res, next)
  );

  app.use((req, res, next) => {
    const requestId = req.header("x-request-id")?.trim() || crypto.randomUUID();
    res.setHeader("x-request-id", requestId);
    (req as any).requestId = requestId;
    const start = Date.now();
    res.on("finish", () => {
      const duration = (Date.now() - start) / 1000;
      httpRequestDuration.observe({ method: req.method, route: req.route?.path ?? req.path, status_code: res.statusCode }, duration);
      httpRequestTotal.inc({ method: req.method, route: req.route?.path ?? req.path, status_code: res.statusCode });
    });
    next();
  });

  // Blueprint-spelling aliases (e.g. /auth/password/reset-request).
  // Rewrites req.url before routing, so alias and canonical share one handler.
  app.use(compatRewrite);

  // -- Rate limits -----------------------------------------------------------
  // Declared in core/rateLimits.ts; mounted here, BEFORE the routers, so a
  // limited request never reaches a handler. Ordering matters: the webhook
  // limiter has to precede the "/payments/webhooks" mount below.
  app.use("/auth", authLimiter);

  // Guessable or forceable work: the six-digit booking OTPs, and the webhook
  // HMAC check an unauthenticated caller can make the server perform.
  app.post("/bookings/:id/verify-start", strictLimiter);
  app.post("/bookings/:id/verify-complete", strictLimiter);
  app.post("/bookings/:id/otp", strictLimiter);
  app.use("/payments/webhooks", strictLimiter);

  // Billed per call -- Google Maps on the server key, and the AI sidecar.
  app.use("/maps", meteredLimiter);
  app.use("/ai", meteredLimiter);

  // Durable writes. Idempotency makes a REPLAY cheap; a fresh key on every
  // request is a new row, a new matching run and a new PostGIS scan.
  app.post("/bookings", writeLimiter);
  app.post("/orders", writeLimiter);
  app.post("/emergency/bookings", writeLimiter);

  app.use(
    "/docs",
    helmet({
      contentSecurityPolicy: false,
    }),
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: "GET IT DONE — API reference",
      customCss: DOCS_CSS,
      swaggerOptions: {
        // 270 operations across 40 tags. Landing on all of them expanded is
        // unreadable; "list" shows tags collapsed to their operations.
        docExpansion: "list",
        // The filter box is the only realistic way to find one route in 270.
        filter: true,
        // Survives a page reload, so exercising a few authenticated endpoints
        // in a row does not mean pasting the bearer token each time.
        persistAuthorization: true,
        displayRequestDuration: true,
        tryItOutEnabled: true,
        defaultModelsExpandDepth: 0,
      },
    })
  );
  // Both spellings: /docs.json is what swagger-ui links to, /openapi.json is
  // what most generators and clients look for by convention.
  app.get("/docs.json", (_req, res) => res.json(swaggerSpec));
  app.get("/openapi.json", (_req, res) => res.json(swaggerSpec));

  app.get("/health/live", async (_req, res) => { res.json(await getLiveness()); });
  app.get("/health/ready", async (_req, res) => {
    const health = await getReadiness();
    res.status(health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503).json(health);
  });
  // Public artwork (service/category PNGs and Lottie files).
  //
  // Unauthenticated on purpose — the app renders these before sign-in. Served
  // from the `public/` subtree ONLY, which is why this points at that prefix
  // and not at STORAGE_DIR: worker identity documents live as siblings and
  // must never be reachable over HTTP.
  //
  // `index: false` and `dotfiles: "deny"` stop directory listings and hidden
  // files; `immutable` is safe because filenames are content-addressed uuids
  // that are never rewritten in place.
  app.use(
    "/media/artwork",
    express.static(path.resolve(env.STORAGE_DIR, "public/artwork"), {
      index: false,
      dotfiles: "deny",
      maxAge: "365d",
      immutable: true,
      setHeaders: (res) => {
        // These are images, never documents to be interpreted.
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Disposition", "inline");
      },
    })
  );

  app.use("/health", healthRouter);
  // Unauthenticated by necessity: the app reads this before anyone signs in.
  // Public identifiers only — see routes/config.ts.
  app.use("/config", configRouter);
  app.get("/metrics", async (_req, res) => { res.set("Content-Type", getMetricsContentType()).send(await getMetrics()); });
  app.get("/version", (_req, res) => { res.json({ version: process.env.npm_package_version ?? "0.1.0", env: env.NODE_ENV }); });

  app.use("/auth", authRouter);
  app.use("/users", requireAuth, usersRouter);
  app.use("/cooperatives", requireAuth, cooperativesRouter);
  app.use("/skills", requireAuth, skillsRouter);
  app.use("/documents", requireAuth, documentsRouter);
  app.use("/pricing", requireAuth, pricingRouter);
  app.use("/emergency", requireAuth, emergencyRouter);
  app.use("/payments/webhooks", paymentsRouter);
  app.use("/payments", requireAuth, paymentsRouter);
  app.use("/settlements", requireAuth, settlementsRouter);
  app.use("/earnings", requireAuth, earningsRouter);
  app.use("/invoices", requireAuth, invoicesRouter);
  app.use("/analytics", requireAuth, analyticsRouter);
  app.use("/institutions", requireAuth, institutionsRouter);
  // Institutional module (bulk bookings, contracts, service plans, purchase orders, analytics)
  app.use("/institutions", requireAuth, institutionalRouter);
  app.use("/recurring", requireAuth, recurringRouter);
  app.use("/matching", requireAuth, matchingRouter);
  app.use("/welfare", requireAuth, welfareRouter);
  app.use("/reviews", requireAuth, reviewsRouter);
  app.use("/service-areas", requireAuth, serviceAreasRouter);
  app.use("/reports", requireAuth, reportsRouter);
  app.use("/support", requireAuth, supportRouter);
  // Mounted before "/services" so servicesRouter's GET /:id cannot swallow it.
  app.use("/services/discovery", requireAuth, serviceDiscoveryRouter);
  // Before servicesRouter: its `/:id` would otherwise capture "categories".
  app.use("/orders", requireAuth, ordersRouter);
  app.use("/services", serviceArtworkRouter);
  app.use("/services", servicesRouter);
  // Mounted BEFORE workersRouter and bookingsRouter. Both of those end in a
  // catch-all `/:id`, and while a two-segment path like /me/offers could not
  // match it today, ordering the specific router first means a later `/:a/:b`
  // route cannot quietly shadow these.
  app.use("/workers", requireAuth, workerAppRouter);
  app.use("/bookings", requireAuth, workerJobsRouter);
  app.use("/workers", requireAuth, workersRouter);
  app.use("/bookings", requireAuth, bookingsRouter);
  app.use("/bookings", requireAuth, bookingAttachmentsRouter);
  app.use("/addresses", requireAuth, addressesRouter);
  app.use("/admin", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin"), adminRouter);
  app.use("/ai", requireAuth, aiRouter);
  app.use("/trust", requireAuth, trustRouter);
  app.use("/notifications", requireAuth, notificationsRouter);
  app.use("/files", requireAuth, filesRouter);
  app.use("/chats", requireAuth, chatRouter);
app.use("/training", requireAuth, trainingRouter);

  // New Dashboard Routes
  app.use("/customer", requireAuth, customerDashboardRouter);
  app.use("/worker", requireAuth, workerDashboardRouter);
  app.use("/cooperatives", requireAuth, cooperativeDashboardRouter);
  app.use("/federation", requireAuth, federationDashboardRouter);
  // Admin-facing aliases for the same dashboards (documented contract)
  app.use("/admin/dashboard", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin"), cooperativeDashboardRouter);
  app.use("/admin/federation", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin"), federationDashboardRouter);

  // New Feature Routes
  app.use("/i18n", i18nRouter);
  app.use("/maps", requireAuth, googleMapsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.info({ env: env.NODE_ENV }, "Express app created");
  return app;
}
