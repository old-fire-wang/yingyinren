/** 从 TAPD 描述/自定义字段 HTML 或纯文本中提取大神（zhuanspirit）链接 */
const DASHEN_HOST_RE = /zhuanspirit\.com/i;

const URL_IN_TEXT_RE =
  /https?:\/\/[^\s"'<>)\]]+/gi;

function decodeBasicHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTrailingUrlPunctuation(url: string): string {
  return url.replace(/[.,;:!?)>\]]+$/g, "");
}

export function firstDashenUrlInText(text: string): string {
  const decoded = decodeBasicHtmlEntities(String(text ?? ""));
  const matches = decoded.match(URL_IN_TEXT_RE) ?? [];
  for (const raw of matches) {
    const u = stripTrailingUrlPunctuation(raw.trim());
    if (DASHEN_HOST_RE.test(u)) return u;
  }
  return "";
}

/** 从 TAPD Story 行里找大神链接：description + 可选自定义字段 + 其余 custom_field_* */
export function extractDashenUrlFromStory(row: Record<string, unknown>): string {
  const parts: string[] = [];
  const desc = String(row.description ?? row.Description ?? "").trim();
  if (desc) parts.push(desc);

  const configured = process.env.BRIDGE_TAPD_DASHEN_FIELD?.trim();
  if (configured && row[configured] != null) {
    parts.push(String(row[configured]));
  } else {
    for (const [k, v] of Object.entries(row)) {
      if (!/^custom_field_/i.test(k) || v == null) continue;
      const s = String(v).trim();
      if (s) parts.push(s);
    }
  }

  for (const block of parts) {
    const url = firstDashenUrlInText(block);
    if (url) return url;
  }
  return "";
}

export function parsePageIdFromDashenUrl(url: string): string | null {
  const u = String(url ?? "").trim();
  if (!u) return null;
  const m = u.match(/[?&]pageId=(\d+)/i);
  return m?.[1] ?? null;
}

/** 用于大神 MCP CQL text~ 检索的候选片段（完整 URL、路径、/x/ 短码） */
export function dashenUrlSearchTokens(url: string): string[] {
  const u = String(url ?? "").trim();
  if (!u) return [];
  const tokens = [u];
  try {
    const parsed = new URL(u);
    const pathQuery = (parsed.pathname + parsed.search).trim();
    if (pathQuery && pathQuery !== "/") tokens.push(pathQuery);
    const short = parsed.pathname.match(/\/x\/([^/?#]+)/i);
    if (short?.[1]) tokens.push(short[1]);
  } catch {
    /* relative or malformed — keep full string only */
  }
  return [...new Set(tokens.filter(Boolean))];
}
