# ARCHITECTURE.md

## 当前运行架构
当前实际运行架构是 `apps/web` 单体 Next.js 应用：

```text
apps/web
  Next.js App Router
  React UI components
  Next.js API Routes
  Prisma + PostgreSQL
  Fire-and-wait generation service
  APIMart image provider
  Tencent COS input image bridge
  Ark text copy provider
  Prompt builder + PromptLog
  Template repository/API
  Session scope: free/template
  Direct model-image download proxy
```

`apps/api` / NestJS 目前未启用。

## 关键模块
- 页面层：`src/app/page.tsx`、`src/app/image/page.tsx`、`src/app/templates/image/[id]`、`src/app/admin/templates`。
- API 层：`src/app/api/generation-tasks`、`src/app/api/generation-sessions`、`src/app/api/templates`、`src/app/api/admin/templates`、`src/app/api/download-image`、`src/app/api/dev/run-logs`。
- 生成领域：`src/features/generation`。
- 模板领域：`src/features/templates`。
- 数据库：`prisma/schema.prisma`。
- 下载能力：`src/lib/download.ts`。

## 数据库模型
Prisma 当前模型：

```text
Session
GenerationTask
GenerationResult
ImageAsset
PromptLog
Template
```

当前事实存储是 PostgreSQL。浏览器 localStorage 只保存匿名 `ownerId` 和当前会话 id/key，不保存完整历史事实。

`Session` 已包含：

- `kind`: `free` 或 `template`
- `templateId`: 模板会话所属模板

下一阶段会新增正式账号模型，让 `User` 接管数据归属，逐步替代匿名 `ownerId`。

## 自由图片生成数据流
```text
用户输入/上传图片/选择渠道场景风格/填写活动信息
  -> /api/generation-tasks
  -> generation-service
  -> prompt-builder 构建 imagePrompt + copyPrompt
  -> 如有上传图且使用 APIMart：ImageAsset -> COS -> 私有签名 URL
  -> APIMart provider 生成完整海报图
  -> Ark text provider 生成标题、发布文案、图片中文字
  -> 保存 Session / GenerationTask / GenerationResult / ImageAsset / PromptLog
  -> 前端 ResultCard 展示模型原图和文案
  -> 下载优先下载模型原图
```

## 模板图片生成数据流
```text
用户点击首页图片模板
  -> /templates/image/[id]
  -> 用户上传图片、填写活动信息
  -> /api/templates/[id]/generation-tasks
  -> 服务端读取 Template.prompt
  -> prompt-builder 注入模板内部 prompt
  -> 复用普通生成链路
  -> 仅恢复当前模板自己的模板会话历史
```

模板内部 prompt 不从公开模板 API 返回，也不由前端提交。

## Provider 边界
- 图片 provider 当前主路径：`APIMartImageProvider`，模型为 `gpt-image-2-official`。
- 旧图片 provider：`VolcengineSeedreamProvider`，保留为回滚路径。
- 文案 provider：`VolcengineTextProvider`，调用 Ark chat completions。
- `GENERATION_PROVIDER=mock` 用于测试和 E2E，避免真实模型费用。
- 文案 provider 失败不会阻断图片结果；任务仍可成功并使用 fallback 文案。
- 图片 provider 失败会让生成任务失败。

## APIMart + COS 图生图边界
APIMart 图生图通过 `image_urls` 读取输入图，因此本地上传图需要先变成 APIMart 可访问的 URL。

当前实现：

```text
uploadedImageDataUrl
  -> ImageAsset(base64)
  -> Tencent COS private object
  -> signed GET URL
  -> APIMart image_urls
```

规则：

- COS Bucket 保持私有。
- 服务端上传对象并生成短期签名 URL。
- PromptLog 不保存完整签名 URL，只保存安全摘要。
- `APP_PUBLIC_BASE_URL` 仅作为旧 fallback。
- `ImageAsset` 仍保存 base64，长期迁移到对象存储是后续 P1。

## 下载数据流
真实模型图是主要下载对象。

```text
generatedImageDataUrl
  -> 直接触发浏览器下载

remote imageUrl
  -> /api/download-image?url=...
  -> 服务端 fetch 远程图
  -> attachment 响应下载

mock 或无真实模型图
  -> canvas fallback
```

不要重新把真实模型图套入本地海报模板。

## Prompt 管理
- `prompt-builder` 是当前统一入口。
- `imagePrompt` 发给图片模型。
- `copyPrompt` 发给文案模型。
- 有上传图时，prompt 强制强调商品一致性。
- 无上传图时，prompt 明确生成氛围型营销图，不暗示真实商品。
- 模板模式下，服务端读取模板内部 prompt 并注入生成链路。
- PromptLog 保存最终 prompt、版本、provider request/response 摘要和错误信息。

## 模板系统边界
- `Template` 表保存图片/视频模板、封面、描述、内部 prompt、发布状态和排序。
- 公开模板 API 只返回标题、描述、封面、类型、发布状态，不返回 prompt。
- 管理 API 当前使用 `TEMPLATE_ADMIN_SECRET` 保护。
- 图片模板可真实生成。
- 视频模板第一版只做占位展示。
- 下一阶段账号系统会把模板管理权限迁移到 `admin` 角色。

## 日志和调试
- `/api/dev/run-logs` 接收开发期前端调试事件。
- 服务端终端日志会显示上传图摘要、选项变化、生成提交、最终 prompt、provider 请求摘要和结果。
- 图片 base64 不完整打印到终端，只打印 mime、估算大小、长度和短 hash。
- 不打印 API key、token、password、数据库密码、COS SecretKey 或完整 COS 签名 URL。

## 下一阶段账号边界
当前匿名 `ownerId` 只是临时隔离方案。账号系统上线后：

- 服务端从 session/cookie 解析当前 `User`。
- API 不再信任前端传来的 owner 身份。
- 现有匿名数据需要迁移或明确放弃。
- Session、GenerationTask、ImageAsset、PromptLog、Template 管理行为都要纳入用户/角色边界。

## 未来目标架构
长期方向仍是：

```text
NestJS 主后端
  用户、商家、会话、任务、模板、素材、积分、订单、结果事件

AI Provider Adapter
  统一模型调用协议

BullMQ + Redis
  异步任务队列、缓存、限流、任务状态

PostgreSQL
  长期业务事实来源

对象存储
  图片、视频、素材资产

FastAPI AI 执行服务
  后期承载复杂 AI 工作流、图像处理、多模态和视频执行
```

当前阶段先把 `apps/web` 内图片 MVP 和账号隔离跑稳，再决定迁移时机。
