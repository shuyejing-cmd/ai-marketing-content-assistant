# DECISIONS.md

## 当前阶段继续在 apps/web 内完成闭环
原因：

- 能最快验证从输入、prompt、模型调用、结果展示、下载到历史会话的完整体验。
- 暂不引入 NestJS、队列和多服务部署复杂度。
- 当前最重要的是把图片 MVP 和账号隔离跑稳。

## 图片模型主路径切换为 APIMart GPT-Image-2
决策：

- 当前图片模型主路径使用 APIMart `gpt-image-2-official`。
- 旧 `VolcengineSeedreamProvider` 保留为回滚路径。
- 前端不直接调用 APIMart；所有模型调用经服务端 provider。

原因：

- 当前希望验证 GPT-Image-2 生成完整营销海报的效果。
- APIMart 返回远程图片 URL，适合结果卡直接展示和下载。
- 保留 Seedream 可以降低回滚风险。

## 腾讯云 COS 作为 APIMart 图生图中转
决策：

- Bucket 使用私有读写。
- 服务端上传输入图到 COS。
- 服务端生成短期签名 URL 传给 APIMart `image_urls`。
- `APP_PUBLIC_BASE_URL` 只作为旧 fallback。

原因：

- APIMart 图生图通过 URL 拉取输入图，不能访问用户本机 `localhost`。
- COS 比本地公网隧道更适合个人本地使用和后续上线。
- 私有 Bucket + 短期签名 URL 比公开读更安全。

## 文案继续使用火山方舟 Ark
决策：

- 文案 provider 使用 Ark chat completions。
- 通过 `ARK_TEXT_MODEL` 配置文案模型。
- 文案模型负责 `title`、`publishingCopy`、`imageText`。
- 文案失败不阻断图片结果，任务仍可成功并使用 fallback 文案。

原因：

- 当前图片模型和文案模型职责分离。
- 文案只需要结构化 JSON 输出，不需要读取生成图片本身。
- 图片成功优先，避免用户因文案模型失败看不到图。

## PostgreSQL + Prisma 是当前事实存储
原因：

- 本地完整链路需要跨刷新、跨页面恢复历史。
- 生成任务、结果、图片资产、PromptLog、模板都需要持久化。
- 浏览器 localStorage 只保存匿名 owner 和当前会话 key，不保存完整历史事实。

## 图片资产当前双轨
决策：

- `ImageAsset` 仍在 PostgreSQL 保存 base64。
- COS 当前只作为 APIMart 输入图临时中转。
- 长期图片资产对象存储迁移列为 P1。

原因：

- 当前阶段优先保证生成闭环和调试效率。
- 立刻迁移所有历史图片资产会扩大范围。
- 长期 base64 入库会导致数据库膨胀，后续必须迁移。

## 真实模型图作为展示和下载对象
决策：

- 预览优先展示模型原图。
- 下载优先下载模型原图。
- 远程模型 `imageUrl` 通过 `/api/download-image` 代理下载。
- Canvas 只作为 mock 或无真实生成图时的 fallback。

原因：

- 当前模型直接生成完整营销海报。
- 本地 canvas 模板会造成“下载图和生成图不一致”。
- 远程 URL 直接下载会遇到跨域和文件名问题，使用同源代理更稳定。

## Prompt builder 是当前 prompt 管理边界
原因：

- 所有自由生成、模板生成、重新生成、二次修改都应经过统一 prompt 构建。
- `imagePrompt` 发给图片模型。
- `copyPrompt` 发给文案模型。
- PromptLog 记录最终 prompt，方便排查和后续 A/B。

## 模板 MVP 已先于账号系统完成
历史决策：

- 第一版用 `TEMPLATE_ADMIN_SECRET` 保护管理页和管理 API。
- 普通用户不暴露模板内部 prompt。
- 模板用于验证低门槛入口和产品资产。

当前更新：

- 模板 MVP 已完成基础闭环。
- 下一阶段账号系统升为 P0。
- 模板管理权限后续从 `TEMPLATE_ADMIN_SECRET` 迁移到账号角色。

## 下一阶段账号系统采用邮箱密码
决策：

- 第一版账号注册系统采用邮箱 + 密码。
- 支持注册、登录、退出和登录态保持。
- 第一版至少包含 `admin` / `user` 角色。

原因：

- 邮箱密码实现范围可控，适合先跑通多用户隔离。
- 手机验证码需要短信服务，范围和成本更大。
- 账号系统是后续素材库、模板管理权限、支付和团队能力的基础。

## 保留自由生成，不让模板替代主线
原因：

- 用户没有合适模板时仍然必须能一句话自定义。
- 产品核心是智能辅助实现营销想法，不是模板市场。
- 模板用于降低输入成本和沉淀高频场景。

## 商品一致性优先
原因：

- 用户上传的商品图是事实资产。
- 小商家最怕生成结果不像自己的产品。
- 画面惊艳不能以修改真实商品为代价。

## NestJS 仍是未来主后端方向
原因：

- 适合承载用户、商家、素材、模板、任务、积分、订单等业务模块。
- TypeScript 与当前前端类型体系一致。
- 当前阶段暂不启动，等 `apps/web` 图片 MVP 和账号隔离稳定后再评估迁移。

## FastAPI 后期作为 AI 执行服务
原因：

- Python 生态适合复杂 AI 工作流、图像处理、多模态和视频处理。
- FastAPI 不应持有用户、订单、积分和任务主状态。
- 未来通过 AI Provider Adapter 接入，不影响主业务边界。
