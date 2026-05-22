import { withMcpClient, extractTextFromToolResult, tryParseStreamableHttpHeaders } from "./mcpClient";
import {
  dashenUrlSearchTokens,
  parsePageIdFromDashenUrl,
} from "./dashenLink";
import { resolveDashenPageIdByHttpRedirects } from "./dashenResolveHttp";
import {
  dashenMcpErrorLooksLikeAuthFailure,
  fetchDashenPageStorageViaHttp,
} from "./dashenFetchHttp";
import { parseDashenGetPageContentFromMcpText } from "./dashenPageParse";

export type DashenFetchContext = {
  pageId?: string;
  dashenUrl?: string;
  title?: string;
};

function escapeCqlLiteral(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function extractPageIdsFromSearchText(text: string): string[] {
  const found: string[] = [];
  const re = /"pageId"\s*:\s*"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) found.push(m[1]);
  }
  return [...new Set(found)];
}

async function callContentSearch(dashenMcpClientJson: string, cql: string): Promise<string> {
  return withMcpClient(dashenMcpClientJson, async (client) => {
    const r = await client.callTool({
      name: "get_rest_api_content_search",
      arguments: { cql },
    });
    return extractTextFromToolResult(r);
  });
}

async function resolvePageIdFromDashenUrl(
  dashenMcpClientJson: string,
  dashenUrl: string,
  hints?: { title?: string }
): Promise<{ pageId: string; cql_used?: string; via?: "url_query" | "http_redirect" | "cql" } | null> {
  const fromQuery = parsePageIdFromDashenUrl(dashenUrl);
  if (fromQuery) return { pageId: fromQuery, via: "url_query" };

  const lower = dashenUrl.toLowerCase();
  const isShort =
    /\/x\/[^/?#]+/i.test(dashenUrl) ||
    lower.includes("dashen.zhuanspirit.com") ||
    lower.includes("dashen.");

  if (isShort) {
    const hdrs = tryParseStreamableHttpHeaders(dashenMcpClientJson);
    const httpRes = await resolveDashenPageIdByHttpRedirects(dashenUrl, hdrs).catch(() => null);
    if (httpRes?.pageId) return { pageId: httpRes.pageId, via: "http_redirect" };
  }

  const space = process.env.BRIDGE_DASHEN_SEARCH_SPACE?.trim();
  const title = String(hints?.title ?? "").trim();

  for (const token of dashenUrlSearchTokens(dashenUrl)) {
    let cql = `text~"${escapeCqlLiteral(token)}"`;
    if (space) cql += ` and space=${space}`;
    let text = await callContentSearch(dashenMcpClientJson, cql).catch(() => "");
    let ids = extractPageIdsFromSearchText(text);
    if (ids[0]) return { pageId: ids[0], cql_used: cql, via: "cql" };
    if (space) {
      const cqlBare = `text~"${escapeCqlLiteral(token)}"`;
      text = await callContentSearch(dashenMcpClientJson, cqlBare).catch(() => "");
      ids = extractPageIdsFromSearchText(text);
      if (ids[0]) return { pageId: ids[0], cql_used: cqlBare, via: "cql" };
    }
  }

  if (title && space) {
    const cql = `title~"${escapeCqlLiteral(title)}" and space=${space}`;
    const text = await callContentSearch(dashenMcpClientJson, cql).catch(() => "");
    const ids = extractPageIdsFromSearchText(text);
    if (ids[0]) return { pageId: ids[0], cql_used: cql, via: "cql" };
  }
  if (title && process.env.BRIDGE_DASHEN_TITLE_SEARCH === "1") {
    const cql = `title~"${escapeCqlLiteral(title)}"`;
    const text = await callContentSearch(dashenMcpClientJson, cql).catch(() => "");
    const ids = extractPageIdsFromSearchText(text);
    if (ids[0]) return { pageId: ids[0], cql_used: cql, via: "cql" };
  }

  return null;
}

export async function fetchDashenPageMarkdown(
  dashenMcpClientJson: string,
  pageId: string
): Promise<{ raw: string; page_id: string; fetch_via?: "mcp" | "http_rest" }> {
  const mock = process.env.BRIDGE_MOCK_RAW_MARKDOWN?.trim();
  if (mock) {
    return { raw: mock, page_id: pageId || "mock" };
  }
  const pid = String(pageId ?? "").trim();
  if (!pid) {
    throw new Error("缺少大神 pageId");
  }
  if (!dashenMcpClientJson.trim()) {
    throw new Error("云端未配置大神 MCP：请在后台系统配置填写大神 URL 与 token");
  }
  const mcpHdrs = tryParseStreamableHttpHeaders(dashenMcpClientJson);
  let mcpErr: Error | null = null;
  try {
    const mcpText = await withMcpClient(dashenMcpClientJson, async (client) => {
      const r = await client.callTool({
        name: "getPageContent",
        arguments: { pageId: pid },
      });
      return extractTextFromToolResult(r);
    });
    if (!mcpText.trim()) {
      throw new Error("大神 getPageContent 返回空内容");
    }
    const parsed = parseDashenGetPageContentFromMcpText(mcpText);
    if (!parsed.body.trim()) {
      throw new Error("大神页面正文为空（未解析到 body.storage.value）");
    }
    return { raw: parsed.body, page_id: parsed.pageId ?? pid, fetch_via: "mcp" };
  } catch (e) {
    mcpErr = e instanceof Error ? e : new Error(String(e));
    if (!dashenMcpErrorLooksLikeAuthFailure(mcpErr)) throw mcpErr;
  }

  const httpPage = await fetchDashenPageStorageViaHttp(pid, mcpHdrs);
  if (httpPage?.body.trim()) {
    return { raw: httpPage.body, page_id: httpPage.pageId, fetch_via: "http_rest" };
  }

  throw new Error(
    (mcpErr?.message ?? "大神拉取失败") +
      "；已用内嵌登录 Cookie 尝试 REST /rest/api/content 仍失败。请检查「大神登录」是否已就绪，或在影印人后台更新大神 access_token。"
  );
}

/** 优先 pageId；否则用 TAPD 同步下来的 dashen_url 调大神 MCP */
export async function fetchDashenMarkdownForRequirement(
  dashenMcpClientJson: string,
  ctx: DashenFetchContext
): Promise<{
  raw: string;
  page_id: string;
  dashen_url?: string;
  resolved_via_url: boolean;
  cql_used?: string;
  resolve_via?: string;
  fetch_via?: "mcp" | "http_rest";
}> {
  const mock = process.env.BRIDGE_MOCK_RAW_MARKDOWN?.trim();
  if (mock) {
    return {
      raw: mock,
      page_id: String(ctx.pageId ?? "mock"),
      dashen_url: ctx.dashenUrl,
      resolved_via_url: false,
    };
  }

  let pageId = String(ctx.pageId ?? "").trim();
  const dashenUrl = String(ctx.dashenUrl ?? "").trim();
  let cql_used: string | undefined;
  let resolved_via_url = false;

  let resolve_via: string | undefined;

  if (!pageId && dashenUrl) {
    const resolved = await resolvePageIdFromDashenUrl(dashenMcpClientJson, dashenUrl, {
      title: String(ctx.title ?? "").trim(),
    });
    if (!resolved?.pageId) {
      throw new Error(
        "无法根据 TAPD 大神链接解析 pageId（已尝试：HTTP 跟链、SSO Location 嵌套参数、MCP 检索）。链接：" +
          dashenUrl.slice(0, 200) +
          "。请先在桥C「大神登录」Tab 完成 SSO，点「刷新登录态」直至已就绪；或手填「大神短链 HTTP 跟链」Cookie / demand-skill 回退。" +
          "若仍失败，查日志 cookieSource/cookieChars/hasSso/searchSpace；" +
          "证书：BRIDGE_DASHEN_HTTP_INSECURE_TLS=1；CQL 空间默认 bangmaipm（BRIDGE_DASHEN_SEARCH_SPACE）；Bearer：BRIDGE_DASHEN_HTTP_BEARER=1；" +
          "标题兜底：BRIDGE_DASHEN_TITLE_SEARCH=1。"
      );
    }
    pageId = resolved.pageId;
    cql_used = resolved.cql_used;
    resolve_via = resolved.via;
    resolved_via_url = resolved.via !== "cql";
  }

  if (!pageId) {
    throw new Error(
      "TAPD 需求未包含大神链接，且未填写 page_id：请先刷新列表同步 TAPD 描述中的大神短链"
    );
  }

  const { raw, page_id, fetch_via } = await fetchDashenPageMarkdown(dashenMcpClientJson, pageId);
  return {
    raw,
    page_id,
    dashen_url: dashenUrl || undefined,
    resolved_via_url,
    cql_used,
    resolve_via,
    fetch_via,
  };
}
