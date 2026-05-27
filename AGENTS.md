# AGENTS.md

## 新会话优先阅读
根目录下这 6 个文件是当前项目事实来源。新窗口不要一次性阅读整个代码库，先按顺序阅读：

1. `AGENTS.md`
2. `CURRENT_STATUS.md`
3. `NEXT_TASKS.md`
4. `ARCHITECTURE.md`
5. `PROJECT_BRIEF.md`
6. `DECISIONS.md`

需要历史背景时再读：

- `docs/superpowers/specs/`
- `docs/superpowers/plans/`

`docs/superpowers/` 是历史产品设计和实施计划，不等同于当前代码状态。当前事实以根目录 6 个文件和实际代码为准。

## 当前项目定位
这是一个面向中小商家的 AI 营销内容助手。当前阶段重点是 `apps/web` 内的图片营销 MVP：

- 自由图片生成：一句话需求 + 快捷选项 + 可选上传图。
- 图片模板生成：管理员发布模板，用户只上传图片和填写活动信息。
- 结果卡包含完整模型海报图、标题、发布文案、图片中文字建议、复制和下载。
- 主页右上角已有 X App 风格菜单，当前入口包含模板创建/管理，后续可放个人账号等能力。
- 下一阶段最重要任务是账号注册系统，让多个用户使用所有功能时数据互不干扰。

## 当前技术栈
- 应用：Next.js App Router、React、TypeScript、Tailwind CSS。
- 后端落点：`apps/web` 的 Next.js API Routes。
- 数据库：PostgreSQL + Prisma。
- 图片模型：APIMart `gpt-image-2-official` 为当前主路径；旧 Seedream provider 保留用于回滚。
- 图生图中转：腾讯云 COS，Bucket 私有，服务端上传输入图并生成短期签名 URL 给 APIMart。
- 文案模型：火山方舟 Ark chat completions，通过 `VolcengineTextProvider` 服务端调用。
- Prompt：`prompt-builder` 统一构建 `imagePrompt` 和 `copyPrompt`，并写入 `PromptLog`。
- 模板：`Template` 表 + 公开模板 API + 管理 API + 图片模板使用页。
- 会话：`Session.kind/templateId` 已区分自由会话和模板会话；浏览器只保存匿名 `ownerId` 和当前会话 key。
- 下载：真实模型远程 `imageUrl` 通过 `/api/download-image` 代理下载；mock/无真实模型图才走 canvas fallback。
- 测试：Vitest、Playwright mobile E2E。

## 主要目录边界
- `apps/web`：当前唯一运行应用。
- `apps/web/src/app`：页面和 API Routes。
- `apps/web/src/app/image/page.tsx`：自由图片生成页。
- `apps/web/src/app/templates/image/[id]`：图片模板使用页。
- `apps/web/src/app/admin/templates`：最小模板管理页。
- `apps/web/src/app/api/download-image`：远程模型图同源下载代理。
- `apps/web/src/features/generation`：生成类型、Prompt、provider、服务、会话和数据存储。
- `apps/web/src/features/templates`：模板类型、客户端、仓库和管理鉴权。
- `apps/web/prisma`：Prisma schema 和迁移。
- `docs/superpowers`：历史规格和历史实施计划。
- `apps/api`：未来 NestJS 主后端方向，目前不要启用。

## 固定规则
- 不泄露 `.env`、API key、COS 密钥、数据库密码、管理员口令或任何真实密钥。
- 前端不得直接调用模型供应商；真实模型调用必须经过服务端 provider。
- 普通用户 API 不返回模板内部 prompt。
- 模板内部 prompt 只允许在管理页、服务端读取和 PromptLog 调试中出现。
- PromptLog 可以记录最终 `imagePrompt` / `copyPrompt`，但不得保存 COS 私有签名 URL；只记录 bucket、region、object key、过期时间等安全摘要。
- 上传图当前仍会保存到 PostgreSQL `ImageAsset.base64`，并在 APIMart 图生图时临时上传 COS。
- 模型原图是当前主要展示和下载对象；canvas 模板只作 mock 或无真实生成图时的 fallback。
- 商品一致性优先于画面惊艳：有上传图时不得随意改变包装、Logo、颜色和关键主体细节。
- 不把模板模式替代自由生成模式；两条路径都要保留。
- 视频模板第一版只做列表占位，不接真实视频生成。
- 当前阶段继续使用 `apps/web` API Routes，不启动 NestJS，除非用户明确要求。
- 代码改动要小步、可验证、贴合现有结构。

## 常用命令
在 `apps/web` 目录执行：

```powershell
npm.cmd run dev
npm.cmd test
npm.cmd run build
npm.cmd run e2e
npm.cmd exec -- prisma migrate dev
npm.cmd exec -- prisma generate
```

如需跑覆盖模板管理的 E2E，临时在本机 shell 设置 `GENERATION_PROVIDER=mock` 和 `TEMPLATE_ADMIN_SECRET`，不要把口令写进文档或提交到仓库。

本地手机访问开发服务：

```text
http://<电脑局域网 IPv4>:3000
```

## 验证标准
- 只改文档：检查文件存在、中文可读、路径准确、没有过期结论、没有敏感信息。
- 改代码：至少运行 `npm.cmd test` 和 `npm.cmd run build`。
- 改交互：还要运行 mock E2E。若 3000 已运行真实环境 dev server，先确认是否会复用真实模型服务。
- 改 Prisma schema：运行 `npm.cmd exec -- prisma migrate dev` 或按实际需要运行 `prisma generate`。
- 改真实模型链路：除了自动化测试，还要实机生成并查看服务端日志里的最终 prompt、图片输入摘要、文案模型输出是否真实生效。
