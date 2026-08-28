import type { NextFunction, Request, Response } from "express";
import { pool } from "../db/pool.js";

export interface AdminScope {
  cooperativeId: string | null;
  federationId: string | null;
  isSystemAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      adminScope?: AdminScope;
    }
  }
}

export async function resolveScope(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (req.user.role === "system_admin") {
      req.adminScope = { cooperativeId: null, federationId: null, isSystemAdmin: true };
      next();
      return;
    }

    const result = await pool.query(
      `SELECT cooperative_id, federation_id FROM admin_scopes WHERE user_id = $1`,
      [req.user.id]
    );

    if (!result.rows[0]) {
      res.status(403).json({ error: "No scope configured for this admin account" });
      return;
    }

    req.adminScope = {
      cooperativeId: result.rows[0].cooperative_id ?? null,
      federationId: result.rows[0].federation_id ?? null,
      isSystemAdmin: false,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireScope(scopeType: "cooperative" | "federation") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.adminScope) {
      res.status(403).json({ error: "Scope not resolved" });
      return;
    }

    if (scopeType === "cooperative" && !req.adminScope.cooperativeId) {
      res.status(403).json({ error: "Cooperative scope required" });
      return;
    }

    if (scopeType === "federation" && !req.adminScope.federationId) {
      res.status(403).json({ error: "Federation scope required" });
      return;
    }

    next();
  };
}

export function requireSystemAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.adminScope?.isSystemAdmin) {
    res.status(403).json({ error: "System admin required" });
    return;
  }
  next();
}