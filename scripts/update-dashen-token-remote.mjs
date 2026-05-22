/**
 * 在服务器 /opt/yingyinren-api 执行：更新大神 MCP token（Bearer 格式）
 * node update-dashen-token-remote.mjs
 */
import { PrismaClient } from "@prisma/client";

const TOK = process.env.DASHEN_TOKEN?.trim();
const URL = (process.env.DASHEN_URL ?? "https://mcp.zhuanspirit.com/mcp/dashen2").trim();

if (!TOK) {
  console.error("DASHEN_TOKEN required");
  process.exit(1);
}

const dashenJson = JSON.stringify({
  type: "streamableHttp",
  url: URL,
  headers: { Authorization: `Bearer ${TOK}` },
});

const p = new PrismaClient();
try {
  const upsert = (k, v) =>
    p.systemConfig.upsert({
      where: { configKey: k },
      create: { configKey: k, configValue: v },
      update: { configValue: v },
    });
  await upsert("mcp_dashen_token", TOK);
  await upsert("mcp_dashen_url", URL);
  await upsert("dashen_mcp_json", dashenJson);
  const row = await p.systemConfig.findUnique({ where: { configKey: "dashen_mcp_json" } });
  const v = row?.configValue ?? "";
  console.log(
    JSON.stringify({
      ok: v.includes("Authorization") && v.includes("Bearer"),
      jsonLen: v.length,
    })
  );
} finally {
  await p.$disconnect();
}
