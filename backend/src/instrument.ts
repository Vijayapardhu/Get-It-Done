/**
 * Sentry initialisation.
 *
 * This module exists to be imported FIRST, before anything else in the process.
 * Sentry's automatic instrumentation patches `http`, `pg` and the rest at
 * require time, so anything already loaded when `init()` runs is never
 * instrumented. ESM evaluates imported modules in source order, so
 * `import "./instrument.js"` at the top of an entry point runs this before the
 * imports below it execute — which is why server.ts and worker.ts both open
 * with it, and why nothing here imports from `./app.js` or a route.
 *
 * `SENTRY_DSN` has been in .env.example since the beginning with no SDK behind
 * it, so the platform has been reporting "observability configured" while
 * dropping every stack trace. This is the missing half.
 *
 * Absent a DSN this is a no-op that logs once — the same shape as the Razorpay,
 * SMS and Maps adapters, so a developer without credentials gets a working
 * process and a clear reason rather than a crash or silence.
 */
import * as Sentry from "@sentry/node";

// Read straight from process.env rather than through config/env.js: importing
// the config module here would pull in its transitive imports before Sentry has
// patched anything, defeating the point of loading this first.
const dsn = process.env.SENTRY_DSN?.trim();
const environment = process.env.NODE_ENV ?? "development";

export const sentryEnabled = Boolean(dsn) && environment !== "test";

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment,
    // Ties an event to the deployed commit. Set SENTRY_RELEASE in CI to the git
    // sha; without it Sentry groups every deploy together and "when did this
    // start?" becomes unanswerable.
    release: process.env.SENTRY_RELEASE,

    // Performance sampling. Full tracing on an API that also serves a metrics
    // endpoint and health probes is mostly noise and entirely cost, so this is
    // low by default and tunable without a deploy.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

    // The platform handles identity documents, payout accounts and customer
    // addresses. Default OFF: request bodies, headers and cookies must not be
    // shipped to a third party by accident.
    sendDefaultPii: false,

    beforeSend(event) {
      // Belt and braces on top of sendDefaultPii — scrub the headers that carry
      // credentials even if something upstream attaches them deliberately.
      if (event.request?.headers) {
        for (const header of ["authorization", "cookie", "x-api-key"]) {
          delete event.request.headers[header];
        }
      }
      return event;
    },
  });
} else if (environment !== "test") {
  // `console` rather than the pino logger on purpose: importing core/logger.js
  // here would load it before Sentry has patched anything, which is exactly
  // what this module exists to avoid.
  console.info("[sentry] SENTRY_DSN not set: errors are logged locally only");
}
