import type { Request, Response, NextFunction } from "express";

export function authBridge(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.BRIDGE_BEARER_TOKEN;
  if (!expected) {
    res.status(500).json({ error: "bridge_token_not_configured" });
    return;
  }
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : undefined;
  if (!token || token !== expected) {
    res.status(401).json({ error: "invalid_bridge_token" });
    return;
  }
  next();
}
