import { rawMarkdownLooksLikeAccessOrErrorPage } from "./dashenContentGuard";

export type ParsedDashenPage = {
  body: string;
  title?: string;
  pageId?: string;
  /** storage_html=从 JSON 抽出正文；mcp_wrapper=未能解析仍用原文 */
  kind: "storage_html" | "mcp_wrapper";
};

function tryParsePageJson(text: string): Record<string, unknown> | null {
  const t = text.trim();
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    if (j && typeof j === "object") return j;
  } catch {
    /* continue */
  }
  const marker = "## Original Response";
  const idx = t.indexOf(marker);
  if (idx >= 0) {
    const after = t.slice(idx + marker.length).trim();
    const start = after.indexOf("{");
    if (start >= 0) {
      let depth = 0;
      for (let i = start; i < after.length; i += 1) {
        const ch = after[i];
        if (ch === "{") depth += 1;
        else if (ch === "}") {
          depth -= 1;
          if (depth === 0) {
            try {
              return JSON.parse(after.slice(start, i + 1)) as Record<string, unknown>;
            } catch {
              return null;
            }
          }
        }
      }
    }
  }
  const firstBrace = t.indexOf("{");
  if (firstBrace >= 0 && t.includes('"body"') && t.includes('"storage"')) {
    let depth = 0;
    for (let i = firstBrace; i < t.length; i += 1) {
      const ch = t[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(t.slice(firstBrace, i + 1)) as Record<string, unknown>;
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function storageValueFromPageJson(j: Record<string, unknown>): string {
  const body = j.body as { storage?: { value?: string } } | undefined;
  const v = body?.storage?.value;
  return typeof v === "string" ? v.trim() : "";
}

/**
 * 大神 MCP getPageContent 常在 text 里附带 API 说明 + Original Response JSON；
 * 真正页面正文在 body.storage.value（HTML）。鉴权失败时则多为 401 XML，无 storage。
 */
export function parseDashenGetPageContentFromMcpText(mcpText: string): ParsedDashenPage {
  const raw = String(mcpText ?? "").trim();
  const pageJson = tryParsePageJson(raw);
  if (pageJson) {
    const storage = storageValueFromPageJson(pageJson);
    const title = typeof pageJson.title === "string" ? pageJson.title.trim() : undefined;
    const pageId = typeof pageJson.id === "string" ? pageJson.id.trim() : undefined;
    if (storage) {
      return { body: storage, title, pageId, kind: "storage_html" };
    }
    const serialized = JSON.stringify(pageJson);
    const guard = rawMarkdownLooksLikeAccessOrErrorPage(serialized);
    if (guard.reject) {
      throw new Error(
        "大神 getPageContent 返回鉴权/错误响应（" +
          (guard.reason ?? "unknown") +
          "），非页面正文。请检查云端大神 MCP token 或桥 C Cookie。"
      );
    }
  }

  const guardRaw = rawMarkdownLooksLikeAccessOrErrorPage(raw);
  if (guardRaw.reject) {
    throw new Error(
      "大神 getPageContent 返回鉴权/错误页（" +
        (guardRaw.reason ?? "unknown") +
        "）。请检查云端大神 MCP token 或桥 C Cookie。"
    );
  }

  if (/API Response Information/i.test(raw) || /## Original Response/i.test(raw)) {
    throw new Error(
      "大神 getPageContent 返回了 MCP 包装说明，但未解析到 body.storage.value。请升级桥 C 或检查大神 MCP / token。"
    );
  }

  return { body: raw, kind: "mcp_wrapper" };
}
