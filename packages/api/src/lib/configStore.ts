import { prisma } from "../prisma";

export async function getConfigMap(): Promise<Record<string, string>> {
  const rows = await prisma.systemConfig.findMany();
  const m: Record<string, string> = {};
  for (const r of rows) m[r.configKey] = r.configValue;
  return m;
}

export async function setConfigKey(key: string, value: string): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { configKey: key },
    create: { configKey: key, configValue: value },
    update: { configValue: value },
  });
}

export const DEFAULT_PROMPT_GENERATE = `你是一个需求文档整理助手，请将以下内容整理成结构化的 markdown 文档。
要求：
1. 提取需求的核心信息，包括背景、目标、功能点、技术方案等
2. 使用清晰的标题层级（# ## ###）
3. 保留关键的技术细节和业务逻辑
4. 删除冗余的会议记录、讨论过程等非核心内容
5. 输出纯 markdown 格式，不要有其他说明文字
6. **若原文明显为 HTTP/接口错误页、登录提示、或仅含 401/403/404 等状态 XML/HTML（而非产品需求描述），禁止编造需求；只输出一行：**\`（无法整理：原文为鉴权或错误响应，非需求文档。请修复大神访问权限后重新生成。）\`
需求文档原文：
{content}
`;

export const DEFAULT_PROMPT_MODIFY = `你是一个 markdown 文档编辑助手。
当前文档内容：
{current_md}
用户修改指令：
{user_instruction}
请根据用户指令修改文档，输出完整的新文档内容。只输出 markdown 内容，不要有其他说明
`;
