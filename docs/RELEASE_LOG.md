# 影印人（yingyinren）— 迭代与上线记录

长期对照用：每次把**新代码部署到生产**或**交付新桥 C 安装包**时，在本文件**末尾追加**一节（由助手或人工维护，勿删改历史节）。

## 版本号约定（本仓库）

- **发布线版本** `R-x.y.z`：与根目录及各 workspace 的 `package.json` 的 `version` 对齐时写明；若当次仅热修未改 `version`，则用 **日期迭代号** `D-YYYY-MM-DD-n`（同一天第 n 次上线，n 从 1 起）。
- 一节内必须包含：**迭代号 / 日期 / 涉及包（api|web|bridge|prisma）/ 过程摘要 / 验证结果**；有 Git 时加 **commit 短哈希**。

## 记录

### D-2026-05-15-1 — 迭代记录机制与安装包目录约定

- **范围**：流程与文档（本 `RELEASE_LOG`、Cursor 规则 `release-iteration-log.mdc`、`aaanzhuangbao-installers.mdc`）；桥 C 安装包输出目录 `D:\AAanzhuangbao`。
- **过程**：建立「每次上线后记一笔」的仓库约定；桥 C `electron-builder` 产物改出到 `D:\AAanzhuangbao`。
- **验证**：规则文件已落库；桥打包路径以本机 `npm run bridge:dist` 日志为准。

### D-2026-05-15-2 — 桥 C TAPD 拉列表缺 id 导致全量丢弃

- **版本**：D-2026-05-15-2
- **范围**：bridge（`tapdPull.ts` / `mcpClient` 无改）
- **摘要**：MCP `get_stories_or_tasks` 的 `fields` 未请求 `id`，TAPD 返回的 `Story` 无 `id`，`droppedNoIdTitle` 与行数相等；已增加 `id,entity_id` 及外层 id 合并；`pickOnlineTime` 将 `created` 置后以更贴近「上线」语义。
- **过程**：本地 `npm run build -w packages/bridge`；`npm run bridge:dist` 产出至 `D:\AAanzhuangbao`。
- **验证**：`tsc` 通过；安装包以 electron-builder 日志为准。

### D-2026-05-15-3 — 桥 TAPD 拉列表与 MCP 契约对齐

- **版本**：D-2026-05-15-3
- **范围**：bridge（`tapdPull.ts`）
- **摘要**：对照 `user-mcp_server_tapd_internal` 的 `get_stories_or_tasks.json`：`workspace_id` 强制整数、`limit` 显式、解析支持 `{result: "..."}` 包装；`fields` 收敛为 TAPD 常见需求字段；分页上限 50 页；支持环境变量 `BRIDGE_TAPD_V_STATUS`、`BRIDGE_TAPD_STORY_OPTIONS_JSON` 透传查询条件。
- **过程**：`npm run build -w packages/bridge`；`npm run bridge:dist` 产出至 `D:\AAanzhuangbao`。
- **验证**：`tsc` 通过。

### D-2026-05-15-4 — TAPD 同步大神链接 + 按链接拉正文

- **版本**：D-2026-05-15-4
- **范围**：api（prisma `dashen_url`、`bridge` sync upsert）、bridge（`tapdPull` / `dashenLink` / `dashenDoc` / `main`）
- **摘要**：拉 TAPD 列表时请求 `description`（及可选 `BRIDGE_TAPD_DASHEN_FIELD`），解析 `zhuanspirit.com` 大神短链写入 `dashen_url`；同步由「只增」改为 **added/updated/skipped**（已存在则更新标题、上线时间、大神链接）；生成文档时优先 `pageId`，否则用 `dashen_url` 调大神 MCP（URL 含 `pageId` 直拉，短链则 `get_rest_api_content_search` 用链接检索后再 `getPageContent`）。
- **过程**：Prisma 迁移 `20260515120000_add_dashen_url`；本地 `npm run build -w packages/bridge` / `packages/api`；`npm run bridge:dist`。
- **验证**：`curl http://115.190.196.95:3010/api/health` → `{"ok":true}`；`prisma db push` 已加 `dashen_url` 列；桥 C 安装包 `D:\AAanzhuangbao\影印人桥C-Setup-1.0.0-x64.exe`。

### D-2026-05-15-5 — 大神短链：HTTP 跟链解析 pageId（先于 CQL）

- **版本**：D-2026-05-15-5
- **范围**：bridge（`dashenResolveHttp`、`dashenDoc`、`mcpClient` 导出 headers、`main` 日志）
- **摘要**：`/x/` 短链在 MCP `text~` 检索常未命中；改为用与 MCP 相同的 `access_token` 对短链发 GET、跟随 302，从 `Location` 或 HTML 中解析 `pageId` 后再 `getPageContent`。可选：`BRIDGE_DASHEN_HTTP_COOKIE`（SSO）、`BRIDGE_DASHEN_HTTP_INSECURE_TLS=1`、`BRIDGE_DASHEN_SEARCH_SPACE`（CQL 兜底）。
- **验证**：`npm run build -w packages/bridge`；`npm run bridge:dist` 产出安装包。

### D-2026-05-15-6 — 大神短链：SSO Location 嵌套参数 + TLS 自动放宽

- **版本**：D-2026-05-15-6
- **范围**：bridge（`dashenResolveHttp`、`dashenDoc`）
- **摘要**：对任意 302 `Location` 增加 `return_url`/`service` 等查询串的多层 URL 解码并提取 `pageId`；补充 `viewpage.action`、`pageId%3D` 等正则；HTTPS 证书错误时在未显式开 `BRIDGE_DASHEN_HTTP_INSECURE_TLS` 前提下自动单次 `rejectUnauthorized:false` 重试；可选 `BRIDGE_DASHEN_HTTP_BEARER=1` 附带 `Authorization: Bearer`；可选标题兜底 `BRIDGE_DASHEN_TITLE_SEARCH=1`。
- **验证**：`packages/bridge` `tsc`；`npm run bridge:dist` → `D:\AAanzhuangbao\影印人桥C-Setup-1.0.0-x64.exe`。

### D-2026-05-15-7 — 大神 Cookie：文件 / 脚本加载 + 设置页

- **版本**：D-2026-05-15-7
- **范围**：bridge（`dashenCookieLoader`、设置同步、`renderer/index.html`）
- **摘要**：除 `BRIDGE_DASHEN_HTTP_COOKIE` 外，支持 `_FILE`（UTF-8 首行）、`_SCRIPT`（.py 默认 `py -3` / `python3 -u`、.ps1、.cmd）；stdout 首行作为 Cookie；约 25s 缓存避免单次任务重复跑脚本；主进程将设置写入同名环境变量；UI 增加「大神短链 HTTP 跟链」折叠区；生成任务前打 `dashen_http_cookie_ready` 日志（仅 `source`，无 cookie 正文）。
- **验证**：`npm run build -w packages/bridge`。

<!-- 新记录请从此行下方追加 -->

### D-2026-05-15-8 — 桥 C 主界面：大神短链配置常驻 + 测试解析

- **版本**：D-2026-05-15-8
- **范围**：bridge（`main` IPC `yy:testDashenShortLink`、`preload`、`renderer/index.html`）
- **摘要**：将「大神短链 HTTP 跟链」从折叠区改为**常驻面板**；增加 **CQL 空间**（`dashenSearchSpace` → `BRIDGE_DASHEN_SEARCH_SPACE`）与**测试短链 URL +「测试解析」**（与生成任务相同的 HTTP 跟链、不写库），便于在客户端内直接验证 Cookie/脚本。
- **验证**：`npm run build -w packages/bridge`。

### D-2026-05-15-9 — 桥 C 安装包交付（上线）

- **版本**：D-2026-05-15-9
- **范围**：bridge（electron-builder）
- **摘要**：本地执行 `npm run bridge:dist`，产出 NSIS 安装包与 `win-unpacked`，包含 D-2026-05-15-8 主界面大神短链常驻面板与「测试解析」。
- **验证**：electron-builder 成功；安装包路径 `D:\AAanzhuangbao\影印人桥C-Setup-1.0.0-x64.exe`（含 `.blockmap`）；未做代码签名。

### D-2026-05-15-10 — 桥 C：demand-skill Cookie 回退链

- **版本**：D-2026-05-15-10
- **范围**：bridge（`dashenCookieLoader.ts`、`dashenDoc` 提示、`renderer/index.html`）
- **摘要**：桥内显式 Cookie 为空时，按 demand-skill 约定回退：`BROWSER_COOKIES` → `get_browser_cookies.py`（平台 `isZagentWeb`）/ `get_chrome_cookie.py`（本地 `~/.zzcli`）→ `~/.config/demand-skill/config.json` 的 `cookie`；可用 `BRIDGE_DASHEN_DISABLE_DEMAND_SKILL=1` 关闭。
- **验证**：`npm run build -w packages/bridge`。

### D-2026-05-15-11 — 桥 C 安装包交付（上线）

- **版本**：D-2026-05-15-11
- **范围**：bridge（electron-builder）
- **摘要**：本地执行 `npm run bridge:dist`，产出 NSIS 安装包；包含 D-2026-05-15-10 demand-skill Cookie 回退链及此前主界面大神短链配置。
- **验证**：electron-builder 成功；安装包 `D:\AAanzhuangbao\影印人桥C-Setup-1.0.0-x64.exe`；未做代码签名。

### D-2026-05-19-1 — Web：需求列表状态筛选 + 中文状态 + 弹窗滚动修复

- **版本**：D-2026-05-19-1
- **范围**：web（`RequirementsPanel`、`requirementStatus.ts`、`sancao-theme.css`）
- **摘要**：「已上线需求上传」增加横向状态筛选（名称+数量）；列表状态改中文；修复「查看/编辑」关闭后页面无法滚动。
- **过程**：`npm run build -w packages/web` → `scp -i Desktop\knowledge.pem` 至 `root@115.190.196.95:/opt/yingyinren-api/web/dist/`（无需 pm2 restart）。
- **验证**：已确认 — 服务器 `index.html` 与 `curl http://127.0.0.1:3010/index.html` 均引用 `index-Dm80gpvY.js`（2026-05-19）；浏览器建议 Ctrl+F5。

### D-2026-05-19-2 — Web：需求列表标题搜索

- **版本**：D-2026-05-19-2
- **范围**：web（`RequirementsPanel.tsx`、`sancao-theme.css`）
- **摘要**：状态筛选栏右侧增加标题搜索框与「查询」按钮；在当前年月列表内按标题子串模糊匹配（与状态筛选可叠加）；清空输入即恢复全量。
- **过程**：`npm run build -w packages/web` → `scp -i Desktop\knowledge.pem` 至 `/opt/yingyinren-api/web/dist/`。
- **验证**：已确认 — `index.html` 引用 `index-CVrVvfwl.js`。

### D-2026-05-19-3 — 桥 C：TAPD 拉取仅「已上线」需求

- **版本**：D-2026-05-19-3
- **范围**：bridge（`tapdPull.ts`、`main.ts`）
- **摘要**：TAPD MCP `get_stories_or_tasks` 默认 `v_status=已上线`；行级再过滤非已上线状态；诊断增加 `droppedNotOnline`、`queryVStatus`。需更新本机桥 C 后「刷新列表」生效（非 ECS Web/API）。
- **过程**：`npm run build -w packages/bridge` → `npm run bridge:dist`。
- **验证**：tsc 通过；安装包见 `D:\AAanzhuangbao\影印人桥C-Setup-1.0.0-x64.exe`。

### D-2026-05-19-4 — 桥 C：内置 Chrome SSO Cookie 自动获取

- **版本**：D-2026-05-19-4
- **范围**：bridge（`chromeSsoCookie.ts`、`electronSessionCookie.ts`、`dashenCookieLoader.ts`、`main.ts`、renderer）
- **摘要**：留空 Cookie 配置时自动获取大神跟链 Cookie：Windows 读 Chrome（`.zhuanspirit.com`）；macOS 调 `chrome-sso-cookie` skill；Chrome 运行时 DB 被锁则回退桥 C 内置浏览器登录（「内置浏览器登录大神」按钮，会话 Cookie 自动复用）。
- **过程**：`npm run build -w packages/bridge` → `npm run bridge:dist`。
- **验证**：tsc 通过；安装包 `D:\AAanzhuangbao\影印人桥C-Setup-1.0.0-x64.exe`。

### D-2026-05-21-4 — 大神 MCP：Bearer 鉴权头修复

- **版本**：D-2026-05-21-4
- **范围**：`mcpConfigHelpers.ts`、`config.ts`、`mcpClient.ts`、Web 系统配置文案
- **摘要**：dashen2 须 `Authorization: Bearer <token>`；原先 `access_token` 头即使用新 token 也 401。保存配置时生成 `dashen_mcp_json` 改为 Bearer；桥 C 解析 MCP headers 时归一化 Bearer。
- **验证**：`node packages/bridge/scripts/test-dashen-mcp-token.mjs <token>` → `Authorization_Bearer` 为 ok。

### D-2026-05-21-3 — 桥 C：MCP 401 时用登录 Cookie 拉正文

- **版本**：D-2026-05-21-3
- **范围**：`dashenFetchHttp.ts`、`dashenDoc.ts`、`dashenResolveHttp.ts`、`main.ts`
- **摘要**：`getPageContent` 返回 xml_status_401 时，自动用 `persist:dashen` Cookie 请求 `GET /rest/api/content/{pageId}?expand=body.storage`；成功日志带 `fetch_via: http_rest`。
- **过程**：`npm run build -w packages/bridge` → `npm run bridge:dist`。
- **验证**：云端 MCP token 无效但「大神登录」已就绪时，生成应成功且 `mcp_fetch_ok.fetch_via` 为 `http_rest`。

### D-2026-05-21-2 — 桥 C：短链 pageId 解析 Cookie/空间修复

- **版本**：D-2026-05-21-2
- **范围**：`dashenCookieLoader.ts`、`electronSessionCookie.ts`、`main.ts`、`dashenDoc.ts`
- **摘要**：登录后刷新 Cookie 时清除 25s memo；从 `persist:dashen` 读取全分区 Cookie（含 zzsso）；默认 `BRIDGE_DASHEN_SEARCH_SPACE=bangmaipm`；`mcp_fetch_failed` 日志增加 cookieSource/cookieChars/hasSso/searchSpace。
- **过程**：`npm run build -w packages/bridge` → `npm run bridge:dist`。
- **验证**：桥 C「大神登录」→「刷新登录态」→ 测试短链 `https://dashen.zhuanspirit.com/x/f0rfIQ` 应解析出 pageId。

### D-2026-05-21-1 — 桥 C：内嵌大神登录页（persist:dashen）

- **版本**：D-2026-05-21-1
- **范围**：bridge（`dashenSession.ts`、`electronSessionCookie.ts`、`main.ts`、`preload.ts`、`renderer/index.html`、`dashenCookieLoader.ts`）
- **摘要**：主界面默认「大神登录」Tab，`<webview partition="persist:dashen">` 加载 `bangmaipm` 空间页；登录后 Cookie 写入同一分区并优先用于 HTTP 跟链；移除独立弹窗登录。
- **过程**：`npm run build -w packages/bridge` → `npm run bridge:dist`。
- **验证**：tsc 通过；安装包 `D:\AAanzhuangbao\影印人桥C-Setup-1.0.0-x64.exe`。


