# @venue/web

场地预约系统的前端：React 19 + Vite（TanStack Router / Query / Form，基于 Base UI 的 shadcn/ui，Tailwind CSS v4，i18next）。

- `src/routes/` 基于文件的路由；`src/routeTree.gen.ts` 由 TanStack Router 的 Vite 插件生成。
- `src/features/` 预约看板、预约流程和预约记录页面。
- `src/locales/` 英文与简体中文文案。
- `src/lib/api.ts` 根据共用的 `@venue/contracts` 契约生成的类型化客户端。

首页默认使用场地卡片，可切换为对齐时间轴；名称/位置、人数、预约时长和日期保存在 URL。推荐时段按连续空档计算，进入详情后再次校验。档期未取得或刷新失败时，会暂停选时和提交，并保留已填写信息。

预约详情支持移动端固定摘要和“继续填写”，冲突后可改用相同时长的下一段空档。确认单支持复制编号和预约链接；记录页支持按编号查询、指定日期和返回筛选结果。

## 前端验证

在仓库根目录运行：

```bash
bun run --filter @venue/web typecheck
bun run --filter @venue/web build
bun run test:ux
```

`test:ux` 自动启动 Vite，通过模拟 HTTP API 检查页面交互，不需要后端或数据库。它覆盖预约及取消流程、档期异常、键盘操作，以及 375/768/1440px、中英文、深浅主题的布局，截图保存到 `test-results/`。默认使用 Playwright Chromium；也可设置 `PLAYWRIGHT_CHANNEL=msedge` 使用本机 Edge。

实际连接方式保持同源 `/api`：开发时由 Vite 转发到 `http://localhost:3000`，部署时由现有 nginx 反向代理到 API。后端启动后，使用 `bun run --filter @venue/web dev` 即可进行联调。

在本目录添加 shadcn/ui 组件，例如 `bunx --bun shadcn@latest add dialog`。

安装与开发命令见[仓库首页](../../README.md)。
