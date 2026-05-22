import { Router } from "express";
import { prisma } from "../prisma";
import { authBridge } from "../middleware/authBridge";
import { TASK_STATUS, TASK_TYPE, REQ_STATUS } from "../constants";
import { getConfigMap, setConfigKey, DEFAULT_PROMPT_GENERATE } from "../lib/configStore";
import { chatCompletion } from "../lib/llm";
import { resolveDashenMcpClientJson, resolveTapdMcpClientJson } from "../lib/mcpConfigHelpers";
import {
  SERVER_LOG_PHASE,
  SERVER_LOG_STEP,
  truncateText,
  writeServerExecLog,
} from "../lib/serverExecLog";
import { rawMarkdownLooksLikeAccessOrErrorPage } from "../lib/rawMarkdownGuard";

export const bridgeRouter = Router();
bridgeRouter.use(authBridge);

bridgeRouter.get("/config", async (_req, res) => {
  const map = await getConfigMap();
  res.json({
    tapd_mcp_json: resolveTapdMcpClientJson(map),
    dashen_mcp_json: resolveDashenMcpClientJson(map),
  });
});

/** 桥 C 心跳：工作台据此判断在线（约每 8s 调用） */
bridgeRouter.post("/heartbeat", async (_req, res) => {
  await setConfigKey("bridge_last_seen_ms", String(Date.now()));
  res.json({ ok: true });
});

bridgeRouter.get("/projects", async (_req, res) => {
  const projects = await prisma.subscribedProject.findMany({
    orderBy: { id: "asc" },
    select: { projectId: true, projectName: true },
  });
  res.json({ projects });
});

bridgeRouter.post("/requirements/sync", async (req, res) => {
  const projectId = String(req.body?.project_id ?? "").trim();
  const items = req.body?.requirements as
    | { tapd_id: string; title: string; online_time: string; dashen_url?: string }[]
    | undefined;
  if (!projectId || !Array.isArray(items)) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const sample = items.slice(0, 5).map((it) => ({
    tapd_id: String(it.tapd_id ?? "").trim(),
    title: truncateText(String(it.title ?? ""), 120),
    dashen_url: truncateText(String(it.dashen_url ?? ""), 160),
  }));
  await writeServerExecLog({
    phase: SERVER_LOG_PHASE.TAPD_LIST,
    step: SERVER_LOG_STEP.TAPD_SYNC_BATCH_RECEIVED,
    level: "info",
    message: "桥上报 TAPD 同步批次: " + items.length + " 条",
    projectId,
    payload: {
      incoming_count: items.length,
      sample_rows: sample,
    },
  });
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const it of items) {
    const tapdId = String(it.tapd_id ?? "").trim();
    const title = String(it.title ?? "").trim();
    const onlineTime = new Date(it.online_time);
    const dashenUrl = String(it.dashen_url ?? "").trim() || null;
    if (!tapdId || !title || Number.isNaN(onlineTime.getTime())) {
      skipped += 1;
      continue;
    }
    const exists = await prisma.requirement.findUnique({
      where: { projectId_tapdId: { projectId, tapdId } },
    });
    if (exists) {
      const patch: {
        title?: string;
        onlineTime?: Date;
        dashenUrl?: string | null;
      } = {};
      if (title !== exists.title) patch.title = title;
      if (onlineTime.getTime() !== exists.onlineTime.getTime()) patch.onlineTime = onlineTime;
      if (dashenUrl && dashenUrl !== (exists.dashenUrl ?? "")) patch.dashenUrl = dashenUrl;
      if (Object.keys(patch).length) {
        await prisma.requirement.update({
          where: { id: exists.id },
          data: patch,
        });
        updated += 1;
      } else {
        skipped += 1;
      }
      continue;
    }
    await prisma.requirement.create({
      data: {
        projectId,
        tapdId,
        title,
        onlineTime,
        dashenUrl,
        status: REQ_STATUS.PENDING_GENERATE,
      },
    });
    added += 1;
  }
  res.json({ added, updated, skipped });
});

bridgeRouter.get("/tasks", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 5) || 5, 20);
  const tasks = await prisma.bridgeTask.findMany({
    where: { status: TASK_STATUS.PENDING },
    orderBy: { id: "asc" },
    take: limit,
  });
  if (tasks.length) {
    await writeServerExecLog({
      phase: SERVER_LOG_PHASE.BRIDGE,
      step: SERVER_LOG_STEP.BRIDGE_TASKS_DISPATCHED,
      level: "info",
      message: "桥拉取待处理任务 " + tasks.length + " 条",
      payload: {
        limit,
        tasks: tasks.map((t) => ({ id: t.id, type: t.type })),
      },
    });
  }
  res.json({ tasks });
});

/** 须在 /requirements/:id/md 之前注册，避免 :id 吞掉路径 */
bridgeRouter.get("/requirements/:id/context", async (req, res) => {
  const id = Number(req.params.id);
  const row = await prisma.requirement.findUnique({
    where: { id },
    select: { tapdId: true, pageId: true, dashenUrl: true, title: true, projectId: true },
  });
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(row);
});

bridgeRouter.get("/requirements/:id/md", async (req, res) => {
  const id = Number(req.params.id);
  const row = await prisma.requirement.findUnique({
    where: { id },
    select: { tapdId: true, title: true, mdContent: true, onlineTime: true, projectId: true },
  });
  if (!row?.mdContent) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(row);
});

bridgeRouter.post("/tasks/:id/result", async (req, res) => {
  const id = Number(req.params.id);
  const success = Boolean(req.body?.success);
  const rawMarkdown = req.body?.raw_markdown != null ? String(req.body.raw_markdown) : "";
  const pageId = req.body?.page_id != null ? String(req.body.page_id) : undefined;
  const errMsg = req.body?.error != null ? String(req.body.error) : undefined;

  const task = await prisma.bridgeTask.findUnique({ where: { id } });
  if (!task) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (task.status !== TASK_STATUS.PENDING) {
    await writeServerExecLog({
      phase: SERVER_LOG_PHASE.BRIDGE,
      step: SERVER_LOG_STEP.BRIDGE_TASK_RESULT_IDEMPOTENT,
      level: "info",
      message: "桥重复上报任务结果（已非 pending），幂等忽略",
      bridgeTaskId: id,
      payload: { reason: "task_not_pending", task_type: task.type },
    });
    res.json({ ok: true, idempotent: true, reason: "task_not_pending" });
    return;
  }

  if (task.type === TASK_TYPE.TAPD_PULL_REQUIREMENTS) {
    const ok = Boolean(req.body?.success);
    const pullErr = req.body?.error != null ? String(req.body.error) : undefined;
    const added = req.body?.added != null ? Number(req.body.added) : undefined;
    const updated = req.body?.updated != null ? Number(req.body.updated) : undefined;
    const skipped = req.body?.skipped != null ? Number(req.body.skipped) : undefined;
    let projectIdFromPayload: string | undefined;
    try {
      projectIdFromPayload = String(
        (JSON.parse(task.payload) as { project_id?: string }).project_id ?? ""
      ).trim();
    } catch {
      projectIdFromPayload = undefined;
    }
    await prisma.bridgeTask.update({
      where: { id },
      data: {
        status: ok ? TASK_STATUS.DONE : TASK_STATUS.FAILED,
        result: JSON.stringify({ added, updated, skipped }),
        error: ok ? null : pullErr ?? "tapd_pull_failed",
      },
    });
    await writeServerExecLog({
      phase: SERVER_LOG_PHASE.TAPD_LIST,
      step: SERVER_LOG_STEP.TAPD_PULL_TASK_FINISHED,
      level: ok ? "info" : "error",
      message: ok ? "TAPD 拉取任务完成" : "TAPD 拉取任务失败",
      bridgeTaskId: id,
      projectId: projectIdFromPayload ?? null,
      payload: { added, updated, skipped, error: pullErr ?? null },
    });
    res.json({ ok: true });
    return;
  }

  if (task.type !== TASK_TYPE.MCP_FETCH_DOC) {
    res.status(400).json({ error: "unknown_task" });
    return;
  }

  const payload = JSON.parse(task.payload) as {
    requirementId: number;
    tapdId?: string;
    pageId?: string;
    title?: string;
  };
  const reqRow = await prisma.requirement.findUnique({ where: { id: payload.requirementId } });
  if (!reqRow) {
    await prisma.bridgeTask.update({
      where: { id },
      data: { status: TASK_STATUS.FAILED, error: "requirement_missing" },
    });
    await writeServerExecLog({
      phase: SERVER_LOG_PHASE.DOC_PIPELINE,
      step: SERVER_LOG_STEP.MCP_DOC_INGEST_FAILED,
      level: "error",
      message: "MCP 任务对应需求不存在",
      bridgeTaskId: id,
      requirementId: payload.requirementId,
      payload: { error: "requirement_missing" },
    });
    res.json({ ok: false });
    return;
  }

  if (!success || !rawMarkdown) {
    const st = !rawMarkdown && success ? REQ_STATUS.NO_PAGE : REQ_STATUS.GENERATION_FAILED;
    await prisma.requirement.update({
      where: { id: reqRow.id },
      data: {
        status: st,
        pageId: pageId ?? null,
        errorMessage: errMsg ?? (!rawMarkdown ? "empty_doc" : "bridge_failed"),
      },
    });
    await prisma.bridgeTask.update({
      where: { id },
      data: {
        status: TASK_STATUS.DONE,
        result: JSON.stringify({ ok: false }),
        error: errMsg ?? "failed",
      },
    });
    await writeServerExecLog({
      phase: SERVER_LOG_PHASE.DOC_PIPELINE,
      step: SERVER_LOG_STEP.MCP_DOC_INGEST_FAILED,
      level: "warn",
      message: "大神正文缺失或桥标记失败",
      bridgeTaskId: id,
      requirementId: reqRow.id,
      projectId: reqRow.projectId,
      payload: {
        success_flag: success,
        raw_char_length: rawMarkdown.length,
        page_id: pageId ?? null,
        error: errMsg ?? null,
        requirement_status: st,
      },
    });
    res.json({ ok: true });
    return;
  }

  const ingestGuard = rawMarkdownLooksLikeAccessOrErrorPage(rawMarkdown);
  if (ingestGuard.reject) {
    const errMsg =
      "大神正文疑似鉴权或错误页（" +
      (ingestGuard.reason ?? "unknown") +
      "），已跳过 LLM。请检查大神 Cookie/MCP 权限后重新点「生成」。";
    await prisma.requirement.update({
      where: { id: reqRow.id },
      data: {
        status: REQ_STATUS.GENERATION_FAILED,
        pageId: pageId ?? null,
        errorMessage: errMsg,
      },
    });
    await prisma.bridgeTask.update({
      where: { id },
      data: {
        status: TASK_STATUS.DONE,
        result: JSON.stringify({ ok: false }),
        error: errMsg,
      },
    });
    await writeServerExecLog({
      phase: SERVER_LOG_PHASE.DOC_PIPELINE,
      step: SERVER_LOG_STEP.MCP_RAW_REJECTED_ERROR_PAGE,
      level: "warn",
      message: "大神正文像错误/鉴权页，跳过 LLM",
      bridgeTaskId: id,
      requirementId: reqRow.id,
      projectId: reqRow.projectId,
      payload: {
        reason: ingestGuard.reason,
        raw_char_length: rawMarkdown.length,
        raw_preview: truncateText(rawMarkdown, 2000),
      },
    });
    res.json({ ok: true });
    return;
  }

  const map = await getConfigMap();
  const tpl = map.llm_md_generation_prompt ?? DEFAULT_PROMPT_GENERATE;
  const prompt = tpl.replace("{content}", rawMarkdown);

  await writeServerExecLog({
    phase: SERVER_LOG_PHASE.DOC_PIPELINE,
    step: SERVER_LOG_STEP.MCP_RAW_DOCUMENT_RECEIVED,
    level: "info",
    message: "收到大神正文，进入 LLM 整理",
    bridgeTaskId: id,
    requirementId: reqRow.id,
    projectId: reqRow.projectId,
    payload: {
      page_id: pageId ?? reqRow.pageId,
      tapd_id: reqRow.tapdId,
      title: truncateText(reqRow.title, 200),
      raw_byte_length: Buffer.byteLength(rawMarkdown, "utf8"),
      raw_char_length: rawMarkdown.length,
      raw_preview: truncateText(rawMarkdown, 2000),
    },
  });

  const t0 = Date.now();
  await writeServerExecLog({
    phase: SERVER_LOG_PHASE.DOC_PIPELINE,
    step: SERVER_LOG_STEP.LLM_MD_GENERATION_STARTED,
    level: "info",
    message: "开始调用 LLM 生成审查用 Markdown",
    bridgeTaskId: id,
    requirementId: reqRow.id,
    projectId: reqRow.projectId,
    payload: {
      prompt_template_chars: tpl.length,
      prompt_user_chars: prompt.length,
    },
  });

  try {
    const md = await chatCompletion([
      { role: "system", content: "You output markdown only." },
      { role: "user", content: prompt },
    ]);
    await prisma.requirement.update({
      where: { id: reqRow.id },
      data: {
        status: REQ_STATUS.PENDING_REVIEW,
        mdContent: md,
        mdFileSize: Buffer.byteLength(md, "utf8"),
        pageId: pageId ?? reqRow.pageId,
        errorMessage: null,
      },
    });
    await prisma.bridgeTask.update({
      where: { id },
      data: { status: TASK_STATUS.DONE, result: JSON.stringify({ ok: true }) },
    });
    await writeServerExecLog({
      phase: SERVER_LOG_PHASE.DOC_PIPELINE,
      step: SERVER_LOG_STEP.LLM_MD_GENERATION_FINISHED,
      level: "info",
      message: "LLM 生成 Markdown 完成",
      bridgeTaskId: id,
      requirementId: reqRow.id,
      projectId: reqRow.projectId,
      payload: {
        duration_ms: Date.now() - t0,
        output_char_length: md.length,
        output_byte_length: Buffer.byteLength(md, "utf8"),
        md_preview: truncateText(md, 1500),
      },
    });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.requirement.update({
      where: { id: reqRow.id },
      data: { status: REQ_STATUS.GENERATION_FAILED, errorMessage: msg },
    });
    await prisma.bridgeTask.update({
      where: { id },
      data: { status: TASK_STATUS.DONE, error: msg },
    });
    await writeServerExecLog({
      phase: SERVER_LOG_PHASE.DOC_PIPELINE,
      step: SERVER_LOG_STEP.LLM_MD_GENERATION_FAILED,
      level: "error",
      message: "LLM 调用失败",
      bridgeTaskId: id,
      requirementId: reqRow.id,
      projectId: reqRow.projectId,
      payload: { duration_ms: Date.now() - t0, error: msg },
    });
    res.json({ ok: true });
  }
});
