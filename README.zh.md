# 场地预约系统

[English](README.md) | [简体中文](README.zh.md)

复旦大学《CS30074 云原生软件技术》实验一的全栈场地预约系统。

用户选择日期，查看各场地何时空闲，预约时段，并获得预约编号，之后可凭编号查询或取消预约。前端、Web API 和 PostgreSQL 分别运行在独立容器中，由 Docker Compose 编排。

- 预约看板：所有场地的当天安排排在同一时间轴上，标出已预约、未开放和已过去的时间
- 场地页面：先点选开始时段再点选结束时段（或直接选择时间），填写预约人和用途后提交
- 预约成功后显示带预约编号的确认单；取消前需要再次确认
- 预约记录：按预约人或用途搜索，并可按状态、场地和日期筛选
- 新增场地；停用的场地仍会显示，但不能预约
- 支持英文和简体中文、浅色和深色主题，适配手机

## 系统架构

```text
浏览器 ──HTTP :8080──▶ frontend (nginx)            React 静态资源
                         │  /api/* 反向代理
                         ▼
                       api (Node.js :3000)          Hono + oRPC REST API、参数校验、业务规则
                         │  SQL
                         ▼
                       database (PostgreSQL :5432)  场地与预约数据（命名卷）
```

| 容器       | 镜像                           | 职责                                         | 网络                          | 对外端口       |
| ---------- | ------------------------------ | -------------------------------------------- | ----------------------------- | -------------- |
| `frontend` | `venue-booking/frontend:1.0.0` | 提供界面，并把 `/api` 请求转发给 API         | `frontend-net`                | `8080`（主机） |
| `api`      | `venue-booking/api:1.0.0`      | REST API、参数校验、冲突检查、迁移与种子数据 | `frontend-net`、`backend-net` | 无             |
| `database` | `postgres:18.6-alpine3.24`     | 将场地和预约数据持久化到 `database-data` 卷  | `backend-net`                 | 无             |

浏览器只访问前端所在的源，因此无需配置 CORS，也无需在构建时指定 API 地址。`frontend` 容器没有接入 `backend-net`，既解析不到也连不上数据库。主机上只开放 8080 端口。

## 技术栈

| 层次       | 技术                                           |
| ---------- | ---------------------------------------------- |
| 前端       | React 19、TypeScript、Vite 8                   |
| 路由与数据 | TanStack Router、TanStack Query、TanStack Form |
| UI 与样式  | shadcn/ui、Base UI、Tailwind CSS v4            |
| 国际化     | i18next、react-i18next                         |
| 后端       | Node.js、Hono、oRPC、Zod                       |
| 数据库     | PostgreSQL 18、Drizzle ORM                     |
| 包管理     | Bun Workspaces                                 |
| 代码质量   | Oxlint、Oxfmt、Knip                            |
| 测试       | Vitest、Playwright、axe-core、Lighthouse CI    |
| 基础设施   | Docker、Docker Compose、Nginx                  |

## 目录结构

```text
.
├── apps/
│   ├── api/                  # Hono + oRPC 后端
│   │   ├── drizzle/          # SQL 迁移文件（自动生成 + 排他约束）
│   │   └── src/
│   │       ├── db/           # Drizzle 表结构、数据库连接、迁移、种子数据
│   │       ├── routers/      # 接口处理与业务规则
│   │       ├── app.ts        # HTTP 应用：/api 路由、健康检查、错误处理
│   │       └── server.ts     # 入口：读取配置、迁移、写入种子数据、启动监听
│   └── web/                  # React 前端
│       └── src/
│           ├── routes/       # 基于文件的路由（TanStack Router）
│           ├── features/     # 预约看板、预约流程、预约记录
│           ├── components/   # 通用组件（shadcn/ui 组件位于 ui/）
│           ├── locales/      # 英文与简体中文文案
│           └── lib/          # API 客户端、时间与格式化工具、i18n
├── packages/contracts/       # api 与 web 共用的接口契约和 Zod 校验规则
├── deploy/
│   ├── api/Dockerfile        # API 多阶段构建镜像
│   └── web/                  # 前端多阶段构建镜像 + nginx 配置模板
├── tests/                    # unit/、integration/（Vitest），e2e/（Playwright）
├── compose.yaml              # frontend、api、database
├── compose.dev.yaml          # 开发用覆盖文件：把 PostgreSQL 发布到 127.0.0.1
├── .env.example              # 配置模板
└── docs/lab-1.md             # 实验要求
```

## 使用 Docker Compose 运行

前置条件：Docker 与 Compose v2（Windows 和 macOS 上安装 Docker Desktop 即可）。

```bash
cp .env.example .env
```

编辑 `.env`，设置自己的 `POSTGRES_PASSWORD`（只使用字母、数字、`-`、`_`、`.`，因为密码会拼进 API 的连接 URL）。然后构建并启动：

```bash
docker compose up --build -d
```

```bash
docker compose ps
```

约 20 秒后三个服务都会显示 `(healthy)`。打开 <http://localhost:8080>。

- API 根地址：<http://localhost:8080/api>（经前端反向代理）
- 交互式接口文档：<http://localhost:8080/api/docs>（OpenAPI 文档位于 `/api/openapi.json`）
- 健康检查：<http://localhost:8080/api/health> 返回 `{"status":"ok","database":"up"}`

首次启动时，API 会执行数据库迁移并写入六个演示场地（其中一个为停用状态）。之后再启动会保留已有数据，不会重复写入演示场地。

常用命令：

```bash
docker compose logs -f api
```

```bash
docker compose down
```

`docker compose down` 会保留 `venue-booking_database-data` 卷，预约数据不会丢失。加上 `-v` 会连同数据一起删除。

### 配置

Docker Compose 会读取仓库根目录下的 `.env`。`.env` 已被 Git 忽略；`.env.example` 列出了所有变量和示例值。

| 变量                 | 示例值                          | 使用者             | 用途                                  |
| -------------------- | ------------------------------- | ------------------ | ------------------------------------- |
| `POSTGRES_DB`        | `venue_booking`                 | database、api      | 数据库名                              |
| `POSTGRES_USER`      | `venue`                         | database、api      | 数据库用户                            |
| `POSTGRES_PASSWORD`  | `change-me-local-only`          | database、api      | 数据库密码（必填，只用 URL 安全字符） |
| `FRONTEND_PORT`      | `8080`                          | frontend           | Web 界面在主机上的端口                |
| `APP_TIME_ZONE`      | `Asia/Shanghai`                 | api                | 用于判断预约是否已开始的时区          |
| `DB_SEED_ON_START`   | `true`                          | api                | 场地表为空时写入演示场地              |
| `IMAGE_TAG`          | `1.0.0`                         | compose            | 本地构建镜像的标签                    |
| `POSTGRES_HOST_PORT` | `5432`                          | `compose.dev.yaml` | 本地开发时 PostgreSQL 的回环地址端口  |
| `DATABASE_URL`       | `postgres://…@localhost:5432/…` | 本地 `bun run dev` | 在 Docker 外运行 API 时的连接 URL     |

在 Compose 中，API 收到的是 `DATABASE_URL=postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@database:5432/$POSTGRES_DB`，其中 `database` 是数据库的服务名。源码和镜像中都不包含密码。

### 镜像

两个 Dockerfile 都以仓库根目录为构建上下文，并共用根目录的 `.dockerignore`，排除 `node_modules`、构建产物、`.env` 文件、Git 数据、测试和文档。

- `deploy/api/Dockerfile`：第一阶段（`oven/bun:1.4.2-alpine`）按锁文件只安装 API 所需的依赖，并用 tsup 把 API 打包成单个 `dist/server.js`。运行阶段（`node:24.22.0-alpine3.24`）只包含该文件和 SQL 迁移，没有源码、`node_modules` 或构建工具；以非 root 的 `node` 用户运行，监听 3000 端口。
- `deploy/web/Dockerfile`：第一阶段用 Vite 构建 React 应用。运行阶段（`nginxinc/nginx-unprivileged:1.30.6-alpine3.24`）以 uid 101 在 8080 端口提供静态文件，把 `/api/` 转发到 `API_UPSTREAM`（默认 `http://api:3000`），并把前端路由回退到 `index.html`。代理在每次请求时解析 API 主机名，因此 API 容器重建后仍能连上。

单独构建镜像：

```bash
docker build -f deploy/api/Dockerfile -t venue-booking/api:1.0.0 .
```

```bash
docker build -f deploy/web/Dockerfile -t venue-booking/frontend:1.0.0 .
```

## 本地开发

前置条件：[Bun](https://bun.sh) 1.4、Node.js 24、Docker。

```bash
bun install
```

```bash
cp .env.example .env
```

只启动 PostgreSQL（开发覆盖文件会把它发布到 `127.0.0.1:5432`）：

```bash
bun run dev:db
```

启动带热更新的 API（<http://localhost:3000>）和 Web 应用（<http://localhost:5173>）：

```bash
bun run dev
```

Vite 开发服务器会把 `/api` 转发给 API，与 Docker 中的 nginx 一致。API 从仓库根目录读取 `.env`，启动时同样会执行迁移和写入种子数据。开发用数据库与完整部署共用同一个 `database-data` 卷。

| 命令                  | 作用                                        |
| --------------------- | ------------------------------------------- |
| `bun run build`       | 构建 API 打包文件和 Web 应用                |
| `bun run typecheck`   | 对所有工作区和测试做类型检查                |
| `bun run lint`        | 使用 Oxlint 检查代码                        |
| `bun run format`      | 使用 Oxfmt 格式化（`format:check` 只检查）  |
| `bun run knip`        | 找出未使用的文件、导出和依赖                |
| `bun run db:generate` | 修改 `apps/api/src/db/schema.ts` 后生成迁移 |

## 接口说明

所有接口都位于 `/api` 下，请求和响应均为 JSON。完整定义见 `/api/openapi.json`，也可在 `/api/docs` 浏览。

| 方法 | 路径                            | 说明                     | 成功 | 错误               |
| ---- | ------------------------------- | ------------------------ | ---- | ------------------ |
| GET  | `/api/venues`                   | 查询场地列表             | 200  |                    |
| GET  | `/api/venues/{id}`              | 查询场地详情             | 200  | 400、404           |
| POST | `/api/venues`                   | 新增场地                 | 201  | 400                |
| GET  | `/api/reservations`             | 查询预约列表（筛选见下） | 200  | 400                |
| GET  | `/api/reservations/{id}`        | 查询预约详情             | 200  | 400、404           |
| POST | `/api/reservations`             | 创建预约                 | 201  | 400、404、409      |
| POST | `/api/reservations/{id}/cancel` | 取消预约                 | 200  | 400、404           |
| GET  | `/api/health`                   | 存活及数据库连通性检查   | 200  | 数据库不可用时 503 |

`GET /api/reservations` 支持以下可选查询参数（同时使用时取交集）：`venueId`、`date`（指定日期）、`from`（该日期及以后）、`status`（`confirmed` 或 `cancelled`）、`q`（在预约人和用途中不区分大小写搜索）。结果按日期和开始时间排序。

新增场地：

```json
{
  "name": "Seminar Room 210",
  "location": "Teaching Building B, 2F",
  "capacity": 30,
  "openTime": "08:00",
  "closeTime": "21:00",
  "status": "open",
  "description": "可选"
}
```

创建预约（日期格式为 `YYYY-MM-DD`，时间为 24 小时制 `HH:mm`）：

```json
{
  "venueId": 2,
  "bookerName": "机器人社",
  "attendeeCount": 12,
  "date": "2026-10-30",
  "startTime": "14:00",
  "endTime": "15:30",
  "purpose": "每周项目例会"
}
```

所有错误使用同一种 JSON 格式，不会返回异常堆栈。意外错误由 API 记录日志，并以通用的 500 响应返回。

```json
{
  "code": "RESERVATION_CONFLICT",
  "status": 409,
  "message": "The requested time overlaps 1 existing reservation(s)",
  "data": {
    "conflicts": [{ "id": 7, "startTime": "14:00", "endTime": "15:00" }]
  }
}
```

| 错误码                  | 状态码 | 触发条件                                                          |
| ----------------------- | ------ | ----------------------------------------------------------------- |
| `BAD_REQUEST`           | 400    | JSON 格式错误或字段不合法；`data.issues` 给出 `{ path, message }` |
| `VENUE_DISABLED`        | 400    | 场地状态为 `disabled`                                             |
| `OUTSIDE_OPENING_HOURS` | 400    | 时段不在场地开放时间内                                            |
| `RESERVATION_IN_PAST`   | 400    | 开始时间不晚于当前时间                                            |
| `CAPACITY_EXCEEDED`     | 400    | `attendeeCount` 超过场地容量                                      |
| `VENUE_NOT_FOUND`       | 404    | 场地不存在                                                        |
| `RESERVATION_NOT_FOUND` | 404    | 预约不存在                                                        |
| `NOT_FOUND`             | 404    | 路由不存在                                                        |
| `RESERVATION_CONFLICT`  | 409    | 与同一场地已确认的预约时间重叠                                    |
| `INTERNAL_SERVER_ERROR` | 500    | 服务器意外错误                                                    |

## 数据模型与预约规则

**venues（场地）**：`id`（自增主键）、`name`、`location`、`capacity`（大于 0）、`open_time` 与 `close_time`（`time` 类型，开放早于关闭）、`status`（`open` | `disabled`）、`description`、`created_at`。

**reservations（预约）**：`id`（自增主键）、`venue_id`（外键，引用 `venues.id`，`ON DELETE RESTRICT`）、`booker_name`、`attendee_count`（大于 0）、`reservation_date`（`date`）、`start_time` 与 `end_time`（`time`，开始早于结束）、`purpose`、`status`（`confirmed` | `cancelled`）、`created_at`、`cancelled_at`。检查约束保证仅当状态为 `cancelled` 时 `cancelled_at` 有值。`(venue_id, reservation_date)` 上的索引用于按日查询。

表结构定义在 `apps/api/src/db/schema.ts`，由 `apps/api/drizzle/` 中的 Drizzle 迁移创建，API 启动时自动执行。

只有同时满足以下条件，预约才会被接受：场地存在且开放、请求格式正确、时段在开放时间内、开始时间在未来、人数不超过容量，并且与同一场地的**已确认**预约不重叠。时段为左闭右开区间，因此 09:00–10:00 与 10:00–11:00 可以同时预约。

冲突由数据库原子地阻止，并发请求也不会重复预约：

1. API 先校验场地、时间和人数，再插入预约。若 PostgreSQL 因排他约束拒绝插入（SQLSTATE `23P01`），API 返回 409，并附带冲突的时间段。
2. PostgreSQL 的排他约束（`EXCLUDE USING gist (venue_id WITH =, tsrange(date + start, date + end) WITH &&) WHERE (status = 'confirmed')`，迁移 `0001`）即使绕过 API 也会拒绝重叠。

**取消采用逻辑取消。** 取消时把 `status` 设为 `cancelled` 并记录 `cancelled_at`，保留该行作为记录。已取消的预约不参与重叠检查，也不受排他约束限制，所以该时段可以立即被重新预约。对已取消的预约再次取消会原样返回（幂等）。

日期和时间均为不带时区的当地时间。API 用 `APP_TIME_ZONE`（默认 `Asia/Shanghai`）确定“当前时间”，因此与容器本身使用的 UTC 时钟无关。前端用与 API 相同的 Zod 规则即时校验输入，但所有规则最终都由 API 判定。

## 测试

| 命令                       | 范围                                                                 | 依赖                                                         |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| `bun run test:unit`        | 校验规则、时间工具、配置解析                                         | 无                                                           |
| `bun run test:integration` | 用真实 PostgreSQL 测试全部接口，包括冲突、并发、数据库约束、错误处理 | Docker（自动启动临时 PostgreSQL 容器）或 `TEST_DATABASE_URL` |
| `bun run test`             | 单元测试与集成测试                                                   | 同上                                                         |
| `bun run test:e2e`         | 浏览器流程、无障碍检查（axe）、经 nginx 代理的接口                   | 正在运行的系统和 Chromium                                    |
| `bun run test:lighthouse`  | 对三个页面运行 Lighthouse CI（无障碍 ≥ 0.95，最佳实践 ≥ 0.9）        | 正在运行的系统和 Chrome                                      |

端到端测试默认访问 <http://localhost:8080>。测试会新增场地和预约，建议在临时部署上运行：

```bash
bunx playwright install chromium
```

```bash
FRONTEND_PORT=8081 docker compose -p venue-booking-e2e up -d --build --wait
```

```bash
E2E_BASE_URL=http://localhost:8081 bun run test:e2e
```

```bash
docker compose -p venue-booking-e2e down -v
```

## 实验一验收步骤

以下命令对正在运行的系统复现实验要求的验收检查（第 8.1–8.3 节）。在 PowerShell 中请使用 `curl.exe` 并转义内部双引号，或直接在 Web 界面中操作。

**容器验证（8.2）**

```bash
docker compose up --build -d
```

```bash
docker compose ps
```

`api`、`database`、`frontend` 均应为 `Up … (healthy)`，且只发布了 `0.0.0.0:8080->8080/tcp`。`curl http://localhost:8080/api/health` 返回 `{"status":"ok","database":"up"}`，说明 API 能连上数据库。`docker compose logs api` 中可以看到迁移和种子数据信息以及每个请求一行日志，没有反复出现的错误。

**预约流程（8.1）**：请把日期换成未来的某一天。

```bash
curl http://localhost:8080/api/venues
```

```bash
curl -i -X POST http://localhost:8080/api/reservations -H "content-type: application/json" -d '{"venueId":3,"bookerName":"Robotics Club","attendeeCount":8,"date":"2026-10-30","startTime":"14:00","endTime":"15:30","purpose":"Sprint planning"}'
```

响应为 `201 Created`，其中包含新预约的 `id`。使用这个 id：

- `GET /api/reservations/{id}` 返回该预约。
- 为同一场地、同一天提交 15:00–16:00 的预约，返回 `409 Conflict`，错误码为 `RESERVATION_CONFLICT`。
- `POST /api/reservations/{id}/cancel` 返回 `200`，且 `"status":"cancelled"`。
- 再次提交 15:00–16:00 的预约，返回 `201 Created`，因为已取消的预约不再占用该时段。

**数据持久化（8.3）**

```bash
docker compose down
```

```bash
docker compose up -d
```

再次请求 `GET /api/reservations/{id}`，预约仍然存在，因为 PostgreSQL 的数据保存在命名卷中：

```bash
docker volume ls
```

输出中包含 `venue-booking_database-data`。

## 常见问题

- **8080 端口被占用**：在 `.env` 中设置 `FRONTEND_PORT`，例如 `FRONTEND_PORT=8090`。
- **提示 `set POSTGRES_PASSWORD in .env`**：先把 `.env.example` 复制为 `.env`。
- **API 一直不健康**：查看 `docker compose logs api`。密码中含有 `@`、`/` 等字符会破坏连接 URL。
- **清空数据重新开始**：执行 `docker compose down -v`，再执行 `docker compose up -d`。
- **开发时 5432 端口被占用**：把 `POSTGRES_HOST_PORT` 和 `DATABASE_URL` 中的端口改成空闲端口。
