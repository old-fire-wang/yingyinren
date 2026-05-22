import { Router } from "express";
import { prisma } from "../prisma";
import { authJwt, type AuthedRequest } from "../middleware/authJwt";

export const serverLogsRouter = Router();
serverLogsRouter.use(authJwt);

/** 分页：beforeId 取比该 id 更早的记录（时间倒序） */
serverLogsRouter.get("/", async (req: AuthedRequest, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
  const beforeId = req.query.before_id != null ? Number(req.query.before_id) : undefined;
  const phase = req.query.phase != null ? String(req.query.phase).trim() : undefined;

  const rows = await prisma.serverExecutionLog.findMany({
    where: {
      ...(beforeId && Number.isFinite(beforeId) ? { id: { lt: beforeId } } : {}),
      ...(phase ? { phase } : {}),
    },
    orderBy: { id: "desc" },
    take: limit,
    select: {
      id: true,
      phase: true,
      step: true,
      level: true,
      message: true,
      payloadJson: true,
      bridgeTaskId: true,
      requirementId: true,
      projectId: true,
      createdAt: true,
    },
  });

  const logs = rows.map((r) => ({
    id: r.id,
    phase: r.phase,
    step: r.step,
    level: r.level,
    message: r.message,
    bridgeTaskId: r.bridgeTaskId,
    requirementId: r.requirementId,
    projectId: r.projectId,
    createdAt: r.createdAt,
    payload: r.payloadJson ? tryParseJson(r.payloadJson) : null,
  }));

  res.json({
    logs,
    next_before_id: rows.length === limit ? rows[rows.length - 1]?.id : null,
  });
});

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return s;
  }
}
