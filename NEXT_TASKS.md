# NEXT_TASKS.md

## P0 GitHub 两级整合

目标：把本地已完成成果安全同步到 GitHub，并建立可审查、可回退的主线历史。

1. 提交本次中文交接文档。
2. 推送 `feature/local-mobile-mvp` 当前领先远端的 2 个提交。
3. 推送 `account-owner-migration`。
4. 创建并审查 `account-owner-migration -> feature/local-mobile-mvp` PR。
5. 第一层 PR 使用普通 merge，保留账号模块详细提交。
6. 合并后对主工作区做包含未跟踪文件的安全 stash。
7. `pull --ff-only` 更新主工作区，并重新运行测试和构建。
8. 创建 `feature/local-mobile-mvp -> main` PR。
9. 第二层 PR 使用 squash merge，形成完整图片营销 MVP 里程碑。
10. `main` 验证完成且用户确认后，再删除 stash、账号工作树和本地账号分支。

禁止使用 `git reset --hard`，禁止 force push。

## P0 图片上传稳定性真实链路验收

目标：自动化已经完成，接下来只产生一次真实 APIMart 费用完成链路收口。

验收标准：

- 上传小于等于 10 MiB 且最长边小于等于 4096px 的普通 JPEG，确认保留原文件并记录 `processing=original`。
- 上传超过 10 MiB 或最长边超过 4096px 的普通图片，确认浏览器等比处理后满足最终限制。
- 上传真实 HEIC/HEIF，确认浏览器优先转换或服务端兜底对用户无感。
- 只对一个处理完成的参考图执行一次真实 APIMart 生成，核对 COS 中转、provider 调用和安全摘要日志。
- 不在自动化测试中调用真实 APIMart；不在文档、日志或提交中写入密钥、密码、连接串、完整 base64 或完整签名 URL。

## P0 生图安全审核错误体验

目标：把 APIMart 安全拒绝与普通网络、服务错误区分开。

验收标准：

- 服务端识别上游 `HTTP 400` 与 `rejected by the safety system`。
- 对前端返回可理解的安全审核提示，不暴露上游敏感响应。
- 提示用户分别尝试中性提示词、普通参考图和纯文生图。
- 不把安全审核拒绝误报为数据库或账号故障。
- 增加 provider、service 和 UI 错误映射测试。

## P1 图片资产对象存储长期化

- `ImageAsset` 保存对象存储 key、MIME、大小和 hash。
- 只长期保存处理后的最终图，不恢复保存上传原图。
- 旧 base64 数据仍可兼容读取。
- COS 未配置时提供本地开发 fallback。
- 迁移不破坏历史结果。

## P1 模板版本与归属

- Template 增加创建者归属。
- 用户只能编辑自己创建的模板，管理员可管理全部模板。
- 内部 prompt 有版本记录。
- PromptLog 关联模板版本。

## P1 认证产品化

- 邮箱验证和找回密码。
- session 管理和主动下线。
- 登录失败限流。
- 更细的角色与权限边界。

## 暂不进行

- 支付、积分、订单。
- 正式模板市场。
- 团队空间。
- 真实视频生成。
- NestJS 迁移。
- 复杂手动海报编辑器。
