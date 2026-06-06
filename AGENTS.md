# AGENTS.md

## 新会话阅读顺序

根目录下这 6 个文件是当前项目事实来源。新会话不要一次性读取整个代码库，先按顺序阅读：

1. `AGENTS.md`
2. `CURRENT_STATUS.md`
3. `NEXT_TASKS.md`
4. `ARCHITECTURE.md`
5. `PROJECT_BRIEF.md`
6. `DECISIONS.md`

需要了解历史设计和实施过程时，再按需读取 `docs/superpowers/specs/` 和 `docs/superpowers/plans/`。历史方案中的部分权限设计已被后续决策覆盖，当前事实以根目录 6 份文档、当前分支代码和最新测试结果为准。

## 仓库与分支状态

- GitHub 仓库：`shuyejing-cmd/ai-marketing-content-assistant`
- 当前工作树：`.worktrees/account-owner-migration`
- 当前分支：`account-owner-migration`
- 基础开发分支：`feature/local-mobile-mvp`
- 目标主分支：`main`
- 当前功能已在本地完成并提交，尚未合入 GitHub 主线。
- 计划先合入 `feature/local-mobile-mvp`，再把完整 MVP 合入 `main`。

不要把“本地已完成”误写为“GitHub 主线已上线”。

## 当前项目定位

这是一个面向中小商家的 AI 营销内容助手。当前已经跑通 `apps/web` 内的图片营销 MVP：

- 自由图片生成：一句话需求、快捷选项、可选上传商品图。
- 图片模板生成：登录用户创建模板，用户选择已发布模板生成内容。
- 结果卡：模型原图、标题、发布文案、图片文字建议、复制、下载、重新生成和二次修改。
- 账号系统：邮箱密码注册、登录、退出、登录态持久化。
- 数据归属：注册或登录时自动绑定当前浏览器匿名 `ownerId` 数据。
- 多用户隔离：服务端从登录 cookie 解析 owner，不信任前端伪造的账号 owner。
- 真实模型链路：APIMart 图片模型、腾讯云 COS 图生图中转、火山方舟 Ark 文案模型。

## 当前技术栈

- Next.js App Router、React、TypeScript、Tailwind CSS。
- Next.js API Routes 承载当前后端能力。
- PostgreSQL + Prisma 保存用户、登录会话、生成数据、PromptLog 和模板。
- APIMart `gpt-image-2-official` 是图片生成主路径。
- 腾讯云 COS 私有 Bucket 提供图生图输入图短期签名 URL。
- 火山方舟 Ark chat completions 生成结果卡文案。
- Node `crypto.scrypt` 处理密码 hash。
- HttpOnly cookie + 数据库 `AuthSession` 保持登录态。
- Vitest、Playwright mobile E2E。

## 关键目录

- `apps/web/src/app`：页面和 API Routes。
- `apps/web/src/app/auth`：登录/注册页面。
- `apps/web/src/app/image`：自由图片生成页面。
- `apps/web/src/app/templates/image/[id]`：图片模板使用页面。
- `apps/web/src/app/admin/templates`：模板创建/管理页面；路径保留，但权限是任意登录用户。
- `apps/web/src/features/auth`：认证、密码、cookie、登录会话、owner 解析与匿名数据绑定。
- `apps/web/src/features/generation`：Prompt、provider、生成服务、会话和持久化。
- `apps/web/src/features/templates`：模板类型、客户端和仓库。
- `apps/web/prisma`：schema 与 migrations。
- `docs/superpowers`：历史规格和实施计划。

## 固定规则

- 不泄露 `.env`、`.env.local`、API Key、COS 密钥、数据库密码、cookie token 或代理凭据。
- 真实配置只写入被 Git 忽略的本地环境文件；`.env.example` 只写变量名和安全示例。
- 前端不得直接调用模型供应商。
- 登录 cookie 保存原始随机 token；数据库只保存 token hash。
- 业务 API 不信任 body/header 中伪造的 `user:*` owner。
- 登录用户使用稳定 owner key：`user:<userId>`。
- 匿名用户使用浏览器生成的 `owner_*`，注册或登录时自动迁移到账号 owner。
- 所有登录用户都可访问模板创建/管理；`AUTH_ADMIN_EMAILS` 可赋予角色，但不控制模板入口。
- 公开模板 API 不返回内部 prompt。
- PromptLog 不保存完整 COS 签名 URL，只保存安全摘要。
- 模型原图是主要展示和下载对象；canvas 只用于 mock 或 fallback。
- 商品一致性优先于画面惊艳。
- 自由生成和模板生成两条路径都要保留。
- 当前继续使用 `apps/web` API Routes，不启动 NestJS。

## 模型错误判断

- `fetch failed`、连接超时：优先检查代理和网络。
- APIMart 返回 `HTTP 400` 且包含 `rejected by the safety system`：上游安全审核拒绝，可能由提示词、参考图或二者组合触发，不是数据库断链。
- `url.parse()` deprecation warning 是依赖警告，不是本次生成失败根因。
- 图片 provider 失败会让任务失败；Ark 文案 provider 失败时图片仍可成功并使用 fallback 文案。

## 本地环境

真实配置使用 `apps/web/.env.local`，该文件必须保持 Git ignored。关键变量类别：

- `DATABASE_URL`
- `GENERATION_PROVIDER`
- `APIMART_API_KEY`、`APIMART_BASE_URL`、`APIMART_IMAGE_MODEL`
- `APIMART_PROXY_URL`
- `TENCENT_COS_*`
- `ARK_API_KEY`、`ARK_BASE_URL`、`ARK_TEXT_MODEL`
- `AUTH_ADMIN_EMAILS`

不要把任何真实值写进文档、测试或提交。

## 常用命令

在 `apps/web` 目录执行：

```powershell
npm.cmd run dev
npm.cmd test
npm.cmd run build
npm.cmd run e2e
npx.cmd prisma migrate deploy
npx.cmd prisma generate
```

E2E 优先使用 mock：

```powershell
$env:GENERATION_PROVIDER='mock'; npm.cmd run e2e
```

## 验证要求

- 文档改动：检查中文、路径、分支状态、敏感信息和历史结论。
- 代码改动：至少执行 `npm.cmd test` 和 `npm.cmd run build`。
- 交互改动：增加 mock Playwright E2E。
- Prisma 改动：验证 migration 和 Prisma client。
- 真实模型改动：除自动化测试外，还要实机检查 provider 日志。
- 完成模块后：更新事实文档、本地提交、推送功能分支，并通过 PR 合入目标分支。
