import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET ?? "dev-change-me";

export type AuthedRequest = Request & { userId?: string };

export function signUserToken(): string {
  return jwt.sign({ sub: "owner" }, secret, { expiresIn: "7d" });
}

export function authJwt(req: AuthedRequest, res: Response, next: NextFunction): void {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: "missing_token" });
    return;
  }
  try {
    const p = jwt.verify(token, secret) as { sub?: string };
    req.userId = p.sub;
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}
