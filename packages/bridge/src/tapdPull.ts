import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractTextFromToolResult, withMcpClient } from "./mcpClient";
import { extractDashenUrlFromStory } from "./dashenLink";

/**
 * TAPD 拉列表须与 MCP 工具契约一致（转转内部 MCP 描述见 Cursor：
 * `mcps/user-mcp_server_tapd_internal/tools/get_stories_or_tasks.json`）。
 * 要点：`workspace_id` 为 integer；`options.limit` 须显式传入（文档默认 10）；默认 `v_status=已上线` 仅拉已上线需求。
 */

/** TAPD MCP `options.v_status` 默认值；仅拉「已上线」需求 */
const DEFAULT_TAPD_V_STATUS = "已上线";

export type TapdRequirementItem = {
  tapd_id: string;
  title: string;
  online_time: string;
  dashen_url: string;
};

export type TapdPullDiagnostics = {
  pagesTried: number;
  /** 最后一页 MCP 文本开头（便于对照 TAPD 实际返回） */
  lastMcpTextHead: string;
  lastPageRawRowCount: number;
  totalRawRows: number;
  /** 有 id+标题但没有任何可解析日期 */
  droppedNoDate: number;
  /** 有日期但不在所选年月 */
  droppedWrongMonth: number;
  /** 缺 id 或标题 */
  droppedNoIdTitle: number;
  /** 状态不是「已上线」（MCP 未过滤干净时的兜底） */
  droppedNotOnline: number;
  /** 本次 MCP 查询使用的 v_status（未设置则为未按状态过滤） */
  queryVStatus?: string;
};

export type TapdPullResult = {
  items: TapdRequirementItem[];
  diagnostics: TapdPullDiagnostics;
};

function monthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

function coerceDateValue(v: unknown): Date | null {
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (typeof v === "number" && Number.isFinite(v) && v > 1_000_000_000) {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const inner = o.value ?? o.Value ?? o.date ?? o.Date;
    if (typeof inner === "string" && inner.trim()) {
      const d = new Date(inner);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function pickOnlineTime(row: Record<string, unknown>): Date | null {
  /** 优先「上线/完成」语义字段，再回落到创建时间，避免仅用 created 把旧单算进错月 */
  const keys = [
    "completed",
    "custom_plan_release",
    "released",
    "closed",
    "due",
    "begin",
    "deadline",
    "start",
    "plan_start",
    "plan_end",
    "accepted",
    "modified",
    "updated",
    "created",
    "developer_end",
  ];
  for (const k of keys) {
    const d = coerceDateValue(row[k]);
    if (d) return d;
  }
  for (const [k, v] of Object.entries(row)) {
    if (!/^custom_field_/i.test(k)) continue;
    const d = coerceDateValue(v);
    if (d) return d;
  }
  return null;
}

function normalizeEntity(row: Record<string, unknown>): Record<string, unknown> {
  const inner =
    row.Story ?? row.story ?? row.Task ?? row.task ?? row.Bug ?? row.bug ?? row.Item ?? row.item;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    const innerObj = { ...(inner as Record<string, unknown>) };
    const outerId =
      row.id ?? row.Id ?? row.ID ?? row.entity_id ?? row.EntityId ?? row.story_id ?? row.StoryId;
    if (outerId != null && String(outerId).trim() && !innerObj.id && !innerObj.entity_id) {
      innerObj.id = outerId;
    }
    return innerObj;
  }
  return row;
}

/** 解析 MCP 查询用的 v_status；未设置 env 时默认「已上线」 */
function resolveTapdVStatusForQuery(): string | undefined {
  const env = process.env.BRIDGE_TAPD_V_STATUS;
  if (env !== undefined) {
    const t = env.trim();
    if (!t || t === "*" || t.toLowerCase() === "all") return undefined;
    return t;
  }
  return DEFAULT_TAPD_V_STATUS;
}

/** 行内状态字段是否表示已上线；无状态字段时信任 MCP 侧 v_status 过滤 */
function storyHasOnlineStatus(row: Record<string, unknown>): boolean {
  const n = normalizeEntity(row);
  const labels: string[] = [];
  for (const k of ["v_status", "V_status", "status_label", "status_name", "custom_status"]) {
    const v = String(n[k] ?? "").trim();
    if (v) labels.push(v);
  }
  if (!labels.length) return true;
  return labels.some((s) => s === "已上线" || s.includes("已上线"));
}

function flattenStories(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
  if (!parsed || typeof parsed !== "object") return [];
  const p = parsed as Record<string, unknown>;

  if (typeof p.data === "string") {
    try {
      return flattenStories(JSON.parse(p.data as string));
    } catch {
      return [];
    }
  }
  if (Array.isArray(p.data)) return p.data as Record<string, unknown>[];
  const d = p.data;
  if (d && typeof d === "object" && !Array.isArray(d)) return Object.values(d) as Record<string, unknown>[];
  if (p.Story && typeof p.Story === "object") return Object.values(p.Story as object) as Record<string, unknown>[];
  if (Array.isArray(p.stories)) return p.stories as Record<string, unknown>[];
  if (Array.isArray(p.Stories)) return p.Stories as Record<string, unknown>[];
  if (Array.isArray(p.items)) return p.items as Record<string, unknown>[];
  if (Array.isArray(p.Items)) return p.Items as Record<string, unknown>[];
  return [];
}

function stripMarkdownCodeFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/im);
  if (m) return m[1].trim();
  return t;
}

function parseStoriesFromMcpText(text: string): Record<string, unknown>[] {
  const trimmed = stripMarkdownCodeFence(text.trim());
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const i = trimmed.indexOf("{");
    const j = trimmed.lastIndexOf("}");
    if (i >= 0 && j > i) {
      try {
        parsed = JSON.parse(trimmed.slice(i, j + 1));
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }
  /** fastmcp / 部分网关会把整段 JSON 再包一层 { "result": "<stringified json>" } */
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const r = (parsed as Record<string, unknown>).result;
    if (typeof r === "string" && r.trim()) {
      try {
        parsed = JSON.parse(r.trim());
      } catch {
        /* keep outer */
      }
    }
  }
  return flattenStories(parsed);
}

function rowToRequirement(
  row: Record<string, unknown>,
  year: number,
  month: number
): TapdRequirementItem | null | "no_id_title" | "no_date" | "wrong_month" {
  const n = normalizeEntity(row);
  const tapdId = String(n.id ?? n.entity_id ?? n.Id ?? n.ID ?? "").trim();
  const title = String(n.name ?? n.title ?? n.Name ?? n.Title ?? "").trim();
  if (!tapdId || !title) return "no_id_title";
  const online = pickOnlineTime(n);
  if (!online) return "no_date";
  const { start, end } = monthRange(year, month);
  if (online < start || online > end) return "wrong_month";
  const dashen_url = extractDashenUrlFromStory(n);
  return { tapd_id: tapdId, title, online_time: online.toISOString(), dashen_url };
}

/** 联调：环境变量 JSON 数组，格式与 sync 接口 requirements 一致 */
export function loadMockTapdListFromEnv(): TapdRequirementItem[] | null {
  const raw = process.env.BRIDGE_MOCK_TAPD_LIST_JSON?.trim();
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as TapdRequirementItem[];
    if (!Array.isArray(arr)) return null;
    return arr.map((m) => ({
      tapd_id: String(m.tapd_id ?? "").trim(),
      title: String(m.title ?? "").trim(),
      online_time: String(m.online_time ?? ""),
      dashen_url: String(m.dashen_url ?? "").trim(),
    }));
  } catch {
    throw new Error("BRIDGE_MOCK_TAPD_LIST_JSON 不是合法 JSON");
  }
}

const emptyDiag = (): TapdPullDiagnostics => ({
  pagesTried: 0,
  lastMcpTextHead: "",
  lastPageRawRowCount: 0,
  totalRawRows: 0,
  droppedNoDate: 0,
  droppedWrongMonth: 0,
  droppedNoIdTitle: 0,
  droppedNotOnline: 0,
});

export async function pullTapdRequirementsForMonth(
  tapdMcpClientJson: string,
  projectId: string,
  year: number,
  month: number
): Promise<TapdPullResult> {
  const diag = emptyDiag();
  const mock = loadMockTapdListFromEnv();
  if (mock) {
    const { start, end } = monthRange(year, month);
    const items = mock.filter((m) => {
      const d = new Date(m.online_time);
      return !Number.isNaN(d.getTime()) && d >= start && d <= end;
    });
    return { items, diagnostics: diag };
  }
  if (!tapdMcpClientJson.trim()) {
    throw new Error("云端未配置 TAPD MCP：请在影印人后台「系统配置」填写 TAPD URL 与 access_token");
  }
  const workspaceId = Math.trunc(Number(String(projectId).trim()));
  if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
    throw new Error("project_id 须为 TAPD workspace_id（正整数字符串）");
  }
  const merged = new Map<string, TapdRequirementItem>();
  const limit = 200;
  const maxPages = 50;
  const dashenField = process.env.BRIDGE_TAPD_DASHEN_FIELD?.trim();
  const storyFields =
    "id,name,status,v_status,creator,created,modified,completed,begin,due,accepted,custom_plan_release,owner,developer,iteration_id,parent_id,children_id,category_id,description" +
    (dashenField ? `,${dashenField}` : "");
  const queryVStatus = resolveTapdVStatusForQuery();
  diag.queryVStatus = queryVStatus;
  await withMcpClient(tapdMcpClientJson, async (client: Client) => {
    for (let page = 1; page <= maxPages; page += 1) {
      const options: Record<string, unknown> = {
        entity_type: "stories",
        limit,
        page,
        /** TAPD 标准需求字段；description 用于解析大神链接 */
        fields: storyFields,
      };
      if (queryVStatus) options.v_status = queryVStatus;
      const extraJson = process.env.BRIDGE_TAPD_STORY_OPTIONS_JSON?.trim();
      if (extraJson) {
        try {
          const ext = JSON.parse(extraJson) as Record<string, unknown>;
          if (ext && typeof ext === "object" && !Array.isArray(ext)) {
            for (const [k, val] of Object.entries(ext)) {
              if (k === "entity_type" || k === "fields") continue;
              options[k] = val;
            }
          }
        } catch {
          /* ignore */
        }
      }
      const r = await client.callTool({
        name: "get_stories_or_tasks",
        arguments: {
          workspace_id: workspaceId,
          options,
        },
      });
      const text = extractTextFromToolResult(r);
      diag.pagesTried = page;
      diag.lastMcpTextHead = text.slice(0, 800);
      const rawRows = parseStoriesFromMcpText(text);
      diag.lastPageRawRowCount = rawRows.length;
      diag.totalRawRows += rawRows.length;
      if (!rawRows.length) break;
      for (const row of rawRows) {
        if (!storyHasOnlineStatus(row)) {
          diag.droppedNotOnline += 1;
          continue;
        }
        const item = rowToRequirement(row, year, month);
        if (item === "no_id_title") {
          diag.droppedNoIdTitle += 1;
          continue;
        }
        if (item === "no_date") {
          diag.droppedNoDate += 1;
          continue;
        }
        if (item === "wrong_month") {
          diag.droppedWrongMonth += 1;
          continue;
        }
        const ok = item as TapdRequirementItem;
        merged.set(ok.tapd_id, ok);
      }
      if (rawRows.length < limit) break;
    }
  });
  return { items: [...merged.values()], diagnostics: diag };
}
