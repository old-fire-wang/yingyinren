/** 默认 MCP 入口（与现网一致，可在后台覆盖） */
export const DEFAULT_MCP_TAPD_URL = "https://mcp.zhuanspirit.com/mcp-servers/tapd";
export const DEFAULT_MCP_DASHEN_URL = "https://mcp.zhuanspirit.com/mcp/dashen2";

/** TAPD 等：streamableHttp，请求头 access_token */
export function buildStreamableMcpClientJson(url: string, accessToken: string): string {
  const u = url.trim();
  const t = accessToken.trim();
  return JSON.stringify({
    type: "streamableHttp",
    url: u,
    headers: { access_token: t },
  });
}

/** 大神 dashen2：须 Authorization Bearer（access_token 头会 401） */
export function buildDashenMcpClientJson(url: string, accessToken: string): string {
  const u = url.trim();
  const t = accessToken.trim();
  return JSON.stringify({
    type: "streamableHttp",
    url: u,
    headers: { Authorization: `Bearer ${t}` },
  });
}

export function resolveTapdMcpClientJson(map: Record<string, string>): string {
  const tok = (map.mcp_tapd_token ?? "").trim();
  if (tok) {
    const url = (map.mcp_tapd_url ?? "").trim() || DEFAULT_MCP_TAPD_URL;
    return buildStreamableMcpClientJson(url, tok);
  }
  return (map.tapd_mcp_json ?? "").trim();
}

export function resolveDashenMcpClientJson(map: Record<string, string>): string {
  const tok = (map.mcp_dashen_token ?? "").trim();
  if (tok) {
    const url = (map.mcp_dashen_url ?? "").trim() || DEFAULT_MCP_DASHEN_URL;
    return buildDashenMcpClientJson(url, tok);
  }
  const legacy = (map.dashen_mcp_json ?? "").trim();
  if (!legacy) return "";
  try {
    const j = JSON.parse(legacy) as { type?: string; url?: string; headers?: Record<string, string> };
    const h = j.headers ?? {};
    const bearer = (h.Authorization ?? h.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
    const flat = (h.access_token ?? "").trim();
    const token = bearer || flat;
    const url = String(j.url ?? "").trim() || DEFAULT_MCP_DASHEN_URL;
    if (j.type === "streamableHttp" && url && token) {
      return buildDashenMcpClientJson(url, token);
    }
  } catch {
    /* use legacy as-is */
  }
  return legacy;
}
