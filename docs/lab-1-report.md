# 实验一报告：场地预约系统开发与 Docker 容器化部署

《CS30074 云原生软件技术》课程实验一

| 项目     | 内容                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------- |
| 小组     | 【待填写：小组名称或编号】                                                                                |
| 成员     | 【待填写，见第 10 节】                                                                                    |
| 代码仓库 | <https://github.com/Lucas2029460802/CloudNative>（取自本地仓库的 `origin` 远程地址，提交前请确认） |
| 报告日期 | 【待填写】（提交截止日期：2026 年 11 月 2 日）                                                            |

> 说明：报告中的命令输出和截图都来自 2026 年 10 月 19 日在本机对本系统的实际运行（环境与时间见第 7.1 节）。输出只删去了重复或与验证无关的行，删减处用“……”表示；代码块中以 `#` 开头的中文行是报告添加的注释，不属于命令输出。

## 1. 概述

本项目实现了一个全栈场地预约系统：用户选择日期，查看各场地何时空闲，预约一个时段并获得预约编号，之后可以凭编号查询或取消预约。前端、Web API 和 PostgreSQL 数据库分别运行在独立的容器中，由 Docker Compose 统一编排。

主要功能：

- 预约看板：所有场地当天的安排排在同一条时间轴上，标出已预约、未开放和已过去的时间；
- 场地页面：展示场地信息，先点选开始时段再点选结束时段（也可以直接选择时间），填写预约人、人数和用途后提交；
- 预约成功后显示带预约编号的确认单；取消预约前需要再次确认；
- 预约记录：按预约人或用途搜索，并可按状态、日期范围和场地筛选；
- 新增场地；停用的场地仍会显示，但不能预约；
- 支持英文和简体中文界面、浅色和深色主题，适配手机屏幕。

仓库根目录的 `README.zh.md`（英文版为 `README.md`）是完整的使用说明，本报告侧重设计说明和运行记录。

## 2. 系统架构

### 2.1 运行时架构

```text
浏览器 ──HTTP :8080──▶ frontend (nginx)            React 静态资源
                         │  /api/* 反向代理
                         ▼
                       api (Node.js :3000)          Hono + oRPC REST API、参数校验、业务规则
                         │  SQL
                         ▼
                       database (PostgreSQL :5432)  场地与预约数据（命名卷）
```

`frontend-net` 连接前端和 API，`backend-net` 连接 API 和数据库，只有 API 同时接入两个网络：

```text
主机 0.0.0.0:8080
  │  端口映射到容器的 8080
  ▼
frontend（只接入 frontend-net）
  │  http://api:3000，经 frontend-net
  ▼
api（同时接入 frontend-net 和 backend-net）
  │  database:5432，经 backend-net
  ▼
database（只接入 backend-net）──▶ 命名卷 database-data
```

| 容器（服务） | 镜像                           | 容器内的主要进程                    | 职责                                         | 网络                          | 主机端口 |
| ------------ | ------------------------------ | ----------------------------------- | -------------------------------------------- | ----------------------------- | -------- |
| `frontend`   | `venue-booking/frontend:1.0.0` | nginx，uid 101                      | 提供界面，并把 `/api` 请求转发给 API         | `frontend-net`                | `8080`   |
| `api`        | `venue-booking/api:1.0.0`      | `node dist/server.js`，`node` 用户  | REST API、参数校验、冲突检查、迁移与种子数据 | `frontend-net`、`backend-net` | 无       |
| `database`   | `postgres:18.6-alpine3.24`     | `postgres`，uid 70                  | 将场地和预约数据持久化到 `database-data` 卷  | `backend-net`                 | 无       |

### 2.2 请求链路

1. 浏览器访问 `http://localhost:8080`，nginx 返回 `index.html` 和 `/assets/` 下的静态文件。`/reservations/12` 这类前端路由由 nginx 回退到 `index.html`，再由前端路由渲染。
2. 页面通过同源的 `/api/...` 调用后端（`apps/web/src/lib/api.ts`，基础路径固定为 `${location.origin}/api`）。nginx 把 `/api/` 转发到 `http://api:3000`，因此浏览器只与前端所在的源通信，既不需要配置 CORS，也不需要在构建时写死后端地址。
3. API 校验参数、执行业务规则，并通过 Compose 服务名 `database` 连接 PostgreSQL。
4. 前端不直接访问数据库：`frontend` 容器只接入 `frontend-net`，解析不到也连不上 `database`（第 7.10 节验证）。
5. 前端用与 API 相同的 Zod 规则（`packages/contracts`）即时提示输入问题，但冲突判断最终由 API 和数据库决定：即使前端已提示时间重叠，请求仍会发给 API，由 API 返回 409（第 8 节用例 4）。

### 2.3 应用、进程、镜像与容器

- **镜像**是按 Dockerfile 构建出的只读模板，例如 `venue-booking/api:1.0.0` 只包含 Node.js 运行时、打包后的 `dist/server.js` 和 SQL 迁移文件。
- **容器**是镜像的运行实例，由 Compose 为它附加环境变量、网络、卷、重启策略和健康检查，例如 `venue-booking-api-1`。同一个镜像可以在不同的 Compose 项目中创建多个容器。
- **进程**是容器里实际运行的程序。容器的生命周期就是其主进程的生命周期：主进程退出，容器就停止。
- **应用**由三个容器协作完成。`docker compose down` 删除容器（进程随之结束），但镜像和命名卷仍在；再次 `up` 时用同一镜像创建新容器、挂载同一个卷，所以数据不会丢失（第 7.9 节）。

`docker compose top` 列出了各容器内的进程：

```text
$ docker compose -p venue-booking-report top
SERVICE   #   UID    PID    PPID   C   STIME  TTY  TIME      CMD
api       1   1000   13678  13654  2   13:53  ?    00:00:00  node dist/server.js
database  1   70     9124   9101   0   13:48  ?    00:00:00  postgres
database  1   70     9245   9124   0   13:48  ?    00:00:00  postgres: io worker 1
database  1   70     9246   9124   0   13:48  ?    00:00:00  postgres: io worker 0
database  1   70     9247   9124   0   13:48  ?    00:00:00  postgres: io worker 2
database  1   70     9248   9124   0   13:48  ?    00:00:00  postgres: checkpointer
database  1   70     9249   9124   0   13:48  ?    00:00:00  postgres: background writer
database  1   70     9251   9124   0   13:48  ?    00:00:00  postgres: walwriter
database  1   70     9252   9124   0   13:48  ?    00:00:00  postgres: autovacuum launcher
database  1   70     9253   9124   0   13:48  ?    00:00:00  postgres: logical replication launcher
database  1   70     13715  9124   0   13:53  ?    00:00:00  postgres: venue venue_booking 172.22.0.3(52166) idle
database  1   70     13716  9124   0   13:53  ?    00:00:00  postgres: venue venue_booking 172.22.0.3(52168) idle
frontend  1   statd  14175  14150  1   13:53  ?    00:00:00  nginx: master process nginx -g daemon off;
frontend  1   statd  14236  14175  0   13:53  ?    00:00:00  nginx: worker process
……
# 共 24 个 nginx worker 进程（worker_processes auto，与 CPU 核数相同），此处省略
```

- `api` 容器只有一个进程 `node dist/server.js`，以 uid 1000（`node` 用户）运行；
- `database` 中，`postgres` 主进程派生出各后台进程，最后两行是 API 连接池（来自 API 在 `backend-net` 上的地址 172.22.0.3）建立的空闲连接；
- `frontend` 中是 nginx 的 master 和 worker 进程。UID 一列按 Docker 主机（Docker Desktop 虚拟机）的用户表显示，uid 101 在主机上恰好对应 `statd`；容器内 `id` 显示为 `uid=101(nginx)`（第 5.3 节）。STIME 为 UTC 时间。

### 2.4 技术栈

| 层次       | 技术                                           |
| ---------- | ---------------------------------------------- |
| 前端       | React 19、TypeScript、Vite 8                   |
| 路由与数据 | TanStack Router、TanStack Query、TanStack Form |
| UI 与样式  | shadcn/ui、Base UI、Tailwind CSS v4            |
| 国际化     | i18next、react-i18next                         |
| 后端       | Node.js 24、Hono、oRPC、Zod                    |
| 数据库     | PostgreSQL 18、Drizzle ORM                     |
| 包管理     | Bun Workspaces                                 |
| 代码质量   | Oxlint、Oxfmt、Knip                            |
| 测试       | Vitest、Playwright、axe-core、Lighthouse CI    |
| 基础设施   | Docker、Docker Compose、Nginx                  |

`packages/contracts` 用 oRPC 契约和 Zod 定义了除健康检查外全部接口的路径、请求和响应结构以及错误码。API 按契约实现接口，前端用同一份契约生成带类型的客户端，两边的接口定义不会出现不一致。

### 2.5 代码结构

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
│           └── lib/          # API 客户端、时间与格式化工具、i18n、主题切换
├── packages/contracts/       # api 与 web 共用的接口契约和 Zod 校验规则
├── deploy/
│   ├── api/Dockerfile        # API 多阶段构建镜像
│   └── web/                  # 前端多阶段构建镜像 + nginx 配置模板
├── tests/                    # unit/、integration/（Vitest），e2e/（Playwright）
├── compose.yaml              # frontend、api、database
├── compose.dev.yaml          # 开发用覆盖文件：把 PostgreSQL 发布到 127.0.0.1
├── .env.example              # 配置模板
└── docs/                     # 实验要求与本报告
```

## 3. 数据库设计

数据库为 PostgreSQL 18，包含 `venues`（场地）和 `reservations`（预约）两张表。表结构定义在 `apps/api/src/db/schema.ts`，由 `apps/api/drizzle/` 中的迁移文件创建。

### 3.1 实体关系

一个场地可以有多条预约，每条预约属于一个场地：

```text
venues（场地）                        reservations（预约）
┌────────────────────────┐            ┌──────────────────────────────┐
│ id            PK       │ 1        N │ id                PK         │
│ name                   │◀───────────│ venue_id  FK → venues.id     │
│ location               │            │ booker_name                  │
│ capacity               │            │ attendee_count               │
│ open_time, close_time  │            │ reservation_date             │
│ status                 │            │ start_time, end_time         │
│ description            │            │ purpose                      │
│ created_at             │            │ status                       │
└────────────────────────┘            │ created_at, cancelled_at     │
                                      └──────────────────────────────┘
```

### 3.2 venues 表

| 列            | 含义         | 类型           | 约束                                      |
| ------------- | ------------ | -------------- | ----------------------------------------- |
| `id`          | 场地编号     | `integer`      | 主键，`GENERATED ALWAYS AS IDENTITY` 自增 |
| `name`        | 场地名称     | `varchar(100)` | 非空                                      |
| `location`    | 位置         | `varchar(200)` | 非空                                      |
| `capacity`    | 最大容纳人数 | `integer`      | 非空，`CHECK (capacity > 0)`              |
| `open_time`   | 开放时间     | `time`         | 非空，`CHECK (open_time < close_time)`    |
| `close_time`  | 关闭时间     | `time`         | 非空                                      |
| `status`      | 场地状态     | `venue_status` | 非空，默认 `open`                         |
| `description` | 简介         | `text`         | 可空                                      |
| `created_at`  | 创建时间     | `timestamptz`  | 非空，默认 `now()`                        |

### 3.3 reservations 表

| 列                 | 含义         | 类型                 | 约束                                                                 |
| ------------------ | ------------ | -------------------- | -------------------------------------------------------------------- |
| `id`               | 预约编号     | `integer`            | 主键，自增                                                           |
| `venue_id`         | 预约的场地   | `integer`            | 非空，外键引用 `venues.id`，`ON DELETE RESTRICT`                     |
| `booker_name`      | 预约人或组织 | `varchar(100)`       | 非空                                                                 |
| `attendee_count`   | 参加人数     | `integer`            | 非空，`CHECK (attendee_count > 0)`                                   |
| `reservation_date` | 预约日期     | `date`               | 非空                                                                 |
| `start_time`       | 开始时间     | `time`               | 非空，`CHECK (start_time < end_time)`                                |
| `end_time`         | 结束时间     | `time`               | 非空                                                                 |
| `purpose`          | 用途         | `varchar(500)`       | 非空                                                                 |
| `status`           | 预约状态     | `reservation_status` | 非空，默认 `confirmed`                                               |
| `created_at`       | 创建时间     | `timestamptz`        | 非空，默认 `now()`                                                   |
| `cancelled_at`     | 取消时间     | `timestamptz`        | 可空；`CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))` |

两个状态列使用 PostgreSQL 枚举类型：`venue_status` 取值 `open`、`disabled`；`reservation_status` 取值 `confirmed`、`cancelled`。`timestamptz` 即 `timestamp with time zone`。该表还有一个索引和一个排他约束：

- 索引 `reservations_venue_date_idx (venue_id, reservation_date)`：用于按场地和日期查询，例如场地页面的当天时间表和创建预约时的冲突检查；
- 排他约束 `reservations_no_overlap`：禁止同一场地已确认的预约时间重叠（第 3.4 节）。

外键使用 `ON DELETE RESTRICT`：只要场地还有预约记录，就不能被物理删除，避免出现指向不存在场地的预约。系统不提供删除场地的接口，不再使用的场地改为 `disabled`（停用）状态。

日期和时间均为不带时区的当地时间。API 用环境变量 `APP_TIME_ZONE`（默认 `Asia/Shanghai`）确定“当前时间”，所以容器自身使用 UTC 时钟不影响“预约不能早于当前时间”的判断。

下面是在运行中的数据库里查看表结构的实际输出：

```text
$ docker compose -p venue-booking-report exec database psql -U venue -d venue_booking -c "\d venues"
                                    Table "public.venues"
   Column    |           Type           | Collation | Nullable |           Default
-------------+--------------------------+-----------+----------+------------------------------
 id          | integer                  |           | not null | generated always as identity
 name        | character varying(100)   |           | not null |
 location    | character varying(200)   |           | not null |
 capacity    | integer                  |           | not null |
 open_time   | time without time zone   |           | not null |
 close_time  | time without time zone   |           | not null |
 status      | venue_status             |           | not null | 'open'::venue_status
 description | text                     |           |          |
 created_at  | timestamp with time zone |           | not null | now()
Indexes:
    "venues_pkey" PRIMARY KEY, btree (id)
Check constraints:
    "venues_capacity_positive" CHECK (capacity > 0)
    "venues_opening_hours_valid" CHECK (open_time < close_time)
Referenced by:
    TABLE "reservations" CONSTRAINT "reservations_venue_id_venues_id_fk" FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT

$ docker compose -p venue-booking-report exec database psql -U venue -d venue_booking -c "\d reservations"
                                     Table "public.reservations"
      Column      |           Type           | Collation | Nullable |             Default
------------------+--------------------------+-----------+----------+---------------------------------
 id               | integer                  |           | not null | generated always as identity
 venue_id         | integer                  |           | not null |
 booker_name      | character varying(100)   |           | not null |
 attendee_count   | integer                  |           | not null |
 reservation_date | date                     |           | not null |
 start_time       | time without time zone   |           | not null |
 end_time         | time without time zone   |           | not null |
 purpose          | character varying(500)   |           | not null |
 status           | reservation_status       |           | not null | 'confirmed'::reservation_status
 created_at       | timestamp with time zone |           | not null | now()
 cancelled_at     | timestamp with time zone |           |          |
Indexes:
    "reservations_pkey" PRIMARY KEY, btree (id)
    "reservations_no_overlap" EXCLUDE USING gist (venue_id WITH =, tsrange(reservation_date + start_time, reservation_date + end_time, '[)'::text) WITH &&) WHERE (status = 'confirmed'::reservation_status)
    "reservations_venue_date_idx" btree (venue_id, reservation_date)
Check constraints:
    "reservations_attendee_count_positive" CHECK (attendee_count > 0)
    "reservations_cancelled_at_matches_status" CHECK ((status = 'cancelled'::reservation_status) = (cancelled_at IS NOT NULL))
    "reservations_time_range_valid" CHECK (start_time < end_time)
Foreign-key constraints:
    "reservations_venue_id_venues_id_fk" FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT
```

### 3.4 排他约束：在数据库层禁止重叠预约

迁移 `apps/api/drizzle/0001_reservations_no_overlap.sql`：

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_overlap" EXCLUDE USING gist (
	"venue_id" WITH =,
	tsrange("reservation_date" + "start_time", "reservation_date" + "end_time", '[)') WITH &&
) WHERE ("status" = 'confirmed');
```

- 排他约束要求：任意两行不能同时满足“`venue_id` 相等（`=`）”和“时间区间重叠（`&&`）”，否则写入失败。
- `reservation_date + start_time` 把日期和时间相加得到时间戳，`tsrange(…, '[)')` 构造**左闭右开**区间，因此 09:00 至 10:00 与 10:00 至 11:00 首尾相接、不算重叠。
- `WHERE (status = 'confirmed')` 使约束只作用于已确认的预约：已取消的预约不再占用时段。
- GiST 索引本身不支持整数列的 `=` 比较，`btree_gist` 扩展提供了这一运算符类。
- 违反约束时 PostgreSQL 返回 SQLSTATE `23P01`，API 把它转换为 409 `RESERVATION_CONFLICT`。
- Drizzle 的表定义无法表达排他约束，所以它写在手写的迁移文件中，`schema.ts` 里有对应注释。

### 3.5 并发下的冲突检测

冲突由数据库判定，API 把约束错误转换为业务响应（`apps/api/src/routers/reservations.ts`）：

1. API 层：创建预约时开启事务，用 `SELECT … FROM venues WHERE id = ? FOR UPDATE` 锁定场地行，校验状态、时间和人数后插入预约。同一场地的创建请求因此依次执行，不同场地之间互不阻塞。若插入违反排他约束，事务回滚后 API 捕获 `23P01`，再查询与请求时段重叠的已确认预约，返回 409 和冲突时段列表。
2. 数据库层：排他约束原子地检查重叠。同一场地的并发请求也不能写入重叠预约，即使绕过 API 直接写数据库也一样（第 7.8 节演示）。

### 3.6 取消方式：逻辑取消

本系统采用逻辑取消，不物理删除记录：

- `POST /api/reservations/{id}/cancel` 执行 `UPDATE reservations SET status = 'cancelled', cancelled_at = now() WHERE id = ? AND status = 'confirmed'`，然后返回该预约；
- 记录保留下来：预约编号是用户的凭证，取消后仍能在确认单和预约记录中查到，并显示取消时间；
- 已取消的预约不参与重叠检查，也不受排他约束限制，该时段可以立即重新预约（第 7.6 节第 7 步）；
- 检查约束 `reservations_cancelled_at_matches_status` 保证 `status` 与 `cancelled_at` 始终一致（第 7.8 节演示）；
- 对已取消的预约再次取消时，`UPDATE` 不匹配任何行，接口原样返回 200，即取消操作是幂等的（第 7.7 节）。

### 3.7 迁移与种子数据

迁移文件：

| 文件                               | 内容                                                                  | 来源                                  |
| ---------------------------------- | --------------------------------------------------------------------- | ------------------------------------- |
| `0000_init.sql`                    | 两个枚举类型、两张表、主键、外键、检查约束、`(venue_id, reservation_date)` 索引 | `drizzle-kit generate` 根据 `schema.ts` 生成 |
| `0001_reservations_no_overlap.sql` | `btree_gist` 扩展和排他约束                                            | 手写                                  |

API 启动时（`apps/api/src/server.ts`、`apps/api/src/db/prepare.ts`）依次执行：

1. 读取并校验环境变量（`apps/api/src/config.ts`，缺少 `DATABASE_URL` 等配置时直接报错退出）；
2. 反复执行 `select 1` 等待数据库可连接（最多 30 次，每次间隔 1 秒）；
3. 获取 PostgreSQL 会话级咨询锁（advisory lock），保证多个 API 实例同时启动时不会并发执行迁移；
4. 执行尚未应用的迁移，Drizzle 把已执行的迁移记录在 `drizzle.__drizzle_migrations` 表中；迁移目录由 `server.ts` 相对于自身位置定位到 `../drizzle`；
5. 如果 `venues` 表为空，写入 6 个演示场地；表中已有场地时跳过，不会覆盖用户数据；
6. 释放锁，开始监听 3000 端口。

API 每次启动都会检查迁移；环境变量 `DB_SEED_ON_START=false` 可以跳过第 5 步。仓库保留 `bun run db:generate` 生成迁移文件，迁移和种子数据都由启动流程处理。

演示场地（`apps/api/src/db/seed.ts`）：

| 编号 | 名称                | 位置                    | 容量 | 开放时间    | 状态       |
| ---- | ------------------- | ----------------------- | ---- | ----------- | ---------- |
| 1    | Aurora Lecture Hall | Teaching Building A, 1F | 180  | 08:00–22:00 | `open`     |
| 2    | Seminar Room 305    | Teaching Building B, 3F | 32   | 08:00–21:00 | `open`     |
| 3    | Maple Meeting Room  | Library, 4F             | 12   | 09:00–18:00 | `open`     |
| 4    | Badminton Court 2   | Sports Center, Hall 1   | 8    | 07:00–22:00 | `open`     |
| 5    | Black Box Studio    | Arts Center, B1         | 60   | 10:00–22:00 | `open`     |
| 6    | Rooftop Garden      | Student Center, Rooftop | 80   | 09:00–20:00 | `disabled` |

## 4. 接口说明

### 4.1 接口列表

所有接口都位于 `/api` 下，请求和响应均为 JSON。

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

取消预约使用实验要求中允许的显式取消接口 `POST /api/reservations/{id}/cancel`，而不是 `DELETE`，因为取消是逻辑取消，记录会保留。

`GET /api/reservations` 支持以下可选查询参数，同时使用时取交集，结果按日期、开始时间排序：

| 参数      | 含义                                       |
| --------- | ------------------------------------------ |
| `venueId` | 只看某个场地                               |
| `date`    | 只看某一天（`YYYY-MM-DD`）                 |
| `from`    | 只看该日期及以后                           |
| `status`  | `confirmed` 或 `cancelled`                 |
| `q`       | 在预约人和用途中不区分大小写地搜索关键词   |

`/api/health` 执行 `select 1`，数据库可用时返回 `{"status":"ok","database":"up"}`，否则返回 503 和 `{"status":"unavailable","database":"down"}`。Compose 的健康检查调用它，所以 API 处于 healthy 状态即表示它能连上数据库。

### 4.2 请求与响应

新增场地（`POST /api/venues`）：

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

规则：`name` 1 至 100 个字符，`location` 1 至 200 个字符，`capacity` 为 1 至 10000 的整数，时间为 24 小时制 `HH:mm` 且关闭时间晚于开放时间，`status` 默认 `open`，`description` 选填、不超过 500 个字符。

创建预约（`POST /api/reservations`，日期格式为 `YYYY-MM-DD`）：

```json
{
  "venueId": 3,
  "bookerName": "Robotics Club",
  "attendeeCount": 8,
  "date": "2026-10-30",
  "startTime": "14:00",
  "endTime": "15:30",
  "purpose": "Sprint planning"
}
```

规则：`bookerName` 1 至 100 个字符，`attendeeCount` 为 1 至 10000 的整数，日期必须真实存在（2026-02-30 会被拒绝），结束时间晚于开始时间，`purpose` 1 至 500 个字符。

预约的响应中会附带场地的编号、名称和位置，前端无需再单独查询场地：

```json
{"id":1,"venueId":3,"venue":{"id":3,"name":"Maple Meeting Room","location":"Library, 4F"},"bookerName":"Robotics Club","attendeeCount":8,"date":"2026-10-30","startTime":"14:00","endTime":"15:30","purpose":"Sprint planning","status":"confirmed","createdAt":"2026-10-19T13:53:37.224Z","cancelledAt":null}
```

### 4.3 创建预约的校验顺序

1. 请求格式和字段（契约中的 Zod 规则）：不合法时返回 400 `BAD_REQUEST`，`data.issues` 逐项列出 `{ path, message }`；
2. 在事务中查询并锁定场地行：场地不存在返回 404 `VENUE_NOT_FOUND`，场地停用返回 400 `VENUE_DISABLED`；
3. 开始时间不晚于当前时间（按 `APP_TIME_ZONE`）：400 `RESERVATION_IN_PAST`；
4. 时段超出场地开放时间：400 `OUTSIDE_OPENING_HOURS`；
5. 人数超过场地容量：400 `CAPACITY_EXCEEDED`；
6. 插入时由数据库排他约束检查重叠：违反约束后先回滚事务，再把 `23P01` 转为 409 `RESERVATION_CONFLICT`，`data.conflicts` 列出冲突的预约；
7. 写入成功后返回 201 和完整的预约。

### 4.4 错误响应

所有错误使用同一种 JSON 格式，不返回异常堆栈。第 7.6 节中的实际响应：

```json
{"defined":true,"code":"RESERVATION_CONFLICT","status":409,"message":"The requested time overlaps 1 existing reservation(s)","data":{"conflicts":[{"id":1,"startTime":"14:00","endTime":"15:30"}]}}
```

- `code`：机器可读的错误码，前端据此显示对应语言的提示；
- `status`：与 HTTP 状态码一致；
- `message`：英文说明；
- `data`：可选的结构化信息，如字段问题、冲突时段、开放时间、容量；
- `defined`：oRPC 框架附加的字段，`true` 表示该错误是契约（`packages/contracts/src/contract.ts` 中的 `apiErrors`）里声明的业务错误，`false` 表示框架层面的错误（如参数校验失败）。路由不存在时由 Hono 返回，没有这个字段。

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

意外错误由 API 写入日志，客户端只收到错误码为 `INTERNAL_SERVER_ERROR` 的通用 500 响应。预期内的 4xx 错误属于正常业务结果，只记一行请求日志，不作为错误输出（第 7.5 节）。

### 4.5 接口文档

API 根据契约自动生成 OpenAPI 3.1 文档，位于 `/api/openapi.json`；`/api/docs` 是基于 Scalar 的交互式文档页面。该页面从 `cdn.jsdelivr.net` 加载 Scalar 脚本，需要能访问外网；离线时可以直接查看 `/api/openapi.json`。

## 5. Dockerfile 说明

### 5.1 构建上下文与 `.dockerignore`

两个 Dockerfile 都以仓库根目录为构建上下文（`compose.yaml` 中的 `context: .`），因为前后端都依赖根目录的锁文件 `bun.lock` 和共享包 `packages/contracts`。根目录的 `.dockerignore` 同时作用于两次构建：

```text
# Build context for deploy/api/Dockerfile and deploy/web/Dockerfile (repository root).
# The Dockerfiles copy only the files they need; this keeps local dependency caches,
# build output, secrets and tooling out of the context entirely.

# Dependencies and build output are recreated inside the image
**/node_modules
**/dist
**/*.tsbuildinfo

# Secrets and local environment
.env
.env.*
!.env.example

# Version control, editor and agent tooling
.git
.github
.agents
.claude
.codex
.playwright
.playwright-cli
.vscode
.idea

# Tests, reports and documentation are not part of either image
tests
docs
coverage
test-results
playwright-report
blob-report
.lighthouseci
**/*.log
**/*.md
```

- 本机的 `node_modules`、构建产物 `dist` 不进入构建上下文，依赖和产物都在镜像内按锁文件重新生成，保证构建可复现；
- `.env` 及其变体被排除，密码不会被 `COPY` 进镜像；`.env.example` 是示例，允许保留；
- Git 数据、编辑器与工具配置、测试、文档和报告都与镜像无关，一并排除；
- 两个 Dockerfile 也都只 `COPY` 所需的目录，而不是 `COPY . .`。

### 5.2 后端镜像：`deploy/api/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1
# Backend API image. Build context: repository root (see compose.yaml).

# ---- Build stage: install workspace dependencies and bundle the API ----
FROM oven/bun:1.4.2-alpine AS build
WORKDIR /app

# Copy manifests first so the dependency layer stays cached until they change.
# All workspace manifests are needed for the lockfile to match (--frozen-lockfile).
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN bun install --frozen-lockfile --production --filter @venue/api

COPY packages/contracts/ packages/contracts/
COPY apps/api/ apps/api/
# Bun bundles the API and all of its dependencies into dist/server.js.
RUN bun run --cwd apps/api build

# ---- Runtime stage: Node.js with only the bundle and the SQL migrations ----
FROM node:24.22.0-alpine3.24 AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/drizzle ./drizzle

# Database settings (DATABASE_URL etc.) come from the environment at run time.
# The official Node.js image provides the unprivileged "node" user.
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

采用多阶段构建，构建工具和源码只存在于第一阶段：

| 部分                                                       | 说明                                                                                                                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `# syntax=docker/dockerfile:1`                             | 使用 Dockerfile 1.x 的 BuildKit 语法                                                                                                                                  |
| `FROM oven/bun:1.4.2-alpine AS build`                      | 构建阶段：仓库用 Bun 管理依赖和工作区，基础镜像固定到具体版本                                                                                                         |
| 先 `COPY` 各个 `package.json` 和 `bun.lock`，再 `bun install` | 依赖层只在清单或锁文件变化时重建，修改源码不会触发重新安装。`--frozen-lockfile` 要求依赖与锁文件完全一致；`--production --filter @venue/api` 只安装 API 所需的生产依赖。锁文件覆盖所有工作区，所以 web 的 `package.json` 也要复制 |
| `COPY packages/contracts/`、`COPY apps/api/`                 | 只复制 API 及其依赖的共享契约，不复制前端源码                                                                                                                         |
| `RUN bun run --cwd apps/api build`                         | 执行 `bun build src/server.ts --target=node --outdir=dist`，把入口和依赖打包成单个 ESM 文件 `dist/server.js`，运行时不再需要 `node_modules`                            |
| `FROM node:24.22.0-alpine3.24 AS runtime`                  | 运行阶段：只有 Node.js 运行时，不含 Bun、TypeScript 等构建工具                                                                                                        |
| `ENV NODE_ENV=production PORT=3000`                       | 只设置非敏感的默认值                                                                                                                                                  |
| `COPY --from=build … ./dist`、`… ./drizzle`                  | 从构建阶段只取打包产物和 SQL 迁移文件                                                                                                                                 |
| （注释）`DATABASE_URL` 来自运行时环境                        | 数据库地址、用户和密码由 Compose 在创建容器时通过环境变量传入，镜像中没有密码                                                                                          |
| `USER node`                                                | 以官方 Node 镜像自带的非 root 用户（uid 1000）运行                                                                                                                     |
| `EXPOSE 3000`                                              | 声明容器监听的端口（Compose 中没有把它发布到主机）                                                                                                                    |
| `CMD ["node", "dist/server.js"]`                           | exec 形式启动，node 直接作为主进程接收 `SIGTERM`，`server.ts` 据此关闭 HTTP 服务和数据库连接池后退出（日志中的 `SIGTERM received, shutting down`）                     |

镜像内容的实际检查结果：

```text
$ docker image inspect venue-booking/api:1.0.0 --format 'User={{.Config.User}} Cmd={{json .Config.Cmd}} Ports={{json .Config.ExposedPorts}} Env={{json .Config.Env}}'
User=node Cmd=["node","dist/server.js"] Ports={"3000/tcp":{}} Env=["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin","NODE_VERSION=24.22.0","YARN_VERSION=1.22.22","NODE_ENV=production","PORT=3000"]

$ docker compose -p venue-booking-report exec api sh -c 'id; ls -la /app /app/dist /app/drizzle; ls /app/node_modules /app/src'
uid=1000(node) gid=1000(node) groups=1000(node)
/app:
total 16
drwxr-xr-x    1 root     root          4096 Oct 19 13:48 .
drwxr-xr-x    1 root     root          4096 Oct 19 13:48 ..
drwxr-xr-x    2 root     root          4096 Oct 19 13:48 dist
drwxr-xr-x    3 root     root          4096 Oct 19 07:20 drizzle

/app/dist:
total 664
drwxr-xr-x    2 root     root          4096 Oct 19 13:48 .
drwxr-xr-x    1 root     root          4096 Oct 19 13:48 ..
-rw-r--r--    1 root     root        668659 Oct 19 13:48 server.js

/app/drizzle:
total 20
drwxr-xr-x    3 root     root          4096 Oct 19 07:20 .
drwxr-xr-x    1 root     root          4096 Oct 19 13:48 ..
-rwxr-xr-x    1 root     root          2126 Oct 19 07:20 0000_init.sql
-rwxr-xr-x    1 root     root           715 Oct 19 07:20 0001_reservations_no_overlap.sql
drwxr-xr-x    2 root     root          4096 Oct 19 07:20 meta
ls: /app/node_modules: No such file or directory
ls: /app/src: No such file or directory

$ docker compose -p venue-booking-report exec api sh -c 'echo "$DATABASE_URL" | sed -E "s#:[^:@/]+@#:****@#"'
postgres://venue:****@database:5432/venue_booking
# 密码已用 sed 遮盖；主机名为 Compose 服务名 database
```

镜像以 `node` 用户运行；镜像自身的环境变量中没有 `DATABASE_URL` 或密码；`/app` 下只有约 0.67 MB 的 `dist/server.js` 和迁移文件，没有源码和 `node_modules`；连接地址是容器运行时由 Compose 注入的。

### 5.3 前端镜像：`deploy/web/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1
# Frontend image. Build context: repository root (see compose.yaml).

# ---- Build stage: compile the React app into static files ----
FROM oven/bun:1.4.2-alpine AS build
WORKDIR /app

# Copy manifests first so the dependency layer stays cached until they change.
# All workspace manifests are needed for the lockfile to match (--frozen-lockfile).
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN bun install --frozen-lockfile --filter @venue/web

COPY packages/contracts/ packages/contracts/
COPY apps/web/ apps/web/
RUN bun run --cwd apps/web build

# ---- Runtime stage: unprivileged nginx serving the build and proxying /api ----
FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24 AS runtime
# API_UPSTREAM is substituted into the nginx config when the container starts.
ENV API_UPSTREAM=http://api:3000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

COPY deploy/web/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

# Runs as the image's unprivileged "nginx" user (uid 101).
EXPOSE 8080
```

| 部分                                                       | 说明                                                                                                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 构建阶段 `oven/bun:1.4.2-alpine`                           | 与后端相同的依赖缓存方式；`--filter @venue/web` 只安装前端依赖                                                                                             |
| `COPY packages/contracts/`、`COPY apps/web/`                 | 只复制前端源码和共享契约                                                                                                                                   |
| `RUN bun run --cwd apps/web build`                         | 执行 `tsc -b && vite build`，先做类型检查，再输出静态文件到 `apps/web/dist`                                                                                |
| 运行阶段 `nginxinc/nginx-unprivileged:1.30.6-alpine3.24`   | 官方 nginx 的非 root 变体，以 uid 101 运行，监听非特权端口 8080；运行镜像中没有 Node.js、Bun 和源码                                                         |
| `ENV API_UPSTREAM=http://api:3000`                         | API 的上游地址，默认指向 Compose 服务 `api`，可在运行时覆盖                                                                                                |
| `ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1`                   | 让镜像的入口脚本从 `/etc/resolv.conf` 读取 DNS 服务器并写入变量 `NGINX_LOCAL_RESOLVERS`，供配置中的 `resolver` 使用                                          |
| `COPY … /etc/nginx/templates/default.conf.template`        | 放入模板目录：容器启动时入口脚本用 `envsubst` 把其中的 `${…}` 替换为环境变量，生成 `/etc/nginx/conf.d/default.conf`                                          |
| `COPY --from=build … /usr/share/nginx/html`                | 只取构建产物                                                                                                                                               |
| `EXPOSE 8080`                                              | 容器监听端口。没有写 `CMD`，沿用基础镜像的 `nginx -g daemon off;`（见第 2.3 节的进程列表）                                                                  |

镜像内容的实际检查结果：

```text
$ docker image inspect venue-booking/frontend:1.0.0 --format 'User={{.Config.User}} Ports={{json .Config.ExposedPorts}} Env={{json .Config.Env}}'
User=101 Ports={"8080/tcp":{}} Env=["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin","NGINX_VERSION=1.30.6","PKG_RELEASE=1","DYNPKG_RELEASE=1","NJS_VERSION=1.0.2","NJS_RELEASE=1","API_UPSTREAM=http://api:3000","NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1"]

$ docker compose -p venue-booking-report exec frontend sh -c 'id; ls /usr/share/nginx/html'
uid=101(nginx) gid=101(nginx) groups=101(nginx)
50x.html
assets
favicon.svg
index.html
robots.txt
```

### 5.4 nginx 配置模板：`deploy/web/default.conf.template`

```nginx
# Rendered by the nginx image entrypoint (envsubst) into /etc/nginx/conf.d/default.conf.
#   API_UPSTREAM           base URL of the API service, e.g. http://api:3000
#   NGINX_LOCAL_RESOLVERS  DNS servers from /etc/resolv.conf, set by the entrypoint
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    # Resolve the API host per request (cached for 10s) rather than once at startup,
    # so a recreated api container with a new IP address is still reached.
    resolver ${NGINX_LOCAL_RESOLVERS} valid=10s ipv6=off;
    set $api_upstream ${API_UPSTREAM};

    location /api/ {
        proxy_pass $api_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /healthz {
        access_log off;
        default_type text/plain;
        return 200 "ok\n";
    }

    # Vite fingerprints asset file names, so they can be cached for a long time.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # Client-side routes such as /reservations/42 fall back to the single-page app.
    location / {
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;
    }
}
```

| 配置                                             | 说明                                                                                                                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listen 8080`、`root`                            | 在 8080 端口提供 `/usr/share/nginx/html` 中的静态文件                                                                                                                                                                      |
| `gzip`                                           | 压缩 CSS、JS、JSON 和 SVG 响应                                                                                                                                                                                             |
| `resolver …` + `set $api_upstream …` + `proxy_pass $api_upstream` | `proxy_pass` 使用变量时，nginx 在请求时通过 `resolver` 解析主机名（结果缓存 10 秒），而不是只在启动时解析一次。这样 `api` 容器重建、IP 改变后仍能找到它。`proxy_pass` 的变量中没有 URI 部分，请求路径 `/api/...` 原样转发，正好对应 API 的路由前缀 |
| `location /api/`                                 | 反向代理到 API，并传递 `Host`、`X-Real-IP`、`X-Forwarded-For`、`X-Forwarded-Proto` 请求头                                                                                                                                 |
| `location = /healthz`                            | 供容器健康检查使用，直接返回 `ok`，不记访问日志                                                                                                                                                                           |
| `location /assets/`                              | Vite 输出的文件名带内容哈希，可以缓存一年并标记 `immutable`                                                                                                                                                              |
| `location /`                                     | `index.html` 不缓存，保证发布新版本后立即生效；找不到的路径回退到 `index.html`，支持前端路由                                                                                                                              |

容器中渲染后的实际配置（模板中的两个变量已被替换，`127.0.0.11` 是 Docker 内置的 DNS 服务器）：

```text
$ docker compose -p venue-booking-report exec frontend sed -n '4,24p' /etc/nginx/conf.d/default.conf
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    # Resolve the API host per request (cached for 10s) rather than once at startup,
    # so a recreated api container with a new IP address is still reached.
    resolver 127.0.0.11 valid=10s ipv6=off;
    set $api_upstream http://api:3000;

    location /api/ {
        proxy_pass $api_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

### 5.5 镜像版本与标签

| 镜像                                            | 用途                     |
| ----------------------------------------------- | ------------------------ |
| `oven/bun:1.4.2-alpine`                         | 前后端的构建阶段         |
| `node:24.22.0-alpine3.24`                       | API 的运行阶段           |
| `nginxinc/nginx-unprivileged:1.30.6-alpine3.24` | 前端的运行阶段           |
| `postgres:18.6-alpine3.24`                      | 数据库（标准镜像，直接使用） |

所有基础镜像都固定到具体的版本号和 Alpine 版本，不使用 `latest`。自建镜像命名为 `venue-booking/api` 和 `venue-booking/frontend`，标签由 `.env` 中的 `IMAGE_TAG` 决定（默认 `1.0.0`）。镜像不需要推送到公共仓库，任何人都可以用源码和 Dockerfile 重新构建：

```bash
docker build -f deploy/api/Dockerfile -t venue-booking/api:1.0.0 .
```

```bash
docker build -f deploy/web/Dockerfile -t venue-booking/frontend:1.0.0 .
```

本机构建得到的镜像：

```text
$ docker image ls 'venue-booking/*'
IMAGE                          ID             DISK USAGE   CONTENT SIZE   EXTRA
venue-booking/api:1.0.0        d275c6944478        244MB         62.6MB   U
venue-booking/frontend:1.0.0   fc2600f8c724         92MB         26.1MB   U
```

## 6. Compose 文件说明

### 6.1 `compose.yaml`

```yaml
# Venue Booking System — Lab 1 deployment.
#
#   browser ──▶ frontend (nginx :8080) ──/api──▶ api (Node.js :3000) ──▶ database (PostgreSQL :5432)
#
# Usage:  cp .env.example .env   # then adjust the values
#         docker compose up --build -d
#
# Only the frontend port is published. The API is reachable through the frontend's /api
# reverse proxy, and the database is reachable only from the API on the backend network.
name: venue-booking

services:
  database:
    image: postgres:18.6-alpine3.24
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:?set POSTGRES_DB in .env}
      POSTGRES_USER: ${POSTGRES_USER:?set POSTGRES_USER in .env}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
    volumes:
      # PostgreSQL 18+ images store data under /var/lib/postgresql/<major>/docker.
      - database-data:/var/lib/postgresql
    networks:
      - backend-net
    healthcheck:
      test:
        ["CMD-SHELL", 'pg_isready -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"']
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s

  api:
    build:
      context: .
      dockerfile: deploy/api/Dockerfile
    image: venue-booking/api:${IMAGE_TAG:-1.0.0}
    restart: unless-stopped
    environment:
      # The host name is the Compose service name of the database.
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@database:5432/${POSTGRES_DB}
      PORT: 3000
      APP_TIME_ZONE: ${APP_TIME_ZONE:-Asia/Shanghai}
      DB_SEED_ON_START: ${DB_SEED_ON_START:-true}
    depends_on:
      database:
        condition: service_healthy
    networks:
      - frontend-net
      - backend-net
    healthcheck:
      # /api/health runs `select 1`, so a healthy API is also connected to the database.
      test:
        - CMD
        - node
        - -e
        - "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s

  frontend:
    build:
      context: .
      dockerfile: deploy/web/Dockerfile
    image: venue-booking/frontend:${IMAGE_TAG:-1.0.0}
    restart: unless-stopped
    environment:
      API_UPSTREAM: http://api:3000
    ports:
      - "${FRONTEND_PORT:-8080}:8080"
    depends_on:
      api:
        condition: service_healthy
    networks:
      - frontend-net
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://127.0.0.1:8080/healthz"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 5s

networks:
  # frontend <-> api
  frontend-net:
  # api <-> database; the frontend is not attached, so it cannot reach the database.
  backend-net:

volumes:
  database-data:
```

### 6.2 逐项说明

顶层的 `name: venue-booking` 是项目名。Compose 创建的容器、网络和卷都以它为前缀，例如容器 `venue-booking-api-1`、网络 `venue-booking_backend-net`、卷 `venue-booking_database-data`。命令行的 `-p` 参数可以覆盖它（第 7 节就是这样做的）。

#### `database` 服务

| 配置                              | 说明                                                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image: postgres:18.6-alpine3.24` | 标准 PostgreSQL 镜像，无需自建                                                                                                                       |
| `restart: unless-stopped`         | 进程异常退出或 Docker 重启后自动拉起，手动停止的除外（三个服务相同）                                                                                 |
| `environment`                     | 数据库名、用户名和密码全部来自 `.env`。`${VAR:?提示}` 表示变量未设置或为空时 Compose 直接报错并给出提示，不会用空密码启动                              |
| `volumes: database-data:/var/lib/postgresql` | 命名卷持久化数据。PostgreSQL 18 镜像的数据目录是 `/var/lib/postgresql/18/docker`，所以挂载其上级目录（日志中可见 `fixing permissions on existing directory /var/lib/postgresql/18/docker`） |
| `networks: backend-net`           | 只接入后端网络；没有 `ports`，不发布到主机                                                                                                           |
| `healthcheck`                     | 用 `pg_isready` 检查数据库能否接受连接。`$$` 转义为 `$`，让变量在容器内由 shell 展开，而不是被 Compose 在主机上替换；每 5 秒一次，最多重试 10 次，启动后 10 秒内的失败不计入 |

#### `api` 服务

| 配置                                            | 说明                                                                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `build`                                         | 以仓库根目录为上下文，使用 `deploy/api/Dockerfile`                                                                                                           |
| `image: venue-booking/api:${IMAGE_TAG:-1.0.0}`  | 构建出的镜像名和标签                                                                                                                                         |
| `DATABASE_URL`                                  | Compose 用 `.env` 中的同一组变量拼出连接地址，主机名是数据库的服务名 `database`。源码和镜像中都不包含密码                                                    |
| `PORT`、`APP_TIME_ZONE`、`DB_SEED_ON_START`      | 监听端口、业务时区、空库时是否写入演示场地，后两项可在 `.env` 中修改                                                                                         |
| `depends_on: database: condition: service_healthy` | 数据库健康检查通过后才启动 API。API 自身还会重试连接数据库，作为第二道保障                                                                                 |
| `networks: frontend-net, backend-net`           | 唯一同时接入两个网络的服务：既能被前端访问，又能访问数据库                                                                                                   |
| `healthcheck`                                   | Node Alpine 镜像中没有 curl，因此用 `node -e` 调用 `fetch` 访问 `/api/health`。该接口会执行 `select 1`，API 健康即表示数据库连接正常                          |

#### `frontend` 服务

| 配置                                       | 说明                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `build`、`image`                           | 使用 `deploy/web/Dockerfile` 构建 `venue-booking/frontend` 镜像            |
| `environment: API_UPSTREAM`                | nginx 反向代理的上游，即 Compose 服务 `api` 的 3000 端口                   |
| `ports: "${FRONTEND_PORT:-8080}:8080"`     | 整个系统唯一发布到主机的端口，主机端口可通过 `FRONTEND_PORT` 修改          |
| `depends_on: api: condition: service_healthy` | API 健康后才启动前端                                                    |
| `networks: frontend-net`                   | 只接入前端网络，因此无法访问数据库                                         |
| `healthcheck`                              | 用镜像自带的 `wget` 访问 `/healthz`                                        |

#### 网络、卷与启动顺序

`networks` 定义了两个用户自定义的 bridge 网络。在同一网络中，Compose 提供基于服务名的 DNS 解析；不在同一网络的容器之间既不能解析名称，也无法连通。

`volumes` 定义了命名卷 `database-data`。`docker compose down` 不会删除它，只有 `docker compose down -v` 才会。

启动顺序是 `database` 健康 → 启动 `api` → `api` 健康 → 启动 `frontend`。第 7.2 节的输出中可以看到 Compose 依次等待（`Waiting`）和确认健康（`Healthy`）的过程。

### 6.3 配置与敏感信息

Docker Compose 自动读取仓库根目录的 `.env`。仓库只提交 `.env.example`，其中只有变量名和实验用的示例值：

```bash
# Copy to `.env` and adjust. Docker Compose reads `.env` automatically.
# Example values for local experiments only — never commit a real `.env`.

# ---- PostgreSQL container ----
POSTGRES_DB=venue_booking
POSTGRES_USER=venue
# Use URL-safe characters (letters, digits, "-", "_", "."): the API connection URL embeds it.
POSTGRES_PASSWORD=change-me-local-only

# ---- Application ----
# Host port of the web UI; the API is served under /api on the same port.
FRONTEND_PORT=8080
# Time zone used to reject reservations that start in the past.
APP_TIME_ZONE=Asia/Shanghai
# Insert demo venues when the database has no venues yet.
DB_SEED_ON_START=true
# Tag for the locally built images venue-booking/api and venue-booking/frontend.
IMAGE_TAG=1.0.0

# ---- Local development outside Docker (`bun run dev`, integration tests) ----
# Loopback port published by compose.dev.yaml for PostgreSQL.
POSTGRES_HOST_PORT=5432
# Must match the PostgreSQL values above.
DATABASE_URL=postgres://venue:change-me-local-only@localhost:5432/venue_booking
```

| 变量                 | 使用者             | 用途                                  |
| -------------------- | ------------------ | ------------------------------------- |
| `POSTGRES_DB`        | database、api      | 数据库名                              |
| `POSTGRES_USER`      | database、api      | 数据库用户                            |
| `POSTGRES_PASSWORD`  | database、api      | 数据库密码（必填，只用 URL 安全字符） |
| `FRONTEND_PORT`      | frontend           | Web 界面在主机上的端口                |
| `APP_TIME_ZONE`      | api                | 用于判断预约是否已开始的时区          |
| `DB_SEED_ON_START`   | api                | 场地表为空时写入演示场地              |
| `IMAGE_TAG`          | compose            | 本地构建镜像的标签                    |
| `POSTGRES_HOST_PORT` | `compose.dev.yaml` | 本地开发时 PostgreSQL 的回环地址端口  |
| `DATABASE_URL`       | 本地 `bun run dev` | 在 Docker 外运行 API 时的连接地址     |

- 真实的 `.env` 已加入 `.gitignore`（`git check-ignore -v .env` 输出 `.gitignore:8:.env	.env`），也被 `.dockerignore` 排除在构建上下文之外；
- 密码只出现在 `.env` 中，Dockerfile、源码和镜像里都没有（第 5.2 节的 `docker image inspect` 输出可以印证）；
- 密码会被拼进 API 的连接 URL，所以只能使用字母、数字和 `-`、`_`、`.`。

### 6.4 开发用覆盖文件 `compose.dev.yaml`

```yaml
# Development override: publishes PostgreSQL on the loopback interface only, so the API
# and the integration tests can run on the host. Not used by `docker compose up`.
#
#   docker compose -f compose.yaml -f compose.dev.yaml up -d database
services:
  database:
    ports:
      - "127.0.0.1:${POSTGRES_HOST_PORT:-5432}:5432"
```

按实验要求 7.2 节说明：完整部署不发布数据库端口。只有在 Docker 外本地开发 API（`bun run dev:db` 会执行上面注释中的命令）时，才通过这个覆盖文件把 PostgreSQL 发布到主机。端口只绑定在回环地址 `127.0.0.1`，局域网中的其他机器无法访问。`docker compose up` 默认只读取 `compose.yaml`（以及 `compose.override.yaml`，本仓库没有该文件），不会加载这个文件。

## 7. 部署、启动与运行记录

### 7.1 记录环境与说明

| 项目     | 内容                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------ |
| 操作系统 | Windows 11 Pro（10.0.26200）                                                                           |
| Docker   | Docker Desktop，Docker Engine 29.8.2，WSL 2 后端                                                       |
| Compose  | `docker compose version` 输出 `Docker Compose version v5.6.0`（Compose 插件，Compose V2 的后续版本，不是旧版独立的 `docker-compose` V1） |
| 终端     | PowerShell 7.6.7，curl.exe 8.21.0                                                                        |
| 时间     | 2026-10-19（东八区时间）                                                                                |

本机已有一套保存着开发数据的默认实例（项目名 `venue-booking`，端口 8080）。为了不影响它，记录时使用了一个独立的临时项目：在 PowerShell 中设置 `$env:FRONTEND_PORT = '8090'`，所有 Compose 命令都加上 `-p venue-booking-report`。两者使用同一份 `compose.yaml` 和同样的镜像，区别只在于资源名前缀（`venue-booking-report-*`）和主机端口（8090）。按默认方式运行时，去掉 `-p venue-booking-report`，并把 8090 换成 8080 即可，卷名为 `venue-booking_database-data`。记录全部完成后，用 `docker compose -p venue-booking-report down -v` 删除了这个临时项目。

第 7、9 节的主机命令统一使用 PowerShell 7.6.7 语法，输出块中的 `PS>` 表示提示符，不需输入。`curl.exe` 显式调用可执行文件；JSON 请求体用单引号包裹，按 PowerShell 7 默认的原生命令参数传递方式执行。

### 7.2 准备配置、构建并启动

```powershell
Copy-Item .env.example .env
```

本次记录直接使用 `.env.example` 中的示例值，并在 PowerShell 中覆盖端口：

```powershell
$env:FRONTEND_PORT = '8090'
```

```text
PS> docker compose --env-file .env.example -p venue-booking-report up --build -d --wait
 Image venue-booking/frontend:1.0.0 Building
……
 Image venue-booking/api:1.0.0 Building
……
#2 transferring dockerfile: 1.30kB 0.0s done
……
#3 transferring dockerfile: 1.25kB 0.0s done
……
#18 [api build  7/10] RUN bun install --frozen-lockfile --production --filter @venue/api
#18 CACHED
……
#24 [frontend build 10/10] RUN bun run --cwd apps/web build
#24 CACHED
……
#30 [frontend build  7/10] RUN bun install --frozen-lockfile --filter @venue/web
#30 CACHED
……
#33 naming to docker.io/venue-booking/frontend:1.0.0 0.0s done
……
#34 [api build 10/10] RUN bun run --cwd apps/api build
……
……
#34 0.735 Bundled 290 modules in 113ms
……
#34 0.735   server.js  0.67 MB  (entry point)
……
#39 naming to docker.io/venue-booking/api:1.0.0 done
……
 Image venue-booking/api:1.0.0 Built
……
 Image venue-booking/frontend:1.0.0 Built
……
 Volume venue-booking-report_database-data Created
……
……
 Network venue-booking-report_frontend-net Created
……
……
 Network venue-booking-report_backend-net Created
……
……
 Container venue-booking-report-database-1 Created
……
 Container venue-booking-report-api-1 Created
……
 Container venue-booking-report-frontend-1 Created
……
 Container venue-booking-report-database-1 Started
……
 Container venue-booking-report-database-1 Healthy
……
 Container venue-booking-report-api-1 Started
……
 Container venue-booking-report-api-1 Healthy
……
 Container venue-booking-report-frontend-1 Started
……
……
……
 Container venue-booking-report-frontend-1 Healthy
```

- 两个镜像并行构建，步骤名中的 `build` 和 `runtime` 分别对应 Dockerfile 的两个阶段，`COPY --from=build` 把构建阶段的产物复制到运行阶段；
- 依赖安装和前端构建命中了构建缓存（`CACHED`）；API 源码的复制、打包和运行阶段产物复制实际执行。在全新的机器上，依赖安装和前端打包也会实际执行；
- 构建完成后依次创建卷、两个网络和三个容器，并按依赖顺序启动：数据库健康后才启动 API，API 健康后才启动前端；
- `--wait` 等待三个服务全部健康后才返回，本次构建和启动成功。

### 7.3 查看容器状态

```text
PS> docker compose -p venue-booking-report ps
NAME                              IMAGE                          COMMAND                  SERVICE    CREATED         STATUS                    PORTS
venue-booking-report-api-1        venue-booking/api:1.0.0        "docker-entrypoint.s…"   api        4 minutes ago   Up 29 seconds (healthy)   3000/tcp
venue-booking-report-database-1   postgres:18.6-alpine3.24       "docker-entrypoint.s…"   database   4 minutes ago   Up 4 minutes (healthy)    5432/tcp
venue-booking-report-frontend-1   venue-booking/frontend:1.0.0   "/docker-entrypoint.…"   frontend   8 seconds ago   Up 6 seconds (healthy)    0.0.0.0:8090->8080/tcp, [::]:8090->8080/tcp
```

三个服务的容器均已创建并处于 `Up … (healthy)` 状态，说明三项健康检查（`pg_isready`、`/api/health`、`/healthz`）都已通过。`PORTS` 一列中只有 `frontend` 发布了主机端口（`0.0.0.0:8090->8080/tcp`），`api` 的 `3000/tcp` 和 `database` 的 `5432/tcp` 只在容器网络内可用。

### 7.4 健康检查与前端访问

```text
PS> curl.exe -s http://localhost:8090/api/health
{"status":"ok","database":"up"}

PS> curl.exe -s -o NUL -w '%{http_code} %{content_type}\n' http://localhost:8090/
200 text/html
```

健康检查请求经过前端 nginx 的反向代理到达 API，API 执行 `select 1` 成功，说明 `frontend → api → database` 整条链路畅通；首页返回 200 和 HTML，前端可以访问。

### 7.5 服务日志

```text
PS> docker compose -p venue-booking-report logs api
api-1  | Database migrations are up to date
api-1  | Seeded 6 demo venues
api-1  | API listening on http://0.0.0.0:3000
```

API 首次启动时执行了迁移，并因数据库为空写入了 6 个演示场地。

```text
PS> docker compose -p venue-booking-report logs database
database-1  | The files belonging to this database system will be owned by user "postgres".
……
database-1  | fixing permissions on existing directory /var/lib/postgresql/18/docker ... ok
……
database-1  | sh: locale: not found
……
database-1  | 2026-10-19 13:48:57.291 UTC [41] WARNING:  no usable system locales were found
……
database-1  | performing post-bootstrap initialization ... ok
……
database-1  | initdb: warning: enabling "trust" authentication for local connections
……
database-1  | CREATE DATABASE
……
database-1  | PostgreSQL init process complete; ready for start up.
……
database-1  | 2026-10-19 13:48:58.919 UTC [1] LOG:  starting PostgreSQL 18.6 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit
……
database-1  | 2026-10-19 13:48:58.919 UTC [1] LOG:  listening on IPv4 address "0.0.0.0", port 5432
……
database-1  | 2026-10-19 13:48:58.919 UTC [1] LOG:  listening on IPv6 address "::", port 5432
……
database-1  | 2026-10-19 13:48:58.932 UTC [1] LOG:  listening on Unix socket "/var/run/postgresql/.s.PGSQL.5432"
……
database-1  | 2026-10-19 13:48:58.962 UTC [1] LOG:  database system is ready to accept connections
```

首次启动时，官方镜像的入口脚本初始化数据目录、按环境变量创建数据库和用户，然后正式启动。初始化过程中的两条提示都只在首次初始化时出现一次：Alpine 镜像不带系统 locale（不影响 UTF-8 编码），以及容器内通过 Unix 套接字的本地连接免密码（官方镜像的默认行为；API 通过网络连接，需要 `POSTGRES_PASSWORD` 中的密码）。数据目录已存在时不会重新初始化。

```text
PS> docker compose -p venue-booking-report logs frontend
frontend-1  | /docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration
……
frontend-1  | /docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/
……
frontend-1  | /docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh
……
frontend-1  | 10-listen-on-ipv6-by-default.sh: info: Getting the checksum of /etc/nginx/conf.d/default.conf
……
frontend-1  | 10-listen-on-ipv6-by-default.sh: info: /etc/nginx/conf.d/default.conf differs from the packaged version
……
frontend-1  | /docker-entrypoint.sh: Sourcing /docker-entrypoint.d/15-local-resolvers.envsh
……
frontend-1  | /docker-entrypoint.sh: Launching /docker-entrypoint.d/20-envsubst-on-templates.sh
……
frontend-1  | 20-envsubst-on-templates.sh: Running envsubst on /etc/nginx/templates/default.conf.template to /etc/nginx/conf.d/default.conf
……
frontend-1  | /docker-entrypoint.sh: Launching /docker-entrypoint.d/30-tune-worker-processes.sh
……
frontend-1  | /docker-entrypoint.sh: Configuration complete; ready for start up
……
frontend-1  | 2026/10/19 13:53:26 [notice] 1#1: nginx/1.30.6
……
frontend-1  | 2026/10/19 13:53:26 [notice] 1#1: start worker processes
```

nginx 启动时，入口脚本先读取 DNS 服务器（`15-local-resolvers.envsh`），再用 `envsubst` 渲染配置模板（第 5.4 节），之后开始处理请求。请求处理后，访问日志会记录请求路径、状态码和响应大小。

完成功能验证后，再次检查日志：

```text
PS> (docker compose -p venue-booking-report logs --no-log-prefix | Select-String -Pattern 'error|fatal|panic' | Measure-Object).Count
0

PS> docker compose -p venue-booking-report logs api
api-1  | Database migrations are up to date
api-1  | API listening on http://0.0.0.0:3000
api-1  | GET /api/reservations 200 68ms
api-1  | GET /api/reservations/1 200 11ms
api-1  | GET /api/reservations/3 200 4ms
api-1  | GET /api/reservations/3 200 4ms
```

三个服务的日志中没有任何包含 `error`、`fatal` 或 `panic` 的行。API 对每个请求记录一行“方法、路径、状态码、耗时”（健康检查请求不记录，避免每 10 秒一行刷屏）；409 等预期内的业务错误只作为普通请求记录。容器重新创建后，迁移检查通过，没有重复写入演示场地（第 7.9 节）。

### 7.6 基本功能验证（实验要求 8.1）

1\. 打开前端页面：见第 7.4 节和第 8 节截图。

2\. 查询场地列表和场地详情：

```text
PS> curl.exe -sS http://localhost:8090/api/venues
[{"id":1,"name":"Aurora Lecture Hall","location":"Teaching Building A, 1F","capacity":180,"openTime":"08:00","closeTime":"22:00","status":"open","description":"Tiered seating with dual projectors, lecture capture and a wireless microphone kit.","createdAt":"2026-10-19T13:53:03.636Z"},{"id":2,"name":"Seminar Room 305","location":"Teaching Building B, 3F","capacity":32,"openTime":"08:00","closeTime":"21:00","status":"open","description":"Movable tables for workshops and group discussions, with a 75-inch display.","createdAt":"2026-10-19T13:53:03.636Z"},{"id":3,"name":"Maple Meeting Room","location":"Library, 4F","capacity":12,"openTime":"09:00","closeTime":"18:00","status":"open","description":"Quiet boardroom with a video-conferencing camera and whiteboard wall.","createdAt":"2026-10-19T13:53:03.636Z"},{"id":4,"name":"Badminton Court 2","location":"Sports Center, Hall 1","capacity":8,"openTime":"07:00","closeTime":"22:00","status":"open","description":"Full-size indoor court. Rackets can be borrowed at the front desk.","createdAt":"2026-10-19T13:53:03.636Z"},{"id":5,"name":"Black Box Studio","location":"Arts Center, B1","capacity":60,"openTime":"10:00","closeTime":"22:00","status":"open","description":"Flexible performance space with stage lighting, sound system and sprung floor.","createdAt":"2026-10-19T13:53:03.636Z"},{"id":6,"name":"Rooftop Garden","location":"Student Center, Rooftop","capacity":80,"openTime":"09:00","closeTime":"20:00","status":"disabled","description":"Closed for waterproofing maintenance until further notice.","createdAt":"2026-10-19T13:53:03.636Z"}]

PS> curl.exe -sS -i http://localhost:8090/api/venues/3
HTTP/1.1 200 OK
Server: nginx/1.30.6
Date: Mon, 19 Oct 2026 13:53:37 GMT
Content-Type: application/json
Transfer-Encoding: chunked
Connection: keep-alive

{"id":3,"name":"Maple Meeting Room","location":"Library, 4F","capacity":12,"openTime":"09:00","closeTime":"18:00","status":"open","description":"Quiet boardroom with a video-conferencing camera and whiteboard wall.","createdAt":"2026-10-19T13:53:03.636Z"}
```

3\. 创建一个正常的预约（Maple Meeting Room，2026-10-30 14:00 至 15:30）：

```text
PS> curl.exe -sS -i -X POST http://localhost:8090/api/reservations -H 'content-type: application/json' -d '{"venueId":3,"bookerName":"Robotics Club","attendeeCount":8,"date":"2026-10-30","startTime":"14:00","endTime":"15:30","purpose":"Sprint planning"}'
HTTP/1.1 201 Created
Server: nginx/1.30.6
Date: Mon, 19 Oct 2026 13:53:37 GMT
Content-Type: application/json
Transfer-Encoding: chunked
Connection: keep-alive

{"id":1,"venueId":3,"venue":{"id":3,"name":"Maple Meeting Room","location":"Library, 4F"},"bookerName":"Robotics Club","attendeeCount":8,"date":"2026-10-30","startTime":"14:00","endTime":"15:30","purpose":"Sprint planning","status":"confirmed","createdAt":"2026-10-19T13:53:37.224Z","cancelledAt":null}
```

4\. 查询刚创建的预约（编号 1）：

```text
PS> curl.exe -sS -i http://localhost:8090/api/reservations/1
HTTP/1.1 200 OK
Server: nginx/1.30.6
Date: Mon, 19 Oct 2026 13:53:37 GMT
Content-Type: application/json
Transfer-Encoding: chunked
Connection: keep-alive

{"id":1,"venueId":3,"venue":{"id":3,"name":"Maple Meeting Room","location":"Library, 4F"},"bookerName":"Robotics Club","attendeeCount":8,"date":"2026-10-30","startTime":"14:00","endTime":"15:30","purpose":"Sprint planning","status":"confirmed","createdAt":"2026-10-19T13:53:37.224Z","cancelledAt":null}
```

5\. 为同一场地、同一天提交与之重叠的 15:00 至 16:00，后端拒绝：

```text
PS> curl.exe -sS -i -X POST http://localhost:8090/api/reservations -H 'content-type: application/json' -d '{"venueId":3,"bookerName":"Chess Club","attendeeCount":6,"date":"2026-10-30","startTime":"15:00","endTime":"16:00","purpose":"Weekly practice"}'
HTTP/1.1 409 Conflict
Server: nginx/1.30.6
Date: Mon, 19 Oct 2026 13:53:37 GMT
Content-Type: application/json
Transfer-Encoding: chunked
Connection: keep-alive

{"defined":true,"code":"RESERVATION_CONFLICT","status":409,"message":"The requested time overlaps 1 existing reservation(s)","data":{"conflicts":[{"id":1,"startTime":"14:00","endTime":"15:30"}]}}
```

6\. 取消预约 1：

```text
PS> curl.exe -sS -i -X POST http://localhost:8090/api/reservations/1/cancel
HTTP/1.1 200 OK
Server: nginx/1.30.6
Date: Mon, 19 Oct 2026 13:53:37 GMT
Content-Type: application/json
Transfer-Encoding: chunked
Connection: keep-alive

{"id":1,"venueId":3,"venue":{"id":3,"name":"Maple Meeting Room","location":"Library, 4F"},"bookerName":"Robotics Club","attendeeCount":8,"date":"2026-10-30","startTime":"14:00","endTime":"15:30","purpose":"Sprint planning","status":"cancelled","createdAt":"2026-10-19T13:53:37.224Z","cancelledAt":"2026-10-19T13:53:37.538Z"}
```

7\. 取消后，再次提交第 5 步中同一时段的预约：

```text
PS> curl.exe -sS -i -X POST http://localhost:8090/api/reservations -H 'content-type: application/json' -d '{"venueId":3,"bookerName":"Chess Club","attendeeCount":6,"date":"2026-10-30","startTime":"15:00","endTime":"16:00","purpose":"Weekly practice"}'
HTTP/1.1 201 Created
Server: nginx/1.30.6
Date: Mon, 19 Oct 2026 13:53:37 GMT
Content-Type: application/json
Transfer-Encoding: chunked
Connection: keep-alive

{"id":3,"venueId":3,"venue":{"id":3,"name":"Maple Meeting Room","location":"Library, 4F"},"bookerName":"Chess Club","attendeeCount":6,"date":"2026-10-30","startTime":"15:00","endTime":"16:00","purpose":"Weekly practice","status":"confirmed","createdAt":"2026-10-19T13:53:37.643Z","cancelledAt":null}
```

最后查询该场地当天的全部预约（插入失败也会消耗自增编号，因此编号不要求连续）：

```text
PS> curl.exe -sS 'http://localhost:8090/api/reservations?venueId=3&date=2026-10-30'
[{"id":1,"venueId":3,"venue":{"id":3,"name":"Maple Meeting Room","location":"Library, 4F"},"bookerName":"Robotics Club","attendeeCount":8,"date":"2026-10-30","startTime":"14:00","endTime":"15:30","purpose":"Sprint planning","status":"cancelled","createdAt":"2026-10-19T13:53:37.224Z","cancelledAt":"2026-10-19T13:53:37.538Z"},{"id":3,"venueId":3,"venue":{"id":3,"name":"Maple Meeting Room","location":"Library, 4F"},"bookerName":"Chess Club","attendeeCount":6,"date":"2026-10-30","startTime":"15:00","endTime":"16:00","purpose":"Weekly practice","status":"confirmed","createdAt":"2026-10-19T13:53:37.643Z","cancelledAt":null}]
```

| 步骤 | 请求                                              | 状态码 | 结果                                                         |
| ---- | ------------------------------------------------- | ------ | ------------------------------------------------------------ |
| 2    | `GET /api/venues`、`GET /api/venues/3`            | 200    | 6 个演示场地，Rooftop Garden 为 `disabled`；场地 3 的详情    |
| 3    | `POST /api/reservations`，14:00–15:30             | 201    | 新预约编号 1，状态 `confirmed`                               |
| 4    | `GET /api/reservations/1`                         | 200    | 返回预约 1                                                   |
| 5    | `POST /api/reservations`，15:00–16:00             | 409    | `RESERVATION_CONFLICT`，`data.conflicts` 指出与预约 1 重叠   |
| 6    | `POST /api/reservations/1/cancel`                 | 200    | 状态变为 `cancelled`，记录取消时间                           |
| 7    | 再次 `POST /api/reservations`，15:00–16:00        | 201    | 新预约编号 3：已取消的预约不再占用时段                       |
| 最后 | `GET /api/reservations?venueId=3&date=2026-10-30` | 200    | 预约 1（已取消，记录保留）和预约 3（已确认）                 |

### 7.7 参数校验与错误处理

```text
# 字段不合法：预约人为空、人数为 0、日期不存在、时间格式错误
PS> curl.exe -sS -X POST http://localhost:8090/api/reservations -H 'content-type: application/json' -d '{"venueId":3,"bookerName":"","attendeeCount":0,"date":"2026-02-30","startTime":"9am","endTime":"10:00","purpose":"Review"}'
{"defined":false,"code":"BAD_REQUEST","status":400,"message":"Input validation failed","data":{"issues":[{"path":["bookerName"],"message":"Name is required"},{"path":["attendeeCount"],"message":"Too small: expected number to be >=1"},{"path":["date"],"message":"Use a valid date in YYYY-MM-DD format"},{"path":["startTime"],"message":"Use the 24-hour HH:mm format"},{"path":["endTime"],"message":"End time must be later than start time"}]}}
HTTP 400

# 结束时间早于开始时间
PS> curl.exe -sS -X POST http://localhost:8090/api/reservations -H 'content-type: application/json' -d '{"venueId":3,"bookerName":"Robotics Club","attendeeCount":4,"date":"2026-10-30","startTime":"11:00","endTime":"10:00","purpose":"Review"}'
{"defined":false,"code":"BAD_REQUEST","status":400,"message":"Input validation failed","data":{"issues":[{"path":["endTime"],"message":"End time must be later than start time"}]}}
HTTP 400

# JSON 格式错误
PS> curl.exe -sS -X POST http://localhost:8090/api/reservations -H 'content-type: application/json' -d '{"venueId":3,'
{"defined":false,"code":"BAD_REQUEST","status":400,"message":"Malformed request. Ensure the request body is properly formatted and the 'Content-Type' header is set correctly."}
HTTP 400

# 场地已停用（Rooftop Garden）
PS> curl.exe -sS -X POST http://localhost:8090/api/reservations -H 'content-type: application/json' -d '{"venueId":6,"bookerName":"Robotics Club","attendeeCount":4,"date":"2026-10-30","startTime":"10:00","endTime":"11:00","purpose":"Review"}'
{"defined":true,"code":"VENUE_DISABLED","status":400,"message":"This venue is disabled and does not accept reservations"}
HTTP 400

# 超出开放时间（场地 3 开放 09:00–18:00）
PS> curl.exe -sS -X POST http://localhost:8090/api/reservations -H 'content-type: application/json' -d '{"venueId":3,"bookerName":"Robotics Club","attendeeCount":4,"date":"2026-10-30","startTime":"08:00","endTime":"09:30","purpose":"Review"}'
{"defined":true,"code":"OUTSIDE_OPENING_HOURS","status":400,"message":"Maple Meeting Room is open from 09:00 to 18:00","data":{"openTime":"09:00","closeTime":"18:00"}}
HTTP 400

# 预约已经过去的日期
PS> curl.exe -sS -X POST http://localhost:8090/api/reservations -H 'content-type: application/json' -d '{"venueId":3,"bookerName":"Robotics Club","attendeeCount":4,"date":"2026-10-18","startTime":"10:00","endTime":"11:00","purpose":"Review"}'
{"defined":true,"code":"RESERVATION_IN_PAST","status":400,"message":"The reservation must start in the future"}
HTTP 400

# 人数超过容量（场地 3 最多 12 人）
PS> curl.exe -sS -X POST http://localhost:8090/api/reservations -H 'content-type: application/json' -d '{"venueId":3,"bookerName":"Robotics Club","attendeeCount":20,"date":"2026-10-30","startTime":"10:00","endTime":"11:00","purpose":"Review"}'
{"defined":true,"code":"CAPACITY_EXCEEDED","status":400,"message":"Maple Meeting Room holds at most 12 people","data":{"capacity":12}}
HTTP 400

# 场地不存在
PS> curl.exe -sS -X POST http://localhost:8090/api/reservations -H 'content-type: application/json' -d '{"venueId":99,"bookerName":"Robotics Club","attendeeCount":4,"date":"2026-10-30","startTime":"10:00","endTime":"11:00","purpose":"Review"}'
{"defined":true,"code":"VENUE_NOT_FOUND","status":404,"message":"Venue not found"}
HTTP 404

PS> curl.exe -sS http://localhost:8090/api/venues/99
{"defined":true,"code":"VENUE_NOT_FOUND","status":404,"message":"Venue not found"}
HTTP 404

# 预约不存在（查询和取消）
PS> curl.exe -sS http://localhost:8090/api/reservations/9999
{"defined":true,"code":"RESERVATION_NOT_FOUND","status":404,"message":"Reservation not found"}
HTTP 404

PS> curl.exe -sS -X POST http://localhost:8090/api/reservations/9999/cancel
{"defined":true,"code":"RESERVATION_NOT_FOUND","status":404,"message":"Reservation not found"}
HTTP 404

# 路径参数不是数字
PS> curl.exe -sS http://localhost:8090/api/reservations/abc
{"defined":false,"code":"BAD_REQUEST","status":400,"message":"Input validation failed","data":{"issues":[{"path":["id"],"message":"Invalid input: expected number, received NaN"}]}}
HTTP 400

# 路由不存在
PS> curl.exe -sS http://localhost:8090/api/rooms
{"code":"NOT_FOUND","status":404,"message":"Route GET /api/rooms does not exist"}
HTTP 404

# 再次取消已取消的预约 1：原样返回，取消时间不变
PS> curl.exe -sS -X POST http://localhost:8090/api/reservations/1/cancel
{"id":1,"venueId":3,"venue":{"id":3,"name":"Maple Meeting Room","location":"Library, 4F"},"bookerName":"Robotics Club","attendeeCount":8,"date":"2026-10-30","startTime":"14:00","endTime":"15:30","purpose":"Sprint planning","status":"cancelled","createdAt":"2026-10-19T13:53:37.224Z","cancelledAt":"2026-10-19T13:53:37.538Z"}
HTTP 200

# 紧接在 15:00–16:00 之后的 16:00–17:00：首尾相接不算重叠
PS> curl.exe -sS -X POST http://localhost:8090/api/reservations -H 'content-type: application/json' -d '{"venueId":3,"bookerName":"Debate Society","attendeeCount":10,"date":"2026-10-30","startTime":"16:00","endTime":"17:00","purpose":"Mock debate"}'
{"id":4,"venueId":3,"venue":{"id":3,"name":"Maple Meeting Room","location":"Library, 4F"},"bookerName":"Debate Society","attendeeCount":10,"date":"2026-10-30","startTime":"16:00","endTime":"17:00","purpose":"Mock debate","status":"confirmed","createdAt":"2026-10-19T13:53:39.014Z","cancelledAt":null}
HTTP 201

# 新增场地
PS> curl.exe -sS -X POST http://localhost:8090/api/venues -H 'content-type: application/json' -d '{"name":"Seminar Room 210","location":"Teaching Building B, 2F","capacity":30,"openTime":"08:00","closeTime":"21:00","status":"open"}'
{"id":7,"name":"Seminar Room 210","location":"Teaching Building B, 2F","capacity":30,"openTime":"08:00","closeTime":"21:00","status":"open","description":null,"createdAt":"2026-10-19T13:53:39.143Z"}
HTTP 201

# 新增场地时字段不合法：容量为 0、关闭时间早于开放时间
PS> curl.exe -sS -X POST http://localhost:8090/api/venues -H 'content-type: application/json' -d '{"name":"Night Lab","location":"Lab Building","capacity":0,"openTime":"21:00","closeTime":"08:00"}'
{"defined":false,"code":"BAD_REQUEST","status":400,"message":"Input validation failed","data":{"issues":[{"path":["capacity"],"message":"Too small: expected number to be >=1"},{"path":["closeTime"],"message":"Closing time must be later than opening time"}]}}
HTTP 400
```

以上每条命令都带有 `-w '\nHTTP %{http_code}\n'`（为便于阅读，上面省略了这一部分），所以响应体之后单独一行显示 HTTP 状态码。所有错误都返回结构统一的 JSON，指出具体原因，没有任何异常堆栈。

| 场景                           | 状态码 | 错误码                                         |
| ------------------------------ | ------ | ---------------------------------------------- |
| 字段不合法、结束早于开始       | 400    | `BAD_REQUEST`，`data.issues` 按字段列出问题    |
| JSON 格式错误、路径参数不合法  | 400    | `BAD_REQUEST`                                  |
| 场地已停用                     | 400    | `VENUE_DISABLED`                               |
| 超出开放时间                   | 400    | `OUTSIDE_OPENING_HOURS`，附带开放时间          |
| 开始时间已过去                 | 400    | `RESERVATION_IN_PAST`                          |
| 超过容量                       | 400    | `CAPACITY_EXCEEDED`，附带容量                  |
| 场地不存在                     | 404    | `VENUE_NOT_FOUND`                              |
| 预约不存在                     | 404    | `RESERVATION_NOT_FOUND`                        |
| 路由不存在                     | 404    | `NOT_FOUND`                                    |
| 时间冲突（第 7.6 节）          | 409    | `RESERVATION_CONFLICT`，附带冲突时段           |
| 重复取消                       | 200    | 无错误，幂等                                   |
| 首尾相接的预约                 | 201    | 无错误，左闭右开区间                           |

### 7.8 数据库层验证

```text
PS> docker compose -p venue-booking-report exec database psql -U venue -d venue_booking -c "\dt"
            List of tables
 Schema |     Name     | Type  | Owner
--------+--------------+-------+-------
 public | reservations | table | venue
 public | venues       | table | venue
(2 rows)

PS> docker compose -p venue-booking-report exec database psql -U venue -d venue_booking -c "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id"
 id |                               hash                               |  created_at
----+------------------------------------------------------------------+---------------
  1 | 223faa7a6e5b08eeed4d71f46a5f09dad6ecf1c7f86389490292a5fe17d9d907 | 1792394413185
  2 | edd92ebc8546ee3c56907522e7fa2ddc3118be03561b775ef6a1707ecc82ddb4 | 1792394428832
(2 rows)
```

两条迁移记录分别对应 `0000_init` 和 `0001_reservations_no_overlap`。第 7.6、7.7 节之后预约表的内容：

```text
PS> docker compose -p venue-booking-report exec database psql -U venue -d venue_booking -c "SELECT id, venue_id, reservation_date, start_time, end_time, status, cancelled_at FROM reservations ORDER BY id"
 id | venue_id | reservation_date | start_time | end_time |  status   |         cancelled_at
----+----------+------------------+------------+----------+-----------+-------------------------------
  1 |        3 | 2026-10-30       | 14:00:00   | 15:30:00 | cancelled | 2026-10-19 13:53:37.538732+00
  3 |        3 | 2026-10-30       | 15:00:00   | 16:00:00 | confirmed |
  4 |        3 | 2026-10-30       | 16:00:00   | 17:00:00 | confirmed |
(3 rows)
```

已取消的预约 1 仍保留在表中（逻辑取消），并且与已确认的预约 3 时间重叠也不违反排他约束，因为约束只作用于 `status = 'confirmed'` 的行。

绕过 API，直接用 SQL 插入一条与预约 3 重叠的已确认预约，数据库拒绝写入：

```text
PS> docker compose -p venue-booking-report exec database psql -U venue -d venue_booking -c "INSERT INTO reservations (venue_id, booker_name, attendee_count, reservation_date, start_time, end_time, purpose) VALUES (3, 'Bypass Test', 2, '2026-10-30', '15:30', '16:30', 'Direct SQL insert')"
ERROR:  conflicting key value violates exclusion constraint "reservations_no_overlap"
DETAIL:  Key (venue_id, tsrange(reservation_date + start_time, reservation_date + end_time, '[)'::text))=(3, ["2026-10-30 15:30:00","2026-10-30 16:30:00")) conflicts with existing key (venue_id, tsrange(reservation_date + start_time, reservation_date + end_time, '[)'::text))=(3, ["2026-10-30 15:00:00","2026-10-30 16:00:00")).
```

只修改状态而不写取消时间，同样被检查约束拒绝：

```text
PS> docker compose -p venue-booking-report exec database psql -U venue -d venue_booking -c "UPDATE reservations SET status = 'cancelled' WHERE id = 3"
ERROR:  new row for relation "reservations" violates check constraint "reservations_cancelled_at_matches_status"
DETAIL:  Failing row contains (3, 3, Chess Club, 6, 2026-10-30, 15:00:00, 16:00:00, Weekly practice, cancelled, 2026-10-19 13:53:37.643508+00, null).
```

### 7.9 数据持久化验证（实验要求 8.3）

1\. 记录要验证的预约：预约 3（已确认）和预约 1（已取消）。停止前先查询一次：

```text
PS> curl.exe -sS http://localhost:8090/api/reservations/3
{"id":3,"venueId":3,"venue":{"id":3,"name":"Maple Meeting Room","location":"Library, 4F"},"bookerName":"Chess Club","attendeeCount":6,"date":"2026-10-30","startTime":"15:00","endTime":"16:00","purpose":"Weekly practice","status":"confirmed","createdAt":"2026-10-19T13:53:37.643Z","cancelledAt":null}
```

2\. 执行 `docker compose down`：

```text
PS> docker compose -p venue-booking-report down
 Container venue-booking-report-frontend-1 Stopping
 Container venue-booking-report-frontend-1 Stopped
 Container venue-booking-report-frontend-1 Removing
 Container venue-booking-report-frontend-1 Removed
 Container venue-booking-report-api-1 Stopping
 Container venue-booking-report-api-1 Stopped
 Container venue-booking-report-api-1 Removing
 Container venue-booking-report-api-1 Removed
 Container venue-booking-report-database-1 Stopping
 Container venue-booking-report-database-1 Stopped
 Container venue-booking-report-database-1 Removing
 Container venue-booking-report-database-1 Removed
 Network venue-booking-report_frontend-net Removing
 Network venue-booking-report_backend-net Removing
 Network venue-booking-report_backend-net Removed
 Network venue-booking-report_frontend-net Removed

PS> docker compose -p venue-booking-report ps -a
NAME      IMAGE     COMMAND   SERVICE   CREATED   STATUS    PORTS

PS> docker volume ls
DRIVER    VOLUME NAME
……
local     venue-booking-report_database-data
local     venue-booking_database-data
```

三个容器和两个网络都被删除（按依赖的逆序停止：先前端、再 API、最后数据库），但卷 `venue-booking-report_database-data` 仍在。列表中的 `venue-booking_database-data` 是默认实例的卷；其余为本机其他项目的卷。

3\. 再次启动：

```text
PS> docker compose -p venue-booking-report up -d --wait
 Network venue-booking-report_backend-net Creating
 Network venue-booking-report_frontend-net Creating
 Network venue-booking-report_backend-net Creating
 Network venue-booking-report_frontend-net Creating
 Network venue-booking-report_backend-net Created
 Network venue-booking-report_backend-net Created
 Container venue-booking-report-database-1 Creating
 Network venue-booking-report_frontend-net Created
 Network venue-booking-report_frontend-net Created
 Container venue-booking-report-database-1 Created
 Container venue-booking-report-api-1 Creating
 Container venue-booking-report-api-1 Created
 Container venue-booking-report-frontend-1 Creating
 Container venue-booking-report-frontend-1 Created
 Container venue-booking-report-database-1 Starting
 Container venue-booking-report-database-1 Started
 Container venue-booking-report-database-1 Waiting
 Container venue-booking-report-database-1 Healthy
 Container venue-booking-report-api-1 Starting
 Container venue-booking-report-api-1 Started
 Container venue-booking-report-api-1 Waiting
 Container venue-booking-report-api-1 Healthy
 Container venue-booking-report-frontend-1 Starting
 Container venue-booking-report-frontend-1 Started
 Container venue-booking-report-database-1 Waiting
 Container venue-booking-report-api-1 Waiting
 Container venue-booking-report-frontend-1 Waiting
 Container venue-booking-report-api-1 Healthy
 Container venue-booking-report-database-1 Healthy
 Container venue-booking-report-frontend-1 Healthy

PS> docker compose -p venue-booking-report ps
NAME                              IMAGE                          COMMAND                  SERVICE    CREATED          STATUS                    PORTS
venue-booking-report-api-1        venue-booking/api:1.0.0        "docker-entrypoint.s…"   api        18 seconds ago   Up 11 seconds (healthy)   3000/tcp
venue-booking-report-database-1   postgres:18.6-alpine3.24       "docker-entrypoint.s…"   database   19 seconds ago   Up 17 seconds (healthy)   5432/tcp
venue-booking-report-frontend-1   venue-booking/frontend:1.0.0   "/docker-entrypoint.…"   frontend   18 seconds ago   Up 5 seconds (healthy)    0.0.0.0:8090->8080/tcp, [::]:8090->8080/tcp
```

与第 7.2 节相比，这次的输出中没有 `Volume … Created`，因为卷已经存在；`CREATED` 列则显示三个容器都是刚刚新建的。

4\. 再次查询之前的预约：

```text
PS> curl.exe -sS -i http://localhost:8090/api/reservations/3
HTTP/1.1 200 OK
Server: nginx/1.30.6
Date: Mon, 19 Oct 2026 13:54:51 GMT
Content-Type: application/json
Transfer-Encoding: chunked
Connection: keep-alive

{"id":3,"venueId":3,"venue":{"id":3,"name":"Maple Meeting Room","location":"Library, 4F"},"bookerName":"Chess Club","attendeeCount":6,"date":"2026-10-30","startTime":"15:00","endTime":"16:00","purpose":"Weekly practice","status":"confirmed","createdAt":"2026-10-19T13:53:37.643Z","cancelledAt":null}

PS> curl.exe -sS http://localhost:8090/api/reservations/1
{"id":1,"venueId":3,"venue":{"id":3,"name":"Maple Meeting Room","location":"Library, 4F"},"bookerName":"Robotics Club","attendeeCount":8,"date":"2026-10-30","startTime":"14:00","endTime":"15:30","purpose":"Sprint planning","status":"cancelled","createdAt":"2026-10-19T13:53:37.224Z","cancelledAt":"2026-10-19T13:53:37.538Z"}

PS> docker compose -p venue-booking-report logs api
api-1  | Database migrations are up to date
api-1  | API listening on http://0.0.0.0:3000
api-1  | GET /api/reservations 200 68ms
api-1  | GET /api/reservations/1 200 11ms
api-1  | GET /api/reservations/3 200 4ms
api-1  | GET /api/reservations/3 200 4ms
```

两条预约与 `down` 之前完全一致，包括已取消预约的取消时间。新 API 容器的日志里没有 `Seeded 6 demo venues`，说明它连上的是原有数据库（场地表不为空，跳过了种子数据），而不是一个新建的空库。

5\. 查看项目的卷：

```text
PS> docker volume inspect venue-booking-report_database-data
[
    {
        "CreatedAt": "2026-10-19T13:48:55Z",
        "Driver": "local",
        "Labels": {
            "com.docker.compose.config-hash": "eae817569b16af945791bf25615f340bbf44463d29dd29cf464d51e9e8f4f55f",
            "com.docker.compose.project": "venue-booking-report",
            "com.docker.compose.version": "5.6.0",
            "com.docker.compose.volume": "database-data"
        },
        "Mountpoint": "/var/lib/docker/volumes/venue-booking-report_database-data/_data",
        "Name": "venue-booking-report_database-data",
        "Options": null,
        "Scope": "local"
    }
]
```

卷创建于 13:48:55（UTC，即第 7.2 节首次启动时），标签表明它属于该 Compose 项目中的 `database-data` 卷。

容器被删除重建后，预约数据仍然存在，因为 PostgreSQL 的数据保存在命名卷中，而不是容器的可写层中。

### 7.10 网络隔离验证

#### 前端无法访问数据库

```text
PS> docker compose -p venue-booking-report exec frontend getent hosts database
# 无输出，退出码 2（找不到该主机名）

PS> docker compose -p venue-booking-report exec frontend nslookup database
Server:		127.0.0.11
Address:	127.0.0.11:53

Non-authoritative answer:

** server can't find database: NXDOMAIN

# 即使直接使用数据库在 backend-net 上的 IP 地址（172.21.0.2），也无法建立连接
PS> docker compose -p venue-booking-report exec frontend nc -zv -w 3 172.21.0.2 5432
nc: 172.21.0.2 (172.21.0.2:5432): Operation timed out
```

#### 前端可以访问 API

```text
PS> docker compose -p venue-booking-report exec frontend getent hosts api
172.22.0.2        api  api

PS> docker compose -p venue-booking-report exec frontend wget -qO- http://api:3000/api/health
{"status":"ok","database":"up"}
```

#### API 通过服务名连接数据库

```text
PS> docker compose -p venue-booking-report exec api getent hosts database
172.21.0.2        database  database

PS> docker compose -p venue-booking-report exec api nc -zv -w 3 database 5432
database (172.21.0.2:5432) open
```

#### 各网络中的容器

```text
PS> docker network inspect venue-booking-report_frontend-net --format '{{range .Containers}}{{.Name}} {{end}}'
venue-booking-report-frontend-1 venue-booking-report-api-1

PS> docker network inspect venue-booking-report_backend-net --format '{{range .Containers}}{{.Name}} {{end}}'
venue-booking-report-database-1 venue-booking-report-api-1
```

#### 数据库端口没有发布到主机

```text
PS> docker inspect --format '{{json .HostConfig.PortBindings}}' venue-booking-report-database-1 venue-booking-report-api-1 venue-booking-report-frontend-1
{}
{}
{"8080/tcp":[{"HostIp":"","HostPort":"8090"}]}

PS> curl.exe -s --connect-timeout 3 telnet://127.0.0.1:5432
# 无输出，退出码 7（无法连接）
```

| 检查                               | 结果                             | 结论                                                 |
| ---------------------------------- | -------------------------------- | ---------------------------------------------------- |
| frontend 解析 `database`           | `NXDOMAIN`，`getent` 退出码 2    | frontend 不在 `backend-net` 上，找不到数据库         |
| frontend 直连数据库 IP 的 5432 端口 | 连接超时                         | 两个网络之间不能互通，知道 IP 也访问不到             |
| frontend 访问 `api:3000`           | 解析成功，健康检查返回 `ok`      | 前端与 API 通过 `frontend-net` 通信                  |
| api 访问 `database:5432`           | 解析成功，端口 `open`            | API 通过服务名 `database` 连接数据库                 |
| 主机访问 5432 端口                 | 端口绑定为空，curl 退出码 7      | 数据库端口未暴露，只有前端的 8090（默认 8080）对外   |

注：IP 地址由 Docker 在创建网络时分配，网络重建后可能变化。

## 8. 主要用例流程与记录

截图使用 Playwright（Chromium）脚本自动操作浏览器拍摄，访问地址为 `http://localhost:8090`，视口 1280×900，时区 `Asia/Shanghai`，浅色主题。界面演示使用 2026-10-30 的示例数据：场地 3 的三条预约、场地 Seminar Room 210，以及通过 `POST /api/reservations` 创建的另外 7 条预约。下面以 Seminar Room 305 的预约 12 为例，演示创建、冲突提示、取消和查询流程。

### 用例 1：浏览预约看板（查询场地列表）

打开首页，在日期栏中选择 10 月 30 日（周五）。看板把所有场地当天的安排排在同一条时间轴上：深色为已预约，浅灰为未开放或已过去，白色为空闲，下方显示当天可预约的空闲时长。停用的 Rooftop Garden 带有 “Disabled” 标记并显示 “Not accepting bookings”。页面调用 `GET /api/venues` 和 `GET /api/reservations?date=2026-10-30&status=confirmed`。

![预约看板](report-assets/01-board.png)

### 用例 2：查看场地信息并选择时段

点击 Seminar Room 305 进入场地页面，页面显示位置、容量、开放时间和简介，以及当天以 30 分钟为单位的时间表（已有 09:00 至 11:00 的预约）。先点 13:00 的时段，再点 14:00 的时段，选中 13:00 至 14:30（1 小时 30 分钟），然后填写预约人或组织、参加人数和用途。页面调用 `GET /api/venues/2` 和 `GET /api/reservations?venueId=2&date=2026-10-30&status=confirmed`。

![选择时段并填写预约信息](report-assets/02-venue-booking.png)

### 用例 3：提交预约，查看确认单

点击 “Book 13:00–14:30”，前端发送 `POST /api/reservations`，收到 201 后跳转到 `/reservations/12?created=true`。页面提示 “Booking confirmed”，要求记下预约编号 12，确认单列出场地、时间、预约人、人数、用途和预约时间，状态为 “Confirmed”。

![预约确认单](report-assets/03-confirmation.png)

### 用例 4：失败信息（时间冲突与参数错误）

回到同一场地，在 Start/End 下拉框中选择 14:00 至 15:00（时间表上已预约的时段不能点击，但下拉框允许选择任意时间）。前端发现与已确认的预约重叠，先给出提示 “This time overlaps a confirmed booking, so the venue will reject it.”，但仍允许提交。提交后 API 返回 409，Playwright 记录到的响应为：

```json
{"defined":true,"code":"RESERVATION_CONFLICT","status":409,"message":"The requested time overlaps 1 existing reservation(s)","data":{"conflicts":[{"id":12,"startTime":"13:00","endTime":"14:30"}]}}
```

页面根据响应中的冲突时段显示 “Booking not completed: That time overlaps a confirmed booking (13:00–14:30). Choose another time.”，并停留在当前页面。冲突的最终判定来自后端，前端提示只是辅助。

![冲突预约被后端拒绝](report-assets/04-conflict.png)

参数错误：选中 17:00 至 18:00，把人数填为 40（该场地最多 32 人），不填预约人和用途就提交。表单用与 API 相同的规则逐项标出错误，这次没有发出任何请求；即使绕过前端直接调用 API，同样会得到 400 错误（第 7.7 节）。

![表单参数错误提示](report-assets/11-form-errors.png)

### 用例 5：取消预约

在确认单上点击 “Cancel booking”，页面弹出确认对话框，说明取消后该时段将开放给其他人，且无法恢复：

![取消确认对话框](report-assets/05-cancel-dialog.png)

确认后，前端发送 `POST /api/reservations/12/cancel`。确认单的状态变为 “Cancelled”，时间加删除线，并显示取消时间；右下角提示 “13:00–14:30 at Seminar Room 305 is available again.”。该时段随即可以重新预约：用例 4 中的参数错误截图是在取消之后拍摄的，图中 13:00 至 14:30 已恢复为空闲。

![预约已取消](report-assets/06-cancelled.png)

### 用例 6：查询预约记录

预约记录页面可以按预约人或用途搜索，按状态（All / Confirmed / Cancelled）、日期范围（Upcoming / All dates）和场地筛选。默认显示今天及以后的全部预约，共 11 条，按日期分组、按开始时间排序。两条已取消的预约（编号 1 和 12）显示 “Cancelled” 标记和删除线，不再提供取消按钮。页面调用 `GET /api/reservations?from=2026-10-19`（及搜索、筛选参数）和 `GET /api/venues`。

![预约记录](report-assets/07-reservations.png)

### 用例 7：新增场地

在看板点击 “Add a venue” 打开新增场地表单，填写名称、位置、最大容纳人数、开放与关闭时间、预约状态（开放或停用）和选填的简介。表单使用与 API 相同的校验规则，提交时调用 `POST /api/venues`。截图展示填写好的表单（未提交）；用例 1 看板中的 Seminar Room 210 是通过该接口创建的示例场地。新增场地接口的 201 响应见第 7.7 节。

![新增场地表单](report-assets/08-new-venue.png)

### 用例 8：简体中文界面

点击页头的 “中文” 按钮即可切换到简体中文，选择保存在浏览器的 `localStorage` 中；浏览器语言为中文时会自动使用中文界面。下面两张截图使用中文浏览器环境拍摄：预约看板，以及在场地页面选中 12:00 至 13:30 并填写中文预约信息。场地名称和简介属于数据，按录入时的内容显示。

![中文预约看板](report-assets/09-board-zh.png)

![中文场地页面](report-assets/10-venue-zh.png)

### 前端要求对照

| 实验要求第四节（前端要求）     | 对应用例           |
| ------------------------------ | ------------------ |
| 1. 显示场地列表                | 用例 1             |
| 2. 查看场地基本信息            | 用例 2             |
| 3. 创建场地预约                | 用例 2、用例 3     |
| 4. 显示预约记录                | 用例 6             |
| 5. 取消预约                    | 用例 5             |
| 6. 显示预约成功信息            | 用例 3             |
| 7. 显示时间冲突、参数错误等失败信息 | 用例 4         |

## 9. 实现情况

下表左列的编号对应 `docs/lab-1.md` 第一部分的章节号，右列指向本报告中的验证位置。

| 实验要求                                               | 实现方式                                                                                         | 验证位置              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------- |
| 1.1 frontend、api、database 三个组件                   | `compose.yaml` 中的三个服务                                                                      | 7.3                   |
| 1.2 HTTP Web API，Docker 与 Compose                    | Hono + oRPC 的 REST API；`docker compose` v5.6.0                                                 | 4、7.1                |
| 2.1 场地实体                                           | `venues` 表：编号、名称、位置、容量、开放时间、状态（另有简介、创建时间）                        | 3.2                   |
| 2.2 预约实体                                           | `reservations` 表：编号、场地、预约人、日期、起止时间、用途、状态（另有人数、创建和取消时间）    | 3.3                   |
| 2.3 查询场地列表、详情，新增场地                       | `GET /api/venues`、`GET /api/venues/{id}`、`POST /api/venues`                                    | 7.6、7.7，用例 1、2、7 |
| 2.3 创建预约，查询预约列表、详情，取消预约             | `POST /api/reservations`、`GET /api/reservations`、`GET /api/reservations/{id}`、`POST /api/reservations/{id}/cancel` | 7.6，用例 3、5、6 |
| 2.3 创建预约时校验场地、时间和输入                     | Zod 契约 + 场地存在、启用、开放时间、未过去、容量等业务规则                                      | 7.7，用例 4           |
| 2.3 拒绝同一场地同一时段的冲突预约                     | 事务内锁定场地行，数据库排他约束阻止重叠写入，API 将 `23P01` 转为 409                            | 3.5、7.6、7.8，用例 4 |
| 3 JSON、明确的 404/409 等错误、不返回堆栈              | 统一的错误 JSON 和错误码                                                                         | 4.4、7.7              |
| 3 数据写入关系数据库，连接信息来自环境变量             | PostgreSQL；`DATABASE_URL` 由 Compose 注入                                                       | 5.2、7.9              |
| 4 前端七项交互，通过 HTTP 调用 API，不直连数据库       | React 前端经同源 `/api` 反向代理调用 API                                                        | 8、7.10               |
| 4 冲突判定不只在前端                                   | 前端只做提示，最终由 API 和数据库判定                                                            | 用例 4                |
| 5 两张表、主键、关联，迁移文件，演示数据               | Drizzle 迁移 `0000`、`0001`；启动时写入 6 个演示场地                                             | 3、7.5、7.8           |
| 5 预约持久化；说明取消方式；密码不硬编码               | 命名卷；逻辑取消；密码只在 `.env`                                                                | 3.6、6.3、7.9         |
| 6.1 前端 Dockerfile                                    | 多阶段构建，nginx 提供静态文件，监听 8080，使用 `.dockerignore`                                  | 5.1、5.3              |
| 6.2 后端 Dockerfile                                    | 多阶段构建；运行镜像只有打包产物和迁移；非 root 用户；镜像中无密码                               | 5.2                   |
| 6.3 镜像版本、名称和标签                               | 基础镜像固定版本；`venue-booking/*:1.0.0`                                                        | 5.5                   |
| 7.1 服务要求（端口、服务名连接、环境变量、命名卷、健康检查） | 见第 6 节                                                                                  | 6、7.3                |
| 7.2 网络要求                                           | 两个网络，前端不能访问数据库，只发布前端端口                                                     | 7.10                  |
| 7.3 配置要求                                           | 提交 `.env.example`，`.env` 被 Git 忽略                                                          | 6.3                   |
| 8.1 / 8.2 / 8.3 验收                                   | 全部按要求执行                                                                                   | 7.6 / 7.2–7.5 / 7.9   |

除手工验证外，仓库还包含自动化测试。本次在本机运行的结果（2026-10-19 21:48 至 21:52）：

```text
PS> bun run test
……
 Test Files  6 passed (6)
      Tests  96 passed (96)
   Start at  21:48:44
   Duration  12.82s (tests 51%, import 45%, transform 4%)

PS> $env:E2E_BASE_URL = 'http://localhost:8090'
PS> bun run test:e2e
……
Running 12 tests using 1 worker
……
  12 passed (11.8s)
```

- `bun run test` 包含单元测试（校验规则、时间工具、配置解析）和集成测试（自动启动一个临时 PostgreSQL 容器，覆盖全部接口、冲突与并发、数据库约束和错误处理）；
- `bun run test:e2e` 用 Playwright 在浏览器中走完预约、冲突、取消、重新预约和语言切换流程，经 nginx 代理检查接口，并用 axe 检查无障碍问题。

两个并发用例均通过：20 个请求同时预约同一时段，恰好 1 个返回 201、19 个返回 409；混合竞争时段的请求也只返回 201 或 409，已确认的预约之间没有重叠。

Lighthouse 按 `lighthouserc.json` 的桌面配置，对本次部署的首页、场地详情页和预约记录页各检测一次，全部满足配置中的断言：

| 页面 | 性能 | 无障碍 | 最佳实践 | SEO |
| ---- | ---- | ------ | -------- | --- |
| `/` | 99 | 100 | 100 | 100 |
| `/venues/1` | 99 | 100 | 100 | 100 |
| `/reservations` | 97 | 100 | 100 | 100 |

`bun run typecheck`、`bun run lint`、`bun run format:check`、`bun run knip`、`bun run build` 和第 7.2 节的 Docker 构建、健康检查均通过。API 和前端本机构建输出为：

```text
PS> bun run build
……
@venue/api build: Bundled 290 modules in 88ms
@venue/api build:
@venue/api build:   server.js  0.67 MB  (entry point)
@venue/api build:
@venue/api build: Exited with code 0
……
@venue/web build: ✓ built in 1.03s
@venue/web build: Exited with code 0
```

## 10. 小组成员与分工

【待小组填写】

| 成员       | 学号       | 负责内容   | 完成情况   |
| ---------- | ---------- | ---------- | ---------- |
| 【待填写】 | 【待填写】 | 【待填写】 | 【待填写】 |
| 【待填写】 | 【待填写】 | 【待填写】 | 【待填写】 |
| 【待填写】 | 【待填写】 | 【待填写】 | 【待填写】 |

【待填写：生成式 AI 的使用情况（如有），以及组员如何验证最终提交的代码和配置】

## 11. 问题与解决过程（选做）

【待小组填写，或删除本节】

以下技术点在代码或配置中都有对应的处理和注释，可作为素材，请按小组的实际经历取舍和改写：

- 并发请求可能重复预约同一时段：事务内锁定场地行，使同一场地的创建请求依次执行，数据库排他约束阻止重叠写入，API 将 `23P01` 转为 409（`apps/api/src/routers/reservations.ts`、`apps/api/drizzle/0001_reservations_no_overlap.sql`，见第 3.5、9 节）；
- `api` 容器重建后 IP 改变，nginx 仍连接旧地址：使用 `resolver` 和变量形式的 `proxy_pass`，按请求解析主机名（`deploy/web/default.conf.template`）；
- PostgreSQL 18 镜像的数据目录改为 `/var/lib/postgresql/18/docker`：卷挂载到 `/var/lib/postgresql`（`compose.yaml` 中的注释）；
- 容器时钟为 UTC，判断“预约已过去”需要使用业务时区：`APP_TIME_ZONE`（`apps/api/src/lib/time.ts`）；
- API 可能先于数据库就绪：`depends_on` 的 `service_healthy` 条件，加上 API 启动时的连接重试（`apps/api/src/db/client.ts`）；
- 多个 API 实例同时启动时迁移会互相干扰：PostgreSQL 咨询锁（`apps/api/src/db/prepare.ts`）；
- 密码含 `@`、`/` 等字符会破坏连接 URL：限制为 URL 安全字符（`.env.example`）；
- Node Alpine 镜像没有 curl：API 的健康检查改用 `node -e` 调用 `fetch`（`compose.yaml`）。
