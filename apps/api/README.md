# @venue/api

场地预约系统的 Hono + oRPC REST API，通过 Drizzle ORM 使用 PostgreSQL。

- `src/server.ts` 读取环境变量、执行迁移、写入演示场地，并在 `PORT`（3000）上监听。
- `src/app.ts` 在 `/api` 下挂载 oRPC 处理函数、健康检查、接口文档（`/api/docs`）和错误处理。
- `src/routers/` 实现 `@venue/contracts` 中的契约；预约规则在 `routers/reservations.ts`。
- `src/db/` 包含 Drizzle 表结构、连接、迁移执行和种子数据；SQL 迁移在 `drizzle/`。

安装、配置和接口说明见[仓库首页](../../README.md)。
