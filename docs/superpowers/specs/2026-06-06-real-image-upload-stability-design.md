# 真实图片上传稳定性设计

## 背景

当前图片生成链路允许用户在自由生图页和图片模板页上传参考图。`ImageUploader` 会直接把浏览器选中的文件读取为 Data URL，随后生成 API 将完整 base64 放入 JSON 请求。生成服务会先把图片保存到 `ImageAsset`，再上传腾讯云 COS，最后把可访问 URL 交给 APIMart。

最近一次真实图生图使用了约 37.8 MB 的 PNG。仅保存和上传参考图就耗时约 84 秒，同时给浏览器内存、JSON 解析、PostgreSQL、COS 上传和 APIMart 请求带来明显压力。

本阶段只解决真实参考图进入生图链路前的格式兼容、体积控制、尺寸控制和错误体验，不增加相机入口、素材库、原图保存或图片对象存储长期迁移。

## 目标

- 用户上传不超过 10 MB、最长边不超过 4096px 的 JPEG、PNG、WebP 时，保持原文件内容，不做压缩、转换或裁剪。
- 用户上传超过 10 MB或最长边超过 4096px 的图片时，自动降低体积并等比缩小，最终控制在 10 MB以内和最长边 4096px以内。
- 用户可以直接选择 HEIC/HEIF 文件，不需要自行转换。
- HEIC/HEIF 优先在浏览器无感转换为 JPEG；浏览器无法处理时，自动使用服务端转换。
- 保持完整构图、照片方向和宽高比，不识别、不裁剪、不抠取所谓“产品主体”。
- 不保留处理前原图。
- 客户端处理不能代替服务端校验；绕过前端的超限、损坏或伪造图片必须被服务端拒绝。
- 处理期间提供明确状态，避免重复选择、重复提交或在图片尚未可用时开始生成。
- APIMart 最终只接收 JPEG、PNG 或 WebP。

## 非目标

- 不增加调用手机相机的入口，但图片处理模块应能被未来的拍照上传复用。
- 不建设用户素材库，不提供原图下载和原图归档。
- 不把参考图长期存储从 PostgreSQL base64 迁移到 COS key；该工作仍属于后续独立阶段。
- 不做裁剪、抠图、主体检测、背景移除、局部重绘或人工画质增强。
- 不改变 APIMart、Ark 文案模型、COS 签名 URL 和生成任务的业务流程。
- 不处理视频、GIF 动图或 SVG。

## 核心规则

### 支持格式

用户选择层支持：

- JPEG：`image/jpeg`
- PNG：`image/png`
- WebP：`image/webp`
- HEIC/HEIF：浏览器可能报告 `image/heic`、`image/heif` 或空 MIME，因此还需要结合扩展名和文件签名识别

进入现有生成任务和 APIMart 前，最终格式只能是 JPEG、PNG 或 WebP。HEIC/HEIF 必须先转换为 JPEG。

### 体积与尺寸

- 最终文件硬上限：10 MiB，即 `10 * 1024 * 1024` 字节。
- 最终最长边硬上限：4096px。
- JPEG、PNG、WebP 同时满足两个限制时，直接使用原文件，字节内容不变。
- 任一限制超出时，保持宽高比等比缩小，并按格式进行有损或无损压缩。
- 处理结果仍不满足限制时，不进入生成链路。
- 服务端兜底处理的原始请求设置独立安全上限，建议第一版为 40 MiB，避免异常文件耗尽服务端内存；该上限不改变用户看到的 10 MiB 最终文件规则。

### 构图与画质

- 不裁剪任何边缘。
- 不改变横竖方向。
- 根据图片方向信息输出用户肉眼看到的正确方向。
- PNG 存在透明通道时保留 PNG 和透明通道，不强制转为 JPEG。
- JPEG、WebP 在需要压缩时采用逐级质量调整；仅当质量调整不足时继续降低分辨率。
- 不对图片内容作“哪个物体是产品”的判断。

### 原图生命周期

- 普通格式在浏览器完成处理后，只把最终文件送入现有生成链路。
- HEIC/HEIF 浏览器转换成功时，不上传原始 HEIC/HEIF。
- HEIC/HEIF 需要服务端兜底时，原文件只在该次处理请求中存在，不写入 Prisma、不上传 COS、不进入日志。
- 服务端只返回转换后的最终图片；前端状态中不长期保留处理前原图。

## 推荐架构

采用“浏览器预处理 + 服务端 HEIC 兜底 + 生成服务强校验”三层结构。

### 1. 客户端图片处理模块

新增独立模块，例如：

```text
src/features/image-upload/
  image-types.ts
  image-inspection.ts
  browser-image-processor.ts
  heic-client-converter.ts
  image-processing-client.ts
```

职责：

- 根据 MIME、扩展名和可用文件签名判断候选格式。
- 读取图片宽高和方向。
- 判断是否可以原样使用。
- 对超限 JPEG、PNG、WebP 等比缩放和压缩。
- 尝试在浏览器转换 HEIC/HEIF。
- 浏览器无法处理 HEIC/HEIF 时调用服务端兜底 API。
- 返回统一的 `ProcessedUploadImage`，供自由生图页和模板生图页共同使用。

建议数据结构：

```ts
type ProcessedUploadImage = {
  dataUrl: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  bytes: number;
  width: number;
  height: number;
  processing:
    | 'original'
    | 'client-resized'
    | 'client-compressed'
    | 'client-heic-converted'
    | 'server-heic-converted';
};
```

`ImageUploader` 不负责具体编解码算法，只负责文件选择、处理状态、预览、移除和错误展示。两个页面继续共享同一个上传组件，避免规则分叉。

### 2. 服务端 HEIC/HEIF 兜底 API

新增专用端点：

```text
POST /api/image-processing/convert
Content-Type: multipart/form-data
```

仅接受客户端无法处理的 HEIC/HEIF，不作为普通 JPEG、PNG、WebP 的常规上传通道。

处理步骤：

1. 限制请求为单文件并检查原始请求字节数。
2. 使用文件签名识别真实格式，不信任扩展名和浏览器 MIME。
3. 解码 HEIC/HEIF并修正方向。
4. 转换为 JPEG。
5. 按 10 MiB 和 4096px规则逐级压缩。
6. 对输出再次解码检查，确认 MIME、字节数、宽高和有效性。
7. 返回转换结果及非敏感元数据。

响应建议使用 JSON Data URL，以兼容现有 `uploadedImageDataUrl` 链路。第一版不引入临时对象存储，也不持久化原始 HEIC/HEIF。

服务端转换器封装为接口，具体解码依赖在实施计划阶段通过 Windows、本地 Next.js 和生产目标环境的兼容性验证后确定，不能只依据浏览器声明 MIME。

### 3. 生成服务强校验

新增服务端校验模块，例如：

```text
src/features/image-upload/server/validate-generation-image.ts
```

在 `generation-service.ts` 调用 `toImageAsset()`、保存 `ImageAsset` 和上传 COS 之前执行。校验内容：

- Data URL 结构有效。
- base64 可解码，估算值与实际字节数一致。
- 文件签名与声明 MIME 一致。
- 最终格式为 JPEG、PNG 或 WebP。
- 实际字节数不超过 10 MiB。
- 图片可解码，最长边不超过 4096px。
- 宽高、像素总量和解码资源消耗在安全范围内。

自由生成 API 和模板生成 API 都通过同一个生成服务进入该校验，不在两个路由中复制规则。

服务端返回稳定错误码和中文消息，前端不依赖上游异常文本判断错误类型。

## 数据流

### 普通图片且未超限

```text
选择 JPEG/PNG/WebP
  -> 客户端识别和读取尺寸
  -> <=10 MiB 且最长边 <=4096px
  -> 原文件转 Data URL
  -> 用户确认生成
  -> 生成服务强校验
  -> 保存最终参考图
  -> 上传 COS
  -> APIMart
```

原文件在此路径上不经过重新编码。

### 普通图片超限

```text
选择 JPEG/PNG/WebP
  -> 客户端识别和读取尺寸
  -> 等比缩放/压缩
  -> 输出再次检查
  -> 合格后转 Data URL
  -> 生成服务强校验
  -> 保存最终参考图并上传 COS
  -> APIMart
```

### HEIC/HEIF 浏览器转换成功

```text
选择 HEIC/HEIF
  -> 浏览器无感转 JPEG并修正方向
  -> 执行 10 MiB / 4096px规则
  -> 生成服务强校验
  -> 保存转换后 JPEG并上传 COS
  -> APIMart
```

### HEIC/HEIF 浏览器转换失败

```text
选择 HEIC/HEIF
  -> 客户端转换不可用或失败
  -> multipart 上传服务端兜底 API
  -> 服务端转 JPEG并修正方向
  -> 执行 10 MiB / 4096px规则
  -> 返回转换后 Data URL
  -> 生成服务强校验
  -> 保存转换后 JPEG并上传 COS
  -> APIMart
```

## UI 状态与交互

`ImageUploader` 增加明确状态：

- `idle`：未选择图片。
- `processing`：正在识别、转换或压缩。
- `ready`：处理完成，可以预览和生成。
- `error`：处理失败，保留重新选择入口。

交互规则：

- 处理期间显示“正在处理图片”。
- 处理期间禁用文件选择、移除操作和页面生成按钮。
- 完成后才调用页面的 `onChange`，避免半成品 Data URL 进入状态。
- 预览使用完整图片语义，不能通过 `object-cover` 裁掉边缘；显示容器可以留白，但必须让用户看到完整构图。
- 新文件选择成功后替换旧图；新文件处理失败时不把失败文件写入生成状态。
- 页面离开或重新选择时取消仍可取消的处理，并忽略过期异步结果。

建议中文错误：

- 转换失败：`图片处理失败，请重新选择一张图片`
- 处理后仍超限：`图片处理后仍超过 10 MB，请选择体积较小的图片`
- 文件损坏：`无法读取该图片，文件可能已损坏`
- 不支持或伪造格式：`暂不支持该图片格式，请选择 JPEG、PNG、WebP、HEIC 或 HEIF`
- 服务端繁忙：`图片处理暂时不可用，请稍后重试`

## 错误边界

错误至少分为：

- `IMAGE_INVALID`
- `IMAGE_UNSUPPORTED_FORMAT`
- `IMAGE_INPUT_TOO_LARGE`
- `IMAGE_DIMENSIONS_TOO_LARGE`
- `IMAGE_PROCESSING_FAILED`
- `IMAGE_OUTPUT_TOO_LARGE`
- `IMAGE_PROCESSING_UNAVAILABLE`

图片处理错误使用 `4xx`；服务端转换依赖不可用或内部处理异常使用 `5xx`。生成 API 不应把这些错误包装成数据库故障、账号故障或 APIMart 安全审核错误。

APIMart 的 safety rejection 属于图片已经成功处理并发送上游后的另一类错误，继续使用独立错误映射。

## 日志与隐私

允许记录：

- 输入候选格式和最终格式
- 输入与输出字节数
- 输入与输出宽高
- 处理路径
- 处理耗时
- 失败错误码
- 已有的脱敏图片 hash

禁止记录：

- 原始图片内容
- 完整 Data URL 或 base64
- HEIC/HEIF 原文件
- EXIF 中的 GPS、设备身份或其他隐私元数据

转换后的输出应移除不参与生成的 EXIF 元数据。

## 测试设计

### 客户端单元测试

- 9 MB JPEG、普通分辨率：返回 `original`，文件字节保持一致。
- 12 MB JPEG：压缩至不超过 10 MiB。
- 5 MB、6000px 图片：等比缩小至最长边 4096px。
- 同时超体积和超尺寸：一次处理后满足两个限制。
- PNG 透明图：透明通道保留，不强制转 JPEG。
- 横图、竖图和带方向信息的照片：方向与宽高比正确。
- HEIC/HEIF 浏览器转换成功：返回 JPEG，不调用服务端。
- HEIC/HEIF 浏览器转换不可用：自动调用服务端兜底。
- 处理后仍超限：返回稳定错误，不产生可生成图片。
- 用户连续选择两张图片：较早任务完成后不能覆盖较新结果。

### API 与服务端测试

- 服务端兜底 API 只接受单个 HEIC/HEIF。
- MIME、扩展名和文件签名冲突时按真实签名处理或拒绝。
- 损坏图片和随机字节被拒绝。
- 原始兜底请求超过安全上限时在解码前拒绝。
- HEIC/HEIF 输出为合法 JPEG，且满足 10 MiB / 4096px规则。
- 转换失败不保存文件、不写数据库、不上传 COS。
- 生成服务拒绝超过 10 MiB 的伪造 Data URL。
- 生成服务拒绝最长边超过 4096px 的绕过请求。
- 生成服务拒绝 HEIC/HEIF、GIF、SVG 等非最终允许格式。
- 自由生图和模板生图复用同一套校验。
- 日志只包含摘要，不包含 base64 或 EXIF 隐私数据。

### E2E

- 普通小图直接预览并可生成。
- 大图选择后显示“正在处理图片”，完成前生成按钮不可用。
- 大图处理完成后显示完整构图预览，并可使用 mock provider 完成生成。
- HEIC/HEIF 客户端转换路径可完成上传。
- 模拟客户端 HEIC 转换失败后，服务端兜底路径可完成上传。
- 处理失败显示中文提示，可以重新选择。
- 手机尺寸下底部上传面板、状态文字和按钮不重叠。

自动化 E2E 使用 mock provider，不产生真实模型费用。真实 APIMart 只执行一次人工验收，确认最终 COS 图片可被上游读取。

## 验收标准

- 不超过 10 MiB、最长边不超过 4096px 的 JPEG、PNG、WebP 不重新编码。
- 超限普通图片可以自动处理到限制内，完整构图与宽高比保持不变。
- 用户可直接选择 HEIC/HEIF；客户端失败时自动转服务端处理，用户不需要手工转换。
- 最终送入生成服务和 APIMart 的参考图仅为 JPEG、PNG 或 WebP。
- 处理前原图不进入数据库、COS 和日志。
- 服务端无法被绕过前端限制。
- 处理期间不会重复提交，处理结果不会因异步竞态错配。
- 所有新增单元测试、API 测试、mock E2E 和生产构建通过。

## 后续兼容

未来增加相机拍照入口时，拍照得到的 `File` 直接进入同一个客户端图片处理模块，不新增第二套压缩逻辑。

未来进行图片对象存储长期化时，可把 `ProcessedUploadImage` 的最终文件直接上传 COS，并让生成请求只携带资产 ID；本设计不阻碍该迁移。
