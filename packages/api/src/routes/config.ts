import { Router } from "express";
import { authJwt, type AuthedRequest } from "../middleware/authJwt";
import { getConfigMap, setConfigKey, DEFAULT_PROMPT_GENERATE, DEFAULT_PROMPT_MODIFY } from "../lib/configStore";
import {
  buildDashenMcpClientJson,
  buildStreamableMcpClientJson,
  DEFAULT_MCP_DASHEN_URL,
  DEFAULT_MCP_TAPD_URL,
} from "../lib/mcpConfigHelpers";

export const configRouter = Router();
configRouter.use(authJwt);

const BRIDGE_ONLINE_MS = 12_000;

/** 工作台：桥 C 是否在线（JWT，约 10s 轮询） */
configRouter.get("/bridge-presence", async (_req: AuthedRequest, res) => {
  const map = await getConfigMap();
  const raw = (map.bridge_last_seen_ms ?? "").trim();
  const last = raw ? Number(raw) : NaN;
  const lastOk = Number.isFinite(last) && last > 0;
  const online = lastOk && Date.now() - last < BRIDGE_ONLINE_MS;
  res.json({ online, last_seen_ms: lastOk ? last : null, window_ms: BRIDGE_ONLINE_MS });
});

configRouter.get("/", async (_req: AuthedRequest, res) => {
  const map = await getConfigMap();
  res.json({
    llm_json: map.llm_json ?? "",
    llm_md_generation_prompt: map.llm_md_generation_prompt ?? DEFAULT_PROMPT_GENERATE,
    llm_md_modification_prompt: map.llm_md_modification_prompt ?? DEFAULT_PROMPT_MODIFY,
    mcp_tapd_url: map.mcp_tapd_url ?? "",
    mcp_tapd_token: map.mcp_tapd_token ?? "",
    mcp_dashen_url: map.mcp_dashen_url ?? "",
    mcp_dashen_token: map.mcp_dashen_token ?? "",
    tapd_mcp_json: map.tapd_mcp_json ?? "",
    dashen_mcp_json: map.dashen_mcp_json ?? "",
    feishu_webhook_url: map.feishu_webhook_url ?? "",
    wechat_webhook_url: map.wechat_webhook_url ?? "",
    mcp_defaults: { tapd_url: DEFAULT_MCP_TAPD_URL, dashen_url: DEFAULT_MCP_DASHEN_URL },
  });
});

configRouter.put("/", async (req: AuthedRequest, res) => {
  const body = req.body ?? {};
  const pairs: [string, string][] = [];
  if (body.llm_json != null) pairs.push(["llm_json", String(body.llm_json)]);
  if (body.llm_md_generation_prompt != null) {
    pairs.push(["llm_md_generation_prompt", String(body.llm_md_generation_prompt)]);
  }
  if (body.llm_md_modification_prompt != null) {
    pairs.push(["llm_md_modification_prompt", String(body.llm_md_modification_prompt)]);
  }
  if (body.mcp_tapd_url != null) pairs.push(["mcp_tapd_url", String(body.mcp_tapd_url)]);
  if (body.mcp_tapd_token != null) pairs.push(["mcp_tapd_token", String(body.mcp_tapd_token)]);
  if (body.mcp_dashen_url != null) pairs.push(["mcp_dashen_url", String(body.mcp_dashen_url)]);
  if (body.mcp_dashen_token != null) pairs.push(["mcp_dashen_token", String(body.mcp_dashen_token)]);
  if (body.tapd_mcp_json != null) pairs.push(["tapd_mcp_json", String(body.tapd_mcp_json)]);
  if (body.dashen_mcp_json != null) pairs.push(["dashen_mcp_json", String(body.dashen_mcp_json)]);
  if (body.feishu_webhook_url != null) pairs.push(["feishu_webhook_url", String(body.feishu_webhook_url)]);
  if (body.wechat_webhook_url != null) pairs.push(["wechat_webhook_url", String(body.wechat_webhook_url)]);
  for (const [k, v] of pairs) await setConfigKey(k, v);

  const map = await getConfigMap();
  const tapTok = (map.mcp_tapd_token ?? "").trim();
  if (tapTok) {
    const u = (map.mcp_tapd_url ?? "").trim() || DEFAULT_MCP_TAPD_URL;
    await setConfigKey("tapd_mcp_json", buildStreamableMcpClientJson(u, tapTok));
  }
  const dsTok = (map.mcp_dashen_token ?? "").trim();
  if (dsTok) {
    const u = (map.mcp_dashen_url ?? "").trim() || DEFAULT_MCP_DASHEN_URL;
    await setConfigKey("dashen_mcp_json", buildDashenMcpClientJson(u, dsTok));
  }

  res.json({ ok: true });
});
