# CURRENT_STATUS.md

## 当前状态摘要

图片营销 MVP、账号系统和真实模型链路修复已经在本地分支 `account-owner-migration` 完成并提交。图片上传稳定性功能已在本地 `image-upload-stability` 分支实现，尚未合入 `main` 或 GitHub 主线。

截至 2026-06-11 的最近验证：

- Vitest：40 个测试文件、354 条测试通过。
- Next.js 生产构建：通过。
- Playwright mobile mock E2E：18 条全部通过，包含普通图片处理、HEIC/HEIF 服务端兜底、失败恢复和 iPhone 13 布局。
- 真实 JPEG、大图、HEIC/HEIF 与 APIMart 的最终人工验收只应执行一次，目前尚未执行。
- Prisma migration 已在本地 PostgreSQL 部署。
- 注册后刷新、重启开发服务后恢复登录态已验证。
- APIMart 经本机 HTTP 代理连通已验证。
- 真实图生图请求已进入 APIMart，并收到上游安全审核 `HTTP 400`，说明 API、代理和 COS 链路已打通。

## 已完成能力

### 图片营销

- `/image` 自由图片生成。
- `/templates/image/[id]` 图片模板生成。
- 会话创建、切换、重命名、删除和恢复。
- 自由会话与模板会话隔离。
- APIMart `gpt-image-2-official` 文生图和图生图。
- 腾讯云 COS 私有对象中转上传图。
- Ark 文案生成 `title`、`publishingCopy`、`imageText`。
- 模型原图预览和 `/api/download-image` 代理下载。
- PromptLog 和结构化生成日志。

### 图片上传稳定性

- 普通 JPEG、PNG、WebP 在不超过 10 MiB 且最长边不超过 4096px 时保留原文件字节，不重新编码。
- 超过最终字节或尺寸限制的普通图片由浏览器等比缩放和压缩；处理后仍不合规则返回明确提示。
- HEIC/HEIF 优先在浏览器无感转换为 JPEG，浏览器不可用或转换失败时自动进入服务端流式兜底。
- HEIC/HEIF 源文件上限为 40 MiB；原文件只参与当次处理，不写入 Prisma、不上传 COS、不进入日志。
- 只保存处理后的最终 JPEG、PNG 或 WebP，不保留上传原图。
- generation service 在持久化和 COS 上传前执行不可绕过的格式、签名、字节、尺寸和像素强校验。
- APIMart、COS 与现有生成业务链路保持不变；日志只记录 MIME、字节、尺寸、处理方式等安全摘要。
- 服务端 HEIC admission 为同时处理 `active=1`、排队 `waiting=4`，并设置请求 deadline。
- 同步 WASM 解码和 Sharp/libvips 工作不能被硬抢占；底层回调或原生操作未结束时不会提前释放资源或 admission slot，这是防止资源并发失控的已知安全取舍。

### 账号与数据隔离

- `/auth` 邮箱密码注册和登录。
- 退出登录。
- `User`、`AuthSession` Prisma 模型及 migration。
- 密码使用 `scrypt` hash，不保存明文。
- session token 仅以 hash 形式入库。
- HttpOnly cookie 保持登录态。
- 注册或登录时自动把当前浏览器匿名 owner 数据迁移到 `user:<userId>`。
- 服务端统一解析请求 owner。
- 生成会话、任务读取、重新生成和二次修改均校验 owner。
- 两个登录用户的数据隔离有单测和 E2E 覆盖。
- `/api/auth/me` 客户端有 8 秒超时，数据库异常时不再永久显示“账号状态读取中”。

### 模板权限

- 未登录用户不能进入模板创建/管理 API。
- 所有已登录用户都能看到并使用“模板创建/管理”入口。
- `/api/admin/templates` 路径名称暂时保留，但实际权限是 `requireUser`。
- `AUTH_ADMIN_EMAILS` 只决定账号角色，不控制模板创建权限。
- 公开模板 API 不返回内部 prompt。

### APIMart 网络

- provider 支持 `APIMART_PROXY_URL`。
- 也可读取标准 `HTTPS_PROXY`、`HTTP_PROXY`、`ALL_PROXY` 环境变量。
- 使用 `undici.fetch` 和 `ProxyAgent` 通过代理访问 APIMart。
- 当前本机环境使用被忽略的 `.env.local` 配置代理。

## 当前数据库模型

- `Session`
- `GenerationTask`
- `GenerationResult`
- `ImageAsset`
- `PromptLog`
- `Template`
- `User`
- `AuthSession`

业务数据第一版仍使用字符串 `ownerId`：

- 匿名：`owner_*`
- 登录账号：`user:<userId>`

这是兼容式迁移方案，尚未把所有业务表改为显式 `userId` 外键。

## 当前已知限制

- 图片仍以 base64 长期保存在 PostgreSQL，可能造成数据库膨胀。
- 真实 JPEG、大图、HEIC/HEIF 与 APIMart 的一次性最终人工验收尚未执行。
- 同步 WASM/Sharp 无法在 deadline 到达时硬中断；系统选择等待底层工作真正结束后再释放资源和 admission slot。
- APIMart 安全审核拒绝目前作为通用 provider 失败返回，前端还没有专门提示。
- `url.parse()` 依赖弃用警告尚未定位到具体第三方调用方。
- 未实现邮箱验证、找回密码、OAuth、支付、积分、订单、团队和模板市场。
- 视频入口仍是占位，不接真实视频生成。
- NestJS 尚未启用。

## Git 状态

- `image-upload-stability`：图片上传稳定性已在本地实现并完成自动化验证，尚未合入 `main` 或 GitHub 主线。
- `account-owner-migration`：本地已提交，准备推送并创建 PR。
- `feature/local-mobile-mvp`：本地比 GitHub 远端领先 2 个提交。
- 主工作区显示的 86 个未提交路径，已确认与 `ab8e118` 基线快照完全一致。
- GitHub 当前已知远端只有 `main` 和 `feature/local-mobile-mvp`；推送前必须再次确认。

## 下一步

下一步只执行一次真实 JPEG、大图、HEIC/HEIF 与 APIMart 人工验收；确认后推进 `image-upload-stability` 的审查与 GitHub 合入。不要在 Git 整合完成前删除主工作区文件、工作树、本地分支或安全 stash。
