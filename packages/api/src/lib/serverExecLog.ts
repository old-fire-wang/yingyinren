import { prisma } from "../prisma";

/** 日志分区：便于列表筛选与理解流水线 */
export const SERVER_LOG_PHASE = {
  TAPD_LIST: "tapd_list",
  BRIDGE: "bridge",
  DOC_PIPELINE: "doc_pipeline",
  DIFY_UPLOAD: "dify_upload",
} as const;

/**
 * 步骤事件码（写入 `step` 字段）。说明见工作台「服务端日志」页顶文案或项目文档。
 *
 * TAPD 列表：工作台下发 → 桥拉 MCP → 桥回传 sync → 桥上报 result
 * 单条文档：下发 mcp_fetch_doc → 桥拉大神 → 回传 raw → LLM → 审核上传 Dify
 */
export const SERVER_LOG_STEP = {
  /** 工作台 POST pull-from-bridge，云端创建桥任务 */
  TAPD_PULL_TASK_ENQUEUED: "tapd_pull_task_enqueued",
  /** 桥 GET /tasks 且有待处理任务 */
  BRIDGE_TASKS_DISPATCHED: "bridge_tasks_dispatched",
  /** 桥 POST requirements/sync：收到 TAPD 侧整理后的需求条目 */
  TAPD_SYNC_BATCH_RECEIVED: "tapd_sync_batch_received",
  /** 桥 POST tasks/:id/result，TAPD 拉取任务结束 */
  TAPD_PULL_TASK_FINISHED: "tapd_pull_task_finished",
  /** 工作台 POST generate，创建 mcp_fetch_doc 任务 */
  DOC_GENERATE_TASK_ENQUEUED: "doc_generate_task_enqueued",
  /** 桥回传大神正文（进入 LLM 前）：记录长度、pageId、正文预览（截断） */
  MCP_RAW_DOCUMENT_RECEIVED: "mcp_raw_document_received",
  /** 大神/桥失败，无正文或 success=false */
  MCP_DOC_INGEST_FAILED: "mcp_doc_ingest_failed",
  /** 正文非空但启发式判定为鉴权/错误页，未进入 LLM（避免假需求） */
  MCP_RAW_REJECTED_ERROR_PAGE: "mcp_raw_rejected_error_page",
  /** 开始调用云端 LLM 整理 markdown */
  LLM_MD_GENERATION_STARTED: "llm_md_generation_started",
  LLM_MD_GENERATION_FINISHED: "llm_md_generation_finished",
  LLM_MD_GENERATION_FAILED: "llm_md_generation_failed",
  /** 用户上传 Dify：收到文件、调用 Dify API、结果 */
  DIFY_UPLOAD_STARTED: "dify_upload_started",
  DIFY_UPLOAD_FINISHED: "dify_upload_finished",
  DIFY_UPLOAD_FAILED: "dify_upload_failed",
  /** 桥对已完成任务重复上报 result（幂等） */
  BRIDGE_TASK_RESULT_IDEMPOTENT: "bridge_task_result_idempotent",
} as const;

const MAX_PAYLOAD_CHARS = 48_000;
const DEFAULT_PREVIEW = 2_000;

export function truncateText(s: string, max = DEFAULT_PREVIEW): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n…(truncated, total_chars=" + s.length + ")";
}

function safeStringify(payload: Record<string, unknown>): string | null {
  try {
    let j = JSON.stringify(payload);
    if (j.length > MAX_PAYLOAD_CHARS) {
      j = j.slice(0, MAX_PAYLOAD_CHARS) + "…(payload_truncated)";
    }
    return j;
  } catch {
    return null;
  }
}

export type WriteServerExecLogInput = {
  phase: string;
  step: string;
  level: "info" | "warn" | "error";
  message: string;
  payload?: Record<string, unknown>;
  bridgeTaskId?: number | null;
  requirementId?: number | null;
  projectId?: string | null;
};

/** 不落库失败影响主流程 */
export async function writeServerExecLog(input: WriteServerExecLogInput): Promise<void> {
  try {
    await prisma.serverExecutionLog.create({
      data: {
        phase: input.phase.slice(0, 32),
        step: input.step.slice(0, 80),
        level: input.level,
        message: input.message.slice(0, 500),
        payloadJson: input.payload ? safeStringify(input.payload) : null,
        bridgeTaskId: input.bridgeTaskId ?? undefined,
        requirementId: input.requirementId ?? undefined,
        projectId: input.projectId ? input.projectId.slice(0, 64) : undefined,
      },
    });
  } catch (e) {
    console.error("[serverExecLog] write failed", e);
  }
}
