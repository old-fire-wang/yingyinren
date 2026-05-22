import { getConfigMap } from "./configStore";

type LlmConfig = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** 默认 OpenAI 风格 `/v1/chat/completions`；智谱 OpenAI 兼容为 `/chat/completions`（也可由 baseUrl 自动识别） */
  chatPath?: string;
};

function resolveChatPath(base: string, explicit?: string): string {
  if (explicit) {
    const p = explicit.trim();
    return p.startsWith("/") ? p : "/" + p;
  }
  const b = base.toLowerCase();
  if (b.includes("open.bigmodel.cn") && b.includes("v4")) {
    return "/chat/completions";
  }
  return "/v1/chat/completions";
}

function parseLlm(map: Record<string, string>): LlmConfig {
  const raw = map.llm_json;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as LlmConfig;
  } catch {
    return {};
  }
}

export async function chatCompletion(
  messages: { role: string; content: string }[]
): Promise<string> {
  const map = await getConfigMap();
  const llm = parseLlm(map);
  if (!llm.apiKey || !llm.baseUrl || !llm.model) {
    throw new Error("llm_not_configured");
  }
  const base = llm.baseUrl.replace(/\/$/, "");
  const url = base + resolveChatPath(base, llm.chatPath);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + llm.apiKey,
    },
    body: JSON.stringify({ model: llm.model, messages }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("llm_http_" + res.status + ":" + t.slice(0, 500));
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("llm_empty_response");
  return text;
}
