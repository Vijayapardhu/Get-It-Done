import type { NextFunction, Request, Response } from "express";
import authService from "../services/authService.js";

declare global {
  namespace Express {
    interface User { id: string; name: string; phone: string | null; email?: string | null; role: string; language?: string; status?: string; }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
    const user = await authService.verifyAccessToken(token);
    if (!user) { res.status(401).json({ error: "Invalid or expired token" }); return; }
    req.user = user;
    next();
  } catch (error) { next(error); }
}

export function requireRoles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) { res.status(403).json({ error: "Insufficient permissions" }); return; }
    next();
  };
}