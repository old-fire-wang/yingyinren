/** 需求状态：与 API REQ_STATUS 一致 */
export const REQ_STATUS_ORDER = [
  "pending_generate",
  "generating",
  "generation_failed",
  "no_page",
  "pending_review",
  "pending_upload",
  "uploading",
  "upload_failed",
  "uploaded",
  "ignored",
] as const;

export const REQ_STATUS_LABELS: Record<string, string> = {
  pending_generate: "待生成",
  generating: "生成中",
  generation_failed: "生成失败",
  no_page: "无大神页",
  pending_review: "待审核",
  pending_upload: "待上传",
  uploading: "上传中",
  upload_failed: "上传失败",
  uploaded: "已上传",
  ignored: "已忽略",
};

export function requirementStatusLabel(status: string): string {
  return REQ_STATUS_LABELS[status] ?? status;
}

/** Tag 颜色（antd preset） */
export function requirementStatusTagColor(status: string): string | undefined {
  switch (status) {
    case "pending_generate":
      return "default";
    case "generating":
      return "processing";
    case "generation_failed":
    case "upload_failed":
      return "error";
    case "no_page":
      return "warning";
    case "pending_review":
      return "gold";
    case "pending_upload":
      return "cyan";
    case "uploading":
      return "processing";
    case "uploaded":
      return "success";
    case "ignored":
      return "default";
    default:
      return undefined;
  }
}
