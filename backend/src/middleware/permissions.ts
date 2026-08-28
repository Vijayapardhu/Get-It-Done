import type { NextFunction, Request, Response } from "express";
import { pool } from "../db/pool.js";

export async function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const systemAdminRoles = ["system_admin", "federation_admin", "society_admin", "support_staff"] as const;
      const isSystemAdminRole = systemAdminRoles.includes(req.user.role as typeof systemAdminRoles[number]);

      if (req.user.role === "system_admin") {
        next();
        return;
      }

      const result = await pool.query(
        `
        SELECT rp.permission
        FROM user_roles ur
        JOIN role_permissions rp ON rp.role_id = ur.role_id
        WHERE ur.user_id = $1
          AND (ur.expires_at IS NULL OR ur.expires_at > now())
        UNION
        SELECT rp.permission
        FROM roles r
        JOIN role_permissions rp ON rp.role_id = r.id
        WHERE r.name = $2
          AND r.is_system = true
        `,
        [req.user.id, req.user.role]
      );

      const permissions = new Set(result.rows.map((r) => r.permission));

      if (!permissions.has(permission)) {
        res.status(403).json({ error: "Insufficient permissions", required: permission });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function requireAnyPermission(permissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (req.user.role === "system_admin") {
        next();
        return;
      }

      const result = await pool.query(
        `
        SELECT rp.permission
        FROM user_roles ur
        JOIN role_permissions rp ON rp.role_id = ur.role_id
        WHERE ur.user_id = $1
          AND (ur.expires_at IS NULL OR ur.expires_at > now())
        UNION
        SELECT rp.permission
        FROM roles r
        JOIN role_permissions rp ON rp.role_id = r.id
        WHERE r.name = $2
          AND r.is_system = true
        `,
        [req.user.id, req.user.role]
      );

      const userPermissions = new Set(result.rows.map((r) => r.permission));
      const hasAny = permissions.some((p) => userPermissions.has(p));

      if (!hasAny) {
        res.status(403).json({ error: "Insufficient permissions", required: permissions });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}