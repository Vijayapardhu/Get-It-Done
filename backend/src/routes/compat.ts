import type { NextFunction, Request, Response } from "express";

/**
 * Blueprint-contract path aliases.
 *
 * SYSTEM_INTEGRATION_AND_ARCHITECTURE_BLUEPRINT.md documents a set of routes as
 * "Implemented" that the code actually serves under different spellings
 * (`/emergency/request` vs `/emergency/bookings`, and so on). A client written
 * against the specification
 * got a 404 from every one of them.
 *
 * This runs BEFORE the routers and rewrites `req.url` in place, so the alias and
 * the canonical path are handled by the same code — no duplicated logic, no
 * redirect round-trip, and no chance of the alias drifting from the real handler.
 *
 * Method mismatches are NOT handled here: where the blueprint says PATCH and the
 * code says POST, the owning router registers both verbs on the one handler.
 */

/** Exact-match aliases: documented path -> path actually served. */
const EXACT_ALIASES: Record<string, string> = {
  // ── Module 1: Authentication ──
  // The blueprint's /auth/otp/* pair is deliberately absent: SMS sign-in was
  // removed, so there is no served path to alias them onto. They 404 like any
  // other unknown route rather than aliasing onto something that would answer.
  "/auth/password/reset-request": "/auth/forgot-password",
  "/auth/password/reset": "/auth/reset-password",

  // ── Module 3: Worker onboarding & welfare ──
  "/welfare/passport": "/welfare/workers/me",

  // ── Module 5: Matching & emergency ──
  "/emergency/request": "/emergency/bookings",
  "/matching/recommend": "/matching/candidates",

  // ── Module 7: Payments & earnings ──
  "/earnings/summary": "/earnings/workers/me/earnings/summary",
  "/earnings/ledger": "/earnings/workers/me/earnings/ledger",

  // ── Module 9: Cooperative administration ──
  "/cooperatives": "/cooperatives/societies",
  "/admin/workers/pending": "/admin/verifications",
};

/**
 * Pattern aliases, applied in order. Each entry rewrites via a capture group.
 * Anchored so a pattern can never match a longer path by accident.
 */
const PATTERN_ALIASES: Array<{ pattern: RegExp; replacement: string }> = [
  // /invoices/booking/:bookingId -> served by paymentsRouter
  { pattern: /^\/invoices\/booking\/([^/]+)$/, replacement: "/payments/invoices/booking/$1" },
  // /payments/:id and /payments/:id/refund -> the order-scoped routes
  { pattern: /^\/payments\/([0-9a-f-]{36})$/i, replacement: "/payments/orders/$1" },
  { pattern: /^\/payments\/([0-9a-f-]{36})\/refund$/i, replacement: "/payments/orders/$1/refund" },
  // /reviews/worker/:id -> /reviews/workers/:id/reviews
  { pattern: /^\/reviews\/worker\/([^/]+)$/, replacement: "/reviews/workers/$1/reviews" },
  // /admin/workers/:id/verify|suspend -> the verification-scoped routes
  { pattern: /^\/admin\/workers\/([^/]+)\/verify$/, replacement: "/admin/verifications/$1/approve" },
  { pattern: /^\/admin\/workers\/([^/]+)\/suspend$/, replacement: "/admin/verifications/$1/suspend" },
  // /institutions/organizations[/...] -> /institutions[/...]
  { pattern: /^\/institutions\/organizations$/, replacement: "/institutions" },
  { pattern: /^\/institutions\/contracts$/, replacement: "/institutions" },
];

/**
 * Aliases that only apply to one HTTP method, so an alias for POST cannot
 * hijack a GET that legitimately resolves elsewhere.
 */
const METHOD_SCOPED_ALIASES: Array<{ method: string; from: string; to: string }> = [
  // POST /cooperatives creates a society; GET /cooperatives lists them (above).
  { method: "POST", from: "/cooperatives", to: "/cooperatives/societies" },
  // The blueprint's POST /workers/me initialises the profile.
  { method: "POST", from: "/workers/me", to: "/workers/me/onboarding" },
];

/**
 * Verb rewrites, for routes where the blueprint and the implementation agree on
 * the path but not the method. Rewriting `req.method` here is what lets one
 * handler serve both spellings — the alternative was registering a duplicate
 * handler per route, which drifts the moment either copy is edited.
 *
 * `pattern` is matched against the path; `from` is the documented verb and `to`
 * is the verb the handler is registered under.
 */
const METHOD_REWRITES: Array<{ from: string; to: string; pattern: RegExp }> = [
  // Blueprint: PATCH. Implementation: POST.
  { from: "PATCH", to: "POST", pattern: /^\/bookings\/[^/]+\/(accept|reject|cancel)$/ },
  // Blueprint: POST. Implementation: PUT.
  { from: "POST", to: "PUT", pattern: /^\/workers\/me\/location$/ },
  // Blueprint: PUT. Implementation: PATCH.
  { from: "PUT", to: "PATCH", pattern: /^\/users\/me\/preferences$/ },
  // Blueprint: GET (an export is a read); implementation queues it with POST.
  { from: "GET", to: "POST", pattern: /^\/reports\/export$/ },
];

export function compatRewrite(req: Request, _res: Response, next: NextFunction): void {
  // Split once: everything below matches on the path, and the query string is
  // re-attached verbatim so filters and pagination survive the rewrite.
  const queryIndex = req.url.indexOf("?");
  const path = queryIndex === -1 ? req.url : req.url.slice(0, queryIndex);
  const search = queryIndex === -1 ? "" : req.url.slice(queryIndex);

  // Verb rewrite first: the path is unchanged, only the method differs.
  const rewrite = METHOD_REWRITES.find((r) => r.from === req.method && r.pattern.test(path));
  if (rewrite) {
    req.method = rewrite.to;
    next();
    return;
  }

  const methodScoped = METHOD_SCOPED_ALIASES.find((a) => a.method === req.method && a.from === path);
  if (methodScoped) {
    req.url = methodScoped.to + search;
    next();
    return;
  }

  const exact = EXACT_ALIASES[path];
  if (exact) {
    req.url = exact + search;
    next();
    return;
  }

  for (const { pattern, replacement } of PATTERN_ALIASES) {
    if (pattern.test(path)) {
      req.url = path.replace(pattern, replacement) + search;
      next();
      return;
    }
  }

  next();
}
