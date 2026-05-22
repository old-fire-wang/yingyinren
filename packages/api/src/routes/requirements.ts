import fs from "fs/promises";
import multer from "multer";
import { Router } from "express";
import { prisma } from "../prisma";
import { authJwt, type AuthedRequest } from "../middleware/authJwt";
import { REQ_STATUS, TASK_STATUS, TASK_TYPE } from "../constants";
import { getConfigMap, DEFAULT_PROMPT_GENERATE, DEFAULT_PROMPT_MODIFY } from "../lib/configStore";
import { chatCompletion } from "../lib/llm";
import { difyCreateDocumentByFile } from "../lib/dify";
import {
  SERVER_LOG_PHASE,
  SERVER_LOG_STEP,
  writeServerExecLog,
} from "../lib/serverExecLog";

const storageDir = process.env.CLOUD_MD_STORAGE_DIR ?? "./storage/cloud_md";

const upload = multer({ dest: storageDir });

export const requirementsRouter = Router();
requirementsRouter.use(authJwt);

/** 工作台「刷新列表」：下发桥 C 任务，由桥调 TAPD MCP 拉列表并写库（桥 C 开启自动轮询即可，无需手点） */
requirementsRouter.post("/pull-from-bridge", async (req: AuthedRequest, res) => {
  const projectId = String(req.body?.project_id ?? "").trim();
  const year = Number(req.body?.year);
  const month = Number(req.body?.month);
  if (!projectId || !Number.isFinite(year) || !Number.isFinite(month)) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const sub = await prisma.subscribedProject.findUnique({ where: { projectId } });
  if (!sub) {
    res.status(400).json({ error: "not_subscribed" });
    return;
  }
  const payload = JSON.stringify({ project_id: projectId, year, month });
  const existing = await prisma.bridgeTask.findFirst({
    where: {
      type: TASK_TYPE.TAPD_PULL_REQUIREMENTS,
      status: TASK_STATUS.PENDING,
      payload,
    },
  });
  if (existing) {
    await writeServerExecLog({
      phase: SERVER_LOG_PHASE.TAPD_LIST,
      step: SERVER_LOG_STEP.TAPD_PULL_TASK_ENQUEUED,
      level: "info",
      message: "工作台请求拉 TAPD 列表（与在途任务合并，未新建）",
      bridgeTaskId: existing.id,
      projectId,
      payload: { year, month, deduped: true },
    });
    res.json({ ok: true, taskId: existing.id, deduped: true });
    return;
  }
  const task = await prisma.bridgeTask.create({
    data: {
      type: TASK_TYPE.TAPD_PULL_REQUIREMENTS,
      payload,
      status: TASK_STATUS.PENDING,
    },
  });
  await writeServerExecLog({
    phase: SERVER_LOG_PHASE.TAPD_LIST,
    step: SERVER_LOG_STEP.TAPD_PULL_TASK_ENQUEUED,
    level: "info",
    message: "工作台请求拉 TAPD 列表，已创建桥任务",
    bridgeTaskId: task.id,
    projectId,
    payload: { year, month, deduped: false },
  });
  res.json({ ok: true, taskId: task.id });
});

requirementsRouter.get("/", async (req: AuthedRequest, res) => {
  const projectId = String(req.query.project_id ?? "").trim();
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!projectId || !Number.isFinite(year) || !Number.isFinite(month)) {
    res.status(400).json({ error: "bad_query" });
    return;
  }
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const requirements = await prisma.requirement.findMany({
    where: {
      projectId,
      isIgnored: false,
      onlineTime: { gte: start, lte: end },
    },
    orderBy: { onlineTime: "desc" },
    select: {
      id: true,
      tapdId: true,
      projectId: true,
      title: true,
      onlineTime: true,
      status: true,
      mdFileSize: true,
      pageId: true,
      dashenUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json({ requirements });
});

requirementsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const row = await prisma.requirement.findUnique({ where: { id } });
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ requirement: row });
});

requirementsRouter.patch("/:id/status", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status ?? "");
  await prisma.requirement.update({ where: { id }, data: { status } });
  res.json({ ok: true });
});

requirementsRouter.put("/:id/md", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const mdContent = req.body?.md_content != null ? String(req.body.md_content) : undefined;
  const mdLocalPath =
    req.body?.md_local_path != null ? String(req.body.md_local_path) : undefined;
  const mdFileSize =
    req.body?.md_file_size != null ? Number(req.body.md_file_size) : undefined;
  const pageId = req.body?.page_id != null ? String(req.body.page_id) : undefined;
  await prisma.requirement.update({
    where: { id },
    data: {
      mdContent: mdContent ?? undefined,
      mdLocalPath: mdLocalPath ?? undefined,
      mdFileSize: Number.isFinite(mdFileSize) ? mdFileSize : undefined,
      pageId: pageId ?? undefined,
    },
  });
  res.json({ ok: true });
});

requirementsRouter.post("/:id/md-edit", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const instruction = String(req.body?.instruction ?? "");
  if (!instruction) {
    res.status(400).json({ error: "instruction_required" });
    return;
  }
  const row = await prisma.requirement.findUnique({ where: { id } });
  if (!row?.mdContent) {
    res.status(400).json({ error: "no_md" });
    return;
  }
  const map = await getConfigMap();
  const tpl = map.llm_md_modification_prompt ?? DEFAULT_PROMPT_MODIFY;
  const prompt = tpl
    .replace("{current_md}", row.mdContent)
    .replace("{user_instruction}", instruction);
  const out = await chatCompletion([
    { role: "system", content: "You output markdown only." },
    { role: "user", content: prompt },
  ]);
  await prisma.requirement.update({
    where: { id },
    data: { mdContent: out, mdFileSize: Buffer.byteLength(out, "utf8") },
  });
  res.json({ md_content: out });
});

requirementsRouter.post("/:id/generate", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const row = await prisma.requirement.findUnique({ where: { id } });
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (
    row.status !== REQ_STATUS.PENDING_GENERATE &&
    row.status !== REQ_STATUS.GENERATION_FAILED
  ) {
    res.status(400).json({ error: "bad_status" });
    return;
  }
  await prisma.requirement.update({
    where: { id },
    data: { status: REQ_STATUS.GENERATING, errorMessage: null },
  });
  const bridgeTask = await prisma.bridgeTask.create({
    data: {
      type: TASK_TYPE.MCP_FETCH_DOC,
      payload: JSON.stringify({
        requirementId: id,
        tapdId: row.tapdId,
        pageId: row.pageId ?? "",
        dashenUrl: row.dashenUrl ?? "",
        title: row.title,
      }),
      status: TASK_STATUS.PENDING,
      requirementId: id,
    },
  });
  await writeServerExecLog({
    phase: SERVER_LOG_PHASE.DOC_PIPELINE,
    step: SERVER_LOG_STEP.DOC_GENERATE_TASK_ENQUEUED,
    level: "info",
    message: "工作台下发「生成文档」桥任务",
    bridgeTaskId: bridgeTask.id,
    requirementId: id,
    projectId: row.projectId,
    payload: {
      tapd_id: row.tapdId,
      page_id: row.pageId ?? "",
      dashen_url: row.dashenUrl ? row.dashenUrl.slice(0, 200) : "",
      title: row.title.slice(0, 200),
    },
  });
  res.json({ ok: true });
});

requirementsRouter.post("/:id/ignore", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  await prisma.requirement.update({
    where: { id },
    data: { isIgnored: true, status: REQ_STATUS.IGNORED },
  });
  res.json({ ok: true });
});

requirementsRouter.get("/:id/upload-status", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const row = await prisma.requirement.findUnique({
    where: { id },
    select: { id: true, status: true, difyDocumentId: true, errorMessage: true },
  });
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(row);
});

requirementsRouter.post(
  "/:id/upload",
  upload.single("file"),
  async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "file_required" });
      return;
    }
    const row = await prisma.requirement.findUnique({ where: { id } });
    if (!row) {
      try {
        await fs.unlink(file.path);
      } catch {
        /* ignore */
      }
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (row.status !== REQ_STATUS.PENDING_UPLOAD) {
      try {
        await fs.unlink(file.path);
      } catch {
        /* ignore */
      }
      res.status(400).json({ error: "bad_status" });
      return;
    }
    const proj = await prisma.subscribedProject.findUnique({
      where: { projectId: row.projectId },
    });
    if (!proj) {
      try {
        await fs.unlink(file.path);
      } catch {
        /* ignore */
      }
      res.status(400).json({ error: "project_missing" });
      return;
    }
    await prisma.requirement.update({
      where: { id },
      data: { status: REQ_STATUS.UPLOADING, errorMessage: null },
    });
    const originalName = row.tapdId + "_" + row.title + ".md";
    let fileSize = 0;
    try {
      const st = await fs.stat(file.path);
      fileSize = st.size;
    } catch {
      fileSize = 0;
    }
    await writeServerExecLog({
      phase: SERVER_LOG_PHASE.DIFY_UPLOAD,
      step: SERVER_LOG_STEP.DIFY_UPLOAD_STARTED,
      level: "info",
      message: "开始上传 Markdown 到 Dify",
      requirementId: id,
      projectId: row.projectId,
      payload: {
        original_name: originalName,
        temp_file_bytes: fileSize,
        dataset_id_suffix: proj.difyDatasetId.slice(-8),
      },
    });
    try {
      const { documentId } = await difyCreateDocumentByFile({
        difyBaseUrl: proj.difyBaseUrl,
        difyApiKey: proj.difyApiKey,
        datasetId: proj.difyDatasetId,
        filePath: file.path,
        originalName,
      });
      const now = new Date();
      await prisma.requirement.update({
        where: { id },
        data: {
          status: REQ_STATUS.UPLOADED,
          difyDocumentId: documentId,
          mdCloudPath: file.path,
          cloudFileUploadedAt: now,
        },
      });
      await writeServerExecLog({
        phase: SERVER_LOG_PHASE.DIFY_UPLOAD,
        step: SERVER_LOG_STEP.DIFY_UPLOAD_FINISHED,
        level: "info",
        message: "Dify 文档创建成功",
        requirementId: id,
        projectId: row.projectId,
        payload: { dify_document_id: documentId, original_name: originalName },
      });
      res.json({ success: true, dify_document_id: documentId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.requirement.update({
        where: { id },
        data: { status: REQ_STATUS.UPLOAD_FAILED, errorMessage: msg },
      });
      await writeServerExecLog({
        phase: SERVER_LOG_PHASE.DIFY_UPLOAD,
        step: SERVER_LOG_STEP.DIFY_UPLOAD_FAILED,
        level: "error",
        message: "Dify 上传失败",
        requirementId: id,
        projectId: row.projectId,
        payload: { error: msg, original_name: originalName },
      });
      try {
        await fs.unlink(file.path);
      } catch {
        /* ignore */
      }
      res.status(500).json({ success: false, error: msg });
    }
  }
);
