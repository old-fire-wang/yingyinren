import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type TapdConn =
  | { kind: "stdio"; command: string; args: string[] }
  | { kind: "http"; url: string; headers: Record<string, string> };

export function extractTextFromToolResult(r: unknown): string {
  const o = r as { content?: { type?: string; text?: string }[] };
  const parts = (o.content ?? []).map((c) => {
    const t = (c as { type?: string; text?: string }).text;
    if (typeof t === "string" && t.trim()) return t;
    return "";
  });
  return parts.filter(Boolean).join("\n").trim();
}

function headersFromObj(h: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h || typeof h !== "object") return out;
  for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return out;
}

function pickStreamableServer(root: Record<string, unknown>): Record<string, unknown> | null {
  const ms = root.mcpServers;
  if (!ms || typeof ms !== "object") return null;
  const servers = ms as Record<string, unknown>;
  const prefer = servers.mcp_server_tapd_internal ?? servers["mcp_server_tapd_internal"];
  if (prefer && typeof prefer === "object") return prefer as Record<string, unknown>;
  const keys = Object.keys(servers);
  if (!keys.length) return null;
  const first = servers[keys[0]];
  return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
}

export function parseTapdMcpConfig(raw: string): TapdConn {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("MCP 配置为空");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("MCP 配置不是合法 JSON");
  }
  if (Array.isArray(parsed)) {
    const arr = parsed.filter((x) => typeof x === "string") as string[];
    if (arr.length < 1 || !arr[0].trim()) {
      throw new Error("stdio 须为非空 JSON 数组，如 [\"node\",\"C:\\\\path\\\\server.js\"]");
    }
    return { kind: "stdio", command: arr[0], args: arr.slice(1) };
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("MCP 配置须为 JSON 数组或 JSON 对象");
  }
  const root = parsed as Record<string, unknown>;
  let node = root;
  const nested = pickStreamableServer(root);
  if (nested) node = nested;
  const typ = String(node.type ?? "").trim();
  const url = String(node.url ?? "").trim();
  if (typ === "streamableHttp" && url) {
    return { kind: "http", url, headers: headersFromObj(node.headers) };
  }
  throw new Error("不识别的 MCP 配置（需 streamableHttp 单段、或 mcpServers、或 stdio 数组）");
}

/** 供大神短链 HTTP / REST 回退：读取 MCP headers，并归一化 Bearer */
export function tryParseStreamableHttpHeaders(configJson: string): Record<string, string> {
  try {
    const cfg = parseTapdMcpConfig(configJson.trim());
    if (cfg.kind !== "http") return {};
    const out = { ...cfg.headers };
    const auth = out.Authorization ?? out.authorization;
    if (typeof auth === "string" && /^Bearer\s+/i.test(auth)) {
      const tok = auth.replace(/^Bearer\s+/i, "").trim();
      if (tok) out.access_token = tok;
    }
    return out;
  } catch {
    return {};
  }
}

export async function withMcpClient<T>(configJson: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const cfg = parseTapdMcpConfig(configJson);
  const client = new Client({ name: "yingyinren-bridge", version: "1.0.0" });
  if (cfg.kind === "stdio") {
    const transport = new StdioClientTransport({
      command: cfg.command,
      args: cfg.args,
      env: { ...process.env } as Record<string, string>,
    });
    await client.connect(transport);
    try {
      return await fn(client);
    } finally {
      await transport.close().catch(() => undefined);
    }
  }
  const transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
    requestInit: { headers: cfg.headers },
  });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await transport.close().catch(() => undefined);
  }
}
