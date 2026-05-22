# 影印人 1.0（Monorepo）

本地 **桥C（Electron）** + 火山云 **API + Web（同端口）**。

## GitHub

- 仓库（私有）：`https://github.com/old-fire-wang/yingyinren`
- 首次推送：本机先 `gh auth login`，再执行 `.\scripts\push-to-github.ps1 -GitHubUser old-fire-wang -CreateWithGh`

## 目录

- `packages/api`：Express + Prisma + MySQL（业务库、桥接接口、Dify 上传、LLM）
- `packages/web`：React + Ant Design（工作台）
- `packages/bridge`：Electron 最小壳（拉订阅、同步需求、轮询 MCP 任务）

## 本地开发

前置：本机已安装 Node 22+ 与 npm。

```bash
cd yingyinren
npm install
```

### API

```bash
cd packages/api
copy .env.example .env
# 编辑 DATABASE_URL、JWT_SECRET、BRIDGE_BEARER_TOKEN、CLOUD_MD_STORAGE_DIR
npx prisma generate
npx prisma db push
npm run dev
```

默认监听 `PORT`（默认 3000）。

### Web

```bash
cd packages/web
npm run dev
```

`vite.config.ts` 已将 `/api` 代理到 `http://127.0.0.1:3000`。生产构建：

```bash
npm run build
```

将 `packages/web/dist` 交给 API 进程静态托管（`packages/api/src/app.ts`）。

### 桥C

```bash
cd packages/bridge
npm install
npm run dev
```

在窗口填写：

- **云端 API Base**：如 `http://127.0.0.1:3000` 或 `https://你的域名`
- **Bridge Token**：与云端 `.env` 中 `BRIDGE_BEARER_TOKEN` 完全一致
- **本地 MD 根目录**：生成成功后会写入 `{根}/{projectId}/{年}/{月}/W{周}/{tapdId}_{标题}.md`

说明：当前 MCP 调用在桥里仍是 **占位**（可用环境变量 `BRIDGE_MOCK_RAW_MARKDOWN` 覆盖模拟正文）；接入公司 TAPD/大神 MCP 后，替换 `packages/bridge/src/main.ts` 中 `pollTasksOnce` 的取数逻辑即可。

## 火山云部署（概要）

1. MySQL 新建库（示例 `yingyinren`），创建用户并授权。
2. 将 `packages/api` 拷贝到服务器 `/opt/yingyinren-api`，配置 `.env`。
3. `npm ci && npx prisma migrate deploy`（或 `db push`）`npm run build`。
4. `pm2 start dist/index.js --name yingyinren-api`（建议 `PORT=3010` 避免与旧服务冲突）。
5. 先执行一次 **Web 初始化密码**：`POST /api/auth/bootstrap`（或打开 Web 登录页按钮）。
6. Nginx 反代 HTTPS 到你的 `PORT`，Web 静态由同一进程提供。

## 环境变量（API）

见 `packages/api/.env.example`。

## 与旧 `temp-md-service` 的关系

火山机上若已有 `temp-md-service` 占用 3000，本服务请用 **不同端口** 或下线旧进程后再接管。
