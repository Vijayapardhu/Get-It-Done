import type { NextFunction, Request, Response } from "express";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Param validator for router.param(name, fn): rejects non-UUID values with 404
 * so malformed ids never reach SQL (which would throw and 500).
 * Do NOT attach to non-uuid params (file keys, provider names, tokens).
 */
export function rejectNonUuidParam(req: Request, res: Response, next: NextFunction, value: string) {
  if (!UUID_RE.test(value)) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  next();
}
