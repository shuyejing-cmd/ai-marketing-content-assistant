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

## 图片最终边界采用 10 MiB 和 4096px

- 处理后的最终图字节上限为 10 MiB。
- 处理后的最终图最长边上限为 4096px。
- 同时满足限制的普通 JPEG、PNG、WebP 保留原文件字节，不重新编码。
- 超限普通图片在浏览器等比缩放和压缩，不裁剪；处理后仍不合规则明确拒绝。
- generation service 在持久化和 COS 上传前执行不可绕过的最终强校验。

服务端强校验是安全边界，浏览器预处理只是用户体验和带宽优化。APIMart、COS 和生成业务链路不因该决定改变，日志只记录安全摘要。

## HEIC/HEIF 采用浏览器优先与服务端兜底双保障

- 浏览器优先无感转换 HEIC/HEIF，成功后按普通最终图规则处理。
- 浏览器不支持或转换失败时自动调用服务端流式兜底，用户不需要手工转换。
- HEIC/HEIF 源文件上限为 40 MiB，最终输出仍必须满足 10 MiB 和 4096px。
- 服务端 admission 固定为 `active=1`、`waiting=4`，并设置请求 deadline。
- 同步 WASM 和 Sharp/libvips 不能被硬抢占；底层回调或原生操作未结束时不提前释放资源或 admission slot。

最后一项是明确的安全取舍：deadline 可以停止继续推进和返回超时，但不能假装底层工作已经结束，以免扩大并发资源占用。

## 不保留上传原图

- 普通图片处理后只保存最终图，不保存压缩或缩放前副本。
- HEIC/HEIF 浏览器转换成功时不上传源文件。
- HEIC/HEIF 服务端兜底时，源文件只存在于当次请求，不写入 Prisma、不上传 COS、不进入日志。
- `ImageAsset`、COS 和 provider 只接收处理后的最终 JPEG、PNG 或 WebP。

## 上传处理不做商品主体识别

第一版只做格式识别、方向修正、等比缩放、质量压缩和强边界校验，不引入商品主体检测、智能裁剪、背景理解或视觉质量评分。这样可以避免误裁主体和新增模型依赖；主体清晰度由等比缩放、不裁剪和人工真实链路验收保障。

## 测试 fixture 必须有授权与第三方许可记录

- HEIC/HEIF 兼容性测试只使用明确允许再分发的 fixture。
- fixture 必须记录来源、固定版本或提交标识和适用许可。
- 第三方许可文本随仓库保留，fixture 仅用于自动化兼容性测试。
- 不把来源不明的用户图片或真实业务上传图提交为测试资产。

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
