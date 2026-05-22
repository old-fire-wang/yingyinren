import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { authRouter } from "./routes/auth";
import { projectsRouter } from "./routes/projects";
import { requirementsRouter } from "./routes/requirements";
import { bridgeRouter } from "./routes/bridge";
import { configRouter } from "./routes/config";
import { serverLogsRouter } from "./routes/serverLogs";

export function createApp(): express.Application {
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "12mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/requirements", requirementsRouter);
  app.use("/api/bridge", bridgeRouter);
  app.use("/api/config", configRouter);
  app.use("/api/server-logs", serverLogsRouter);

  const webDist =
    process.env.WEB_DIST || path.resolve(process.cwd(), "web", "dist");
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      const indexHtml = path.join(webDist, "index.html");
      if (fs.existsSync(indexHtml)) res.sendFile(indexHtml);
      else next();
    });
  }

  return app;
}
