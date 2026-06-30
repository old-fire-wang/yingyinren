const els = {
  configBtn: document.querySelector("#configBtn"),
  modelStatusChip: document.querySelector("#modelStatusChip"),
  configDialog: document.querySelector("#configDialog"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  modelInput: document.querySelector("#modelInput"),
  baseUrlInput: document.querySelector("#baseUrlInput"),
  saveConfigBtn: document.querySelector("#saveConfigBtn"),
  configState: document.querySelector("#configState"),
  lastConfigMeta: document.querySelector("#lastConfigMeta"),
  modelNotice: document.querySelector("#modelNotice"),
  fileInput: document.querySelector("#fileInput"),
  uploadTitle: document.querySelector("#uploadTitle"),
  uploadHint: document.querySelector("#uploadHint"),
  uploadList: document.querySelector("#uploadList"),
  oaInput: document.querySelector("#oaInput"),
  dataAccessKeyInput: document.querySelector("#dataAccessKeyInput"),
  startDateInput: document.querySelector("#startDateInput"),
  endDateInput: document.querySelector("#endDateInput"),
  runSqlBtn: document.querySelector("#runSqlBtn"),
  editSqlBtn: document.querySelector("#editSqlBtn"),
  sqlDialog: document.querySelector("#sqlDialog"),
  sqlEditor: document.querySelector("#sqlEditor"),
  sqlEditorState: document.querySelector("#sqlEditorState"),
  saveSqlBtn: document.querySelector("#saveSqlBtn"),
  resetSqlBtn: document.querySelector("#resetSqlBtn"),
  modelSqlEditor: document.querySelector("#modelSqlEditor"),
  modelSqlEditorState: document.querySelector("#modelSqlEditorState"),
  modelLibraryMeta: document.querySelector("#modelLibraryMeta"),
  syncModelLibraryBtn: document.querySelector("#syncModelLibraryBtn"),
  saveModelSqlBtn: document.querySelector("#saveModelSqlBtn"),
  resetModelSqlBtn: document.querySelector("#resetModelSqlBtn"),
  sqlProgress: document.querySelector("#sqlProgress"),
  fileStatus: document.querySelector("#fileStatus"),
  limitInput: document.querySelector("#limitInput"),
  resetWorkspaceBtn: document.querySelector("#resetWorkspaceBtn"),
  analyzeBtn: document.querySelector("#analyzeBtn"),
  pauseAnalyzeBtn: document.querySelector("#pauseAnalyzeBtn"),
  cancelAnalyzeBtn: document.querySelector("#cancelAnalyzeBtn"),
  progress: document.querySelector("#progress"),
  analysisTaskMeta: document.querySelector("#analysisTaskMeta"),
  summaryStatus: document.querySelector("#summaryStatus"),
  statTotal: document.querySelector("#statTotal"),
  statNoResult: document.querySelector("#statNoResult"),
  statCandidate: document.querySelector("#statCandidate"),
  statOther: document.querySelector("#statOther"),
  exportSynBtn: document.querySelector("#exportSynBtn"),
  exportOtherBtn: document.querySelector("#exportOtherBtn"),
  reportBtn: document.querySelector("#reportBtn"),
  auditTaskName: document.querySelector("#auditTaskName"),
  auditSummary: document.querySelector("#auditSummary"),
  auditImportableCount: document.querySelector("#auditImportableCount"),
  auditSelectedCount: document.querySelector("#auditSelectedCount"),
  selectImportableBtn: document.querySelector("#selectImportableBtn"),
  clearImportBtn: document.querySelector("#clearImportBtn"),
  exportAuditSynBtn: document.querySelector("#exportAuditSynBtn"),
  filterType: document.querySelector("#filterType"),
  searchFilter: document.querySelector("#searchFilter"),
  resultBody: document.querySelector("#resultBody"),
  reportPanel: document.querySelector("#reportPanel"),
  reportText: document.querySelector("#reportText"),
  copyReportBtn: document.querySelector("#copyReportBtn"),
  reportDialog: document.querySelector("#reportDialog"),
  dialogReportText: document.querySelector("#dialogReportText"),
  copyDialogReportBtn: document.querySelector("#copyDialogReportBtn"),
  taskList: document.querySelector("#taskList"),
  taskLog: document.querySelector("#taskLog"),
  selectedTaskName: document.querySelector("#selectedTaskName"),
  taskPageInfo: document.querySelector("#taskPageInfo"),
  prevTaskPage: document.querySelector("#prevTaskPage"),
  nextTaskPage: document.querySelector("#nextTaskPage"),
  archiveTermCount: document.querySelector("#archiveTermCount"),
  archivePvCount: document.querySelector("#archivePvCount"),
  archiveCategoryCount: document.querySelector("#archiveCategoryCount"),
  archiveLongTailCount: document.querySelector("#archiveLongTailCount"),
  archiveUpdatedAt: document.querySelector("#archiveUpdatedAt"),
  searchPortrait: document.querySelector("#searchPortrait"),
  categoryGapList: document.querySelector("#categoryGapList"),
  searchCapabilityList: document.querySelector("#searchCapabilityList"),
  archiveSearchInput: document.querySelector("#archiveSearchInput"),
  archiveTableBody: document.querySelector("#archiveTableBody"),
  exportArchiveBtn: document.querySelector("#exportArchiveBtn"),
  clearArchiveBtn: document.querySelector("#clearArchiveBtn"),
  tabs: document.querySelectorAll(".tab"),
  workspaceView: document.querySelector("#workspaceView"),
  recordsView: document.querySelector("#recordsView"),
  assetsView: document.querySelector("#assetsView"),
};

const savedWorkspace = loadWorkspace();

const state = {
  config: loadConfig(),
  dataConfig: loadDataConfig(),
  sqlTemplate: loadSqlTemplate(),
  modelSqlTemplate: loadModelSqlTemplate(),
  tasks: loadTasks(),
  archive: loadArchive(),
  currentTask: null,
  analyzeAbortController: null,
  analyzeTickTimer: null,
  paused: false,
  canceled: false,
  rows: savedWorkspace.rows,
  results: [],
  uploadedFiles: savedWorkspace.uploadedFiles,
  activeUploadId: savedWorkspace.activeUploadId,
  lastReportText: "",
  taskPage: 0,
  activeTaskId: "",
  activeAuditTask: null,
  pendingSourceInfo: savedWorkspace.pendingSourceInfo,
  summaryRows: null,
  summaryResults: null,
  currentSqlJobId: "",
  sqlPollTimer: null,
  currentModelSqlJobId: "",
  modelSqlPollTimer: null,
  modelLibraryMeta: null,
  activeAnalyzeRequests: 0,
};

const ANALYZE_CHUNK_SIZE = 50;
const ANALYZE_CONCURRENCY = 3;
const SMALL_ANALYZE_CHUNK_SIZE = 10;
const SMALL_ANALYZE_CONCURRENCY = 10;
const TASK_PAGE_SIZE = 20;
const MODEL_LIBRARY_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function apiUrl(path) {
  if (location.protocol === "file:") return `http://localhost:5177${path}`;
  const base = location.pathname.startsWith("/xitu-governance") ? "/xitu-governance" : "";
  return `${base}${path}`;
}

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem("rsg_model_config") || "{}");
  } catch {
    return {};
  }
}

function loadDataConfig() {
  try {
    return JSON.parse(localStorage.getItem("rsg_data_config") || "{}");
  } catch {
    return {};
  }
}

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem("rsg_analysis_tasks") || "[]");
  } catch {
    return [];
  }
}

function compactAnalysisRow(row, index) {
  return {
    query: row.query || row.key_word || "",
    result_status: row.result_status ?? row.is_result ?? "0",
    search_uv: Number(row.search_uv || 0),
    search_pv: Number(row.search_pv || 0),
    analysisIndex: Number.isInteger(row.analysisIndex) ? row.analysisIndex : index,
  };
}

function compactResultRow(row, index) {
  return {
    ...compactAnalysisRow(row, index),
    query_type: row.query_type || "其他",
    category: row.category || "",
    brand: row.brand || "",
    model: row.model || "",
    synonym: row.synonym || "",
    recommend_synonym: Boolean(row.recommend_synonym),
    selected: Boolean(row.selected && row.synonym),
    action: row.action || "人工确认",
    priority: row.priority || "P2",
    note: row.note || "",
    model_library_hit: Boolean(row.model_library_hit),
    hit_category: row.hit_category || "",
    hit_brand: row.hit_brand || "",
    hit_model: row.hit_model || "",
    match_type: row.match_type || (row.model_library_hit ? "模糊" : "未命中"),
    confidence: Number(row.confidence || 0),
    top_model_candidates: Array.isArray(row.top_model_candidates) ? row.top_model_candidates.slice(0, 5) : [],
    is_governable: Boolean(row.is_governable),
    governance_type: row.governance_type || "",
    governance_owner: row.governance_owner || "",
    no_result_reason: row.no_result_reason || "",
    recommended_action: row.recommended_action || row.action || "",
    risk_level: row.risk_level || "",
  };
}

function compactTask(task, index) {
  const keepFull = index < 8;
  return {
    ...task,
    logs: Array.isArray(task.logs) ? task.logs.slice(-80) : [],
    sourceRows: keepFull && Array.isArray(task.sourceRows) ? task.sourceRows.slice(0, 2200).map(compactAnalysisRow) : [],
    results: keepFull && Array.isArray(task.results) ? task.results.slice(0, 2200).map(compactResultRow) : [],
  };
}

function loadArchive() {
  try {
    const archive = JSON.parse(localStorage.getItem("rsg_search_archive") || "{}");
    return {
      items: archive.items && typeof archive.items === "object" ? archive.items : {},
      updatedAt: archive.updatedAt || "",
    };
  } catch {
    return { items: {}, updatedAt: "" };
  }
}

function loadWorkspace() {
  try {
    const workspace = JSON.parse(localStorage.getItem("rsg_workspace_data") || "{}");
    const uploadedFiles = Array.isArray(workspace.uploadedFiles) ? workspace.uploadedFiles : [];
    const activeUploadId = workspace.activeUploadId || uploadedFiles.find((file) => file.status !== "queued")?.id || "";
    const activeFile = uploadedFiles.find((file) => file.id === activeUploadId && file.status !== "queued");
    return {
      rows: Array.isArray(activeFile?.rows) ? activeFile.rows : [],
      uploadedFiles,
      activeUploadId,
      pendingSourceInfo: activeFile?.sourceInfo || null,
    };
  } catch {
    return { rows: [], uploadedFiles: [], activeUploadId: "", pendingSourceInfo: null };
  }
}

function saveWorkspace() {
  try {
    const limit = Math.max(2200, Math.min(3000, Number(els.limitInput?.value || 2000) + 200));
    const safeFiles = state.uploadedFiles.slice(0, 3).map((file) => ({
      ...file,
      rows: Array.isArray(file.rows) ? prepareRowsFrom(file.rows).slice(0, limit).map(compactAnalysisRow) : [],
    }));
    localStorage.setItem(
      "rsg_workspace_data",
      JSON.stringify({
        uploadedFiles: safeFiles,
        activeUploadId: state.activeUploadId,
        pendingSourceInfo: state.pendingSourceInfo,
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch {
    els.progress.textContent = "数据已读取，但文件较大，浏览器未能持久保存；本次仍可继续 AI 分析。";
  }
}

function clearWorkspaceStorage() {
  localStorage.removeItem("rsg_workspace_data");
}

function loadSqlTemplate() {
  return localStorage.getItem("rsg_no_result_sql") || "";
}

function loadModelSqlTemplate() {
  return localStorage.getItem("rsg_model_library_sql") || "";
}

function saveSqlTemplate(value) {
  state.sqlTemplate = value.trim();
  if (state.sqlTemplate) {
    localStorage.setItem("rsg_no_result_sql", state.sqlTemplate);
  } else {
    localStorage.removeItem("rsg_no_result_sql");
  }
}

function saveModelSqlTemplate(value) {
  state.modelSqlTemplate = value.trim();
  if (state.modelSqlTemplate) {
    localStorage.setItem("rsg_model_library_sql", state.modelSqlTemplate);
  } else {
    localStorage.removeItem("rsg_model_library_sql");
  }
}

function saveTasks() {
  try {
    localStorage.setItem("rsg_analysis_tasks", JSON.stringify(state.tasks.slice(0, 12).map(compactTask)));
  } catch {
    try {
      localStorage.setItem("rsg_analysis_tasks", JSON.stringify(state.tasks.slice(0, 4).map(compactTask)));
    } catch {
      localStorage.removeItem("rsg_analysis_tasks");
    }
  }
}

function saveArchive() {
  localStorage.setItem("rsg_search_archive", JSON.stringify(state.archive));
}

function saveDataConfig() {
  state.dataConfig = {
    oaName58: els.oaInput.value.trim(),
    accessKey: els.dataAccessKeyInput.value.trim(),
    startDate: els.startDateInput.value,
    endDate: els.endDateInput.value,
  };
  localStorage.setItem("rsg_data_config", JSON.stringify(state.dataConfig));
}

function saveConfig() {
  let baseUrl = els.baseUrlInput.value.trim() || "https://api.openai.com/v1";
  const model = els.modelInput.value.trim() || "gpt-4.1-mini";
  if (model.toLowerCase().includes("deepseek") && baseUrl.includes("api.openai.com")) {
    baseUrl = "https://www.packyapi.com/v1";
    els.baseUrlInput.value = baseUrl;
  }
  state.config = {
    apiKey: els.apiKeyInput.value.trim(),
    model,
    baseUrl,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem("rsg_model_config", JSON.stringify(state.config));
  updateConfigState();
}

function updateConfigState() {
  const ok = Boolean(state.config.apiKey);
  els.configState.textContent = ok
    ? `配置有效：${state.config.model || "未填模型"}`
    : "未配置模型，无法调用 AI 分析";
  els.configState.style.color = ok ? "#117a49" : "#a15c00";
  if (els.modelStatusChip) {
    els.modelStatusChip.classList.toggle("ok", ok);
    els.modelStatusChip.classList.toggle("danger", !ok);
    els.modelStatusChip.innerHTML = ok ? "<i></i>模型已配置" : "<i></i>未配置模型";
  }
  if (els.lastConfigMeta) {
    els.lastConfigMeta.textContent = state.config.updatedAt
      ? `已自动载入最新一次配置：${formatDateTime(state.config.updatedAt)}`
      : "保存后会自动记住最新一次配置。";
  }
  if (els.modelNotice) {
    els.modelNotice.textContent = ok
      ? `模型已配置：${state.config.model || "默认模型"}`
      : "请先配置模型，然后再开始 AI 分析。";
    els.modelNotice.classList.toggle("ok", ok);
  }
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function defaultTaskName() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} - 无结果治理分析`;
}

function detectDelimiter(line) {
  if (line.includes("\t")) return "\t";
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

function parseText(text) {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) return [];
  if (clean.startsWith("{") || clean.startsWith("[")) return [];
  const lines = clean.split(/\r?\n/).filter((line) => line.trim());
  const delimiter = detectDelimiter(lines[0]);
  const first = parseDelimitedLine(lines[0], delimiter);
  const hasHeader = first.some((cell) =>
    ["key_word", "query", "关键词", "is_result", "search_uv", "search_pv"].includes(cell),
  );

  if (!hasHeader && first.length === 1) {
    return lines.map((line) => ({
      query: line.trim(),
      result_status: "0",
      search_uv: "",
      search_pv: "",
    }));
  }

  const headers = hasHeader ? first : first.map((_, index) => `col_${index}`);
  const body = hasHeader ? lines.slice(1) : lines;
  const rows = body.map((line) => {
    const cells = parseDelimitedLine(line, delimiter);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    const query = row.key_word || row.query || row["关键词"] || row.col_0 || "";
    return {
      query: String(query).trim(),
      result_status: row.is_result || row.result_status || row["是否有结果"] || "0",
      search_uv: Number(row.search_uv || row.uv || row["搜索用户数"] || 0),
      search_pv: Number(row.search_pv || row.pv || row["搜索次数"] || 0),
    };
  });

  return rows.filter((row) => row.query);
}

function resetUploadEntry() {
  els.fileInput.closest(".dropzone")?.classList.remove("uploaded", "error");
  els.uploadTitle.innerHTML = `<span class="upload-plus">＋</span>选择 TXT / CSV 文件`;
  els.uploadHint.textContent = "支持字段：key_word、is_result、search_uv、search_pv；只有一列词也可以。";
  els.fileInput.value = "";
}

function uploadFileName(label, sourceType = "manual") {
  const text = String(label || "").trim();
  if (!text) return sourceType === "sql" ? "SQL无结果词.csv" : "未命名文件.txt";
  if (/\.(txt|csv)$/i.test(text)) return text;
  if (/SQL\s*任务|SQL任务/i.test(text)) return `${text.replace(/\s+/g, "")}.csv`;
  return text;
}

function addUploadedFile({ rows, sourceInfo, sourceType = "manual", taskId = "", status = "ready" }) {
  const id = `upload_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const file = {
    id,
    taskId,
    status,
    sourceType,
    rows,
    sourceInfo,
    name: uploadFileName(sourceInfo?.label, sourceType),
  };
  state.uploadedFiles.unshift(file);
  if (status === "ready") state.activeUploadId = id;
  saveWorkspace();
  renderUploadList();
  return file;
}

function uploadStatusText(file) {
  if (file.status === "queued") return "排队中";
  if (file.id === state.activeUploadId) return "当前使用";
  return "已上传";
}

function renderUploadList() {
  if (!els.uploadList) return;
  const count = state.uploadedFiles.length;
  els.fileStatus.textContent = count ? `已导入 ${count} 个文件` : "未上传";
  if (!count) {
    els.uploadList.innerHTML = "";
    return;
  }
  els.uploadList.innerHTML = state.uploadedFiles
    .map((file) => `
      <div class="upload-file-card ${file.id === state.activeUploadId ? "active" : ""}" data-upload-id="${file.id}" role="button" tabindex="0" title="切换为当前分析文件">
        <div class="upload-file-icon">CSV</div>
        <div class="upload-file-main">
          <strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong>
          <span>${escapeHtml(uploadStatusText(file))} · 共 ${file.sourceInfo?.rowCount || file.rows.length} 行 · 无结果词 ${file.sourceInfo?.noResultCount ?? 0} 个</span>
        </div>
        <button type="button" data-action="delete-upload-file" data-upload-id="${file.id}" aria-label="删除文件">×</button>
      </div>
    `)
    .join("");
}

function activateUploadedFile(uploadId) {
  const file = state.uploadedFiles.find((item) => item.id === uploadId);
  if (!file) return;
  if (file.status === "queued") {
    els.progress.innerHTML = `<div class="queued-banner">这个文件还在排队中，当前任务完成后会自动开始分析。</div>`;
    return;
  }
  if (state.currentTask) {
    els.progress.innerHTML = `<div class="warning-banner">AI 分析中，请先取消当前任务后再切换文件。</div>`;
    return;
  }
  state.activeUploadId = file.id;
  state.rows = file.rows;
  state.results = [];
  state.summaryRows = null;
  state.summaryResults = null;
  state.activeAuditTask = null;
  state.pendingSourceInfo = file.sourceInfo;
  state.lastReportText = "";
  els.reportPanel.classList.add("hidden");
  els.reportText.innerHTML = "";
  els.analyzeBtn.disabled = !state.rows.length;
  els.progress.textContent = `已切换到 ${file.name}，可以开始 AI 分析。`;
  saveWorkspace();
  renderUploadList();
  updateAnalysisTaskMeta();
  render();
}

function deleteUploadedFile(uploadId) {
  const file = state.uploadedFiles.find((item) => item.id === uploadId);
  if (!file) return;
  if (state.currentTask && file.id === state.activeUploadId) {
    els.progress.innerHTML = `<div class="warning-banner">当前文件正在 AI 分析中，请先取消任务后再删除。</div>`;
    return;
  }
  if (file.taskId) cancelQueuedTask(file.taskId);
  state.uploadedFiles = state.uploadedFiles.filter((item) => item.id !== uploadId);
  if (state.activeUploadId === uploadId) {
    const nextFile = state.uploadedFiles.find((item) => item.status !== "queued");
    if (nextFile) {
      activateUploadedFile(nextFile.id);
    } else {
      state.activeUploadId = "";
      state.rows = [];
      state.results = [];
      state.summaryRows = [];
      state.summaryResults = [];
      state.activeAuditTask = null;
      state.pendingSourceInfo = null;
      els.analyzeBtn.disabled = true;
      els.progress.textContent = "已删除当前文件。";
      clearWorkspaceStorage();
      render();
    }
  }
  saveWorkspace();
  renderUploadList();
  updateAnalysisTaskMeta();
}

function setRows(rows, sourceLabel) {
  const sourceInfo = buildSourceInfo(rows, sourceLabel);
  if (state.currentTask) {
    const task = createTask(prepareRowsFrom(rows), { sourceInfo, status: "queued" });
    appendTaskLog(task, `任务已加入队列，等待当前任务完成后自动分析。来源：${sourceInfo.label}`);
    addUploadedFile({ rows, sourceInfo, taskId: task.id, status: "queued" });
    resetUploadEntry();
    els.progress.innerHTML = `<div class="queued-banner">新数据已加入队列：${escapeHtml(task.title)}。当前任务完成后会自动开始。</div>`;
    updateAnalysisTaskMeta();
    return;
  }
  state.rows = rows;
  state.results = [];
  state.summaryRows = null;
  state.summaryResults = null;
  addUploadedFile({ rows, sourceInfo, sourceType: /SQL\s*任务|SQL任务/i.test(sourceLabel) ? "sql" : "manual", status: "ready" });
  resetUploadEntry();
  els.analyzeBtn.disabled = !state.rows.length;
  els.progress.textContent = "数据已读取，准备分析。";
  state.pendingSourceInfo = sourceInfo;
  saveWorkspace();
  updateAnalysisTaskMeta();
  render();
}

function buildSourceInfo(rows, label) {
  const noResultCount = rows.filter(
    (row) => String(row.result_status) === "0" || String(row.result_status) === "",
  ).length;
  return {
    label: String(label || "手动上传").trim(),
    rowCount: rows.length,
    noResultCount,
  };
}

function sourceInfoText(info) {
  if (!info?.label) return "来源：未记录";
  const parts = [`来源：${info.label}`];
  if (Number.isFinite(info.rowCount)) parts.push(`共 ${info.rowCount} 行`);
  if (Number.isFinite(info.noResultCount)) parts.push(`无结果词 ${info.noResultCount} 个`);
  return parts.join(" · ");
}

function prepareRowsFrom(rows) {
  const limit = Math.max(1, Math.min(10000, Number(els.limitInput.value || 2000)));
  return rows
    .filter((row) => String(row.result_status) === "0" || String(row.result_status) === "")
    .sort((a, b) => Number(b.search_pv || 0) - Number(a.search_pv || 0))
    .slice(0, limit);
}

function queuedTasks() {
  return state.tasks.filter((task) => task.status === "queued");
}

function queueTagsHtml() {
  const tasks = queuedTasks();
  if (!tasks.length) return "";
  return `
    <div class="queued-task-tags" aria-label="排队任务">
      ${tasks.map((task) => `
        <span class="queued-task-chip" title="${escapeHtml(sourceInfoText(task.sourceInfo))}">
          <strong>${escapeHtml(task.title || "排队任务")}</strong>
          <small>${escapeHtml(task.sourceInfo?.label || "未记录来源")}</small>
          <button type="button" data-action="cancel-queued-task" data-task-id="${task.id}" aria-label="取消排队任务">×</button>
        </span>
      `).join("")}
    </div>
  `;
}

function cancelQueuedTask(taskId) {
  const task = state.tasks.find((entry) => entry.id === taskId && entry.status === "queued");
  if (!task) return;
  updateTask(task, { status: "canceled", done: 0 });
  appendTaskLog(task, "排队任务已取消");
  updateAnalysisTaskMeta();
}

function updateAnalysisTaskMeta() {
  if (!els.analysisTaskMeta) return;
  const queueCount = queuedTasks().length;
  const queueText = queueCount ? `<span class="queue-count">排队中 ${queueCount} 个</span>${queueTagsHtml()}` : "";
  if (state.currentTask) {
    els.analysisTaskMeta.innerHTML = `
      <strong>当前任务：${escapeHtml(state.currentTask.title || "未命名任务")}</strong>
      <small>${escapeHtml(sourceInfoText(state.currentTask.sourceInfo))}</small>
      ${queueText}
    `;
    return;
  }
  if (state.pendingSourceInfo) {
    els.analysisTaskMeta.innerHTML = `
      <strong>待分析数据已就绪</strong>
      <small>${escapeHtml(sourceInfoText(state.pendingSourceInfo))}</small>
      ${queueText}
    `;
    return;
  }
  els.analysisTaskMeta.innerHTML = queueCount
    ? `<strong>暂无运行中任务</strong><small>队列中还有任务等待启动</small>${queueText}`
    : "当前无分析任务";
}

function setSqlStatus(type, title, detail = "") {
  const tone = type === "success" ? "success" : type === "error" ? "error" : "running";
  const waitingTip =
    tone === "running"
      ? `<small class="status-tip">耗时参考：快 1-3 分钟，常见 3-8 分钟；数据平台排队或资源紧张时，10 分钟以上也可能。</small>`
      : "";
  els.sqlProgress.innerHTML = `
    <div class="sql-status ${tone}">
      <i></i>
      <div>
        <strong>${escapeHtml(title)}</strong>
        ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
        ${waitingTip}
      </div>
    </div>
  `;
}

function renderSqlJobStatus(job, title = "") {
  const logs = Array.isArray(job?.logs) ? job.logs.slice(-8) : [];
  const taskText = job?.taskId ? `taskId：${job.taskId}` : "等待数据平台返回 taskId";
  const logHtml = logs.length
    ? `<pre class="sql-log">${logs.map(escapeHtml).join("\n")}</pre>`
    : "";
  const tone = job?.status === "failed" ? "error" : job?.status === "success" ? "success" : "running";
  const statusTitle = title || (tone === "running" ? "SQL 任务运行中" : tone === "success" ? "SQL 取数成功" : "SQL 取数失败");
  const detail = tone === "failed" ? job.error || "请查看日志定位失败原因。" : taskText;
  const waitingTip =
    tone === "running"
      ? `<small class="status-tip">耗时参考：快 1-3 分钟，常见 3-8 分钟；数据平台排队或资源紧张时，10 分钟以上也可能。</small>`
      : "";
  els.sqlProgress.innerHTML = `
    <div class="sql-status ${tone}">
      <i></i>
      <div>
        <strong>${escapeHtml(statusTitle)}</strong>
        <span>${escapeHtml(detail)}</span>
        ${waitingTip}
        ${logHtml}
      </div>
    </div>
  `;
}

function stopSqlPolling() {
  if (state.sqlPollTimer) {
    clearTimeout(state.sqlPollTimer);
    state.sqlPollTimer = null;
  }
}

function modelLibraryMetaText(meta = state.modelLibraryMeta) {
  if (!meta || !Number(meta.count || 0)) return "底层机型库：未同步";
  const time = meta.updatedAt ? formatDateTime(meta.updatedAt) : "未知时间";
  return `底层机型库：已同步 ${Number(meta.count || 0).toLocaleString("zh-CN")} 个机型 · 更新于 ${time}`;
}

function isModelLibraryStale(meta = state.modelLibraryMeta) {
  if (!meta || !Number(meta.count || 0) || !meta.updatedAt) return true;
  const updatedAt = new Date(meta.updatedAt).getTime();
  if (!Number.isFinite(updatedAt)) return true;
  return Date.now() - updatedAt >= MODEL_LIBRARY_REFRESH_INTERVAL_MS;
}

function setModelLibraryMeta(type, text) {
  if (!els.modelLibraryMeta) return;
  els.modelLibraryMeta.textContent = text;
  els.modelLibraryMeta.classList.toggle("success-text", type === "success");
  els.modelLibraryMeta.classList.toggle("error-text", type === "error");
}

async function refreshModelLibraryMeta() {
  if (!els.modelLibraryMeta) return;
  try {
    const response = await fetch(apiUrl("/api/model-library-cache/meta"));
    const meta = await response.json();
    if (!response.ok) throw new Error(meta.error || "读取底层机型库状态失败");
    state.modelLibraryMeta = meta;
    setModelLibraryMeta(Number(meta.count || 0) ? "success" : "", modelLibraryMetaText(meta));
  } catch (error) {
    setModelLibraryMeta("error", error.message || "底层机型库状态读取失败");
  }
}

async function autoRefreshModelLibraryIfNeeded() {
  if (!els.syncModelLibraryBtn || state.currentModelSqlJobId) return;
  await refreshModelLibraryMeta();
  const { oaName58, accessKey } = state.dataConfig;
  if (!oaName58 || !accessKey) return;
  if (!isModelLibraryStale()) return;
  setModelLibraryMeta("", "底层机型库超过 7 天未同步，正在自动周更；新机型会补充进本地缓存。");
  runModelLibrarySql({ auto: true });
}

function scheduleSqlPoll(jobId) {
  stopSqlPolling();
  state.sqlPollTimer = setTimeout(() => pollSqlJob(jobId), 3000);
}

async function pollSqlJob(jobId) {
  if (!jobId || state.currentSqlJobId !== jobId) return;
  try {
    const response = await fetch(apiUrl(`/api/sql-job/${encodeURIComponent(jobId)}`));
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || "查询 SQL 任务状态失败");
    renderSqlJobStatus(job);
    if (job.status === "success") {
      stopSqlPolling();
      state.currentSqlJobId = "";
      const rows = parseText(job.resultText || "");
      if (!rows.length) {
        setSqlStatus("error", "SQL 结果格式异常", "数据平台返回的不是可解析的结果表，已拦截，未导入工作台。请查看日志里的 taskId。");
        els.runSqlBtn.disabled = false;
        els.runSqlBtn.textContent = "运行无结果 SQL";
        return;
      }
      setRows(rows, `SQL任务${job.taskId || job.id}.csv`);
      const noResultCount = rows.filter(
        (row) => String(row.result_status) === "0" || String(row.result_status) === "",
      ).length;
      renderSqlJobStatus(job, `SQL 取数成功：共 ${rows.length} 行，无结果词 ${noResultCount} 个`);
      els.runSqlBtn.disabled = false;
      els.runSqlBtn.textContent = "运行无结果 SQL";
      return;
    }
    if (job.status === "failed") {
      stopSqlPolling();
      state.currentSqlJobId = "";
      els.runSqlBtn.disabled = false;
      els.runSqlBtn.textContent = "运行无结果 SQL";
      renderSqlJobStatus(job);
      return;
    }
    scheduleSqlPoll(jobId);
  } catch (error) {
    setSqlStatus("error", "SQL 状态查询失败", error.message || "请检查本地服务是否仍在运行。");
    stopSqlPolling();
    state.currentSqlJobId = "";
    els.runSqlBtn.disabled = false;
    els.runSqlBtn.textContent = "运行无结果 SQL";
  }
}

function stopModelSqlPolling() {
  if (state.modelSqlPollTimer) {
    clearTimeout(state.modelSqlPollTimer);
    state.modelSqlPollTimer = null;
  }
}

function scheduleModelSqlPoll(jobId) {
  stopModelSqlPolling();
  state.modelSqlPollTimer = setTimeout(() => pollModelSqlJob(jobId), 3000);
}

async function pollModelSqlJob(jobId) {
  if (!jobId || state.currentModelSqlJobId !== jobId) return;
  try {
    const response = await fetch(apiUrl(`/api/sql-job/${encodeURIComponent(jobId)}`));
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || "查询机型库同步状态失败");
    const lastLog = Array.isArray(job.logs) && job.logs.length ? job.logs.at(-1) : "";
    if (job.status === "success") {
      stopModelSqlPolling();
      state.currentModelSqlJobId = "";
      els.syncModelLibraryBtn.disabled = false;
      els.syncModelLibraryBtn.textContent = "同步底层机型库";
      state.modelLibraryMeta = job.modelLibraryMeta || state.modelLibraryMeta;
      await refreshModelLibraryMeta();
      const addedText = Number(job.modelLibraryMeta?.addedCount || 0)
        ? `本次新增 ${Number(job.modelLibraryMeta.addedCount).toLocaleString("zh-CN")} 个，`
        : "";
      setModelLibraryMeta("success", `${modelLibraryMetaText()}，${addedText}AI 分析将自动使用。`);
      return;
    }
    if (job.status === "failed") {
      stopModelSqlPolling();
      state.currentModelSqlJobId = "";
      els.syncModelLibraryBtn.disabled = false;
      els.syncModelLibraryBtn.textContent = "同步底层机型库";
      setModelLibraryMeta("error", `底层机型库同步失败：${job.error || lastLog || "请查看 One-Service 任务"}`);
      return;
    }
    setModelLibraryMeta("", lastLog || "底层机型库同步中，数据平台可能需要 3-8 分钟。");
    scheduleModelSqlPoll(jobId);
  } catch (error) {
    stopModelSqlPolling();
    state.currentModelSqlJobId = "";
    els.syncModelLibraryBtn.disabled = false;
    els.syncModelLibraryBtn.textContent = "同步底层机型库";
    setModelLibraryMeta("error", error.message || "机型库同步状态查询失败");
  }
}

async function runNoResultSql() {
  saveDataConfig();
  const { oaName58, accessKey, startDate, endDate } = state.dataConfig;
  if (!oaName58 || !accessKey || !startDate || !endDate) {
    setSqlStatus("error", "取数前请先补全信息", "需要填写 OA、AccessKey 和时间段。");
    return;
  }
  if (startDate > endDate) {
    setSqlStatus("error", "时间段不正确", "开始日期不能晚于结束日期。");
    return;
  }
  els.runSqlBtn.disabled = true;
  els.runSqlBtn.textContent = "SQL取数中";
  setSqlStatus("running", "SQL 任务运行中", "正在提交并等待数据平台执行，本地会持续等待结果。");
  try {
    const response = await fetch(apiUrl("/api/run-no-result-sql"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oaName58, accessKey, startDate, endDate, sqlTemplate: state.sqlTemplate }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "运行 SQL 失败");
    state.currentSqlJobId = payload.jobId;
    renderSqlJobStatus(payload, "SQL 任务已提交");
    scheduleSqlPoll(payload.jobId);
  } catch (error) {
    setSqlStatus("error", "SQL 取数失败", error.message || "请检查 SQL、OA、AccessKey 或数据平台状态。");
    els.runSqlBtn.disabled = false;
    els.runSqlBtn.textContent = "运行无结果 SQL";
  }
}

async function runModelLibrarySql(options = {}) {
  saveDataConfig();
  const { oaName58, accessKey, endDate } = state.dataConfig;
  const date = endDate || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (!oaName58 || !accessKey || !date) {
    if (!options.auto) setModelLibraryMeta("error", "同步前请先在工作台填写 OA、AccessKey 和结束日期。");
    return;
  }
  els.syncModelLibraryBtn.disabled = true;
  els.syncModelLibraryBtn.textContent = options.auto ? "周更中" : "同步中";
  setModelLibraryMeta("", options.auto ? "底层机型库自动周更中；同步完成后会补充新增机型。" : "底层机型库同步中，数据平台可能需要 3-8 分钟；同步后所有分析会自动使用。");
  try {
    const sqlTemplate = els.modelSqlEditor?.value.trim() || state.modelSqlTemplate;
    const response = await fetch(apiUrl("/api/run-model-library-sql"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oaName58, accessKey, date, sqlTemplate }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "同步机型库失败");
    state.currentModelSqlJobId = payload.jobId;
    setModelLibraryMeta("", `机型库同步任务已提交，jobId：${payload.jobId}`);
    scheduleModelSqlPoll(payload.jobId);
  } catch (error) {
    els.syncModelLibraryBtn.disabled = false;
    els.syncModelLibraryBtn.textContent = "同步底层机型库";
    setModelLibraryMeta("error", error.message || "同步机型库失败");
  }
}

async function restoreLatestSqlIfWorkspaceEmpty() {
  if (state.rows.length || state.uploadedFiles.length) return;
  try {
    const response = await fetch(apiUrl("/api/latest-sql-job"));
    if (!response.ok) return;
    const job = await response.json();
    const rows = parseText(job.resultText || "");
    if (!rows.length) return;
    setRows(rows, `SQL任务${job.taskId || job.id}.csv`);
    els.progress.textContent = `已恢复最近一次 SQL 取数结果：共 ${rows.length} 行，可以开始 AI 分析。`;
  } catch {}
}

function prepareRows() {
  return prepareRowsFrom(state.rows);
}

async function fetchDefaultSql() {
  const response = await fetch(apiUrl("/api/no-result-sql"));
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "读取默认 SQL 失败");
  return payload.sql || "";
}

async function fetchDefaultModelSql() {
  const response = await fetch(apiUrl("/api/model-library-sql"));
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "读取默认机型库 SQL 失败");
  return payload.sql || "";
}

async function openSqlEditor() {
  els.sqlEditor.value = state.sqlTemplate || "";
  els.sqlEditorState.textContent = state.sqlTemplate ? "当前使用本机自定义 SQL。" : "正在读取默认 SQL...";
  els.sqlDialog.showModal();
  if (!state.sqlTemplate) {
    try {
      els.sqlEditor.value = await fetchDefaultSql();
      els.sqlEditorState.textContent = "当前展示默认 SQL，保存后会作为本机自定义 SQL 使用。";
    } catch (error) {
      els.sqlEditorState.textContent = error.message || "默认 SQL 读取失败";
    }
  }
}

function createTask(rows, options = {}) {
  const now = new Date().toISOString();
  const sourceRows = normalizeTaskRows(rows);
  const task = {
    id: `analysis_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    title: defaultTaskName(),
    status: options.status || "running",
    total: sourceRows.length,
    done: 0,
    createdAt: now,
    updatedAt: now,
    model: state.config.model || "",
    sourceInfo: options.sourceInfo || state.pendingSourceInfo || buildSourceInfo(sourceRows, "当前工作台数据"),
    sourceRows,
    logs: [],
    results: [],
  };
  state.tasks.unshift(task);
  saveTasks();
  updateAnalysisTaskMeta();
  renderTasks(task.id);
  return task;
}

function appendTaskLog(task, text) {
  if (!task) return;
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  task.logs.push(`[${time}] ${text}`);
  task.updatedAt = new Date().toISOString();
  saveTasks();
  renderTasks(task.id);
}

function normalizeTaskRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({
    ...row,
    analysisIndex: Number.isInteger(row.analysisIndex) ? row.analysisIndex : index,
  }));
}

function normalizeTaskResults(results, rows = []) {
  const map = new Map();
  (Array.isArray(results) ? results : []).forEach((row, index) => {
    const analysisIndex = Number.isInteger(row.analysisIndex)
      ? row.analysisIndex
      : Number.isInteger(rows[index]?.analysisIndex)
        ? rows[index].analysisIndex
        : index;
    map.set(analysisIndex, {
      ...row,
      analysisIndex,
      selected: Boolean(row.selected && row.synonym),
      model_library_hit: Boolean(row.model_library_hit),
      hit_category: row.hit_category || "",
      hit_brand: row.hit_brand || "",
      hit_model: row.hit_model || "",
      match_type: row.match_type || (row.model_library_hit ? "模糊" : "未命中"),
      confidence: Number(row.confidence || 0),
    });
  });
  return [...map.values()].sort((a, b) => a.analysisIndex - b.analysisIndex);
}

function mergeTaskResults(existing, incoming) {
  const map = new Map();
  normalizeTaskResults(existing).forEach((row) => map.set(row.analysisIndex, row));
  normalizeTaskResults(incoming).forEach((row) => map.set(row.analysisIndex, row));
  return [...map.values()].sort((a, b) => a.analysisIndex - b.analysisIndex);
}

function missingRows(rows, results) {
  const doneIndexes = new Set(normalizeTaskResults(results).map((row) => row.analysisIndex));
  return rows.filter((row) => !doneIndexes.has(row.analysisIndex));
}

function chunkRows(rows, size) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function analyzeChunkSize(total) {
  return total <= 100 ? SMALL_ANALYZE_CHUNK_SIZE : ANALYZE_CHUNK_SIZE;
}

function analyzeConcurrency(total, chunkCount) {
  const concurrency = total <= 100 ? SMALL_ANALYZE_CONCURRENCY : ANALYZE_CONCURRENCY;
  return Math.max(1, Math.min(concurrency, chunkCount));
}

function syncActiveTaskResults() {
  if (!state.activeAuditTask) return;
  state.activeAuditTask.results = normalizeTaskResults(state.results, state.rows);
  state.activeAuditTask.done = state.activeAuditTask.results.length;
  state.activeAuditTask.updatedAt = new Date().toISOString();
  saveTasks();
  archiveTaskResults(state.activeAuditTask, state.activeAuditTask.results);
  renderTasks(state.activeAuditTask.id);
}

function updateTask(task, patch) {
  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  saveTasks();
  updateAnalysisTaskMeta();
  renderTasks(task.id);
}

function updateAuditTaskName() {
  if (!els.auditTaskName) return;
  const task = state.activeAuditTask || state.currentTask;
  if (!task) {
    els.auditTaskName.textContent = state.results.length ? "当前审核任务：当前工作台分析结果" : "当前审核任务：未选择";
    return;
  }
  els.auditTaskName.textContent = `当前审核任务：${task.title || "未命名任务"} · ${sourceInfoText(task.sourceInfo)}`;
}

function setAnalyzeRunning(running) {
  els.analyzeBtn.disabled = running || !state.rows.length;
  els.analyzeBtn.textContent = running ? "AI 分析中..." : "开始 AI 分析";
  els.analyzeBtn.classList.toggle("is-running", running);
  els.pauseAnalyzeBtn.disabled = !running;
  els.cancelAnalyzeBtn.disabled = !running;
  updateAnalysisTaskMeta();
  updateAuditTaskName();
}

function analyzedCount(task) {
  return normalizeTaskResults(task?.results).length;
}

function canContinueTask(task) {
  const rows = normalizeTaskRows(taskSourceRows(task));
  const pending = missingRows(rows, task?.results).length;
  return task?.status !== "queued" && pending > 0 && (!state.currentTask || state.currentTask === task);
}

async function runNextQueuedTask() {
  if (state.currentTask || !state.config.apiKey) {
    updateAnalysisTaskMeta();
    return;
  }
  const task = queuedTasks().at(-1);
  if (!task) {
    updateAnalysisTaskMeta();
    return;
  }
  const rows = normalizeTaskRows(taskSourceRows(task));
  if (!rows.length) {
    updateTask(task, { status: "failed", done: 0, total: 0 });
    appendTaskLog(task, "队列任务启动失败：没有可分析的数据");
    setTimeout(runNextQueuedTask, 50);
    return;
  }
  state.pendingSourceInfo = task.sourceInfo || buildSourceInfo(rows, task.title);
  appendTaskLog(task, "队列轮到本任务，自动开始分析");
  await runAnalysisTask(task, rows, { resume: analyzedCount(task) > 0, activateAudit: false });
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "预计剩余时间计算中";
  const minutes = Math.ceil(ms / 60000);
  if (minutes <= 1) return "预计剩余不足 1 分钟";
  return `预计剩余约 ${minutes} 分钟`;
}

function formatElapsed(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
}

function setAnalyzeProgress({ done, total, batchText, remainingMs, waitingText = "", activeCount = 0, candidateCount = null }) {
  const ratio = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const candidateTotal = candidateCount ?? state.results.filter((row) => row.recommend_synonym && row.synonym).length;
  els.progress.innerHTML = `
    <div class="analyze-progress-card">
      <div class="analyze-progress-head">
        <strong>AI 分析中</strong>
        <span>${ratio}%</span>
      </div>
      <div class="analyze-progress-track"><i style="width:${ratio}%"></i></div>
      <div class="analyze-progress-meta">
        <span>${escapeHtml(batchText)}</span>
        <span>${escapeHtml(formatDuration(remainingMs))}</span>
      </div>
      <div class="analyze-progress-submeta">已完成 ${done}/${total} 个词 · 请求中 ${activeCount} 个小批 · 已产出 ${candidateTotal} 个同义词候选</div>
      <div class="analyze-progress-tip">耗时参考：快 1-3 分钟，常见 3-8 分钟；模型排队或资源紧张时，10 分钟以上也可能。</div>
      ${waitingText ? `<div class="analyze-progress-waiting">${escapeHtml(waitingText)}</div>` : ""}
      <button class="progress-log-button" type="button" data-action="view-current-log">查看本次日志</button>
    </div>
  `;
}

function stopAnalyzeTicker() {
  if (state.analyzeTickTimer) {
    clearInterval(state.analyzeTickTimer);
    state.analyzeTickTimer = null;
  }
}

function startAnalyzeTicker({ done, total, batchText, remainingMs, startedAt, candidateCount = null }) {
  stopAnalyzeTicker();
  const tick = () => {
    setAnalyzeProgress({
      done,
      total,
      batchText,
      remainingMs,
      activeCount: state.activeAnalyzeRequests || 1,
      candidateCount,
      waitingText: `本批请求中，已等待 ${formatElapsed(Date.now() - startedAt)}`,
    });
  };
  tick();
  state.analyzeTickTimer = setInterval(tick, 1000);
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enrichRowsWithModelLibrary(rows) {
  try {
    const response = await fetch(apiUrl("/api/match-model-library"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: rows.map((row) => ({ query: row.query })) }),
      signal: state.analyzeAbortController.signal,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "机型库匹配失败");
    if (payload.meta) {
      state.modelLibraryMeta = payload.meta;
      if (els.modelLibraryMeta) setModelLibraryMeta(Number(payload.meta.count || 0) ? "success" : "", modelLibraryMetaText(payload.meta));
    }
    const matchMap = new Map((payload.matches || []).map((item) => [item.query, item]));
    return rows.map((row) => {
      const match = matchMap.get(row.query) || {};
      return { ...row, ...match };
    });
  } catch {
    return rows.map((row) => ({
      ...row,
      model_library_hit: Boolean(row.model_library_hit),
      hit_category: row.hit_category || "",
      hit_brand: row.hit_brand || "",
      hit_model: row.hit_model || "",
      match_type: row.match_type || "未命中",
      confidence: row.confidence || 0,
      top_model_candidates: row.top_model_candidates || [],
      is_governable: Boolean(row.is_governable),
      governance_type: row.governance_type || "",
      governance_owner: row.governance_owner || "",
      no_result_reason: row.no_result_reason || "",
      recommended_action: row.recommended_action || "",
      risk_level: row.risk_level || "",
    }));
  }
}

async function requestAnalyzeChunk(chunk) {
  const enrichedChunk = await enrichRowsWithModelLibrary(chunk);
  const payloadRows = enrichedChunk.map((row) => ({
    query: row.query,
    search_uv: row.search_uv,
    search_pv: row.search_pv,
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
  const response = await fetch(apiUrl("/api/analyze"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config: state.config, rows: payloadRows }),
    signal: state.analyzeAbortController.signal,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "分析失败");
  return payload.results.map((item, index) => ({
    ...enrichedChunk[index],
    ...item,
    model_library_hit: Boolean(item.model_library_hit || enrichedChunk[index].model_library_hit),
    hit_category: item.hit_category || enrichedChunk[index].hit_category || "",
    hit_brand: item.hit_brand || enrichedChunk[index].hit_brand || "",
    hit_model: item.hit_model || enrichedChunk[index].hit_model || "",
    match_type: item.match_type || enrichedChunk[index].match_type || "未命中",
    confidence: Math.max(Number(item.confidence || 0), Number(enrichedChunk[index].confidence || 0)),
    top_model_candidates: enrichedChunk[index].top_model_candidates || [],
    is_governable: Boolean(item.is_governable || enrichedChunk[index].is_governable),
    governance_type: item.governance_type || enrichedChunk[index].governance_type || "",
    governance_owner: item.governance_owner || enrichedChunk[index].governance_owner || "",
    no_result_reason: item.no_result_reason || enrichedChunk[index].no_result_reason || "",
    recommended_action: item.recommended_action || enrichedChunk[index].recommended_action || item.action || "",
    risk_level: item.risk_level || enrichedChunk[index].risk_level || "",
    selected: Boolean(item.recommend_synonym && item.synonym),
  }));
}

async function analyzeChunkResilient(chunk, context) {
  let lastError;
  for (let attempt = 1; attempt <= 1; attempt += 1) {
    if (state.canceled) throw new Error("任务已取消");
    const waitingStartedAt = Date.now();
    const attemptText = attempt > 1 ? `，第 ${attempt} 次重试` : "";
    startAnalyzeTicker({
      done: context.done,
      total: context.total,
      batchText: `${context.batchText}${attemptText}`,
      remainingMs: context.remainingMs,
      startedAt: waitingStartedAt,
      candidateCount: context.candidateCount,
    });
    try {
      const result = await requestAnalyzeChunk(chunk);
      stopAnalyzeTicker();
      return result;
    } catch (error) {
      stopAnalyzeTicker();
      lastError = error;
      appendTaskLog(context.task, `${context.batchText} 调用失败：${error.message}`);
    }
  }
  if (chunk.length > 25) {
    const middle = Math.ceil(chunk.length / 2);
    appendTaskLog(context.task, `${context.batchText} 自动拆分为 ${middle} + ${chunk.length - middle} 个词继续分析`);
    const left = await analyzeChunkResilient(chunk.slice(0, middle), {
      ...context,
      batchText: `${context.batchText}（拆分 1/2）`,
    });
    const right = await analyzeChunkResilient(chunk.slice(middle), {
      ...context,
      batchText: `${context.batchText}（拆分 2/2）`,
    });
    return [...left, ...right];
  }
  throw lastError || new Error("模型调用失败");
}

function waitWhilePaused(task) {
  return new Promise((resolve) => {
    const tick = () => {
      if (state.canceled || !state.paused) {
        resolve();
        return;
      }
      els.progress.textContent = "已暂停。点击“继续”恢复分析。";
      setTimeout(tick, 300);
    };
    appendTaskLog(task, "任务已暂停");
    tick();
  });
}

async function runAnalysisTask(task, rows, { resume = false, activateAudit = true } = {}) {
  rows = normalizeTaskRows(rows);
  if (!rows.length) {
    els.progress.textContent = "没有可分析的无结果词。请确认 is_result = 0。";
    return;
  }
  if (state.currentTask && state.currentTask !== task) {
    els.progress.textContent = "已有分析任务运行中，请先暂停或取消当前任务。";
    return;
  }

  const existingResults = normalizeTaskResults(task.results, rows);
  let workingResults = existingResults;
  if (activateAudit) {
    state.summaryRows = null;
    state.summaryResults = null;
    state.rows = rows;
    state.results = workingResults;
    state.activeAuditTask = task;
    render();
  } else {
    state.summaryRows = [];
    state.summaryResults = [];
    updateSummary();
    updateAuditTaskName();
  }
  state.currentTask = task;
  state.paused = false;
  state.canceled = false;
  state.analyzeAbortController = new AbortController();
  updateTask(task, {
    status: "running",
    total: rows.length,
    done: workingResults.length,
    model: state.config.model || task.model || "",
    sourceRows: rows,
    results: workingResults,
  });
  setAnalyzeRunning(true);

  const pendingRows = missingRows(rows, workingResults);
  const chunkSize = analyzeChunkSize(rows.length);
  const chunks = chunkRows(pendingRows, chunkSize);
  const totalBatches = chunks.length;
  const concurrency = analyzeConcurrency(rows.length, totalBatches);
  const analysisStartedAt = Date.now();
  if (!pendingRows.length) {
    updateTask(task, { status: "completed", done: rows.length, total: rows.length, results: workingResults, sourceRows: rows });
    appendTaskLog(task, "任务已全部完成，无需继续分析");
    els.progress.innerHTML = `<div class="success-banner">分析成功：已完成 ${rows.length} 个词，本次任务已保存到「分析记录」。</div>`;
    state.analyzeAbortController = null;
    state.currentTask = null;
    setAnalyzeRunning(false);
    setTimeout(runNextQueuedTask, 50);
    return;
  }
  setAnalyzeProgress({
    done: workingResults.length,
    total: rows.length,
    batchText: resume
      ? `继续分析剩余 ${pendingRows.length} 个词，共 ${totalBatches} 个小批`
      : `准备分析 ${rows.length} 个词，共 ${totalBatches} 个小批`,
    remainingMs: null,
    activeCount: 0,
    candidateCount: workingResults.filter((row) => row.recommend_synonym && row.synonym).length,
  });
  appendTaskLog(
    task,
    `${resume ? "继续任务" : "任务开始"}，共 ${rows.length} 个词，已完成 ${workingResults.length} 个，批大小 ${chunkSize}，并发 ${concurrency}`,
  );

  try {
    let cursor = 0;
    let finishedChunks = 0;
    state.activeAnalyzeRequests = 0;
    const runWorker = async () => {
      while (cursor < chunks.length) {
        if (state.canceled) throw new Error("任务已取消");
        if (state.paused) await waitWhilePaused(task);
        if (state.canceled) throw new Error("任务已取消");
        const chunkIndex = cursor;
        cursor += 1;
        const chunk = chunks[chunkIndex];
        const firstIndex = chunk[0].analysisIndex + 1;
        const lastIndex = chunk[chunk.length - 1].analysisIndex + 1;
        const avgChunkMs = finishedChunks > 0 ? (Date.now() - analysisStartedAt) / finishedChunks : null;
        const remainingMs = avgChunkMs ? avgChunkMs * Math.max(chunks.length - finishedChunks, 0) : null;
        const batchText = `第 ${chunkIndex + 1}/${totalBatches} 小批：${firstIndex}-${lastIndex} / ${rows.length}`;
        state.activeAnalyzeRequests += 1;
        setAnalyzeProgress({
          done: workingResults.length,
          total: rows.length,
          batchText: `${batchText} 已发起请求`,
          remainingMs,
          activeCount: state.activeAnalyzeRequests,
          candidateCount: workingResults.filter((row) => row.recommend_synonym && row.synonym).length,
        });
        appendTaskLog(task, `开始分析第 ${chunkIndex + 1} 小批：${firstIndex}-${lastIndex}`);
        let merged;
        try {
          merged = await analyzeChunkResilient(chunk, {
            task,
            done: workingResults.length,
            total: rows.length,
            batchText,
            remainingMs,
            candidateCount: workingResults.filter((row) => row.recommend_synonym && row.synonym).length,
          });
        } finally {
          state.activeAnalyzeRequests = Math.max(0, state.activeAnalyzeRequests - 1);
        }
        workingResults = mergeTaskResults(workingResults, merged);
        task.results = workingResults;
        finishedChunks += 1;
        if (activateAudit || state.activeAuditTask?.id === task.id) {
          state.rows = rows;
          state.results = workingResults;
          state.activeAuditTask = task;
          render();
        }
        updateTask(task, { done: workingResults.length, results: workingResults, sourceRows: rows });
        archiveTaskResults(task, workingResults);
        const avgFinishedChunkMs = (Date.now() - analysisStartedAt) / Math.max(finishedChunks, 1);
        setAnalyzeProgress({
          done: workingResults.length,
          total: rows.length,
          batchText: `已完成 ${workingResults.length}/${rows.length} 个词，${Math.max(chunks.length - finishedChunks, 0)} 个小批待完成`,
          remainingMs: avgFinishedChunkMs * Math.max(chunks.length - finishedChunks, 0),
          activeCount: state.activeAnalyzeRequests,
          candidateCount: workingResults.filter((row) => row.recommend_synonym && row.synonym).length,
        });
        appendTaskLog(task, `完成第 ${chunkIndex + 1} 小批，累计 ${workingResults.length}/${rows.length}`);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, runWorker));
    if (workingResults.length < rows.length) {
      throw new Error(`还有 ${rows.length - workingResults.length} 个词未完成`);
    }
    updateTask(task, { status: "completed", done: rows.length, results: workingResults });
    archiveTaskResults(task, workingResults);
    appendTaskLog(task, "任务完成，可以审核并导出");
    els.progress.innerHTML = `<div class="success-banner">分析成功：已完成 ${rows.length} 个词，本次任务已保存到「分析记录」。${activateAudit ? "" : "当前审核区仍保留上一条任务结果，可在分析记录中切换查看本任务。"}</div>`;
    if (activateAudit || state.activeAuditTask?.id === task.id) {
      state.rows = rows;
      state.results = workingResults;
      state.activeAuditTask = task;
      render();
      makeReport(task);
    }
  } catch (error) {
    stopAnalyzeTicker();
    state.analyzeAbortController?.abort();
    const canceled = state.canceled || error.name === "AbortError";
    const done = workingResults.length;
    updateTask(task, {
      status: canceled ? "canceled" : done < rows.length ? "failed" : "completed",
      done,
      total: rows.length,
      results: workingResults,
      sourceRows: rows,
    });
    appendTaskLog(
      task,
      canceled
        ? `任务已取消，已完成 ${done}/${rows.length}，可在分析记录中继续`
        : `任务中断：${error.message}。已完成 ${done}/${rows.length}，可在分析记录中继续`,
    );
    els.progress.innerHTML = `<div class="warning-banner">${canceled ? "分析已取消" : "分析中断"}：已完成 ${done}/${rows.length} 个词，可到「分析记录」点击继续分析。</div>`;
    if (activateAudit || state.activeAuditTask?.id === task.id) render();
  } finally {
    stopAnalyzeTicker();
    state.analyzeAbortController = null;
    state.currentTask = null;
    state.paused = false;
    state.canceled = false;
    els.pauseAnalyzeBtn.textContent = "暂停";
    setAnalyzeRunning(false);
    setTimeout(runNextQueuedTask, 50);
  }
}

async function analyze() {
  els.progress.innerHTML = `<div class="sql-status running"><i></i><div><strong>已收到点击</strong><span>正在创建 AI 分析任务...</span></div></div>`;
  try {
    if (!state.config.apiKey) {
      els.progress.innerHTML = `<div class="warning-banner">Chrome 当前未配置模型，请先在右上角「配置模型」里保存 API Key、Base URL 和模型名。</div>`;
      openConfig();
      return;
    }
    const rows = prepareRows();
    if (!rows.length) {
      els.progress.innerHTML = `<div class="warning-banner">没有可分析的无结果词。请确认已恢复/上传文件，且 is_result = 0。</div>`;
      return;
    }
    state.results = [];
    state.summaryRows = null;
    state.summaryResults = null;
    render();
    const task = createTask(rows, { sourceInfo: state.pendingSourceInfo || buildSourceInfo(state.rows, "当前工作台数据") });
    appendTaskLog(task, "已收到开始分析指令，准备调用模型");
    await runAnalysisTask(task, rows);
  } catch (error) {
    els.progress.innerHTML = `<div class="warning-banner">启动 AI 分析失败：${escapeHtml(error.message || "未知错误")}。请刷新页面后重试。</div>`;
    setAnalyzeRunning(false);
  }
}

function resetWorkspace() {
  if (state.currentTask) {
    els.progress.innerHTML = `<div class="warning-banner">AI 分析中，请先取消当前任务后再重置清空。</div>`;
    return;
  }
  state.rows = [];
  state.results = [];
  state.uploadedFiles = [];
  state.activeUploadId = "";
  state.summaryRows = [];
  state.summaryResults = [];
  state.activeAuditTask = null;
  state.pendingSourceInfo = null;
  state.lastReportText = "";
  clearWorkspaceStorage();
  resetUploadEntry();
  renderUploadList();
  els.progress.textContent = "已重置当前工作台。";
  els.sqlProgress.textContent = "";
  els.reportPanel.classList.add("hidden");
  els.reportText.innerHTML = "";
  els.analyzeBtn.disabled = true;
  updateAnalysisTaskMeta();
  render();
}

function filteredResults() {
  const mode = els.filterType.value;
  const keyword = els.searchFilter.value.trim().toLowerCase();
  return state.results.filter((row) => {
    const matchMode =
      mode === "all" ||
      (mode === "synonym" && row.recommend_synonym) ||
      (mode === "other" && !row.recommend_synonym);
    const text = `${row.query} ${row.synonym} ${row.note}`.toLowerCase();
    return matchMode && (!keyword || text.includes(keyword));
  });
}

function updateSummary() {
  const summaryRows = Array.isArray(state.summaryRows) ? state.summaryRows : state.rows;
  const summaryResults = Array.isArray(state.summaryResults) ? state.summaryResults : state.results;
  const total = summaryRows.length;
  const noResult = summaryRows.filter(
    (row) => String(row.result_status) === "0" || String(row.result_status) === "",
  ).length;
  const importable = state.results.filter((row) => row.recommend_synonym && row.synonym).length;
  const selected = state.results.filter((row) => row.selected && row.synonym).length;
  const summarySelected = summaryResults.filter((row) => row.selected && row.synonym).length;
  els.statTotal.textContent = total;
  els.statNoResult.textContent = noResult;
  els.statCandidate.textContent = summarySelected;
  els.statOther.textContent = Math.max(0, summaryResults.length - summarySelected);
  els.summaryStatus.textContent = state.results.length ? "已分析" : "等待分析";
  const hasResults = state.results.length > 0;
  els.auditImportableCount.textContent = importable;
  els.auditSelectedCount.textContent = selected;
  els.auditSummary.textContent = hasResults
    ? `AI 已识别 ${importable} 个可导入同义词后台的候选词；最终只导出你勾选确认的 ${selected} 个。`
    : "AI 分析后，勾选确认要导入同义词后台的词。";
  els.exportSynBtn.disabled = selected === 0;
  els.exportAuditSynBtn.disabled = selected === 0;
  els.selectImportableBtn.disabled = !hasResults;
  els.clearImportBtn.disabled = !hasResults;
  els.exportOtherBtn.disabled = !hasResults;
  els.reportBtn.disabled = !hasResults;
}

function cellInput(value, rowIndex, field) {
  return `<input type="text" value="${escapeHtml(value || "")}" data-row="${rowIndex}" data-field="${field}" />`;
}

function modelHitBadge(row) {
  const hit = Boolean(row.model_library_hit);
  return `<span class="badge ${hit ? "yes" : "no"}">${hit ? "是" : "否"}</span>`;
}

function modelConfidence(value) {
  const score = Number(value || 0);
  if (!score) return "-";
  return `${Math.max(0, Math.min(100, Math.round(score)))}%`;
}

function governableBadge(row) {
  const yes = Boolean(row.is_governable);
  return `<span class="badge ${yes ? "yes" : "no"}">${yes ? "可治理" : "不明确"}</span>`;
}

function modelCandidatesText(row) {
  const candidates = Array.isArray(row.top_model_candidates) ? row.top_model_candidates.slice(0, 3) : [];
  if (!candidates.length) return "-";
  return candidates
    .map((item) => {
      const name = [item.brand_name, item.model_name].filter(Boolean).join(" ");
      return `${name || item.model_name || "-"}（${modelConfidence(item.confidence)}）`;
    })
    .join("<br>");
}

function render() {
  updateSummary();
  updateAuditTaskName();
  const rows = filteredResults();
  if (!rows.length) {
    els.resultBody.innerHTML = `<tr><td colspan="20" class="empty">${state.results.length ? "没有匹配结果" : "上传数据后开始分析"}</td></tr>`;
    return;
  }
  els.resultBody.innerHTML = rows
    .map((row) => {
      const index = state.results.indexOf(row);
      return `
        <tr>
          <td>
            <label class="import-check">
              <input type="checkbox" data-row="${index}" data-field="selected" ${row.selected ? "checked" : ""}>
              <span>${row.selected ? "已选" : "待选"}</span>
            </label>
          </td>
          <td><strong>${escapeHtml(row.query)}</strong><br><small>UV ${row.search_uv || 0} / PV ${row.search_pv || 0}</small></td>
          <td>${cellInput(row.synonym, index, "synonym")}</td>
          <td><span class="badge ${row.recommend_synonym ? "yes" : "no"}">${escapeHtml(row.query_type || "其他")}</span></td>
          <td>${escapeHtml(row.category || "")}</td>
          <td>${escapeHtml(row.brand || "")}</td>
          <td>${escapeHtml(row.model || "")}</td>
          <td>${cellInput(row.action, index, "action")}</td>
          <td>${cellInput(row.note, index, "note")}</td>
          <td>${modelHitBadge(row)}</td>
          <td>${escapeHtml(row.hit_category || "")}</td>
          <td>${escapeHtml(row.hit_brand || "")}</td>
          <td>${escapeHtml(row.hit_model || "")}</td>
          <td class="candidate-cell">${modelCandidatesText(row)}</td>
          <td>${escapeHtml(row.match_type || "未命中")}</td>
          <td>${modelConfidence(row.confidence)}</td>
          <td>${governableBadge(row)}</td>
          <td>${escapeHtml(row.governance_type || "")}</td>
          <td>${escapeHtml(row.governance_owner || "")}</td>
          <td>${escapeHtml(row.no_result_reason || row.recommended_action || "")}</td>
        </tr>
      `;
    })
    .join("");
}

function renderTasks(activeId) {
  if (!els.taskList || !els.taskLog) return;
  if (!state.tasks.length) {
    els.taskList.innerHTML = `<tr><td colspan="6" class="empty">暂无分析记录</td></tr>`;
    els.taskLog.textContent = "选择一条记录查看运行日志";
    if (els.selectedTaskName) els.selectedTaskName.textContent = "选择一条任务查看详情";
    if (els.taskPageInfo) els.taskPageInfo.textContent = "0 / 0";
    if (els.prevTaskPage) els.prevTaskPage.disabled = true;
    if (els.nextTaskPage) els.nextTaskPage.disabled = true;
    return;
  }
  if (activeId) state.activeTaskId = activeId;
  const selected = state.tasks.find((task) => task.id === state.activeTaskId) || state.tasks[0];
  state.activeTaskId = selected.id;
  const selectedIndex = state.tasks.findIndex((task) => task.id === selected.id);
  if (activeId && selectedIndex >= 0) state.taskPage = Math.floor(selectedIndex / TASK_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(state.tasks.length / TASK_PAGE_SIZE));
  state.taskPage = Math.min(Math.max(0, state.taskPage), totalPages - 1);
  const pageStart = state.taskPage * TASK_PAGE_SIZE;
  const pageTasks = state.tasks.slice(pageStart, pageStart + TASK_PAGE_SIZE);
  if (els.selectedTaskName) {
    els.selectedTaskName.textContent = `当前任务：${selected.title || "未命名任务"} · ${sourceInfoText(selected.sourceInfo)}`;
  }
  els.taskList.innerHTML = pageTasks
    .map((task) => {
      const active = task.id === selected.id ? " active" : "";
      const hasRows = taskSourceRows(task).length > 0;
      const hasResults = Array.isArray(task.results) && task.results.length > 0;
      const canContinue = canContinueTask(task);
      return `
        <tr class="${active}" data-task-id="${task.id}">
          <td>
            <strong>${escapeHtml(task.title)}</strong>
            <small class="task-source">${escapeHtml(sourceInfoText(task.sourceInfo))}</small>
          </td>
          <td>${taskStatusBadge(task.status)}</td>
          <td>${task.done || 0}/${task.total || 0}</td>
          <td>${escapeHtml(task.model || "-")}</td>
          <td>${formatDateTime(task.createdAt)}</td>
          <td>
            <div class="task-actions">
              <button class="mini-button" data-action="export-source" data-task-id="${task.id}" ${hasRows ? "" : "disabled"}>无结果数据</button>
              <button class="mini-button" data-action="view-report" data-task-id="${task.id}" ${hasResults ? "" : "disabled"}>分析报告</button>
              <button class="mini-button" data-action="export-synonyms" data-task-id="${task.id}" ${hasResults ? "" : "disabled"}>同义词</button>
              <button class="mini-button continue" data-action="continue-analysis" data-task-id="${task.id}" ${canContinue ? "" : "disabled"}>继续分析</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
  if (els.taskPageInfo) els.taskPageInfo.textContent = `${state.taskPage + 1} / ${totalPages}（每页 ${TASK_PAGE_SIZE} 条）`;
  if (els.prevTaskPage) els.prevTaskPage.disabled = state.taskPage === 0;
  if (els.nextTaskPage) els.nextTaskPage.disabled = state.taskPage >= totalPages - 1;
  els.taskLog.textContent = selected.logs?.length ? selected.logs.join("\n") : "暂无日志";
}

function taskStatusBadge(status) {
  const statusMap = {
    completed: { label: "成功", tone: "success" },
    failed: { label: "失败", tone: "failed" },
    running: { label: "运行中", tone: "running" },
    queued: { label: "排队中", tone: "queued" },
    canceled: { label: "已取消", tone: "canceled" },
  };
  const item = statusMap[status] || { label: status || "未知", tone: "canceled" };
  return `<span class="task-status ${item.tone}"><i></i>${escapeHtml(item.label)}</span>`;
}

function taskSourceRows(task) {
  if (Array.isArray(task?.sourceRows) && task.sourceRows.length) return task.sourceRows;
  if (Array.isArray(task?.rows) && task.rows.length) return task.rows;
  if (Array.isArray(task?.results) && task.results.length) return task.results;
  return [];
}

function exportTaskSource(task) {
  const rows = taskSourceRows(task).map((row) => ({
    key_word: row.key_word || row.query || "",
    is_result: row.result_status ?? row.is_result ?? "0",
    search_uv: row.search_uv || 0,
    search_pv: row.search_pv || 0,
  }));
  download(`${task.title || "无结果数据"}.csv`, toCsv(rows, ["key_word", "is_result", "search_uv", "search_pv"]));
}

function exportTaskSynonyms(task) {
  const rows = (task.results || [])
    .filter((row) => row.selected && row.synonym)
    .map((row) => ({
      关键词: row.query,
      同义词: row.synonym,
    }));
  download(`${task.title || "同义词后台导入包"}-同义词.csv`, toCsv(rows, ["关键词", "同义词"]));
}

function viewTaskReport(task) {
  if (!Array.isArray(task.results) || !task.results.length) return;
  const rows = normalizeTaskResults(task.results, taskSourceRows(task));
  const report = buildReport(task, rows);
  state.lastDialogReportText = report.text;
  if (els.dialogReportText) els.dialogReportText.innerHTML = report.html;
  els.reportDialog?.showModal();
}

function switchTab(tabName) {
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));
  els.workspaceView.classList.toggle("active", tabName === "workspace");
  els.recordsView.classList.toggle("active", tabName === "records");
  els.assetsView?.classList.toggle("active", tabName === "assets");
  if (tabName === "assets") renderArchive();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toCsv(rows, headers) {
  const escape = (value) => {
    const text = String(value ?? "");
    if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
    return text;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}

function download(filename, content) {
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportSynonyms() {
  const rows = state.results
    .filter((row) => row.selected && row.synonym)
    .map((row) => ({
      关键词: row.query,
      同义词: row.synonym,
    }));
  if (!rows.length) {
    els.progress.textContent = "没有已勾选且有同义词的词项，先在「审核候选词」里勾选。";
    return;
  }
  download("同义词后台导入包.csv", toCsv(rows, ["关键词", "同义词"]));
}

function exportOthers() {
  const rows = state.results
    .filter((row) => !row.selected || !row.synonym)
    .map((row) => ({
      原词: row.query,
      类型: row.query_type,
      品类: row.category,
      品牌: row.brand,
      型号: row.model,
      建议动作: row.action,
      原因: row.note,
    }));
  download("非同义词问题清单.csv", toCsv(rows, ["原词", "类型", "品类", "品牌", "型号", "建议动作", "原因"]));
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function archiveKey(query) {
  return String(query || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function archiveMapAdd(map, key, weight = 1) {
  const text = String(key || "").trim() || "未识别";
  map[text] = (map[text] || 0) + Number(weight || 0);
}

function archiveTopKey(map) {
  return Object.entries(map || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function isArchiveEligible(row) {
  const query = String(row?.query || "").trim();
  const queryType = String(row?.query_type || "").trim();
  const action = String(row?.action || "").trim();
  if (!query) return false;
  if (queryType === "无效搜索" || queryType.includes("无效")) return false;
  if (action === "忽略") return false;
  return true;
}

function recomputeArchiveItem(item) {
  const sources = Object.values(item.sources || {});
  item.totalPv = sources.reduce((sum, source) => sum + Number(source.search_pv || 0), 0);
  item.totalUv = sources.reduce((sum, source) => sum + Number(source.search_uv || 0), 0);
  item.hitCount = sources.length;
  const categoryMap = {};
  const typeMap = {};
  const actionMap = {};
  const brandMap = {};
  sources.forEach((source) => {
    const weight = Math.max(1, Number(source.search_pv || 0));
    archiveMapAdd(categoryMap, source.category, weight);
    archiveMapAdd(typeMap, source.query_type, weight);
    archiveMapAdd(actionMap, source.action, weight);
    archiveMapAdd(brandMap, source.brand, weight);
  });
  item.category = archiveTopKey(categoryMap);
  item.query_type = archiveTopKey(typeMap);
  item.action = archiveTopKey(actionMap);
  item.brand = archiveTopKey(brandMap);
  item.categoryMap = categoryMap;
  item.typeMap = typeMap;
  item.actionMap = actionMap;
  item.brandMap = brandMap;
  item.lastSeen = sources.map((source) => source.analyzedAt).sort().at(-1) || item.lastSeen;
  return item;
}

function removeTaskArchiveContributions(taskId) {
  if (!taskId) return;
  Object.keys(state.archive.items).forEach((key) => {
    const item = state.archive.items[key];
    if (!item?.sources?.[taskId]) return;
    delete item.sources[taskId];
    if (!Object.keys(item.sources).length) {
      delete state.archive.items[key];
    } else {
      recomputeArchiveItem(item);
    }
  });
}

function archiveTaskResults(task, rows = []) {
  if (!task?.id || !Array.isArray(rows) || !rows.length) return;
  removeTaskArchiveContributions(task.id);
  const analyzedAt = new Date().toISOString();
  rows.forEach((row) => {
    if (!isArchiveEligible(row)) return;
    const key = archiveKey(row.query);
    if (!key) return;
    const item = state.archive.items[key] || {
      query: String(row.query || "").trim(),
      firstSeen: analyzedAt,
      lastSeen: analyzedAt,
      sources: {},
    };
    item.query = item.query || String(row.query || "").trim();
    item.sources[task.id] = {
      taskId: task.id,
      taskTitle: task.title || "未命名任务",
      analyzedAt,
      search_uv: Number(row.search_uv || 0),
      search_pv: Number(row.search_pv || 0),
      query_type: row.query_type || "其他",
      category: row.category || "未识别",
      brand: row.brand || "",
      model: row.model || "",
      synonym: row.synonym || "",
      action: row.action || "人工确认",
    };
    state.archive.items[key] = recomputeArchiveItem(item);
  });
  state.archive.updatedAt = analyzedAt;
  saveArchive();
  renderArchive();
}

function archiveItems() {
  return Object.values(state.archive.items || {}).sort((a, b) => Number(b.totalPv || 0) - Number(a.totalPv || 0));
}

function archiveWeight(item, totalPv = null) {
  if (totalPv === null) {
    totalPv = archiveItems().reduce((sum, entry) => sum + Number(entry.totalPv || 0), 0);
  }
  return totalPv > 0 ? Number(item.totalPv || 0) : Math.max(1, Number(item.hitCount || 1));
}

function archiveMetricName(totalPv) {
  return totalPv > 0 ? "PV" : "词数";
}

function archiveWeightedCounts(items, field, filter = () => true) {
  const totalPv = items.reduce((sum, item) => sum + Number(item.totalPv || 0), 0);
  return items.reduce((map, item) => {
    if (!filter(item)) return map;
    archiveMapAdd(map, item[field], archiveWeight(item, totalPv));
    return map;
  }, {});
}

function archiveWeightSum(items, filter = () => true) {
  const totalPv = items.reduce((sum, item) => sum + Number(item.totalPv || 0), 0);
  return items.reduce((sum, item) => (filter(item) ? sum + archiveWeight(item, totalPv) : sum), 0);
}

function isGapAction(action) {
  const text = String(action || "");
  return ["后续提需求", "标记暂不支持", "补FAQ", "人工确认"].some((item) => text.includes(item));
}

function isSpecificDemand(item) {
  const type = String(item.query_type || "");
  return ["具体型号", "品牌型号混写", "电商标题"].some((value) => type.includes(value));
}

function isBroadDemand(item) {
  const type = String(item.query_type || "");
  return type.includes("宽泛品类");
}

function isServiceDemand(item) {
  const type = String(item.query_type || "");
  const action = String(item.action || "");
  return type.includes("流程售后") || action.includes("补FAQ");
}

function isBrandDemand(item) {
  const brand = String(item.brand || "").trim();
  return Boolean(brand && brand !== "未识别");
}

function archiveTopTerms(items, limit = 3) {
  return items
    .slice()
    .sort((a, b) => Number(b.totalPv || 0) - Number(a.totalPv || 0))
    .slice(0, limit)
    .map((item) => item.query)
    .join("、");
}

function insightCardHtml(title, value, body, tone = "") {
  return `
    <div class="insight-card ${tone}">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(body)}</p>
    </div>
  `;
}

function portraitBarHtml(label, value, total, meta = "") {
  const ratio = Math.min(100, Math.round((Number(value || 0) / Math.max(Number(total || 0), 1)) * 100));
  return `
    <div class="portrait-bar">
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${ratio}%</strong>
      </div>
      <i><b style="width:${ratio}%"></b></i>
      ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
    </div>
  `;
}

function categoryOpportunityHtml(category, value, total, terms, metricName) {
  return `
    <div class="opportunity-item">
      <div>
        <strong>${escapeHtml(category)}</strong>
        <span>${escapeHtml(formatNumber(value))} ${escapeHtml(metricName)} · 占 ${escapeHtml(percent(value, total))}</span>
      </div>
      <p>${escapeHtml(terms || "暂无代表词")}</p>
    </div>
  `;
}

function capabilityItemHtml(item, total, metricName) {
  const ratio = Math.min(100, Math.round((Number(item.weight || 0) / Math.max(Number(total || 0), 1)) * 100));
  const priority = ratio >= 30 ? "P0" : ratio >= 12 ? "P1" : "P2";
  return `
    <div class="capability-item">
      <div class="capability-head">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${priority}</span>
      </div>
      <p>${escapeHtml(item.reason)}</p>
      <div class="capability-progress"><i style="width:${ratio}%"></i></div>
      <small>${escapeHtml(formatNumber(item.weight))} ${escapeHtml(metricName)} · 占 ${ratio}% · 代表词：${escapeHtml(item.terms || "暂无")}</small>
    </div>
  `;
}

function capabilityTerms(items, filter, limit = 5) {
  return archiveTopTerms(items.filter(filter), limit);
}

function buildSearchCapabilities(items, totalWeight) {
  const synonymWeight = archiveWeightSum(items, (item) => String(item.action || "").includes("导入同义词"));
  const modelWeight = archiveWeightSum(items, isSpecificDemand);
  const broadWeight = archiveWeightSum(items, isBroadDemand);
  const serviceWeight = archiveWeightSum(items, isServiceDemand);
  const longTailItems = items.filter((item) => Number(item.totalPv || 0) <= 10 || Number(item.hitCount || 0) <= 1);
  const longTailWeight = archiveWeightSum(longTailItems);
  const gapWeight = archiveWeightSum(items, (item) => isGapAction(item.action));
  const brandModelFilter = (item) => isSpecificDemand(item) || isBrandDemand(item);
  const gapCategoryMap = archiveWeightedCounts(
    items,
    "category",
    (item) => isGapAction(item.action) && item.category && item.category !== "未识别",
  );
  const topGapCategory = topEntries(gapCategoryMap, 1)[0]?.[0] || "";
  const candidates = [
    {
      title: "品牌 / 型号识别与标准化",
      weight: Math.max(modelWeight, archiveWeightSum(items, brandModelFilter)),
      reason: "用户搜索里有大量明确品牌、型号、商品标题，搜索需要把口语词、长标题、型号混写统一识别到标准商品词。",
      terms: capabilityTerms(items, brandModelFilter),
    },
    {
      title: "宽泛品类词兜底召回",
      weight: broadWeight,
      reason: "用户只输入品类意图时，不一定有明确型号，需要搜索能给出可回收品类、推荐入口或承接页，降低空结果。",
      terms: capabilityTerms(items, isBroadDemand),
    },
    {
      title: "长尾搜索词扩展召回",
      weight: longTailWeight,
      reason: "大量低频词分散出现，单靠人工同义词维护成本高，需要支持长尾词语义扩展和近义召回。",
      terms: archiveTopTerms(longTailItems, 5),
    },
    {
      title: "售后 / 流程意图识别",
      weight: serviceWeight,
      reason: "流程、售后、咨询类搜索不应简单走商品召回，需要识别后引导 FAQ、客服或业务流程入口。",
      terms: capabilityTerms(items, isServiceDemand),
    },
    {
      title: "未覆盖品类识别与需求池",
      weight: gapWeight,
      reason: topGapCategory
        ? `「${topGapCategory}」等品类出现搜索需求但不能直接靠同义词解决，需要中台支持品类覆盖识别和需求沉淀。`
        : "部分搜索需求无法通过同义词解决，需要形成中台侧未覆盖品类识别和需求池。",
      terms: capabilityTerms(items, (item) => isGapAction(item.action)),
    },
    {
      title: "同义词 / 别名自动扩展",
      weight: synonymWeight,
      reason: "存在可直接导入同义词后台的词，说明用户表达和标准词之间有稳定映射，适合做自动化别名扩展。",
      terms: capabilityTerms(items, (item) => String(item.action || "").includes("导入同义词")),
    },
  ];
  return candidates
    .filter((item) => item.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6);
}

function renderArchive() {
  if (!els.archiveTableBody) return;
  const items = archiveItems();
  const keyword = (els.archiveSearchInput?.value || "").trim().toLowerCase();
  const totalPv = items.reduce((sum, item) => sum + Number(item.totalPv || 0), 0);
  const totalWeight = totalPv > 0 ? totalPv : items.length;
  const metricName = archiveMetricName(totalPv);
  const categoryMap = archiveWeightedCounts(items, "category");
  const typeMap = archiveWeightedCounts(items, "query_type");
  const actionMap = archiveWeightedCounts(items, "action");
  const gapCategoryMap = archiveWeightedCounts(
    items,
    "category",
    (item) => isGapAction(item.action) && item.category && item.category !== "未识别",
  );
  const topType = topEntries(typeMap, 1)[0];
  const topAction = topEntries(actionMap, 1)[0];
  const longTailItems = items.filter((item) => (totalPv > 0 ? Number(item.totalPv || 0) <= 10 : Number(item.hitCount || 0) <= 1));
  const longTailWeight = archiveWeightSum(longTailItems);
  const headWeight = archiveWeightSum(items.slice(0, 20));
  const gapWeight = archiveWeightSum(items, (item) => isGapAction(item.action));
  const specificWeight = archiveWeightSum(items, isSpecificDemand);
  const broadWeight = archiveWeightSum(items, isBroadDemand);
  const serviceWeight = archiveWeightSum(items, isServiceDemand);
  const brandWeight = archiveWeightSum(items, isBrandDemand);

  els.archiveTermCount.textContent = formatNumber(items.length);
  els.archivePvCount.textContent = formatNumber(totalPv);
  els.archiveCategoryCount.textContent = formatNumber(Object.keys(categoryMap).filter((key) => key !== "未识别").length);
  els.archiveLongTailCount.textContent = formatNumber(longTailItems.length);
  els.archiveUpdatedAt.textContent = state.archive.updatedAt ? `更新于 ${formatDateTime(state.archive.updatedAt)}` : "暂无数据";
  els.exportArchiveBtn.disabled = !items.length;
  els.clearArchiveBtn.disabled = !state.tasks.some((task) => Array.isArray(task.results) && task.results.length);

  const topCategory = topEntries(categoryMap, 1)[0];
  const topGapCategory = topEntries(gapCategoryMap, 1)[0];
  const topGapTerms = topGapCategory
    ? archiveTopTerms(items.filter((item) => item.category === topGapCategory[0] && isGapAction(item.action)), 4)
    : "";
  const portraitSummary = topCategory
    ? `当前真实搜索需求主要集中在「${topCategory[0]}」，其中 ${percent(specificWeight, totalWeight)} 的热度来自明确商品/型号类搜索；${percent(gapWeight, totalWeight)} 的热度不能直接靠同义词解决，更像品类覆盖、FAQ 或供给能力缺口。`
    : "暂无足够数据形成搜索画像。";
  els.searchPortrait.innerHTML = items.length
    ? `
      <div class="portrait-summary">
        <h5>画像结论</h5>
        <p>${escapeHtml(portraitSummary)}</p>
      </div>
      <div class="insight-grid">
        ${insightCardHtml("核心需求池", topCategory?.[0] || "未识别", `Top20 搜索贡献 ${percent(headWeight, totalWeight)} ${metricName}，代表用户已经有稳定高频诉求。`, "hot")}
        ${insightCardHtml("覆盖缺口", topGapCategory?.[0] || "暂不明显", topGapCategory ? `该品类有 ${formatNumber(topGapCategory[1])} ${metricName} 需要非同义词治理，代表词：${topGapTerms}` : "当前缺口主要分散，暂未形成集中品类。", "gap")}
        ${insightCardHtml("长尾机会", `${percent(longTailWeight, totalWeight)}`, `${longTailItems.length} 个长尾词贡献 ${formatNumber(longTailWeight)} ${metricName}，适合沉淀为品类覆盖观察池。`, "tail")}
      </div>
      <div class="portrait-bars">
        ${portraitBarHtml("明确商品/型号搜索", specificWeight, totalWeight, "用户知道自己要卖什么，适合做标准词、型号词、品牌词覆盖。")}
        ${portraitBarHtml("宽泛品类搜索", broadWeight, totalWeight, "用户只表达品类意图，适合补品类承接页或兜底推荐。")}
        ${portraitBarHtml("售后/流程型搜索", serviceWeight, totalWeight, "这类搜索未必该进同义词，更适合 FAQ 或流程入口。")}
        ${portraitBarHtml("品牌意图搜索", brandWeight, totalWeight, "品牌词占比越高，越需要关注品牌识别和召回能力。")}
      </div>
    `
    : `<div class="empty compact">暂无资产数据</div>`;

  els.categoryGapList.innerHTML = topEntries(gapCategoryMap, 8)
    .map(([category, value]) => {
      const terms = archiveTopTerms(items.filter((item) => item.category === category && isGapAction(item.action)), 4);
      return categoryOpportunityHtml(category, value, totalWeight, terms, metricName);
    })
    .join("") || `<div class="empty compact">暂无品类数据</div>`;

  const capabilities = buildSearchCapabilities(items, totalWeight);
  els.searchCapabilityList.innerHTML = capabilities.length
    ? capabilities.map((item) => capabilityItemHtml(item, totalWeight, metricName)).join("")
    : `<div class="empty compact">暂无可提需的搜索能力项</div>`;

  const visibleItems = items.filter((item) => {
    if (!keyword) return true;
    const text = `${item.query} ${item.category} ${item.brand} ${item.query_type} ${item.action}`.toLowerCase();
    return text.includes(keyword);
  });
  els.archiveTableBody.innerHTML = visibleItems.length
    ? visibleItems.slice(0, 300).map((item) => `
        <tr>
          <td><strong>${escapeHtml(item.query)}</strong><br><small>累计出现 ${item.hitCount || 0} 次分析</small></td>
          <td>${formatNumber(item.totalPv)}</td>
          <td>${formatNumber(item.totalUv)}</td>
          <td>${escapeHtml(item.category || "未识别")}</td>
          <td>${escapeHtml(item.query_type || "其他")}</td>
          <td>${escapeHtml(item.action || "人工确认")}</td>
          <td>${escapeHtml(formatDateTime(item.lastSeen))}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="7" class="empty">${items.length ? "没有匹配的存档词" : "AI 分析完成后，这里会自动沉淀真实搜索词。"}</td></tr>`;
}

function exportArchive() {
  const rows = archiveItems().map((item) => ({
    搜索词: item.query,
    累计PV: item.totalPv,
    累计UV: item.totalUv,
    品类: item.category,
    类型: item.query_type,
    品牌: item.brand,
    建议动作: item.action,
    分析次数: item.hitCount,
    首次分析: formatDateTime(item.firstSeen),
    最近分析: formatDateTime(item.lastSeen),
  }));
  if (!rows.length) return;
  download("搜索概览.csv", toCsv(rows, ["搜索词", "累计PV", "累计UV", "品类", "类型", "品牌", "建议动作", "分析次数", "首次分析", "最近分析"]));
}

function rebuildArchive() {
  state.archive = { items: {}, updatedAt: "" };
  state.tasks.forEach((task) => {
    if (!Array.isArray(task.results) || !task.results.length) return;
    archiveTaskResults(task, normalizeTaskResults(task.results, taskSourceRows(task)));
  });
  saveArchive();
  renderArchive();
}

function backfillArchiveFromTasksOnce() {
  if (localStorage.getItem("rsg_archive_backfilled_v1") === "1") return;
  state.tasks.forEach((task) => {
    if (!Array.isArray(task.results) || !task.results.length) return;
    archiveTaskResults(task, normalizeTaskResults(task.results, taskSourceRows(task)));
  });
  localStorage.setItem("rsg_archive_backfilled_v1", "1");
  renderArchive();
}

function countMap(rows, field) {
  return rows.reduce((map, row) => {
    const key = row[field] || "其他";
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
}

function topEntries(map, limit = 8) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function percent(value, total) {
  return `${Math.round((value / Math.max(total, 1)) * 100)}%`;
}

function actionSummaryText(actionRows, total) {
  if (!actionRows.length) return "本次暂无可归纳的建议动作，建议补充分析结果后再复盘。";
  const top = actionRows[0];
  const synonymAction = actionRows.find(([key]) => key === "导入同义词");
  const otherActions = actionRows
    .filter(([key]) => key !== top[0] && key !== "导入同义词")
    .slice(0, 2)
    .map(([key, value]) => `「${key}」${value} 个`)
    .join("、");
  const synonymText = synonymAction
    ? `其中「导入同义词」${synonymAction[1]} 个，占 ${percent(synonymAction[1], total)}，可作为本轮优先审核和导入的核心词包。`
    : "本轮暂无明确的「导入同义词」动作，建议优先确认是否存在可兜底的标准词映射。";
  const otherText = otherActions ? `其余动作主要集中在${otherActions}。` : "其余动作占比较低，可作为人工抽检补充。";
  return `本次建议动作以「${top[0]}」为主，共 ${top[1]} 个，占 ${percent(top[1], total)}。${synonymText}${otherText}`;
}

function buildReport(task, rows) {
  const reportRows = Array.isArray(rows) ? rows : [];
  const total = reportRows.length;
  const synonym = reportRows.filter((row) => row.selected && row.synonym);
  const typeCounts = countMap(reportRows, "query_type");
  const actionCounts = countMap(reportRows, "action");
  const otherCount = total - synonym.length;
  const candidateRate = percent(synonym.length, total);
  const typeRows = topEntries(typeCounts, 8);
  const actionRows = topEntries(actionCounts, 20);
  const reviewRows = synonym.slice(0, 30);
  const generatedAt = formatDateTime(new Date().toISOString());
  const actionSummary = actionSummaryText(actionRows, total);
  const sourceText = sourceInfoText(task?.sourceInfo);
  const text = [
    "4. 治理复盘",
    "稀土壁搜索治理平台复盘",
    "",
    `任务名称：${task?.title || "当前分析"}`,
    sourceText,
    `生成时间：${generatedAt}`,
    "",
    "一、本次概览",
    `共分析无结果词：${total}`,
    `建议导入同义词后台：${synonym.length}`,
    `需要其他治理：${otherCount}`,
    `同义词候选占比：${candidateRate}`,
    "",
    "二、词类型分布",
    ...typeRows.map(([key, value]) => `${key}：${value}（${percent(value, total)}）`),
    "",
    "三、建议动作分布",
    actionSummary,
    "",
    "四、建议处理词项",
    ...(reviewRows.length
      ? reviewRows.map((row) => `${row.query} -> ${row.synonym}｜${row.action || "建议导入"}｜${row.note || ""}`)
      : ["暂无同义词候选"]),
    "",
    "五、下一步动作",
    "审核同义词候选，删除高风险映射",
    "导出 CSV 并批量导入现有同义词后台",
    "下个周期再次跑无结果 SQL，验证这些词是否仍然无结果",
  ].join("\n");
  const html = `
    <div class="report-title-block">
      <h3>4. 治理复盘</h3>
      <p>稀土壁搜索治理平台复盘</p>
      <span>${escapeHtml(task?.title || "当前分析")} · ${escapeHtml(sourceText)} · ${generatedAt}</span>
    </div>

    <div class="report-module">
      <h4>一、本次概览</h4>
      <div class="report-grid">
        <div class="report-card"><strong>${total}</strong><span>共分析无结果词</span></div>
        <div class="report-card"><strong>${synonym.length}</strong><span>建议导入同义词后台</span></div>
        <div class="report-card"><strong>${otherCount}</strong><span>需要其他治理</span></div>
        <div class="report-card"><strong>${candidateRate}</strong><span>同义词候选占比</span></div>
      </div>
    </div>

    <div class="report-module">
      <h4>二、词类型分布</h4>
      <div class="report-bars">
        ${typeRows.map(([key, value]) => {
          const ratio = Math.round((value / Math.max(total, 1)) * 100);
          return `
            <div class="report-bar-row">
              <div class="report-bar-label"><strong>${escapeHtml(key)}</strong><span>${value} 个 · ${ratio}%</span></div>
              <div class="report-bar-track"><i style="width:${ratio}%"></i></div>
            </div>
          `;
        }).join("") || `<div class="report-note">暂无词类型数据</div>`}
      </div>
    </div>

    <div class="report-module">
      <h4>三、建议动作分布</h4>
      <p class="report-insight">${escapeHtml(actionSummary)}</p>
    </div>

    <div class="report-module">
      <h4>四、建议处理词项</h4>
      <table class="report-table compare-table">
        <thead><tr><th>原词</th><th>优化后词</th><th>处理建议</th><th>备注</th></tr></thead>
        <tbody>
          ${reviewRows.map((row) => `
            <tr>
              <td><span class="origin-word">${escapeHtml(row.query)}</span></td>
              <td><span class="target-word">${escapeHtml(row.synonym)}</span></td>
              <td>${escapeHtml(row.action || "建议导入同义词")}</td>
              <td>${escapeHtml(row.note || "建议导入")}</td>
            </tr>
          `).join("") || `<tr><td colspan="4">暂无同义词候选</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="report-module">
      <h4>五、下一步动作</h4>
      <ul class="report-list">
        <li><span>审核同义词候选，删除高风险映射</span><strong>产品确认</strong></li>
        <li><span>导出 CSV 并批量导入现有同义词后台</span><strong>立即执行</strong></li>
        <li><span>下个周期再次跑无结果 SQL，验证这些词是否仍然无结果</span><strong>效果复盘</strong></li>
      </ul>
    </div>
  `;
  return { text, html };
}

function makeReport(task = state.currentTask) {
  const report = buildReport(task, state.results);
  state.lastReportText = report.text;
  els.reportText.innerHTML = report.html;
  els.reportPanel.classList.remove("hidden");
}

function openConfig() {
  els.apiKeyInput.value = state.config.apiKey || "";
  els.modelInput.value = state.config.model || "gpt-4.1-mini";
  els.baseUrlInput.value = state.config.baseUrl || "https://api.openai.com/v1";
  if (els.modelSqlEditor) {
    els.modelSqlEditor.value = state.modelSqlTemplate || "";
    els.modelSqlEditorState.textContent = state.modelSqlTemplate
      ? "当前使用本机自定义机型库 SQL。"
      : "展开后会读取默认机型库 SQL；它只作为 AI 分析底层校验，不在工作台展示。";
  }
  updateConfigState();
  els.configDialog.showModal();
}

els.configBtn.addEventListener("click", openConfig);
els.saveConfigBtn.addEventListener("click", saveConfig);

els.fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const rows = parseText(text);
    if (!rows.length) throw new Error("没有识别到搜索词");
    setRows(rows, file.name);
  } catch (error) {
    els.fileInput.closest(".dropzone")?.classList.add("error");
    els.fileStatus.textContent = `上传失败：${error.message || "请检查文件格式"}`;
    els.fileInput.value = "";
  }
});

els.uploadList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action='delete-upload-file']");
  if (button) {
    deleteUploadedFile(button.dataset.uploadId);
    return;
  }
  const card = event.target.closest(".upload-file-card[data-upload-id]");
  if (!card) return;
  activateUploadedFile(card.dataset.uploadId);
});

els.uploadList?.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  const card = event.target.closest(".upload-file-card[data-upload-id]");
  if (!card) return;
  event.preventDefault();
  activateUploadedFile(card.dataset.uploadId);
});

els.runSqlBtn.addEventListener("click", runNoResultSql);
els.editSqlBtn.addEventListener("click", openSqlEditor);
els.saveSqlBtn.addEventListener("click", () => {
  saveSqlTemplate(els.sqlEditor.value);
  els.sqlEditorState.textContent = "SQL 已保存到本机。";
});
els.resetSqlBtn.addEventListener("click", async () => {
  saveSqlTemplate("");
  els.sqlEditorState.textContent = "正在恢复默认 SQL...";
  try {
    els.sqlEditor.value = await fetchDefaultSql();
    els.sqlEditorState.textContent = "已恢复默认 SQL。点击保存可重新存为自定义 SQL。";
  } catch (error) {
    els.sqlEditorState.textContent = error.message || "默认 SQL 读取失败";
  }
});
els.saveModelSqlBtn?.addEventListener("click", () => {
  saveModelSqlTemplate(els.modelSqlEditor.value);
  els.modelSqlEditorState.textContent = "机型库 SQL 已保存到本机，只用于底层分析配置。";
});
els.syncModelLibraryBtn?.addEventListener("click", runModelLibrarySql);
els.resetModelSqlBtn?.addEventListener("click", async () => {
  saveModelSqlTemplate("");
  els.modelSqlEditorState.textContent = "正在恢复默认机型库 SQL...";
  try {
    els.modelSqlEditor.value = await fetchDefaultModelSql();
    els.modelSqlEditorState.textContent = "已恢复默认机型库 SQL。点击保存可重新存为自定义 SQL。";
  } catch (error) {
    els.modelSqlEditorState.textContent = error.message || "默认机型库 SQL 读取失败";
  }
});
els.modelSqlEditor?.closest("details")?.addEventListener("toggle", async (event) => {
  if (!event.currentTarget.open || els.modelSqlEditor.value.trim()) return;
  els.modelSqlEditorState.textContent = "正在读取默认机型库 SQL...";
  try {
    els.modelSqlEditor.value = await fetchDefaultModelSql();
    els.modelSqlEditorState.textContent = "当前展示默认机型库 SQL，保存后会作为本机自定义 SQL 使用。";
  } catch (error) {
    els.modelSqlEditorState.textContent = error.message || "默认机型库 SQL 读取失败";
  }
});
els.resetWorkspaceBtn?.addEventListener("click", resetWorkspace);
els.analyzeBtn.addEventListener("click", analyze);
els.pauseAnalyzeBtn.addEventListener("click", () => {
  if (!state.currentTask) return;
  state.paused = !state.paused;
  els.pauseAnalyzeBtn.textContent = state.paused ? "继续" : "暂停";
  appendTaskLog(state.currentTask, state.paused ? "收到暂停指令" : "继续分析");
});
els.cancelAnalyzeBtn.addEventListener("click", () => {
  if (!state.currentTask) return;
  state.canceled = true;
  state.analyzeAbortController?.abort();
  appendTaskLog(state.currentTask, "收到取消指令");
});
els.progress.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action='view-current-log']");
  if (!button || !state.currentTask) return;
  switchTab("records");
  renderTasks(state.currentTask.id);
  requestAnimationFrame(() => els.taskLog?.scrollIntoView({ behavior: "smooth", block: "center" }));
});
els.analysisTaskMeta?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action='cancel-queued-task']");
  if (!button) return;
  cancelQueuedTask(button.dataset.taskId);
});
els.exportSynBtn.addEventListener("click", exportSynonyms);
els.exportAuditSynBtn.addEventListener("click", exportSynonyms);
els.selectImportableBtn.addEventListener("click", () => {
  const importable = state.results.filter((row) => row.recommend_synonym && row.synonym);
  if (!importable.length) {
    els.auditSummary.textContent = "当前没有 AI 建议导入同义词后台的词，无法批量勾选。";
    return;
  }
  state.results.forEach((row) => {
    row.selected = Boolean(row.recommend_synonym && row.synonym);
  });
  syncActiveTaskResults();
  render();
  els.auditSummary.textContent = `已勾选 ${importable.length} 个可导入同义词后台的候选词。`;
});
els.clearImportBtn.addEventListener("click", () => {
  const selected = state.results.filter((row) => row.selected && row.synonym).length;
  if (!selected) {
    els.auditSummary.textContent = "当前没有已勾选的同义词候选。";
    return;
  }
  state.results.forEach((row) => {
    row.selected = false;
  });
  syncActiveTaskResults();
  render();
  els.auditSummary.textContent = "已清空本次勾选。";
});
els.exportOtherBtn.addEventListener("click", exportOthers);
els.reportBtn.addEventListener("click", makeReport);
els.copyReportBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(state.lastReportText || els.reportText.textContent);
});
els.copyDialogReportBtn?.addEventListener("click", async () => {
  await navigator.clipboard.writeText(state.lastDialogReportText || els.dialogReportText?.textContent || "");
});

els.archiveSearchInput?.addEventListener("input", renderArchive);
els.exportArchiveBtn?.addEventListener("click", exportArchive);
els.clearArchiveBtn?.addEventListener("click", rebuildArchive);

els.filterType.addEventListener("change", render);
els.searchFilter.addEventListener("input", render);

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

els.prevTaskPage?.addEventListener("click", () => {
  state.taskPage = Math.max(0, state.taskPage - 1);
  renderTasks(state.activeTaskId);
});

els.nextTaskPage?.addEventListener("click", () => {
  state.taskPage += 1;
  renderTasks(state.activeTaskId);
});

els.taskList.addEventListener("click", (event) => {
  const actionButton = event.target.closest("button[data-action]");
  if (actionButton) {
    const task = state.tasks.find((entry) => entry.id === actionButton.dataset.taskId);
    if (!task) return;
    if (actionButton.dataset.action === "export-source") exportTaskSource(task);
    if (actionButton.dataset.action === "view-report") viewTaskReport(task);
    if (actionButton.dataset.action === "export-synonyms") exportTaskSynonyms(task);
    if (actionButton.dataset.action === "continue-analysis") {
      if (!state.config.apiKey) {
        openConfig();
        return;
      }
      const rows = taskSourceRows(task);
      if (!rows.length || analyzedCount(task) >= rows.length) return;
      state.rows = rows;
      state.results = normalizeTaskResults(task.results, rows);
      state.summaryRows = null;
      state.summaryResults = null;
      state.activeAuditTask = task;
      render();
      switchTab("workspace");
      runAnalysisTask(task, rows, { resume: true });
    }
    return;
  }
  const item = event.target.closest("tr[data-task-id]");
  if (!item) return;
  const task = state.tasks.find((entry) => entry.id === item.dataset.taskId);
  if (!task) return;
  if (Array.isArray(task.results) && task.results.length) {
    const rows = normalizeTaskRows(taskSourceRows(task));
    state.rows = rows;
    state.results = normalizeTaskResults(task.results, rows);
    state.summaryRows = null;
    state.summaryResults = null;
    state.activeAuditTask = task;
    render();
  }
  renderTasks(task.id);
});

els.resultBody.addEventListener("input", (event) => {
  const target = event.target;
  const rowIndex = Number(target.dataset.row);
  const field = target.dataset.field;
  if (!Number.isInteger(rowIndex) || !field) return;
  if (field === "selected") {
    state.results[rowIndex].selected = target.checked;
  } else {
    state.results[rowIndex][field] = target.value;
  }
  syncActiveTaskResults();
  updateSummary();
});

els.resultBody.addEventListener("change", (event) => {
  const target = event.target;
  const rowIndex = Number(target.dataset.row);
  if (!Number.isInteger(rowIndex) || target.dataset.field !== "selected") return;
  state.results[rowIndex].selected = target.checked;
  syncActiveTaskResults();
  render();
});

window.addEventListener("error", (event) => {
  if (!els.progress) return;
  els.progress.innerHTML = `<div class="warning-banner">页面脚本异常：${escapeHtml(event.message || "未知错误")}。请刷新页面后重试。</div>`;
});

window.addEventListener("unhandledrejection", (event) => {
  if (!els.progress) return;
  const message = event.reason?.message || String(event.reason || "未知错误");
  els.progress.innerHTML = `<div class="warning-banner">异步任务异常：${escapeHtml(message)}。请刷新页面后重试。</div>`;
});

updateConfigState();
els.oaInput.value = state.dataConfig.oaName58 || "";
els.dataAccessKeyInput.value = state.dataConfig.accessKey || "";
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
els.startDateInput.value = state.dataConfig.startDate || yesterday;
els.endDateInput.value = state.dataConfig.endDate || yesterday;
saveTasks();
saveWorkspace();
resetUploadEntry();
renderUploadList();
els.analyzeBtn.disabled = !state.rows.length;
updateAnalysisTaskMeta();
renderTasks();
backfillArchiveFromTasksOnce();
renderArchive();
refreshModelLibraryMeta();
autoRefreshModelLibraryIfNeeded();
render();
restoreLatestSqlIfWorkspaceEmpty();
