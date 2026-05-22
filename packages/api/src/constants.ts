export const REQ_STATUS = {
  PENDING_GENERATE: "pending_generate",
  GENERATING: "generating",
  GENERATION_FAILED: "generation_failed",
  NO_PAGE: "no_page",
  PENDING_REVIEW: "pending_review",
  PENDING_UPLOAD: "pending_upload",
  UPLOADING: "uploading",
  UPLOAD_FAILED: "upload_failed",
  UPLOADED: "uploaded",
  IGNORED: "ignored",
} as const;

export const TASK_STATUS = {
  PENDING: "pending",
  DONE: "done",
  FAILED: "failed",
} as const;

export const TASK_TYPE = {
  MCP_FETCH_DOC: "mcp_fetch_doc",
  /** 桥 C 调 TAPD MCP 拉需求列表并 POST /bridge/requirements/sync */
  TAPD_PULL_REQUIREMENTS: "tapd_pull_requirements",
} as const;
