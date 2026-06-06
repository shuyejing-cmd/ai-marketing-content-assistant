# DECISIONS.md

## 当前继续使用 apps/web 单体

图片 MVP、账号和模板能力继续放在 Next.js App Router 与 API Routes 中。当前闭环已跑通，暂不引入 NestJS、队列和多服务部署复杂度。

## 采用兼容式账号接管 ownerId

- 新增 `User` 和 `AuthSession`。
- 保留业务表现有 `ownerId`。
- 登录用户使用 `user:<userId>`。
- 匿名用户继续使用 `owner_*`。
- 注册或登录时自动迁移当前匿名 owner 数据。

该方案改动范围小，能复用现有生成、会话和模板结构，后续仍可迁移为显式 `userId` 外键。

## 使用数据库登录会话

- 浏览器保存 HttpOnly session cookie。
- 数据库保存 token hash，不保存原始 token。
- 登录 session 不依赖 Next.js 进程内内存。

因此刷新浏览器和服务重启后仍能恢复登录。

## 所有登录用户都可创建模板

最终决定：

- 模板入口对任意登录用户显示。
- `/api/admin/templates` 当前使用 `requireUser`。
- `AUTH_ADMIN_EMAILS` 不控制模板创建权限。

这项决定覆盖 2026-05-27 历史账号设计中“只有 admin 管理模板”的方案。后续增加模板作者归属后，再实现用户管理自己的模板、管理员管理全部模板。

## APIMart 继续作为图片主 provider

- 使用 APIMart `gpt-image-2-official`。
- Seedream provider 保留为回滚路径。
- 前端不直接调用供应商。

## APIMart 显式支持代理

- 新增 `APIMART_PROXY_URL`。
- provider 使用 `undici.fetch` + `ProxyAgent`。
- 标准代理环境变量作为 fallback。

之前的 `fetch failed` 根因是 Node 直连 APIMart 超时，不是模型配置或数据库问题。

## COS 作为图生图输入桥接

- 上传图先进入私有 COS。
- 服务端生成短期签名 URL 传给 APIMart。
- 日志不保存完整签名 URL。

## 安全审核拒绝属于上游业务错误

APIMart `HTTP 400` 且包含 safety rejection，归类为模型安全审核拒绝。它可能由提示词、参考图或组合触发，不应描述为数据库断链、账号故障或代理故障。

后续需要增加专门的前端提示。

## 图片原图是展示和下载对象

- 预览优先显示模型原图。
- 下载优先通过 `/api/download-image` 下载远程原图。
- canvas 只用于 mock 或 fallback。

## PostgreSQL 是当前事实存储

- 用户、登录会话、生成历史、模板和 PromptLog 使用 PostgreSQL + Prisma。
- localStorage 只保存匿名 owner 和当前会话辅助信息。
- 大图 base64 长期入库是临时方案。

## GitHub 采用两级 PR

1. `account-owner-migration -> feature/local-mobile-mvp`
2. `feature/local-mobile-mvp -> main`

第一层普通 merge，保留账号模块详细提交；第二层 squash merge，形成完整 MVP 里程碑。

## 完成模块后的固定流程

1. 实现与测试。
2. 更新中文事实文档。
3. 本地 Git 提交。
4. 推送功能分支。
5. 创建或更新 PR。
6. 合并后重新验证。

本地 commit 不等于 GitHub 已同步，必须显式 push。
