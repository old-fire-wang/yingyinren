import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { createHash } from "crypto";
import fs from "fs/promises";
import fsSync from "fs";
import Store from "electron-store";
import { pullTapdRequirementsForMonth } from "./tapdPull";
import { fetchDashenMarkdownForRequirement } from "./dashenDoc";
import { resolveDashenHttpCookie } from "./dashenCookieLoader";
import {
  getDashenLoginCookieStatus,
  refreshElectronSessionCookieHeader,
} from "./electronSessionCookie";
import { DEFAULT_DASHEN_LOGIN_URL } from "./dashenSession";
import { tryParseStreamableHttpHeaders } from "./mcpClient";
import { resolveDashenPageIdByHttpRedirects } from "./dashenResolveHttp";

const TASK_MCP_FETCH = "mcp_fetch_doc";
const TASK_TAPD_PULL = "tapd_pull_requirements";

type Settings = {
  apiBase: string;
  bridgeToken: string;
  localMdRoot: string;
  /** 是否自动轮询云端任务并发心跳（单实例桥） */
  autoPoll: boolean;
  /** 大神短链 HTTP 跟链：Cookie 串（写入 process.env.BRIDGE_DASHEN_HTTP_COOKIE） */
  dashenHttpCookie?: string;
  /** 从文件读 Cookie 路径（BRIDGE_DASHEN_HTTP_COOKIE_FILE） */
  dashenHttpCookieFile?: string;
  /** 输出 Cookie 的脚本路径（BRIDGE_DASHEN_HTTP_COOKIE_SCRIPT） */
  dashenHttpCookieScript?: string;
  /** Python 解释器（仅 .py 脚本，BRIDGE_DASHEN_HTTP_COOKIE_PYTHON） */
  dashenHttpCookiePython?: string;
  /** 大神 CQL 空间，默认 bangmaipm（BRIDGE_DASHEN_SEARCH_SPACE） */
  dashenSearchSpace?: string;
  /** 内嵌大神登录页 URL（默认 bangmaipm 空间页） */
  dashenLoginPageUrl?: string;
};

type BridgeMcpBundle = { tapd_mcp_json: string; dashen_mcp_json: string };

const store = new Store<Settings>({
  defaults: {
    apiBase: "http://115.190.196.95:3010",
    bridgeToken: "",
    localMdRoot: "",
    autoPoll: true,
    dashenSearchSpace: "bangmaipm",
  },
});

let cachedMcp: BridgeMcpBundle | null = null;
/** 与上次打到前端的 MCP 配置指纹，避免每 10s 刷屏 */
let lastAnnouncedMcpFingerprint = "";
const taskInFlight = new Set<number>();

function syncDashenBridgeEnvFromStore(): void {
  const s = store.store as Settings;
  const pairs: [keyof Settings, string][] = [
    ["dashenHttpCookie", "BRIDGE_DASHEN_HTTP_COOKIE"],
    ["dashenHttpCookieFile", "BRIDGE_DASHEN_HTTP_COOKIE_FILE"],
    ["dashenHttpCookieScript", "BRIDGE_DASHEN_HTTP_COOKIE_SCRIPT"],
    ["dashenHttpCookiePython", "BRIDGE_DASHEN_HTTP_COOKIE_PYTHON"],
    ["dashenSearchSpace", "BRIDGE_DASHEN_SEARCH_SPACE"],
  ];
  for (const [sk, ek] of pairs) {
    if (!store.has(sk as string)) continue;
    const v = String((s[sk] as string | undefined) ?? "").trim();
    if (v) (process.env as Record<string, string | undefined>)[ek] = v;
    else delete (process.env as Record<string, string | undefined>)[ek];
  }
  if (!process.env.BRIDGE_DASHEN_SEARCH_SPACE?.trim()) {
    process.env.BRIDGE_DASHEN_SEARCH_SPACE = "bangmaipm";
  }
}

function mcpBundleFingerprint(b: BridgeMcpBundle): string {
  return createHash("sha256")
    .update(b.tapd_mcp_json + "\n" + b.dashen_mcp_json)
    .digest("hex")
    .slice(0, 16);
}

function authHeader(): Record<string, string> {
  const t = store.get("bridgeToken");
  return { Authorization: "Bearer " + t };
}

function bridgeLog(level: "info" | "warn" | "error", msg: string, meta?: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...meta,
  });
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send("yy:log", line);
  }
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = store.get("apiBase").replace(/\/$/, "");
  return fetch(base + path, {
    ...init,
    headers: { ...(init?.headers as object), ...authHeader() },
  });
}

async function refreshBridgeMcpFromApi(): Promise<void> {
  const res = await apiFetch("/api/bridge/config");
  const text = await res.text();
  if (!res.ok) {
    cachedMcp = null;
    throw new Error("bridge_config:" + text);
  }
  const j = JSON.parse(text) as BridgeMcpBundle;
  cachedMcp = {
    tapd_mcp_json: String(j.tapd_mcp_json ?? ""),
    dashen_mcp_json: String(j.dashen_mcp_json ?? ""),
  };
}

async function sendHeartbeat(): Promise<void> {
  const res = await apiFetch("/api/bridge/heartbeat", { method: "POST" });
  if (!res.ok) {
    bridgeLog("warn", "heartbeat_http_error", { status: res.status, body: await res.text() });
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
}

function weekBucket(d: Date): number {
  const day = d.getDate();
  return Math.ceil(day / 7);
}

async function writeLocalMdFromCloud(requirementId: number): Promise<void> {
  const root = store.get("localMdRoot");
  if (!root) return;
  const res = await apiFetch("/api/bridge/requirements/" + requirementId + "/md");
  if (!res.ok) return;
  const row = (await res.json()) as {
    tapdId: string;
    title: string;
    mdContent: string;
    onlineTime: string;
    projectId: string;
  };
  const dt = new Date(row.onlineTime);
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const w = weekBucket(dt);
  const dir = path.join(root, row.projectId, String(y), String(m), "W" + w);
  await fs.mkdir(dir, { recursive: true });
  const fn = sanitizeFileName(row.tapdId + "_" + row.title) + ".md";
  const fp = path.join(dir, fn);
  await fs.writeFile(fp, row.mdContent, "utf8");
}

async function postTapdPullResult(
  taskId: number,
  body: Record<string, unknown>
): Promise<{ ok: boolean; text: string }> {
  const r2 = await apiFetch("/api/bridge/tasks/" + taskId + "/result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const t2 = await r2.text();
  return { ok: r2.ok, text: t2 };
}

async function handleTapdPullTask(t: { id: number; payload: string }): Promise<string> {
  const { project_id, year, month } = JSON.parse(t.payload) as {
    project_id: string;
    year: number;
    month: number;
  };
  const tapdJson = cachedMcp?.tapd_mcp_json ?? "";
  let items: { tapd_id: string; title: string; online_time: string; dashen_url?: string }[];
  try {
    const pull = await pullTapdRequirementsForMonth(tapdJson, project_id, year, month);
    items = pull.items;
    const d = pull.diagnostics;
    if (!items.length) {
      bridgeLog("warn", "tapd_mcp_pull_diagnostics", {
        taskId: t.id,
        project_id,
        year,
        month,
        pagesTried: d.pagesTried,
        totalRawRows: d.totalRawRows,
        lastPageRawRowCount: d.lastPageRawRowCount,
        droppedNoIdTitle: d.droppedNoIdTitle,
        droppedNoDate: d.droppedNoDate,
        droppedWrongMonth: d.droppedWrongMonth,
        droppedNotOnline: d.droppedNotOnline,
        queryVStatus: d.queryVStatus,
        mcpTextHead: d.lastMcpTextHead.slice(0, 600),
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    bridgeLog("error", "tapd_pull_failed", { taskId: t.id, error: msg });
    await postTapdPullResult(t.id, { success: false, error: msg });
    return "tapd_pull_fail:" + msg;
  }
  bridgeLog(
    items.length ? "info" : "warn",
    items.length ? "tapd_mcp_list_result" : "tapd_mcp_list_empty",
    {
      taskId: t.id,
      project_id,
      year,
      month,
      itemCount: items.length,
      sampleTapdIds: items.slice(0, 8).map((x) => x.tapd_id),
      ...(items.length
        ? {}
        : {
            hint:
              "TAPD MCP 返回 0 条、状态非「已上线」或上线时间不在所选年月；请核对年月与 TAPD 单据「已上线」状态",
          }),
    }
  );
  const syncRes = await apiFetch("/api/bridge/requirements/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id, requirements: items }),
  });
  const syncText = await syncRes.text();
  if (!syncRes.ok) {
    await postTapdPullResult(t.id, { success: false, error: "sync_http:" + syncText });
    bridgeLog("error", "tapd_pull_sync_failed", { taskId: t.id, status: syncRes.status });
    return "tapd_pull_sync_fail:" + syncText;
  }
  let added = 0;
  let updated = 0;
  let skipped = 0;
  try {
    const j = JSON.parse(syncText) as { added?: number; updated?: number; skipped?: number };
    added = Number(j.added ?? 0);
    updated = Number(j.updated ?? 0);
    skipped = Number(j.skipped ?? 0);
  } catch {
    /* ignore */
  }
  const pr = await postTapdPullResult(t.id, { success: true, added, updated, skipped });
  if (!pr.ok) {
    bridgeLog("warn", "tapd_pull_result_post_failed", { taskId: t.id, text: pr.text });
    return "tapd_pull_result_fail:" + pr.text;
  }
  bridgeLog("info", "tapd_pull_ok", { taskId: t.id, added, updated, skipped });
  return "tapd_pull_ok:" + t.id + " added=" + added + " updated=" + updated + " skipped=" + skipped;
}

async function mergeRequirementFetchContext(
  requirementId: number,
  payload: { pageId?: string; dashenUrl?: string; title?: string }
): Promise<{ pageId: string; dashenUrl: string; title: string }> {
  const res = await apiFetch("/api/bridge/requirements/" + requirementId + "/context");
  const text = await res.text();
  if (!res.ok) throw new Error("context_http:" + text);
  const row = JSON.parse(text) as {
    pageId?: string | null;
    dashenUrl?: string | null;
    title?: string | null;
  };
  return {
    pageId: String(payload.pageId ?? row.pageId ?? "").trim(),
    dashenUrl: String(payload.dashenUrl ?? row.dashenUrl ?? "").trim(),
    title: String(payload.title ?? row.title ?? "").trim(),
  };
}

async function ensureDashenCookiesFresh(): Promise<void> {
  await refreshElectronSessionCookieHeader().catch(() => undefined);
}

async function handleMcpFetchDocTask(t: { id: number; payload: string }): Promise<string> {
  const payload = JSON.parse(t.payload) as {
    requirementId: number;
    tapdId?: string;
    pageId?: string;
    dashenUrl?: string;
    title?: string;
  };
  const rid = payload.requirementId;
  const dashenJson = cachedMcp?.dashen_mcp_json ?? "";
  try {
    await ensureDashenCookiesFresh();
    const ck = resolveDashenHttpCookie();
    const hasSso = /sso_/i.test(ck.value);
    if (ck.source !== "none" && ck.value.length > 0) {
      bridgeLog("info", "dashen_http_cookie_ready", {
        source: ck.source,
        cookieChars: ck.value.length,
        hasSso,
      });
    } else {
      bridgeLog("warn", "dashen_http_cookie_missing", {
        hint: "请先在桥C「大神登录」Tab完成SSO，点「刷新登录态」后再生成",
      });
    }
    const ctx = await mergeRequirementFetchContext(rid, payload);
    const fetchResult = await fetchDashenMarkdownForRequirement(dashenJson, ctx);
    const { raw, page_id, dashen_url, resolved_via_url, cql_used, resolve_via, fetch_via } =
      fetchResult;
    const r2 = await apiFetch("/api/bridge/tasks/" + t.id + "/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        raw_markdown: raw,
        page_id: page_id,
      }),
    });
    const t2 = await r2.text();
    if (!r2.ok) {
      bridgeLog("error", "mcp_fetch_result_failed", { taskId: t.id, text: t2 });
      return "task_fail:" + t2;
    }
    await writeLocalMdFromCloud(rid).catch(() => undefined);
    const contentKind =
      raw.includes("<h2>") || raw.includes("<p>") ? "storage_html" : "other";
    bridgeLog("info", "mcp_fetch_ok", {
      taskId: t.id,
      requirementId: rid,
      pageId: page_id,
      dashenUrl: dashen_url ? dashen_url.slice(0, 200) : undefined,
      resolved_via_url,
      resolve_via,
      fetch_via,
      cql_used: cql_used ? cql_used.slice(0, 240) : undefined,
      raw_char_length: raw.length,
      content_kind: contentKind,
      raw_preview: raw.slice(0, 280).replace(/\s+/g, " "),
    });
    return "task_ok:" + t.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const ckFail = resolveDashenHttpCookie();
    bridgeLog("error", "mcp_fetch_failed", {
      taskId: t.id,
      requirementId: rid,
      error: msg,
      cookieSource: ckFail.source,
      cookieChars: ckFail.value.length,
      hasSso: /sso_/i.test(ckFail.value),
      searchSpace: process.env.BRIDGE_DASHEN_SEARCH_SPACE ?? "",
    });
    const r2 = await apiFetch("/api/bridge/tasks/" + t.id + "/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: msg, raw_markdown: "" }),
    });
    await r2.text();
    return "task_fail:" + msg;
  }
}

async function runOnePollCycle(): Promise<string> {
  const token = store.get("bridgeToken").trim();
  const base = store.get("apiBase").trim();
  if (!token || !base) {
    return "skip_no_auth";
  }
  try {
    await refreshBridgeMcpFromApi();
    if (cachedMcp) {
      const fp = mcpBundleFingerprint(cachedMcp);
      if (fp !== lastAnnouncedMcpFingerprint) {
        lastAnnouncedMcpFingerprint = fp;
        bridgeLog("info", "bridge_mcp_config_updated", {
          tapdLen: cachedMcp.tapd_mcp_json.length,
          dashenLen: cachedMcp.dashen_mcp_json.length,
          fingerprint: fp,
        });
      }
    }
  } catch (e) {
    lastAnnouncedMcpFingerprint = "";
    const msg = e instanceof Error ? e.message : String(e);
    bridgeLog("error", "bridge_config_refresh_failed", { error: msg });
    return "config_fail:" + msg;
  }

  const res = await apiFetch("/api/bridge/tasks?limit=8");
  const text = await res.text();
  if (!res.ok) return "tasks_fetch_failed:" + text;
  const data = JSON.parse(text) as { tasks: { id: number; type: string; payload: string }[] };
  const tasks = data.tasks ?? [];
  if (!tasks.length) return "no_pending_tasks";

  const lines: string[] = [];
  for (const t of tasks) {
    if (taskInFlight.has(t.id)) {
      lines.push("skip_inflight:" + t.id);
      continue;
    }
    taskInFlight.add(t.id);
    try {
      if (t.type === TASK_TAPD_PULL) {
        lines.push(await handleTapdPullTask(t));
      } else if (t.type === TASK_MCP_FETCH) {
        lines.push(await handleMcpFetchDocTask(t));
      } else {
        lines.push("skip_task:" + t.type);
      }
    } finally {
      taskInFlight.delete(t.id);
    }
  }
  return lines.join("\n");
}

ipcMain.handle("yy:getSettings", async () => store.store);
ipcMain.handle("yy:setSettings", async (_e, s: Partial<Settings>) => {
  const cur = store.store as Settings;
  store.set({ ...cur, ...s });
  syncDashenBridgeEnvFromStore();
});

ipcMain.handle("yy:pullProjects", async () => {
  const res = await apiFetch("/api/bridge/projects");
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return JSON.parse(text);
});

function dashenLoginPageUrlFromStore(): string {
  const u = String((store.store as Settings).dashenLoginPageUrl ?? "").trim();
  return u || DEFAULT_DASHEN_LOGIN_URL;
}

/** 从内嵌 webview 分区刷新 Cookie，并写日志（不含 Cookie 正文） */
ipcMain.handle("yy:refreshDashenCookies", async () => {
  const st = await getDashenLoginCookieStatus();
  bridgeLog("info", "dashen_electron_cookies_refreshed", {
    cookieChars: st.cookieChars,
    hasSso: st.hasSso,
    cookieCount: st.cookieCount,
  });
  return st;
});

ipcMain.handle("yy:getDashenLoginUrl", async () => ({
  url: dashenLoginPageUrlFromStore(),
}));

ipcMain.handle("yy:pollTasksOnce", async (): Promise<string> => {
  await sendHeartbeat().catch(() => undefined);
  return runOnePollCycle();
});

/** 主界面「测试短链」：与生成任务相同的 HTTP 跟链解析（不写库） */
ipcMain.handle(
  "yy:testDashenShortLink",
  async (
    _e,
    payload: { url?: string }
  ): Promise<{
    ok: boolean;
    pageId?: string | null;
    finalUrl?: string | null;
    cookieSource: string;
    error?: string;
    detail?: string;
  }> => {
    const u = String(payload?.url ?? "").trim();
    if (!u) {
      return { ok: false, cookieSource: "none", error: "empty_url" };
    }
    try {
      await refreshBridgeMcpFromApi();
    } catch (e) {
      return {
        ok: false,
        cookieSource: "none",
        error: "bridge_config",
        detail: e instanceof Error ? e.message : String(e),
      };
    }
    const dashenJson = cachedMcp?.dashen_mcp_json ?? "";
    if (!dashenJson.trim()) {
      return { ok: false, cookieSource: "none", error: "no_dashen_mcp" };
    }
    syncDashenBridgeEnvFromStore();
    await ensureDashenCookiesFresh();
    const ck = resolveDashenHttpCookie();
    const hdrs = tryParseStreamableHttpHeaders(dashenJson);
    try {
      const r = await resolveDashenPageIdByHttpRedirects(u, hdrs);
      if (r?.pageId) {
        return {
          ok: true,
          pageId: r.pageId,
          finalUrl: r.finalUrl ?? null,
          cookieSource: ck.source,
        };
      }
      return {
        ok: false,
        cookieSource: ck.source,
        error: "no_page_id",
        detail: "HTTP 跟链未得到 pageId（可加 Cookie/脚本或填 CQL 空间后重试）",
      };
    } catch (e) {
      return {
        ok: false,
        cookieSource: ck.source,
        error: "resolve_exception",
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }
);

let pollTimer: ReturnType<typeof setInterval> | null = null;
let hbTimer: ReturnType<typeof setInterval> | null = null;

function startBackgroundLoops(): void {
  if (pollTimer) clearInterval(pollTimer);
  if (hbTimer) clearInterval(hbTimer);
  hbTimer = setInterval(() => {
    if (!store.get("autoPoll")) return;
    void sendHeartbeat().catch(() => undefined);
    void refreshElectronSessionCookieHeader().catch(() => undefined);
  }, 8000);
  pollTimer = setInterval(() => {
    if (!store.get("autoPoll")) return;
    void runOnePollCycle().catch((e) =>
      bridgeLog("error", "poll_cycle_uncaught", { error: e instanceof Error ? e.message : String(e) })
    );
  }, 10_000);
}

function windowIconPath(): string | undefined {
  const base = path.join(__dirname, "..", "assets");
  const ico = path.join(base, "icon.ico");
  const png = path.join(base, "icon.png");
  if (fsSync.existsSync(ico)) return ico;
  if (fsSync.existsSync(png)) return png;
  return undefined;
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 920,
    height: 880,
    icon: windowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });
  const htmlPath = path.join(app.getAppPath(), "renderer", "index.html");
  win.loadFile(htmlPath).catch(() => {
    win.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent("<h3>桥C</h3><p>缺少 renderer/index.html</p>")
    );
  });
}

app.whenReady().then(() => {
  syncDashenBridgeEnvFromStore();
  void refreshElectronSessionCookieHeader().catch(() => undefined);
  createWindow();
  startBackgroundLoops();
});
