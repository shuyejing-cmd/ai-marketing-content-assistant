# 账号注册与匿名数据绑定设计

## 背景

当前 `apps/web` 已经跑通图片营销 MVP：自由图片生成、图片模板生成、模板管理、APIMart 图片模型、COS 图生图中转、Ark 文案模型、PromptLog 和远程模型图下载代理都可用。

当前数据隔离仍依赖浏览器 localStorage 中的匿名 `ownerId`，并通过 `x-owner-id` header 或 request body 传给服务端。下一阶段 P0 是邮箱密码账号系统与多用户隔离，让多个用户使用自由生成、模板生成、历史会话和模板管理时数据互不干扰。

本设计只覆盖第一版账号闭环，不覆盖支付、积分、团队、模板市场、对象存储长期迁移或 NestJS 迁移。

## 目标

- 支持邮箱密码注册、登录、退出和登录态保持。
- 密码只保存安全 hash，不保存明文。
- 登录或注册成功后，自动把当前浏览器匿名 `ownerId` 下的数据绑定到该账号。
- 登录用户只能读取和操作自己的会话、生成任务、生成结果、图片资产和 PromptLog 关联数据。
- 自由会话和模板会话继续在用户维度隔离。
- 模板管理从裸本地入口过渡到账号角色，第一版支持 `admin` / `user`。
- API 层不再信任前端传来的 owner 身份；服务端从 cookie 登录态解析当前用户，匿名状态才使用匿名 owner。
- E2E 或 API 测试覆盖至少两个用户数据互不串。

## 非目标

- 不做短信验证码、OAuth、找回密码、邮箱验证。
- 不做个人中心、团队、商家空间、支付、积分、订单。
- 不把现有业务表一次性全量改成 `userId` 外键。
- 不启动 `apps/api` / NestJS。
- 不改变 APIMart、COS、Ark 的 provider 主链路。

## 推荐方案

采用“兼容式账号接管 ownerId”。

新增账号与登录 session 模型，但保留现有 `Session.ownerId`、`GenerationTask.ownerId`、`ImageAsset.ownerId`。登录用户使用稳定 owner key，例如 `user:<userId>`。注册或登录成功后，服务端把当前浏览器匿名 owner 下的数据更新到该用户 owner key。

这个方案改动范围比一次性外键化小，能复用现有 session repository、generation store、模板会话隔离和测试结构。未来需要更强关系约束时，再迁移到显式 `userId` 外键。

## 数据模型

在 `apps/web/prisma/schema.prisma` 新增：

```prisma
model User {
  id           String        @id
  email        String        @unique
  passwordHash String
  role         String        @default("user")
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  authSessions AuthSession[]

  @@index([role])
}

model AuthSession {
  id        String   @id
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}
```

现有业务表第一版保持不新增 `userId`：

- `Session.ownerId`
- `GenerationTask.ownerId`
- `ImageAsset.ownerId`

登录用户的 owner key 固定为：

```ts
`user:${user.id}`
```

匿名 owner 仍沿用现有 `owner_<uuid>`。

## 服务端认证边界

新增 `src/features/auth/server`：

- `password.ts`：使用 Node `crypto.scrypt` hash 密码，保存带参数的字符串格式。
- `session.ts`：创建随机 session token，只把 token hash 存数据库，把原始 token 放入 HttpOnly cookie。
- `current-user.ts`：从 cookie 读取 token，hash 后查询 `AuthSession` 和 `User`。
- `owner.ts`：提供 `getRequestOwner(request)`，统一决定当前请求 owner。
- `migration.ts`：把匿名 owner 数据绑定到用户 owner key。

Cookie 建议：

- 名称：`ai_marketing_session`
- `httpOnly: true`
- `sameSite: "lax"`
- `secure: process.env.NODE_ENV === "production"`
- 第一版有效期：30 天

`getRequestOwner(request)` 行为：

1. 如果 cookie 对应有效登录用户，返回 `{ ownerId: userOwnerId(user), user }`。
2. 如果未登录，返回 `{ ownerId: request.headers.get("x-owner-id") ?? "anonymous", user: null }`。
3. 业务 route 不再读取 body.ownerId。

## 自动绑定匿名数据

注册和登录 API 都接受可选 `anonymousOwnerId`，前端从现有 `getOwnerId()` 获取并提交。

成功认证后执行：

```text
anonymousOwnerId -> user:<userId>
```

绑定范围：

- `Session.updateMany({ where: { ownerId: anonymousOwnerId }, data: { ownerId: userOwnerId } })`
- `GenerationTask.updateMany({ where: { ownerId: anonymousOwnerId }, data: { ownerId: userOwnerId } })`
- `ImageAsset.updateMany({ where: { ownerId: anonymousOwnerId }, data: { ownerId: userOwnerId } })`

不直接迁移 `PromptLog`，因为它通过 `taskId` 关联 `GenerationTask`，归属随任务解析。

安全约束：

- 只允许把当前请求提交的匿名 owner 绑定到刚注册或刚登录的账号。
- 如果 `anonymousOwnerId` 为空、等于目标 user owner、或不是 `owner_` 开头，则跳过。
- 多次绑定是幂等的。
- 登录到不同账号时，当前浏览器匿名 owner 会绑定到本次登录账号；第一版不提供冲突交互。

## API 设计

新增：

- `POST /api/auth/register`
  - 输入：`email`、`password`、`anonymousOwnerId?`
  - 输出：当前用户公开信息
  - 行为：创建用户、创建 session cookie、绑定匿名数据。

- `POST /api/auth/login`
  - 输入：`email`、`password`、`anonymousOwnerId?`
  - 输出：当前用户公开信息
  - 行为：验证密码、创建 session cookie、绑定匿名数据。

- `POST /api/auth/logout`
  - 输入：无
  - 输出：`{ ok: true }`
  - 行为：删除当前 session，清空 cookie。

- `GET /api/auth/me`
  - 输出：未登录返回 `{ user: null }`，已登录返回 `{ user: { id, email, role } }`。

修改：

- `/api/generation-sessions`
  - 使用 `getRequestOwner(request)`。
  - 保留匿名使用。

- `/api/generation-tasks`
  - 使用 `getRequestOwner(request)`。
  - 忽略 body 中的 `ownerId`。

- `/api/templates/[id]/generation-tasks`
  - 使用 `getRequestOwner(request)`。
  - 忽略 body 中的 `ownerId`。

- `/api/generation-tasks/[id]/regenerate`
  - 先按当前 owner 校验旧 task 归属。
  - 旧 task 不存在或不属于当前 owner 时返回 404。

- `/api/generation-tasks/[id]/modify`
  - 同上，禁止跨用户修改。

- `/api/image-assets/[id]`
  - 第一版作为 APIMart fallback 输入图接口，应至少校验当前 owner 或只在 `APP_PUBLIC_BASE_URL` fallback 需要时使用不可猜测 id。
  - 推荐在账号 P0 中改为：登录/匿名 owner 必须匹配 `ImageAsset.ownerId` 才返回；APIMart COS 主路径不受影响。

- `/api/admin/templates` 和 `/api/admin/templates/[id]`
  - 改为 `requireAdmin(request)`。
  - 非登录返回 401，非 admin 返回 403。

## 前端设计

新增轻量账号客户端：

- `src/features/auth/auth-client.ts`
  - `getCurrentUser()`
  - `register(email, password, anonymousOwnerId)`
  - `login(email, password, anonymousOwnerId)`
  - `logout()`

首页右上角菜单：

- 未登录：显示“登录 / 注册”入口。
- 已登录：显示邮箱、角色和“退出登录”。
- admin：显示“模板创建/管理”。
- user：不显示模板管理入口，或点击时提示无权限。

页面初始化：

- `/image` 和 `/templates/image/[id]` 仍调用现有 `getOwnerId()`，保证匿名路径可用。
- 注册/登录成功后，重新拉取 `/api/generation-sessions`，此时服务端会返回账号 owner 下的数据。
- localStorage 中的匿名 owner 可以继续保留，作为下一次匿名绑定来源；业务请求在登录后由 cookie 优先决定 owner。

登录/注册 UI 第一版可以放在首页菜单内的简单表单或独立 `/auth` 页面。为了减少页面复杂度，推荐第一版使用独立 `/auth` 页面，首页菜单链接过去。

## 错误处理

- 注册邮箱已存在：409，提示“该邮箱已注册”。
- 登录密码错误：401，提示“邮箱或密码不正确”。
- 密码太短：400，第一版要求至少 8 个字符。
- 邮箱格式无效：400。
- session 过期：`/api/auth/me` 返回 `{ user: null }`，业务 API 回退到匿名 owner 或按 route 要求返回 401。
- admin 权限不足：401 或 403，不泄露模板内部 prompt。

## 测试策略

单测 / API 测试：

- 密码 hash 不等于明文，并能校验正确密码。
- 注册创建用户、设置 cookie、绑定匿名 `Session` / `GenerationTask` / `ImageAsset`。
- 登录成功绑定当前匿名 owner 数据。
- 两个用户登录后各自只能 list 自己的会话。
- `POST /api/generation-tasks` 忽略 body.ownerId，使用服务端解析 owner。
- 重生成和二次修改不能操作其他 owner 的 task。
- 普通 user 不能访问 admin 模板 API。
- admin 可以访问 admin 模板 API。
- 公开模板 API 仍不返回 prompt。

E2E：

- 用户 A 注册并生成一次图片营销任务。
- 退出，用户 B 注册或登录。
- 用户 B 看不到用户 A 的会话。
- admin 登录后能进入模板管理；普通 user 不能看到或不能访问模板管理。

## 验证命令

代码实现后至少运行：

```powershell
npm.cmd test
npm.cmd run build
```

涉及登录/会话 UI 后，还要运行 mock E2E：

```powershell
$env:GENERATION_PROVIDER='mock'; $env:TEMPLATE_ADMIN_SECRET='<local-test-admin-secret>'; npm.cmd run e2e
```

如果修改 Prisma schema：

```powershell
npm.cmd exec -- prisma migrate dev
npm.cmd exec -- prisma generate
```

## 实施顺序

1. 增加认证模型和迁移。
2. 写密码、session、当前用户、owner 解析和匿名数据绑定服务。
3. 写注册、登录、退出、me API。
4. 收口会话和生成 API 的 owner 来源。
5. 给重生成、二次修改和图片资产 API 增加 owner 校验。
6. 给 admin 模板 API 增加角色鉴权。
7. 增加登录/注册/退出 UI，并接入首页菜单。
8. 补充多用户隔离和权限测试。

## 自查结果

- 没有把真实密钥、环境变量值或口令写入设计。
- 设计范围只覆盖账号注册、登录、匿名绑定和权限隔离。
- 方案保留 `apps/web` API Routes，不启动 NestJS。
- 匿名绑定策略明确为注册/登录时自动绑定当前浏览器匿名 owner。
- 当前业务表第一版继续使用 `ownerId`，避免扩大迁移范围。
