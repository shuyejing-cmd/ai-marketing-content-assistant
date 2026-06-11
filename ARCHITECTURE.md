# ARCHITECTURE.md

## 当前运行架构

当前是 `apps/web` 单体 Next.js 应用：

```text
Browser
  -> Next.js pages/components
  -> Next.js API Routes
       -> Auth service
       -> Generation service
       -> Template repository
       -> Prisma/PostgreSQL
       -> APIMart image provider
       -> Tencent COS
       -> Ark text provider
```

`apps/api` / NestJS 尚未启用。

## 认证与 owner 架构

### 数据模型

```text
User
  id
  email
  passwordHash
  role
  -> AuthSession[]

AuthSession
  userId
  tokenHash
  expiresAt
```

### 登录流程

```text
浏览器提交 email/password/anonymousOwnerId
  -> /api/auth/register 或 /api/auth/login
  -> scrypt 创建或校验 passwordHash
  -> 创建随机 session token
  -> 数据库只保存 tokenHash
  -> 浏览器接收 HttpOnly cookie
  -> 把 owner_* 业务数据迁移到 user:<userId>
```

### 请求归属

```text
请求携带有效登录 cookie
  -> getCurrentUser()
  -> ownerId = user:<userId>

无有效登录 cookie
  -> 校验 x-owner-id 只能是 owner_*
  -> ownerId = owner_* 或 anonymous
```

业务 API 不接受客户端伪造的 `user:*` owner，也不再以 body.ownerId 决定账号身份。

### 登录态恢复

`/api/auth/me` 从 cookie 读取原始 token，hash 后查询 `AuthSession` 和 `User`。数据库和 migration 正常时，刷新浏览器或重启 Next.js 服务都不会让账号失效。

客户端读取账号状态有 8 秒超时。超时或服务端失败时退出 loading 状态并显示数据库或服务端配置错误。

## 业务数据模型

```text
Session
  -> GenerationTask[]

GenerationTask
  -> GenerationResult[]
  -> ImageAsset[]
  -> PromptLog[]

Template
User
AuthSession
```

第一版账号迁移保留现有 `ownerId` 列：

- 匿名 owner：`owner_*`
- 登录 owner：`user:<userId>`

## 图片上传预处理与生成数据流

自由生图和模板生图共用同一套上传处理，最终数据流为：

```text
用户选择 JPEG / PNG / WebP / HEIC / HEIF
  -> 浏览器读取文件签名、MIME、字节和尺寸
  -> 普通 JPEG / PNG / WebP
       -> <=10 MiB 且最长边 <=4096px：保留原文件
       -> 超限：浏览器等比缩放和压缩
       -> 处理后仍超限：返回明确错误，不进入生成链路
  -> HEIC / HEIF
       -> 浏览器优先无感转换为 JPEG，再执行 10 MiB / 4096px 规则
       -> 浏览器无法转换：POST 服务端 HEIC 流式兜底
            -> 源文件 <=40 MiB
            -> admission active=1、waiting=4
            -> 请求 deadline
            -> 输出满足限制的 JPEG
  -> POST generation task
  -> generation service 强校验最终 MIME、签名、字节、尺寸和像素
  -> 只把处理后的最终图持久化为 ImageAsset
  -> 腾讯 COS 私有对象
  -> 短期签名 URL
  -> APIMartImageProvider
  -> 保存生成结果和安全摘要日志
```

浏览器预处理不能代替服务端边界。generation service 的最终强校验位于持久化和 COS 上传之前，直接构造请求、绕过 UI 或伪造 Data URL 都不能绕过。

HEIC 服务端兜底使用有界 admission 和 deadline。同步 WASM 解码不能被硬抢占，Sharp/libvips 原生工作也不会通过竞速提前返回；即使请求 deadline 已到，底层回调或原生操作未结束前仍持有资源和 admission slot，结束后再释放。这是用较低吞吐换取资源生命周期正确性的安全取舍。

原始 HEIC/HEIF 只存在于当次转换请求中，普通图片超限处理也不保留处理前副本。Prisma、COS 和 provider 只接收最终 JPEG、PNG 或 WebP。日志仅记录 MIME、字节、尺寸、处理方式、provider 等安全摘要，不记录完整 base64、原始文件或完整签名 URL。

图片预处理与强校验只收紧输入边界，不改变现有 APIMart、COS、任务持久化和结果展示业务链路。

## 自由图片生成

```text
用户输入、快捷选项、可选上传图
  -> 浏览器图片预处理；HEIC 必要时服务端兜底
  -> POST /api/generation-tasks
  -> 服务端解析 owner
  -> prompt-builder 生成 imagePrompt/copyPrompt
  -> generation service 强校验
  -> 处理后的最终图保存为 ImageAsset
  -> APIMart 图生图：ImageAsset -> COS -> 短期签名 URL
  -> APIMartImageProvider
  -> VolcengineTextProvider
  -> 保存任务、结果、PromptLog
  -> ResultCard 展示模型原图和文案
```

## 模板图片生成

```text
公开模板列表
  -> /templates/image/[id]
  -> 用户上传图和填写活动信息
  -> POST /api/templates/[id]/generation-tasks
  -> 服务端读取 Template.prompt
  -> 注入统一 prompt-builder
  -> 复用生成主链路
```

公开模板 API 不返回内部 prompt。

## 模板创建权限

- `/admin/templates` 路径暂时保留。
- 页面入口只向登录用户显示。
- 管理 API 使用 `requireUser`。
- 所有登录用户当前都可创建和更新模板。
- `AUTH_ADMIN_EMAILS` 会给匹配邮箱赋予 `admin` 角色，但模板权限暂不区分角色。

后续增加模板作者归属后，再收紧为“用户管理自己的模板，管理员管理全部模板”。

## APIMart provider

```text
APIMartImageProvider
  -> submit generation
  -> poll task
  -> return remote image URL
```

代理优先级：

1. `APIMART_PROXY_URL`
2. `HTTPS_PROXY` / `https_proxy`
3. `HTTP_PROXY` / `http_proxy`
4. `ALL_PROXY` / `all_proxy`

配置代理时使用 `undici.fetch` + `ProxyAgent`，因为 Node 内置 fetch 不会自动遵循 Windows 系统代理。

错误边界：

- 网络连接失败：provider fetch error。
- 上游安全审核：APIMart `HTTP 400`，消息包含 safety rejection。
- 图片 provider 失败：任务失败。
- 文案 provider 失败：图片任务仍成功，使用 fallback 文案。

## COS 图生图中转

```text
浏览器预处理或 HEIC 服务端兜底后的最终图
  -> generation service 强校验
  -> ImageAsset(base64，仅最终图)
  -> Tencent COS private object
  -> signed GET URL
  -> APIMart image_urls
```

- Bucket 保持私有。
- 签名 URL 只短期有效。
- PromptLog 不保存完整签名 URL。
- 不保存上传原图或原始 HEIC/HEIF。
- 长期仍需把 `ImageAsset.base64` 迁移为对象存储 key。

## 下载

```text
remote imageUrl
  -> /api/download-image
  -> 服务端 fetch
  -> attachment response
```

只有 mock 或没有真实模型图时才使用 canvas fallback。

## 配置边界

- `.env.local`：真实本地配置，Git ignored。
- `.env.example`：变量名和安全示例，可提交。
- Prisma migration：可提交。
- 数据库密码、API Key、COS Secret、代理认证信息：禁止提交。

## 未来演进

- ImageAsset 全量对象存储。
- Template 作者和版本模型。
- NestJS 主后端。
- BullMQ/Redis 异步任务。
- FastAPI AI 执行服务。
