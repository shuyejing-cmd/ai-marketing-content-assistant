# CURRENT_STATUS.md

## 当前分支
`feature/local-mobile-mvp`

## 当前阶段
项目已经从本地 mock H5 进入 `apps/web` 内的真实模型图片营销 MVP 阶段。

当前已完成：

- PostgreSQL + Prisma 持久化。
- 自由图片生成页 `/image`。
- 图片模板管理页 `/admin/templates`。
- 图片模板使用页 `/templates/image/[id]`。
- 主页右上角菜单和模板创建/管理入口。
- 自由会话和模板会话隔离，同一个模板会恢复自己的最近会话。
- APIMart `gpt-image-2-official` 图片生成接入。
- 腾讯云 COS 作为 APIMart 上传图中转，使用私有签名 URL。
- 火山方舟 Ark 文案模型接入，并修复 Ark base URL 配置和错误解析。
- 远程模型图通过 `/api/download-image` 代理下载原图，避免回到旧 canvas 模板。
- PromptLog、服务端生成日志、前端调试日志基础可用。

当前仍不是完整 SaaS 产品。尚未完成账号、正式多用户权限、支付、积分、订单、模板市场和真实视频生成。

## 当前可用入口
- `/`：首页，包含文案、图片、视频三入口，图片/视频模板列表，以及右上角菜单。
- `/image`：自由图片生成页。
- `/templates/image/[id]`：图片模板使用页，只允许上传图和填写活动信息。
- `/admin/templates`：模板管理页，当前仍使用 `TEMPLATE_ADMIN_SECRET` 保护。
- `/api/download-image`：远程模型图同源下载代理。

## 当前已完成能力
- 图片生成页面采用类聊天形态，底部输入框加快捷按钮。
- 快捷按钮包含上传图片、发布渠道、营销场景、风格模板、活动信息。
- 上传图后有缩略图和状态反馈，发送后清空输入和上传状态。
- 会话列表支持创建、切换、重命名、删除；删除最后一个会话后自动创建新空会话。
- `Session.kind` 支持 `free` / `template`，`Session.templateId` 用于模板会话隔离。
- `GET /api/generation-sessions?kind=free` 只返回自由会话。
- `GET /api/generation-sessions?templateId=...` 只返回对应模板会话。
- `POST /api/generation-tasks` 可创建自由生成任务。
- `POST /api/templates/[id]/generation-tasks` 可创建模板生成任务，服务端读取 `Template.prompt`。
- `POST /api/generation-tasks/:id/regenerate` 可重新生成。
- `POST /api/generation-tasks/:id/modify` 可二次修改自由生成结果。
- APIMart provider 提交任务、轮询任务并读取远程生成图 URL。
- APIMart 图生图时优先上传输入图到 COS，传短期签名 URL 给 `image_urls`。
- 旧 `APP_PUBLIC_BASE_URL` 本地公开接口保留为 fallback。
- Ark text provider 生成结果卡 `title`、`publishingCopy`、`imageText`；失败时图片任务仍可成功并使用 fallback 文案。
- 结果预览优先显示模型原图，不再把模型图套进本地海报模板。
- 下载优先下载模型原图；mock/无模型图时才使用 canvas fallback。
- 公开模板 API 不返回内部 prompt。
- 视频模板第一版只做列表占位，显示“即将开放”。

## 当前数据库模型
Prisma 当前包含：

- `Session`
- `GenerationTask`
- `GenerationResult`
- `ImageAsset`
- `PromptLog`
- `Template`

重要现状：

- `Session` 已有 `kind` 和 `templateId`。
- `GenerationTask` / `Session` 仍以匿名 `ownerId` 隔离。
- 尚无 `User`、`Account`、`PasswordCredential` 或正式账号模型。
- 上传图仍会以 base64 形式保存到 `ImageAsset`，COS 当前只作为 APIMart 图生图临时中转。

## 当前环境变量类别
`.env.example` 描述当前需要的变量名：

- 数据库：`DATABASE_URL`
- 图片生成：`GENERATION_PROVIDER`、`APIMART_API_KEY`、`APIMART_BASE_URL`、`APIMART_IMAGE_MODEL`、`APIMART_IMAGE_SIZE`、`APIMART_IMAGE_RESOLUTION`、`APIMART_IMAGE_QUALITY`
- COS 中转：`TENCENT_COS_SECRET_ID`、`TENCENT_COS_SECRET_KEY`、`TENCENT_COS_BUCKET`、`TENCENT_COS_REGION`、`TENCENT_COS_UPLOAD_PREFIX`、`TENCENT_COS_SIGNED_URL_TTL_SECONDS`
- 文案模型：`ARK_API_KEY`、`ARK_BASE_URL`、`ARK_TEXT_MODEL`
- 模板管理：`TEMPLATE_ADMIN_SECRET`
- 兼容 fallback：`APP_PUBLIC_BASE_URL`、`ARK_IMAGE_MODEL`

真实值只允许存在本地 `.env`，不要写入文档、测试输出或对话。

## 最近验证结果
最近完成 APIMart、COS、下载代理、Ark 文案错误解析后已验证：

```powershell
npm.cmd test
npm.cmd run build
```

记录结果：

- Vitest：25 个测试文件、70 个测试通过。
- Next build：通过。
- mock Playwright E2E 最近一次完整运行 13 条通过；如果 3000 端口正运行真实环境 dev server，E2E 可能复用真实模型服务，运行前要先确认。

真实模型链路每次改动后仍需实机复验，重点看服务端日志里的 `generation.provider.request`、`generation.provider.success`、`generation.copy_provider.success`、COS 输入图摘要和最终 prompt。

## 当前未完成
- 没有账号注册/登录系统。
- 没有正式多用户权限；当前只是匿名 `ownerId` 隔离。
- 没有用户角色和管理员账号。
- 模板管理仍靠 `TEMPLATE_ADMIN_SECRET`。
- 没有匿名数据迁移到注册账号的流程。
- 没有支付、积分、订单。
- 没有正式模板市场。
- 没有真实视频生成。
- 文案入口和视频入口仍不是完整生产功能。
- 图片资产长期对象存储迁移尚未完成；COS 当前只是 APIMart 输入图中转。
- NestJS 主后端尚未启用，当前继续使用 `apps/web` API Routes。
