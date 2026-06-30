import type { Request, Response, NextFunction } from "express";
import http from "http";

const XITU_TARGET = process.env.XITU_GOVERNANCE_INTERNAL_URL || "http://127.0.0.1:3011";

/** 将 /xitu-governance/* 反代到本机稀土壁 Node 服务（3011） */
export function xituGovernanceProxy(req: Request, res: Response, next: NextFunction): void {
  let target: URL;
  try {
    target = new URL(XITU_TARGET);
  } catch {
    res.status(502).json({ error: "xitu_proxy_misconfigured" });
    return;
  }

  const upstreamPath = req.url && req.url !== "" ? req.url : "/";
  const headers = { ...req.headers, host: `${target.hostname}:${target.port || "80"}` };
  delete headers["accept-encoding"];

  const proxyReq = http.request(
    {
      hostname: target.hostname,
      port: target.port || 80,
      path: upstreamPath,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", () => {
    if (!res.headersSent) {
      res.status(502).json({ error: "xitu_governance_unavailable" });
    }
  });

  req.pipe(proxyReq);
}
