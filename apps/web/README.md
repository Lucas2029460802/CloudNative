# @venue/web

场地预约系统的前端：React 19 + Vite（TanStack Router / Query / Form，基于 Base UI 的 shadcn/ui，Tailwind CSS v4，i18next）。

- `src/routes/` 基于文件的路由；`src/routeTree.gen.ts` 由 TanStack Router 的 Vite 插件生成。
- `src/features/` 预约看板、预约流程和预约记录页面。
- `src/locales/` 英文与简体中文文案。
- `src/lib/api.ts` 根据共用的 `@venue/contracts` 契约生成的类型化客户端。

在本目录添加 shadcn/ui 组件，例如 `bunx --bun shadcn@latest add dialog`。

安装与开发命令见[仓库首页](../../README.md)。
