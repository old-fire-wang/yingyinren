import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const dataDir = join(__dirname, "data");
const modelLibraryCachePath = join(dataDir, "model-library-cache.json");
const latestSqlJobCachePath = join(dataDir, "latest-sql-job.json");
const port = Number(process.env.PORT || 5177);
const oneServiceBaseUrl = "https://oneservice.zhuanspirit.com";
const sqlJobs = new Map();
let modelLibraryCache = null;
let modelLibraryIndex = null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(body);
}

function sendCorsPreflight(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  });
  res.end();
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  return JSON.parse(text);
}

function toFormBody(params) {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => body.set(key, value));
  return body;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readDefaultNoResultSql() {
  return readFile(join(__dirname, "sql/no-result.sql"), "utf8");
}

async function readDefaultModelLibrarySql() {
  return readFile(join(__dirname, "sql/model-library.sql"), "utf8");
}

async function prepareNoResultSql({ startDate, endDate, sqlTemplate }) {
  const start = String(startDate || "").trim();
  const end = String(endDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new Error("请选择正确的时间段，日期格式为 YYYY-MM-DD");
  }
  if (start > end) {
    throw new Error("开始日期不能晚于结束日期");
  }
  const template = String(sqlTemplate || "").trim() || (await readDefaultNoResultSql());
  const sql = template
    .replaceAll("${startDate}", start)
    .replaceAll("${endDate}", end)
    .replaceAll("${start_date}", start)
    .replaceAll("${end_date}", end)
    .replaceAll("${outFileSuffix}", end)
    .replaceAll("${hiveconf:start_date}", `'${start}'`)
    .replaceAll("${hiveconf:end_date}", `'${end}'`);
  const singleSelectSql = sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*set\s+/i.test(line))
    .join("\n")
    .replace(/;\s*$/g, "")
    .trim();
  if (!/\bselect\b/i.test(singleSelectSql)) {
    throw new Error("SQL 中没有识别到 select 查询，请检查 SQL 配置。");
  }
  return singleSelectSql;
}

async function prepareModelLibrarySql({ date, sqlTemplate }) {
  const targetDate = String(date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error("请选择正确的机型库日期，日期格式为 YYYY-MM-DD");
  }
  const template = String(sqlTemplate || "").trim() || (await readDefaultModelLibrarySql());
  const sql = template
    .replaceAll("${date}", targetDate)
    .replaceAll("${startDate}", targetDate)
    .replaceAll("${endDate}", targetDate)
    .replaceAll("${outFileSuffix}", targetDate);
  const singleSelectSql = sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*set\s+/i.test(line))
    .join("\n")
    .replace(/;\s*$/g, "")
    .trim();
  if (!/\bselect\b/i.test(singleSelectSql)) {
    throw new Error("机型库 SQL 中没有识别到 select 查询，请检查 SQL 配置。");
  }
  return singleSelectSql;
}

function detectDelimiter(line) {
  if (String(line || "").includes("\t")) return "\t";
  return ",";
}

function parseDelimitedLine(line, delimiter = ",") {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function tokenizeSearchText(value) {
  const text = String(value || "").normalize("NFKC").toLowerCase();
  return (text.match(/[\p{Script=Han}]+|[a-z0-9]+/gu) || [])
    .map((token) => token.trim())
    .filter((token) => {
      if (!token) return false;
      if (/^[a-z]+$/i.test(token)) return token.length >= 3;
      return token.length >= 2;
    });
}

function uniqueTokens(...groups) {
  return [...new Set(groups.flat().filter(Boolean))];
}

function parseModelLibraryText(text) {
  const clean = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!clean) return [];
  const lines = clean.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines[0]);
  const first = parseDelimitedLine(lines[0], delimiter);
  const normalizedHeaders = first.map((cell) => cell.trim().toLowerCase());
  const hasHeader = normalizedHeaders.some((cell) =>
    ["model_id", "model_name", "brand_name", "cate_name", "category_name", "型号", "机型名称"].includes(cell),
  );
  const headers = hasHeader ? normalizedHeaders : first.map((_, index) => `col_${index}`);
  const body = hasHeader ? lines.slice(1) : lines;
  const seen = new Set();
  return body
    .map((line) => {
      const cells = parseDelimitedLine(line, delimiter);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = cells[index] ?? "";
      });
      const modelName = String(row.model_name || row["型号"] || row["机型名称"] || row.col_4 || row.col_1 || row.col_0 || "").trim();
      const brandName = String(row.brand_name || row["品牌"] || row.col_2 || "").trim();
      const categoryName = String(row.category_name || row.cate_name || row["品类"] || row.col_0 || "").trim();
      const normalized = normalizeSearchText(modelName);
      const modelId = String(row.model_id || row["机型id"] || row.col_5 || row.col_0 || "").trim();
      const dedupeKey = modelId || `${normalizeSearchText(brandName)}:${normalized}:${normalizeSearchText(categoryName)}`;
      if (!modelName || !normalized || seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);
      const fullName = `${brandName} ${modelName}`.trim();
      return {
        model_id: modelId,
        brand_id: String(row.brand_id || row["品牌id"] || row.col_3 || "").trim(),
        category_id: String(row.cate_id || row.category_id || row["品类id"] || row.col_1 || "").trim(),
        model_name: modelName,
        brand_name: brandName,
        category_name: categoryName,
        normalized,
        full_normalized: normalizeSearchText(fullName),
        model_tokens: uniqueTokens(tokenizeSearchText(modelName)),
        brand_tokens: uniqueTokens(tokenizeSearchText(brandName)),
      };
    })
    .filter(Boolean);
}

async function readModelLibraryCache() {
  if (modelLibraryCache) return modelLibraryCache;
  try {
    const text = await readFile(modelLibraryCachePath, "utf8");
    const payload = JSON.parse(text);
    modelLibraryCache = {
      updatedAt: payload.updatedAt || "",
      sourceTaskId: payload.sourceTaskId || "",
      count: Number(payload.count || payload.items?.length || 0),
      items: Array.isArray(payload.items) ? payload.items : [],
    };
  } catch {
    modelLibraryCache = { updatedAt: "", sourceTaskId: "", count: 0, items: [] };
  }
  return modelLibraryCache;
}

function buildModelLibraryIndex(items = []) {
  const normalizedMap = new Map();
  const rawMap = new Map();
  const fullMap = new Map();
  const tokenMap = new Map();
  const prefixMap = new Map();
  const addMappedItem = (map, key, item) => {
    if (!key) return;
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  };
  items.forEach((item) => {
    const rawKey = String(item.model_name || "").normalize("NFKC").toLowerCase();
    if (rawKey && !rawMap.has(rawKey)) rawMap.set(rawKey, item);
    if (item.normalized && !normalizedMap.has(item.normalized)) normalizedMap.set(item.normalized, item);
    if (item.full_normalized && !fullMap.has(item.full_normalized)) fullMap.set(item.full_normalized, item);
    uniqueTokens(item.model_tokens || [], item.brand_tokens || []).forEach((token) => {
      const norm = normalizeSearchText(token);
      if (!norm) return;
      addMappedItem(tokenMap, norm, item);
      if (norm.length >= 4) addMappedItem(prefixMap, norm.slice(0, 4), item);
    });
    if (item.normalized?.length >= 4) addMappedItem(prefixMap, item.normalized.slice(0, 4), item);
  });
  return { items, normalizedMap, rawMap, fullMap, tokenMap, prefixMap };
}

function getModelLibraryIndex(cache) {
  if (modelLibraryIndex && modelLibraryIndex.items === cache.items) return modelLibraryIndex;
  modelLibraryIndex = buildModelLibraryIndex(cache.items || []);
  return modelLibraryIndex;
}

function modelLibraryItemKey(item) {
  return String(item.model_id || "").trim() || [
    normalizeSearchText(item.category_name),
    normalizeSearchText(item.brand_name),
    normalizeSearchText(item.model_name),
  ].join(":");
}

function mergeModelLibraryItems(existingItems = [], incomingItems = []) {
  const merged = [];
  const indexByKey = new Map();
  for (const item of existingItems) {
    const key = modelLibraryItemKey(item);
    if (!key || indexByKey.has(key)) continue;
    indexByKey.set(key, merged.length);
    merged.push(item);
  }
  let addedCount = 0;
  let updatedCount = 0;
  for (const item of incomingItems) {
    const key = modelLibraryItemKey(item);
    if (!key) continue;
    const existingIndex = indexByKey.get(key);
    if (existingIndex == null) {
      indexByKey.set(key, merged.length);
      merged.push(item);
      addedCount += 1;
    } else {
      merged[existingIndex] = { ...merged[existingIndex], ...item };
      updatedCount += 1;
    }
  }
  return { items: merged, addedCount, updatedCount };
}

async function writeModelLibraryCache({ items, sourceTaskId, merge = false }) {
  const previous = merge ? await readModelLibraryCache() : { items: [] };
  const merged = merge ? mergeModelLibraryItems(previous.items || [], items) : { items, addedCount: items.length, updatedCount: 0 };
  const payload = {
    updatedAt: new Date().toISOString(),
    sourceTaskId,
    count: merged.items.length,
    addedCount: merged.addedCount,
    updatedCount: merged.updatedCount,
    items: merged.items,
  };
  await mkdir(dataDir, { recursive: true });
  await writeFile(modelLibraryCachePath, JSON.stringify(payload), "utf8");
  modelLibraryCache = payload;
  modelLibraryIndex = buildModelLibraryIndex(payload.items);
  return payload;
}

async function writeLatestSqlJobCache(job) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    latestSqlJobCachePath,
    JSON.stringify({
      id: job.id,
      taskId: job.taskId,
      status: job.status,
      resultText: job.resultText,
      updatedAt: job.updatedAt,
    }),
    "utf8",
  );
}

function modelLibraryMeta(cache) {
  return {
    updatedAt: cache?.updatedAt || "",
    sourceTaskId: cache?.sourceTaskId || "",
    count: Number(cache?.count || cache?.items?.length || 0),
    addedCount: Number(cache?.addedCount || 0),
    updatedCount: Number(cache?.updatedCount || 0),
  };
}

function modelCandidate(item, matchType, confidence, evidence = "") {
  return {
    model_id: item.model_id || "",
    model_name: item.model_name || "",
    brand_id: item.brand_id || "",
    brand_name: item.brand_name || "",
    category_id: item.category_id || "",
    category_name: item.category_name || "",
    match_type: matchType,
    confidence: Math.max(0, Math.min(100, Math.round(confidence || 0))),
    evidence,
  };
}

function ngramDice(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!left || !right) return 0;
  if (left === right) return 1;
  const size = Math.min(left.length, right.length) <= 3 ? 1 : 2;
  const grams = (value) => {
    const set = new Set();
    for (let i = 0; i <= value.length - size; i += 1) set.add(value.slice(i, i + size));
    return set;
  };
  const aSet = grams(left);
  const bSet = grams(right);
  let intersection = 0;
  aSet.forEach((gram) => {
    if (bSet.has(gram)) intersection += 1;
  });
  return (2 * intersection) / Math.max(1, aSet.size + bSet.size);
}

function scoreModelCandidate({ rawLower, normalized, queryTokens }, item) {
  const modelNorm = item.normalized || "";
  const fullNorm = item.full_normalized || modelNorm;
  if (!modelNorm) return null;
  if (rawLower && rawLower === String(item.model_name || "").normalize("NFKC").toLowerCase()) {
    return modelCandidate(item, "精确", 100, "query 与标准机型名称完全一致");
  }
  if (normalized === fullNorm) return modelCandidate(item, "品牌型号归一化", 98, "query 与品牌+机型归一化后一致");
  if (normalized === modelNorm) return modelCandidate(item, "归一化", 96, "query 与标准机型归一化后一致");

  const containsModel = normalized.length >= 4 && modelNorm.length >= 4 && normalized.includes(modelNorm);
  const modelContainsQuery = normalized.length >= 4 && modelNorm.length >= 4 && modelNorm.includes(normalized);
  if (containsModel || modelContainsQuery) {
    const ratio = Math.min(modelNorm.length, normalized.length) / Math.max(modelNorm.length, normalized.length);
    return modelCandidate(item, "包含", 78 + ratio * 16, containsModel ? "query 包含标准机型名" : "标准机型名包含 query");
  }

  const brandHit = (item.brand_tokens || []).some((token) => normalized.includes(normalizeSearchText(token)));
  const modelTokenHits = (item.model_tokens || []).filter((token) => {
    const norm = normalizeSearchText(token);
    if (/^[a-z]+$/i.test(norm) && norm.length < 3) return false;
    return norm.length >= 2 && (normalized.includes(norm) || queryTokens.includes(norm));
  });
  if (brandHit && modelTokenHits.length) {
    return modelCandidate(item, "品牌+型号词命中", 92 + Math.min(modelTokenHits.length, 2) * 2, `命中品牌和型号片段：${modelTokenHits.join("/")}`);
  }
  if (modelTokenHits.length) {
    const tokenLength = modelTokenHits.join("").length;
    const coverage = tokenLength / Math.max(modelNorm.length, normalized.length, 1);
    return modelCandidate(item, "型号词命中", 62 + coverage * 24, `命中型号片段：${modelTokenHits.join("/")}`);
  }

  const dice = Math.max(ngramDice(normalized, modelNorm), ngramDice(normalized, fullNorm));
  if (dice >= 0.58) return modelCandidate(item, "模糊", 48 + dice * 35, "query 与机型名称字符相似");
  return null;
}

function classifyGovernance(query, candidates) {
  const raw = String(query || "").trim();
  const normalized = normalizeSearchText(raw);
  const tokens = tokenizeSearchText(raw);
  const best = candidates[0];
  const hasAfterSalesIntent = /(回收|估价|价格|多少钱|质检|客服|售后|流程|上门|邮寄|换钱|卖)/i.test(raw);
  const isInvalid = !normalized || normalized.length <= 1 || /^[0-9]+$/.test(normalized);

  if (isInvalid) {
    return {
      is_governable: false,
      governance_type: "无效搜索",
      governance_owner: "无需处理",
      no_result_reason: "搜索词过短、纯数字或无有效语义",
      recommended_action: "忽略",
      risk_level: "低",
    };
  }
  if (best?.confidence >= 85) {
    return {
      is_governable: true,
      governance_type: best.match_type.includes("品牌") || best.match_type.includes("型号词") ? "品牌/型号别名缺失" : "搜索召回失败",
      governance_owner: "运营/搜索策略",
      no_result_reason: "可回收型号库中存在高置信候选，但线上搜索无结果",
      recommended_action: "优先补同义词/别名，并验证搜索是否可召回",
      risk_level: best.confidence >= 95 ? "低" : "中",
    };
  }
  if (best?.confidence >= 60) {
    return {
      is_governable: true,
      governance_type: "疑似可治理",
      governance_owner: "运营人工确认",
      no_result_reason: "可回收型号库存在中置信候选，需要确认是否为同一机型",
      recommended_action: "人工核对 Top 候选后再决定补同义词或提搜索问题",
      risk_level: "中",
    };
  }
  if (hasAfterSalesIntent) {
    return {
      is_governable: true,
      governance_type: "FAQ/流程承接",
      governance_owner: "运营/客服",
      no_result_reason: "query 更像流程、价格、售后或回收咨询，不是明确机型召回",
      recommended_action: "补帮助承接、FAQ 或搜索运营词",
      risk_level: "低",
    };
  }
  if (tokens.length >= 2 || /[\p{Script=Han}]+[a-z0-9]+|[a-z0-9]+[\p{Script=Han}]+/iu.test(raw)) {
    return {
      is_governable: true,
      governance_type: "疑似机型库缺失/业务暂不支持",
      governance_owner: "机型库/业务供给",
      no_result_reason: "query 像品牌型号组合，但可回收型号库未命中",
      recommended_action: "进入供给确认清单，确认是否应新增机型或标记暂不支持",
      risk_level: "中",
    };
  }
  return {
    is_governable: false,
    governance_type: "人工确认",
    governance_owner: "运营",
    no_result_reason: "未命中可回收型号库，且缺少明确机型或流程意图",
    recommended_action: "低优先级人工抽检",
    risk_level: "中",
  };
}

function matchOneModelLibrary(query, index) {
  const raw = String(query || "").trim();
  const normalized = normalizeSearchText(raw);
  const queryTokens = tokenizeSearchText(raw).map(normalizeSearchText);
  const items = index.items || [];
  if (!normalized || !items.length) {
    const governance = classifyGovernance(raw, []);
    return { model_library_hit: false, hit_category: "", hit_brand: "", hit_model: "", match_type: "未命中", confidence: 0, top_model_candidates: [], ...governance };
  }
  const rawLower = raw.normalize("NFKC").toLowerCase();
  const seeded = [
    index.rawMap.get(rawLower) ? modelCandidate(index.rawMap.get(rawLower), "精确", 100, "query 与标准机型名称完全一致") : null,
    index.fullMap.get(normalized) ? modelCandidate(index.fullMap.get(normalized), "品牌型号归一化", 98, "query 与品牌+机型归一化后一致") : null,
    index.normalizedMap.get(normalized) ? modelCandidate(index.normalizedMap.get(normalized), "归一化", 96, "query 与标准机型归一化后一致") : null,
  ].filter(Boolean);
  const scored = [];
  const seen = new Set();
  for (const candidate of seeded) {
    const key = candidate.model_id || `${candidate.brand_name}-${candidate.model_name}`;
    if (!seen.has(key)) {
      seen.add(key);
      scored.push(candidate);
    }
  }
  const candidateItems = new Map();
  const addCandidateItem = (item) => {
    if (!item) return;
    const key = item.model_id || `${item.brand_name}-${item.model_name}`;
    if (!seen.has(key) && !candidateItems.has(key)) candidateItems.set(key, item);
  };
  for (const token of queryTokens) {
    (index.tokenMap.get(token) || []).forEach(addCandidateItem);
    if (token.length >= 4) (index.prefixMap.get(token.slice(0, 4)) || []).forEach(addCandidateItem);
  }
  if (normalized.length >= 4) (index.prefixMap.get(normalized.slice(0, 4)) || []).forEach(addCandidateItem);
  if (candidateItems.size < 30 && normalized.length >= 5) {
    for (let i = 0; i <= normalized.length - 4; i += 1) {
      (index.prefixMap.get(normalized.slice(i, i + 4)) || []).forEach(addCandidateItem);
      if (candidateItems.size >= 120) break;
    }
  }
  for (const item of candidateItems.values()) {
    const key = item.model_id || `${item.brand_name}-${item.model_name}`;
    if (seen.has(key)) continue;
    const candidate = scoreModelCandidate({ rawLower, normalized, queryTokens }, item);
    if (!candidate || candidate.confidence < 55) continue;
    seen.add(key);
    scored.push(candidate);
  }
  const candidates = scored.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  const best = candidates[0];
  const governance = classifyGovernance(raw, candidates);
  if (!best) return { model_library_hit: false, hit_category: "", hit_brand: "", hit_model: "", match_type: "未命中", confidence: 0, top_model_candidates: [], ...governance };
  return {
    model_library_hit: best.confidence >= 60,
    hit_category: best.category_name || "",
    hit_brand: best.brand_name || "",
    hit_model: best.model_name || "",
    hit_model_id: best.model_id || "",
    match_type: best.match_type || "模糊",
    confidence: best.confidence || 0,
    top_model_candidates: candidates,
    ...governance,
  };
}

async function matchModelLibraryRows(rows) {
  const cache = await readModelLibraryCache();
  const index = getModelLibraryIndex(cache);
  return rows.map((row) => ({
    query: String(row.query || "").trim(),
    ...matchOneModelLibrary(row.query, index),
  }));
}

function extractTaskId(payload) {
  if (!payload) return "";
  if (typeof payload === "string") {
    const text = payload.trim();
    try {
      return extractTaskId(JSON.parse(text));
    } catch {}
    const match = text.match(/[A-Za-z0-9_-]{6,}/);
    return match?.[0] || "";
  }
  return (
    payload.taskId ||
    payload.data?.taskId ||
    payload.result?.taskId ||
    payload.task_id ||
    payload.data?.task_id ||
    payload.execute_id ||
    payload.data?.execute_id ||
    payload.respData?.execute_id ||
    payload.respData?.data?.execute_id ||
    payload.msg ||
    ""
  );
}

function getProgressStatus(payload) {
  const nestedData = payload?.respData?.data;
  if (Array.isArray(nestedData)) {
    const nestedStatus = nestedData.find((item) => item?.status)?.status;
    if (nestedStatus) return String(nestedStatus).toLowerCase();
  }
  if (nestedData && typeof nestedData === "object" && nestedData.status) {
    return String(nestedData.status).toLowerCase();
  }
  const value =
    payload?.queryTaskProgress ||
    payload?.data?.queryTaskProgress ||
    payload?.status ||
    payload?.data?.status ||
    payload?.respData?.status ||
    payload?.respData?.data?.status ||
    payload?.respData?.data?.queryTaskProgress ||
    payload?.result?.status ||
    payload?.state ||
    "";
  return String(value || "").toLowerCase();
}

function getProgressError(payload) {
  const nestedData = payload?.respData?.data;
  if (Array.isArray(nestedData)) {
    const failed = nestedData.find((item) => item?.error_msg || item?.errorMsg || item?.msg);
    if (failed) return failed.error_msg || failed.errorMsg || failed.msg || "";
  }
  if (nestedData && typeof nestedData === "object") {
    return nestedData.error_msg || nestedData.errorMsg || nestedData.msg || "";
  }
  return payload?.error_msg || payload?.errorMsg || payload?.msg || payload?.respData?.msg || "";
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function looksLikeTableText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("<")) return false;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return false;
  if (/key_word|search_uv|search_pv|is_result/.test(lines[0])) return true;
  if (/model_name|brand_name|cate_name|category_name|model_id/.test(lines[0])) return true;
  if (lines.length < 2) return false;
  return lines.some((line) => line.includes("\t") || line.split(",").length >= 3);
}

function extractResultCandidate(value, seen = new Set()) {
  if (value == null) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    if (/^https?:\/\//i.test(text)) return { type: "url", value: text };
    const parsed = parseJsonSafe(text);
    if (parsed) return extractResultCandidate(parsed, seen);
    if (looksLikeTableText(text)) return { type: "text", value: text };
    return null;
  }
  if (Array.isArray(value)) {
    if (value.length && value.every((item) => typeof item === "string")) {
      const text = value.join("\n");
      if (looksLikeTableText(text)) return { type: "text", value: text };
    }
    if (value.length && value.every((item) => Array.isArray(item))) {
      const text = value.map((item) => item.join("\t")).join("\n");
      if (looksLikeTableText(text)) return { type: "text", value: text };
    }
    if (
      value.length &&
      value.every((item) => item && typeof item === "object" && !Array.isArray(item)) &&
      value.some((item) => "key_word" in item || "search_uv" in item || "search_pv" in item)
    ) {
      const headers = ["key_word", "is_result", "search_uv", "search_pv"];
      const rows = value.map((item) => headers.map((header) => item[header] ?? "").join("\t"));
      return { type: "text", value: [headers.join("\t"), ...rows].join("\n") };
    }
    if (
      value.length &&
      value.every((item) => item && typeof item === "object" && !Array.isArray(item)) &&
      value.some((item) => "model_name" in item || "brand_name" in item || "cate_name" in item || "model_id" in item)
    ) {
      const headers = ["cate_name", "cate_id", "brand_name", "brand_id", "model_name", "model_id"];
      const rows = value.map((item) => headers.map((header) => item[header] ?? "").join("\t"));
      return { type: "text", value: [headers.join("\t"), ...rows].join("\n") };
    }
    for (const item of value) {
      const candidate = extractResultCandidate(item, seen);
      if (candidate) return candidate;
    }
    return null;
  }
  if (typeof value === "object") {
    if (seen.has(value)) return null;
    seen.add(value);
    const preferredKeys = [
      "downloadUrl",
      "download_url",
      "url",
      "fileUrl",
      "file_url",
      "resultUrl",
      "result_url",
      "result",
      "resultText",
      "data",
      "respData",
      "rows",
    ];
    for (const key of preferredKeys) {
      if (key in value) {
        const candidate = extractResultCandidate(value[key], seen);
        if (candidate) return candidate;
      }
    }
    for (const item of Object.values(value)) {
      const candidate = extractResultCandidate(item, seen);
      if (candidate) return candidate;
    }
  }
  return null;
}

function normalizeResultText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  if (looksLikeTableText(trimmed)) return trimmed;
  const parsed = parseJsonSafe(trimmed);
  if (!parsed) return "";
  const candidate = extractResultCandidate(parsed);
  return candidate?.type === "text" ? candidate.value : "";
}

function isLikelyResultText(text) {
  return Boolean(normalizeResultText(text));
}

function createSqlJob() {
  const id = `sql_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const job = {
    id,
    status: "running",
    taskId: "",
    resultText: "",
    error: "",
    logs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  sqlJobs.set(id, job);
  while (sqlJobs.size > 30) {
    sqlJobs.delete(sqlJobs.keys().next().value);
  }
  return job;
}

function logSqlJob(job, text) {
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  job.logs.push(`[${time}] ${text}`);
  job.updatedAt = new Date().toISOString();
  console.log(`[sql-job:${job.id}] ${text}`);
}

async function submitSqlTask({ sql, oaName58, accessKey }) {
  const response = await fetch(`${oneServiceBaseUrl}/sqlTask/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: toFormBody({ sql, oaName58, accessKey }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`提交 SQL 失败：${response.status} ${text.slice(0, 160)}`);
  const taskId = extractTaskId(text);
  if (!taskId) throw new Error(`提交成功但没有识别到 taskId：${text.slice(0, 160)}`);
  return taskId;
}

async function waitForSqlTask(taskId, job) {
  const pollIntervalMs = 3000;
  const maxPolls = 400;
  for (let index = 0; index < maxPolls; index += 1) {
    const response = await fetch(`${oneServiceBaseUrl}/sqlTask/queryTaskProgress/${taskId}`);
    const text = await response.text();
    if (!response.ok) throw new Error(`查询任务状态失败：${response.status} ${text.slice(0, 200)}`);
    let payload = {};
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { status: text };
    }
    const status = getProgressStatus(payload);
    if (job && (index === 0 || index % 5 === 0)) {
      logSqlJob(job, `数据平台执行中，已等待约 ${Math.round((index * pollIntervalMs) / 1000)} 秒，状态：${status || "未返回明确状态"}`);
    }
    if (["success", "succeed", "finished", "finish", "done"].includes(status)) return payload;
    if (["failed", "fail", "error", "killed"].includes(status)) {
      const message = getProgressError(payload) || text;
      throw new Error(`SQL 执行失败：${String(message).slice(0, 360)}`);
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`SQL 等待超时：本地已等待约 20 分钟仍未完成。taskId：${taskId}。这通常表示数据平台仍在排队或执行中，不代表 SQL 一定失败，请到数据平台按 taskId 查看任务状态。`);
}

async function downloadSqlResult({ taskId, oaName58, accessKey }) {
  const url = `${oneServiceBaseUrl}/sqlTask/downloadTaskResult/${taskId}?${new URLSearchParams({
    oaName58,
    accessKey,
  })}`;
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`下载结果失败：${response.status} ${text.slice(0, 160)}`);
  return text;
}

async function fetchResultUrl(url) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`下载结果链接失败：${response.status} ${text.slice(0, 160)}`);
  return text;
}

async function querySqlResult({ taskId, oaName58, accessKey }) {
  const url = `${oneServiceBaseUrl}/sqlTask/queryTaskResult/${taskId}?${new URLSearchParams({
    oaName58,
    accessKey,
  })}`;
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`查询结果链接失败：${response.status} ${text.slice(0, 160)}`);
  const candidate = extractResultCandidate(text);
  if (!candidate) return "";
  if (candidate.type === "text") return candidate.value;
  if (candidate.type === "url") return fetchResultUrl(candidate.value);
  return "";
}

async function downloadSqlResultWithRetry({ taskId, oaName58, accessKey, job }) {
  const maxAttempts = 180;
  for (let index = 0; index < maxAttempts; index += 1) {
    const directText = await downloadSqlResult({ taskId, oaName58, accessKey });
    const normalizedDirectText = normalizeResultText(directText);
    if (normalizedDirectText) return normalizedDirectText;
    if (job && index === 0) {
      logSqlJob(job, "小结果下载接口未返回表格结果，切换到大结果集接口查询");
    }
    const queryText = await querySqlResult({ taskId, oaName58, accessKey });
    const normalizedQueryText = normalizeResultText(queryText);
    if (normalizedQueryText) return normalizedQueryText;
    if (job) logSqlJob(job, `结果文件尚未生成，等待下载重试 ${index + 1}/${maxAttempts}`);
    await sleep(3000);
  }
  throw new Error(`SQL 已完成但结果暂未生成，请稍后按 taskId ${taskId} 在数据平台查看或重试。`);
}

function normalizeBaseUrl(baseUrl) {
  let text = String(baseUrl || "https://api.openai.com/v1").trim().replace(/\s+/g, "");
  if (!text) text = "https://api.openai.com/v1";
  if (/^api\.openai\.com/i.test(text)) text = `https://${text}`;
  if (/^www\.packyapi\.com/i.test(text)) text = `https://${text}`;
  return text.replace(/\/+$/, "");
}

function resolveBaseUrl(config) {
  const model = String(config.model || "").toLowerCase();
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  if (model.includes("deepseek") && (!/^https?:\/\//i.test(baseUrl) || baseUrl.includes("api.openai.com"))) {
    return "https://www.packyapi.com/v1";
  }
  return baseUrl;
}

function chatCompletionsUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (/\/chat\/completions$/i.test(normalized)) return normalized;
  return `${normalized}/chat/completions`;
}

function makePrompt(rows) {
  return [
    {
      role: "system",
      content:
        "你是回收业务搜索治理助手。你的任务是分析无结果搜索词，判断哪些适合导入同义词后台，哪些不适合。只返回 JSON，不要 Markdown。字段必须严格符合要求。",
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          instructions: [
            "每个输入词输出一条结果。",
            "recommend_synonym 只有在用户词与标准词含义一致、低误召回风险、适合导入同义词后台时才为 true。",
            "具体型号缺失、电商长标题需要清洗、流程售后词、疑似不支持品类、无效搜索，通常不要直接进同义词后台。",
            "synonym 是建议填入同义词后台的标准召回词；不建议导入时可为空。",
            "query_type 枚举：具体型号、品牌型号混写、电商标题、宽泛品类、流程售后、疑似不支持、无效搜索、其他。",
            "action 枚举：导入同义词、补FAQ、标记暂不支持、后续提需求、忽略、人工确认。",
            "priority 枚举：P0、P1、P2。",
            "备注要短，说明推荐原因或风险。",
            "回收业务的真实型号底表可由 hdp_zhuanzhuan_rawdb_global.raw_t_model_full_1d 的 model_name 获得。分析时要优先判断用户词是否像真实回收机型/型号。",
            "如果输入行提供 model_library_hit、hit_model、match_type、confidence，必须优先使用这些命中信息；不要把已命中真实机型库的词误判为疑似不支持。",
            "如果输入行提供 top_model_candidates、governance_type、no_result_reason、recommended_action，必须把这些作为可治理识别证据，不要无依据推翻。",
            "confidence 使用 0-100 的整数。无法确认真实机型命中时，model_library_hit 为 false，match_type 填未命中，confidence 低于 60。",
          ],
          output_schema: {
            results: [
              {
                query: "原搜索词",
                query_type: "词类型",
                category: "解析品类或空",
                brand: "解析品牌或空",
                model: "解析型号或空",
                synonym: "建议标准词或空",
                recommend_synonym: true,
                action: "推荐动作",
                priority: "P0/P1/P2",
                note: "备注",
                model_library_hit: false,
                hit_category: "命中的回收品类或空",
                hit_brand: "命中的品牌或空",
                hit_model: "命中的型号或空",
                match_type: "精确/归一化/模糊/未命中",
                confidence: 0,
                is_governable: true,
                governance_type: "同义词缺失/搜索召回失败/机型库缺失/业务暂不支持/FAQ/流程承接/无效搜索/人工确认",
                governance_owner: "运营/搜索策略/机型库/业务供给/客服/无需处理",
                no_result_reason: "无结果原因",
                recommended_action: "推荐治理动作",
                risk_level: "低/中/高",
              },
            ],
          },
          rows,
        },
        null,
        2,
      ),
    },
  ];
}

function extractJson(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1]);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error("模型没有返回可解析的 JSON");
}

function normalizeResult(item, fallbackQuery) {
  return {
    query: String(item.query || fallbackQuery || "").trim(),
    query_type: String(item.query_type || "其他").trim(),
    category: String(item.category || "").trim(),
    brand: String(item.brand || "").trim(),
    model: String(item.model || "").trim(),
    synonym: String(item.synonym || "").trim(),
    recommend_synonym: Boolean(item.recommend_synonym),
    action: String(item.action || "人工确认").trim(),
    priority: String(item.priority || "P2").trim(),
    note: String(item.note || "").trim(),
    model_library_hit: Boolean(item.model_library_hit),
    hit_category: String(item.hit_category || "").trim(),
    hit_brand: String(item.hit_brand || "").trim(),
    hit_model: String(item.hit_model || "").trim(),
    match_type: String(item.match_type || (item.model_library_hit ? "模糊" : "未命中")).trim(),
    confidence: Number(item.confidence || 0),
    is_governable: Boolean(item.is_governable),
    governance_type: String(item.governance_type || "").trim(),
    governance_owner: String(item.governance_owner || "").trim(),
    no_result_reason: String(item.no_result_reason || "").trim(),
    recommended_action: String(item.recommended_action || "").trim(),
    risk_level: String(item.risk_level || "").trim(),
  };
}

async function analyzeBatchOnce({ config, rows }) {
  const baseUrl = resolveBaseUrl(config);
  const endpoint = chatCompletionsUrl(baseUrl);
  let response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 75000);
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || "gpt-4.1-mini",
        messages: makePrompt(rows),
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
  } catch (error) {
    const message = error.name === "AbortError" ? "模型响应超时" : error.message;
    throw new Error(
      `模型服务连接失败，请检查 Base URL 是否可访问：${baseUrl}。原始错误：${message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || response.statusText || "模型调用失败";
    throw new Error(message);
  }

  const text = payload?.choices?.[0]?.message?.content;
  const parsed = extractJson(text);
  const results = Array.isArray(parsed.results) ? parsed.results : [];
  return rows.map((row, index) => normalizeResult(results[index] || {}, row.query));
}

async function analyzeBatch({ config, rows }) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await analyzeBatchOnce({ config, rows });
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(900 * attempt);
    }
  }
  throw new Error(`${lastError?.message || "模型调用失败"}（已自动重试 2 次）`);
}

async function handleAnalyze(req, res) {
  try {
    const { config, rows } = await readJson(req);
    if (!config?.apiKey) throw new Error("请先配置模型 apiKey");
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("没有可分析的数据");
    const safeRows = rows.slice(0, 80).map((row) => ({
      query: String(row.query || "").trim(),
      search_uv: row.search_uv ?? "",
      search_pv: row.search_pv ?? "",
      model_library_hit: Boolean(row.model_library_hit),
      hit_category: row.hit_category || "",
      hit_brand: row.hit_brand || "",
      hit_model: row.hit_model || "",
      match_type: row.match_type || "",
          confidence: row.confidence ?? "",
          top_model_candidates: row.top_model_candidates || [],
          is_governable: Boolean(row.is_governable),
          governance_type: row.governance_type || "",
          governance_owner: row.governance_owner || "",
          no_result_reason: row.no_result_reason || "",
          recommended_action: row.recommended_action || "",
          risk_level: row.risk_level || "",
        }));
    const results = await analyzeBatch({ config, rows: safeRows });
    send(res, 200, JSON.stringify({ results }));
  } catch (error) {
    send(res, 400, JSON.stringify({ error: error.message || "分析失败" }));
  }
}

async function handleRunNoResultSql(req, res) {
  try {
    const { oaName58, accessKey, startDate, endDate, sqlTemplate } = await readJson(req);
    if (!oaName58) throw new Error("请填写 OA 账号");
    if (!accessKey) throw new Error("请填写 accessKey");
    await prepareNoResultSql({ startDate, endDate, sqlTemplate });
    const job = createSqlJob();
    logSqlJob(job, `创建 SQL 取数任务，时间段：${startDate} 至 ${endDate}`);
    send(res, 200, JSON.stringify({ jobId: job.id, status: job.status, logs: job.logs }));
    runSqlJob(job, { oaName58, accessKey, startDate, endDate, sqlTemplate });
  } catch (error) {
    send(res, 400, JSON.stringify({ error: error.message || "运行 SQL 失败" }));
  }
}

async function handleRunModelLibrarySql(req, res) {
  try {
    const { oaName58, accessKey, date, sqlTemplate } = await readJson(req);
    if (!oaName58) throw new Error("请填写 OA 账号");
    if (!accessKey) throw new Error("请填写 accessKey");
    await prepareModelLibrarySql({ date, sqlTemplate });
    const job = createSqlJob();
    job.kind = "model-library";
    logSqlJob(job, `创建底层机型库同步任务，数据日期：${date}`);
    send(res, 200, JSON.stringify({ jobId: job.id, status: job.status, logs: job.logs }));
    runModelLibrarySqlJob(job, { oaName58, accessKey, date, sqlTemplate });
  } catch (error) {
    send(res, 400, JSON.stringify({ error: error.message || "同步机型库失败" }));
  }
}

async function runSqlJob(job, { oaName58, accessKey, startDate, endDate, sqlTemplate }) {
  try {
    const sql = await prepareNoResultSql({ startDate, endDate, sqlTemplate });
    logSqlJob(job, "SQL 已生成，已使用单条 SELECT 模式，正在提交到 One-Service");
    const taskId = await submitSqlTask({ sql, oaName58, accessKey });
    job.taskId = taskId;
    logSqlJob(job, `提交成功，taskId：${taskId}`);
    await waitForSqlTask(taskId, job);
    logSqlJob(job, "SQL 执行完成，正在下载结果");
    const resultText = await downloadSqlResultWithRetry({ taskId, oaName58, accessKey, job });
    job.status = "success";
    job.resultText = resultText;
    await writeLatestSqlJobCache(job);
    logSqlJob(job, `结果下载完成，返回 ${resultText.length} 个字符`);
  } catch (error) {
    job.status = "failed";
    job.error = error.message || "SQL 任务失败";
    logSqlJob(job, `任务失败：${job.error}`);
  } finally {
    job.updatedAt = new Date().toISOString();
  }
}

async function runModelLibrarySqlJob(job, { oaName58, accessKey, date, sqlTemplate }) {
  try {
    const sql = await prepareModelLibrarySql({ date, sqlTemplate });
    logSqlJob(job, "机型库 SQL 已生成，正在提交到 One-Service");
    const taskId = await submitSqlTask({ sql, oaName58, accessKey });
    job.taskId = taskId;
    logSqlJob(job, `提交成功，taskId：${taskId}`);
    await waitForSqlTask(taskId, job);
    logSqlJob(job, "机型库 SQL 执行完成，正在下载结果");
    const resultText = await downloadSqlResultWithRetry({ taskId, oaName58, accessKey, job });
    const items = parseModelLibraryText(resultText);
    if (!items.length) throw new Error("机型库结果为空，未识别到 model_name，请检查 SQL 返回字段。");
    const cache = await writeModelLibraryCache({ items, sourceTaskId: taskId, merge: true });
    job.status = "success";
    job.resultText = "";
    job.modelLibraryMeta = modelLibraryMeta(cache);
    logSqlJob(job, `底层机型库同步完成，新增 ${cache.addedCount || 0} 个，更新 ${cache.updatedCount || 0} 个，累计缓存 ${cache.count} 个机型`);
  } catch (error) {
    job.status = "failed";
    job.error = error.message || "机型库同步失败";
    logSqlJob(job, `任务失败：${job.error}`);
  } finally {
    job.updatedAt = new Date().toISOString();
  }
}

function handleSqlJobStatus(req, res) {
  const jobId = decodeURIComponent((req.url || "").replace("/api/sql-job/", ""));
  const job = sqlJobs.get(jobId);
  if (!job) {
    send(res, 404, JSON.stringify({ error: "没有找到这个 SQL 任务，请重新运行。" }));
    return;
  }
  if (job.resultText) {
    const normalized = normalizeResultText(job.resultText);
    if (normalized) job.resultText = normalized;
  }
  send(res, 200, JSON.stringify(job));
}

function handleLatestSqlJob(req, res) {
  const jobs = [...sqlJobs.values()].reverse();
  const job = jobs.find((item) => item.status === "success" && item.kind !== "model-library" && item.resultText);
  if (!job) {
    readFile(latestSqlJobCachePath, "utf8")
      .then((text) => send(res, 200, text))
      .catch(() => send(res, 404, JSON.stringify({ error: "没有找到可恢复的 SQL 结果。" })));
    return;
  }
  if (job.resultText) {
    const normalized = normalizeResultText(job.resultText);
    if (normalized) job.resultText = normalized;
  }
  send(
    res,
    200,
    JSON.stringify({
      id: job.id,
      taskId: job.taskId,
      status: job.status,
      resultText: job.resultText,
      updatedAt: job.updatedAt,
    }),
  );
}

async function handleModelLibraryMeta(req, res) {
  const cache = await readModelLibraryCache();
  send(res, 200, JSON.stringify(modelLibraryMeta(cache)));
}

async function handleMatchModelLibrary(req, res) {
  try {
    const { rows } = await readJson(req);
    if (!Array.isArray(rows)) throw new Error("rows 必须是数组");
    const matches = await matchModelLibraryRows(rows.slice(0, 500));
    send(res, 200, JSON.stringify({ matches, meta: modelLibraryMeta(await readModelLibraryCache()) }));
  } catch (error) {
    send(res, 400, JSON.stringify({ error: error.message || "机型库匹配失败" }));
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url || "/", `http://localhost:${port}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(`.${decodeURIComponent(pathname)}`);
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }
  try {
    const file = await readFile(filePath);
    send(res, 200, file, mimeTypes[extname(filePath)] || "application/octet-stream");
  } catch {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendCorsPreflight(res);
    return;
  }
  if (req.method === "GET" && (req.url === "/api/analyze" || req.url === "/api/run-no-result-sql" || req.url === "/api/run-model-library-sql")) {
    res.writeHead(302, {
      Location: "/",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/api/no-result-sql") {
    try {
      send(res, 200, JSON.stringify({ sql: await readDefaultNoResultSql() }));
    } catch (error) {
      send(res, 400, JSON.stringify({ error: error.message || "读取 SQL 失败" }));
    }
    return;
  }
  if (req.method === "GET" && req.url === "/api/model-library-sql") {
    try {
      send(res, 200, JSON.stringify({ sql: await readDefaultModelLibrarySql() }));
    } catch (error) {
      send(res, 400, JSON.stringify({ error: error.message || "读取机型库 SQL 失败" }));
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/analyze") {
    await handleAnalyze(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/run-no-result-sql") {
    await handleRunNoResultSql(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/run-model-library-sql") {
    await handleRunModelLibrarySql(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/api/model-library-cache/meta") {
    await handleModelLibraryMeta(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/match-model-library") {
    await handleMatchModelLibrary(req, res);
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/api/sql-job/")) {
    handleSqlJobStatus(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/api/latest-sql-job") {
    handleLatestSqlJob(req, res);
    return;
  }
  await serveStatic(req, res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`稀土壁搜索治理平台已启动：http://localhost:${port}`);
});
