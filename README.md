# 场地预约系统

[English](README.en.md) | [简体中文](README.md)

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

浏览器只访问前端所在的源，因此无需配置 CORS，也无需在构建时指定 API 地址。`frontend` 容器没有接入 `backend-net`，既解析不到也连不上数据库。

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

| 变量                 | 示例值                          | 使用者             | 用途                                                                                            |
| -------------------- | ------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| `POSTGRES_DB`        | `venue_booking`                 | database、api      | 数据库名                                                                                        |
| `POSTGRES_USER`      | `venue`                         | database、api      | 数据库用户                                                                                      |
| `POSTGRES_PASSWORD`  | `change-me-local-only`          | database、api      | 数据库密码（必填，只用 URL 安全字符）                                                           |
| `FRONTEND_PORT`      | `8080`                          | frontend           | Web 界面在主机上的端口（Docker 发布的端口会绕过 ufw；设为 `127.0.0.1:8080` 可只绑定在回环地址） |
| `APP_TIME_ZONE`      | `Asia/Shanghai`                 | api                | 用于判断预约是否已开始的时区                                                                    |
| `DB_SEED_ON_START`   | `true`                          | api                | 场地表为空时写入演示场地                                                                        |
| `IMAGE_TAG`          | `1.0.0`                         | compose            | 本地构建镜像的标签                                                                              |
| `POSTGRES_HOST_PORT` | `5432`                          | `compose.dev.yaml` | 本地开发时 PostgreSQL 的回环地址端口                                                            |
| `DATABASE_URL`       | `postgres://…@localhost:5432/…` | 本地 `bun run dev` | 在 Docker 外运行 API 时的连接 URL                                                               |

在 Compose 中，API 收到的是 `DATABASE_URL=postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@database:5432/$POSTGRES_DB`，其中 `database` 是数据库的服务名。源码和镜像中都不包含密码。

### 镜像

两个 Dockerfile 都以仓库根目录为构建上下文，并共用根目录的 `.dockerignore`，排除 `node_modules`、构建产物、`.env` 文件、Git 数据、测试和文档。

- `deploy/api/Dockerfile`：第一阶段（`oven/bun:1.4.4-alpine`）按锁文件只安装 API 所需的依赖，并用 `bun build` 把 API 打包成单个 `dist/server.js`。运行阶段（`node:24.22.1-alpine3.24`）只包含该文件和 SQL 迁移，没有源码、`node_modules` 或构建工具；以非 root 的 `node` 用户运行，监听 3000 端口。
- `deploy/web/Dockerfile`：第一阶段用 Vite 构建 React 应用。运行阶段（`nginxinc/nginx-unprivileged:1.30.6-alpine3.24`）以 uid 101 在 8080 端口提供静态文件，把 `/api/` 转发到 `API_UPSTREAM`（默认 `http://api:3000`），并把前端路由回退到 `index.html`。代理在每次请求时解析 API 主机名，因此 API 容器重建后仍能连上。

单独构建镜像：

```bash
docker build -f deploy/api/Dockerfile -t venue-booking/api:1.0.0 .
```

```bash
docker build -f deploy/web/Dockerfile -t venue-booking/frontend:1.0.0 .
```

## Local development

Prerequisites: [Bun](https://bun.sh) 1.4, Node.js 24, Docker.

```bash
bun install
```

```bash
cp .env.example .env
```

Start only PostgreSQL, published on `127.0.0.1:5432` by the development override:

```bash
bun run dev:db
```

Start the API (<http://localhost:3000>) and the web app (<http://localhost:5173>) with hot reload:

```bash
bun run dev
```

The Vite dev server proxies `/api` to the API, just like nginx does in Docker. The API loads `.env` from the repository root and runs migrations and seeding on start, same as in the container. The development database is the same `database-data` volume the full stack uses.

| Command               | What it does                                                    |
| --------------------- | --------------------------------------------------------------- |
| `bun run build`       | Build the API bundle and the web app                            |
| `bun run typecheck`   | Type-check all workspaces and the tests                         |
| `bun run lint`        | Lint with Oxlint                                                |
| `bun run format`      | Format with Oxfmt (`format:check` to verify only)               |
| `bun run knip`        | Report unused files, exports, and dependencies                  |
| `bun run db:generate` | Generate a migration after changing `apps/api/src/db/schema.ts` |

## API

All endpoints use JSON and live under `/api`. The full schema is served at `/api/openapi.json` and browsable at `/api/docs`.

| Method | Path                            | Description                        | Success | Errors                        |
| ------ | ------------------------------- | ---------------------------------- | ------- | ----------------------------- |
| GET    | `/api/venues`                   | List venues                        | 200     |                               |
| GET    | `/api/venues/{id}`              | Venue details                      | 200     | 400, 404                      |
| POST   | `/api/venues`                   | Create a venue                     | 201     | 400                           |
| GET    | `/api/reservations`             | List reservations (filters below)  | 200     | 400                           |
| GET    | `/api/reservations/{id}`        | Reservation details                | 200     | 400, 404                      |
| POST   | `/api/reservations`             | Create a reservation               | 201     | 400, 404, 409                 |
| POST   | `/api/reservations/{id}/cancel` | Cancel a reservation               | 200     | 400, 404                      |
| GET    | `/api/health`                   | Liveness and database connectivity | 200     | 503 when the database is down |

`GET /api/reservations` accepts optional query parameters, combined with AND: `venueId`, `date` (exact day), `from` (on or after), `status` (`confirmed` or `cancelled`), and `q` (case-insensitive search in booker name and purpose). Results are sorted by date and start time.

Create a venue:

```json
{
  "name": "Seminar Room 210",
  "location": "Teaching Building B, 2F",
  "capacity": 30,
  "openTime": "08:00",
  "closeTime": "21:00",
  "status": "open",
  "description": "Optional"
}
```

Create a reservation (dates are `YYYY-MM-DD`, times are 24-hour `HH:mm`):

```json
{
  "venueId": 2,
  "bookerName": "Robotics Club",
  "attendeeCount": 12,
  "date": "2026-10-30",
  "startTime": "14:00",
  "endTime": "15:30",
  "purpose": "Weekly build session"
}
```

Errors share one JSON shape and never include stack traces. Unexpected failures are logged by the API and returned as a generic 500.

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

| Code                    | Status | When                                                                      |
| ----------------------- | ------ | ------------------------------------------------------------------------- |
| `BAD_REQUEST`           | 400    | Malformed JSON or invalid fields; `data.issues` lists `{ path, message }` |
| `VENUE_DISABLED`        | 400    | The venue's status is `disabled`                                          |
| `OUTSIDE_OPENING_HOURS` | 400    | The time range is not within the venue's opening hours                    |
| `RESERVATION_IN_PAST`   | 400    | The reservation starts at or before the current time                      |
| `CAPACITY_EXCEEDED`     | 400    | `attendeeCount` is larger than the venue's capacity                       |
| `VENUE_NOT_FOUND`       | 404    | The venue does not exist                                                  |
| `RESERVATION_NOT_FOUND` | 404    | The reservation does not exist                                            |
| `NOT_FOUND`             | 404    | No such route                                                             |
| `RESERVATION_CONFLICT`  | 409    | The range overlaps a confirmed reservation of the same venue              |
| `INTERNAL_SERVER_ERROR` | 500    | Unexpected server error                                                   |

## Data model and booking rules

`venues`: `id` (identity primary key), `name`, `location`, `capacity` (> 0), `open_time` and `close_time` (`time`, open < close), `status` (`open` | `disabled`), `description`, `created_at`.

`reservations`: `id` (identity primary key), `venue_id` (foreign key to `venues.id`, `ON DELETE RESTRICT`), `booker_name`, `attendee_count` (> 0), `reservation_date` (`date`), `start_time` and `end_time` (`time`, start < end), `purpose`, `status` (`confirmed` | `cancelled`), `created_at`, `cancelled_at`. A check constraint keeps `cancelled_at` set exactly when the status is `cancelled`. An index on `(venue_id, reservation_date)` serves the schedule queries.

The schema lives in `apps/api/src/db/schema.ts`. Drizzle migrations in `apps/api/drizzle/` create it and are applied automatically when the API starts.

A reservation is accepted only if the venue exists and is open, the request is well-formed, the range lies within the opening hours, it starts in the future, and the attendees fit the venue's capacity. It must also not overlap any **confirmed** reservation of the same venue. Ranges are half-open, so 09:00 to 10:00 and 10:00 to 11:00 can both be booked.

The database prevents conflicts atomically, so concurrent requests cannot double-book:

1. The API validates the venue, time, and capacity, then inserts the reservation. If PostgreSQL rejects the insert with an exclusion violation (SQLSTATE `23P01`), the API returns a 409 that names the conflicting time ranges.
2. PostgreSQL enforces an exclusion constraint (`EXCLUDE USING gist (venue_id WITH =, tsrange(date + start, date + end) WITH &&) WHERE (status = 'confirmed')`, migration `0001`), which also rejects overlaps from writes that bypass the API.

Cancellation is logical: it sets `status = 'cancelled'` and `cancelled_at` but keeps the row as a record. The overlap check and the constraint ignore cancelled reservations, so the time slot can be booked again immediately. Cancelling an already cancelled reservation returns it unchanged (idempotent).

Dates and times are wall-clock values without a time zone. The API uses `APP_TIME_ZONE` (default `Asia/Shanghai`) to decide what "now" is, so the container's own UTC clock does not matter. The frontend validates input with the same Zod schemas as the API for immediate feedback, but the API makes the final decision on every rule.

## Tests

| Command                    | Scope                                                                                        | Needs                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `bun run test:unit`        | Schemas, time helpers, configuration parsing                                                 | nothing                                                                 |
| `bun run test:integration` | All endpoints against a real PostgreSQL, incl. conflicts, concurrency, DB constraint, errors | Docker (starts a throwaway PostgreSQL container) or `TEST_DATABASE_URL` |
| `bun run test`             | Unit and integration tests                                                                   | as above                                                                |
| `bun run test:e2e`         | Browser flows, accessibility (axe), API through the nginx proxy                              | a running stack and Chromium                                            |
| `bun run test:lighthouse`  | Lighthouse CI on three pages (accessibility ≥ 0.95, best practices ≥ 0.9)                    | a running stack and Chrome                                              |

End-to-end tests default to <http://localhost:8080>. They add a test venue and bookings, so point them at a disposable stack:

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

## Lab 1 verification walkthrough

These commands reproduce the lab's acceptance checks (sections 8.1 to 8.3) against the running stack. In PowerShell, use `curl.exe` and escape the inner double quotes, or use the web UI instead.

### Containers (8.2)

```bash
docker compose up --build -d
```

```bash
docker compose ps
```

Expect `api`, `database`, and `frontend` to be `Up … (healthy)`, with only `0.0.0.0:8080->8080/tcp` published. `curl http://localhost:8080/api/health` returns `{"status":"ok","database":"up"}`, which proves the API reaches the database. `docker compose logs api` shows the migration and seed messages and one line per request, without recurring errors.

### Booking flow (8.1)

Replace the date in the request with a future day.

```bash
curl http://localhost:8080/api/venues
```

```bash
curl -i -X POST http://localhost:8080/api/reservations -H "content-type: application/json" -d '{"venueId":3,"bookerName":"Robotics Club","attendeeCount":8,"date":"2026-10-30","startTime":"14:00","endTime":"15:30","purpose":"Sprint planning"}'
```

The response is `201 Created` and contains the new reservation `id`. Using that id:

- `GET /api/reservations/{id}` returns the reservation.
- Posting 15:00 to 16:00 for the same venue and day returns `409 Conflict` with code `RESERVATION_CONFLICT`.
- `POST /api/reservations/{id}/cancel` returns `200` with `"status":"cancelled"`.
- Posting 15:00 to 16:00 again now returns `201 Created`, because cancelled reservations no longer block the slot.

### Persistence (8.3)

```bash
docker compose down
```

```bash
docker compose up -d
```

Request `GET /api/reservations/{id}` again. The reservation is still there because PostgreSQL stores its data in the named volume:

```bash
docker volume ls
```

The output lists `venue-booking_database-data`.

## Troubleshooting

- **Port 8080 is in use**: set `FRONTEND_PORT` in `.env`, for example `FRONTEND_PORT=8090`.
- **`set POSTGRES_PASSWORD in .env`**: copy `.env.example` to `.env` first.
- **API stays unhealthy**: check `docker compose logs api`. A password with characters such as `@` or `/` breaks the connection URL.
- **Start over with an empty database**: `docker compose down -v`, then `docker compose up -d`.
- **Port 5432 is in use during development**: set `POSTGRES_HOST_PORT` and the port in `DATABASE_URL` to a free port.
- **`format:check` fails on Windows for files you did not touch**: the checkout predates `.gitattributes`, so its files still have CRLF line endings. With no uncommitted changes, run `git rm -r --cached -q .` and then `git reset --hard` to check them out again with LF.
