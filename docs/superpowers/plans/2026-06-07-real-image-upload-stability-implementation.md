# 真实图片上传稳定性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为自由生图和模板生图增加 10 MiB / 4096px 图片边界、普通图片无损直通与自动压缩、HEIC/HEIF 浏览器优先和服务端兜底转换，以及不可绕过的服务端强校验。

**Architecture:** 新增独立 `image-upload` 功能域：浏览器负责普通图片检查、缩放、压缩和 HEIC 优先转换；专用 Node Route Handler 只负责 HEIC/HEIF 服务端兜底；生成服务在保存数据库和上传 COS 前用 `sharp` 做最终字节、签名、格式和尺寸校验。两个页面共享一个有明确状态的 `ImageUploader`，现有 APIMart、Ark、COS 和数据库业务流程保持不变。

**Tech Stack:** Next.js 15 App Router、React 18、TypeScript、Vitest、Playwright、Canvas / `createImageBitmap`、`heic-to@1.5.2`、`heic-convert@2.1.0`、`@types/heic-convert@2.1.1`、`sharp@0.34.5`

---

## 依赖参考

- `heic-to` 浏览器 CSP 入口与 `heicTo()` API：https://github.com/hoppergee/heic-to
- `heic-convert` Node buffer 转换 API：https://github.com/catdad-experiments/heic-convert
- `sharp` 输入限制、metadata、rotate、resize 和输出编码：https://sharp.pixelplumbing.com/
- Next.js Route Handlers 与 `request.formData()`：https://nextjs.org/docs/app/getting-started/route-handlers

## 实施前提

- 从最新 `origin/main` 创建隔离工作树执行，不在当前主工作区直接改代码。
- 使用 `superpowers:using-git-worktrees` 创建工作树，分支继续使用 `image-upload-stability`；若该分支已绑定主工作区，先在用户确认后调整工作树归属，不删除已有安全 stash。
- 所有自动化生图使用 `GENERATION_PROVIDER=mock`，只有最终人工验收调用一次真实 APIMart。
- 现有 `.env`、`.env.local`、数据库密码、API Key、COS 密钥和代理凭据不得进入 Git。

## 文件职责

### 新增生产文件

- `apps/web/src/features/image-upload/image-types.ts`
  - 统一格式、限制、处理结果和错误码类型。
- `apps/web/src/features/image-upload/image-errors.ts`
  - `ImageProcessingError`、中文消息和 HTTP 状态映射。
- `apps/web/src/features/image-upload/image-signature.ts`
  - 根据文件签名识别 JPEG、PNG、WebP、HEIC/HEIF。
- `apps/web/src/features/image-upload/browser-image-codec.ts`
  - 封装 `createImageBitmap`、Canvas 编码和 Data URL 转换。
- `apps/web/src/features/image-upload/browser-image-processor.ts`
  - 普通 JPEG/PNG/WebP 原样直通、等比缩放和体积压缩。
- `apps/web/src/features/image-upload/heic-client-converter.ts`
  - 使用 `heic-to/csp` 在浏览器转换 HEIC/HEIF。
- `apps/web/src/features/image-upload/image-processing-client.ts`
  - 编排普通图片、客户端 HEIC 和服务端 HEIC 兜底。
- `apps/web/src/features/image-upload/server/heic-converter.ts`
  - 使用 `heic-convert` 解码，再用 `sharp` 自动旋转、限制尺寸、压缩为 JPEG并移除元数据。
- `apps/web/src/features/image-upload/server/validate-generation-image.ts`
  - 生成服务保存前的强校验。
- `apps/web/src/app/api/image-processing/convert/route.ts`
  - HEIC/HEIF multipart 兜底端点。

### 修改生产文件

- `apps/web/package.json`
- `apps/web/package-lock.json`
- `apps/web/next.config.ts`
- `apps/web/src/components/ImageUploader.tsx`
- `apps/web/src/app/image/page.tsx`
- `apps/web/src/app/templates/image/[id]/TemplateImageClient.tsx`
- `apps/web/src/app/api/generation-tasks/route.ts`
- `apps/web/src/app/api/templates/[id]/generation-tasks/route.ts`
- `apps/web/src/features/generation/server/generation-service.ts`

### 新增或修改测试

- `apps/web/tests/image-signature.test.ts`
- `apps/web/tests/browser-image-processor.test.ts`
- `apps/web/tests/image-processing-client.test.ts`
- `apps/web/tests/heic-converter.test.ts`
- `apps/web/tests/image-processing-api.test.ts`
- `apps/web/tests/validate-generation-image.test.ts`
- `apps/web/tests/image-uploader.test.tsx`
- `apps/web/tests/test-image-fixtures.ts`
- `apps/web/tests/generation-service.test.ts`
- `apps/web/tests/request-owner-api.test.ts`
- `apps/web/tests/templates-api.test.ts`
- `apps/web/e2e/mobile-image-flow.spec.ts`

### 完成时更新文档

- `CURRENT_STATUS.md`
- `NEXT_TASKS.md`
- `ARCHITECTURE.md`
- `DECISIONS.md`

---

### Task 1: 锁定图片处理依赖和服务端运行边界

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/package-lock.json`
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: 安装锁定版本**

Run:

```powershell
npm.cmd install heic-to@1.5.2 heic-convert@2.1.0 sharp@0.34.5
npm.cmd install --save-dev @types/heic-convert@2.1.1
```

Expected: `package.json` 增加三个运行依赖和一个开发类型依赖，`npm install` 退出码为 0。

- [ ] **Step 2: 明确 Node-only 包不进入客户端 bundle**

修改 `apps/web/next.config.ts`：

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['heic-convert', 'sharp'],
};

export default nextConfig;
```

`heic-to/csp` 只允许从带 `'use client'` 的模块动态导入；`heic-convert` 和 `sharp` 只允许从 `server/` 或 Route Handler 导入。

- [ ] **Step 3: 验证依赖解析**

Run:

```powershell
npm.cmd ls heic-to heic-convert sharp @types/heic-convert
npx.cmd tsc --noEmit
```

Expected: 四个包版本分别为 `1.5.2`、`2.1.0`、`0.34.5`、`2.1.1`；TypeScript 不出现模块缺失错误。

- [ ] **Step 4: 提交**

```powershell
git add apps/web/package.json apps/web/package-lock.json apps/web/next.config.ts
git commit -m "build: add image processing dependencies"
```

---

### Task 2: 建立限制、错误模型和文件签名识别

**Files:**
- Create: `apps/web/src/features/image-upload/image-types.ts`
- Create: `apps/web/src/features/image-upload/image-errors.ts`
- Create: `apps/web/src/features/image-upload/image-signature.ts`
- Create: `apps/web/tests/image-signature.test.ts`

- [ ] **Step 1: 写签名识别失败测试**

创建 `apps/web/tests/image-signature.test.ts`：

```ts
import { detectImageMime } from '../src/features/image-upload/image-signature';

describe('detectImageMime', () => {
  it.each([
    [Uint8Array.from([0xff, 0xd8, 0xff, 0xdb]), 'image/jpeg'],
    [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'],
    [new TextEncoder().encode('RIFFxxxxWEBP'), 'image/webp'],
    [Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]), 'image/heic'],
    [Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31]), 'image/heif'],
  ] as const)('recognizes a supported signature', (bytes, expected) => {
    expect(detectImageMime(bytes)).toBe(expected);
  });

  it('does not treat AVIF or arbitrary bytes as HEIF', () => {
    expect(detectImageMime(new TextEncoder().encode('\0\0\0\u0018ftypavif'))).toBeNull();
    expect(detectImageMime(Uint8Array.from([1, 2, 3, 4]))).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
npx.cmd vitest run tests/image-signature.test.ts
```

Expected: FAIL，原因是 `image-signature` 模块不存在。

- [ ] **Step 3: 添加统一类型和限制**

创建 `apps/web/src/features/image-upload/image-types.ts`：

```ts
export const MAX_FINAL_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_FINAL_IMAGE_EDGE = 4096;
export const MAX_FINAL_IMAGE_PIXELS = MAX_FINAL_IMAGE_EDGE * MAX_FINAL_IMAGE_EDGE;
export const MAX_HEIC_SOURCE_BYTES = 40 * 1024 * 1024;

export type FinalImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type UploadImageMime = FinalImageMime | 'image/heic' | 'image/heif';
export type ImageProcessingMode =
  | 'original'
  | 'client-resized'
  | 'client-compressed'
  | 'client-heic-converted'
  | 'server-heic-converted';

export type ProcessedUploadImage = {
  dataUrl: string;
  mimeType: FinalImageMime;
  bytes: number;
  width: number;
  height: number;
  processing: ImageProcessingMode;
};

export type ImageProcessingErrorCode =
  | 'IMAGE_INVALID'
  | 'IMAGE_UNSUPPORTED_FORMAT'
  | 'IMAGE_INPUT_TOO_LARGE'
  | 'IMAGE_DIMENSIONS_TOO_LARGE'
  | 'IMAGE_PROCESSING_FAILED'
  | 'IMAGE_OUTPUT_TOO_LARGE'
  | 'IMAGE_PROCESSING_UNAVAILABLE';
```

- [ ] **Step 4: 添加错误模型**

创建 `apps/web/src/features/image-upload/image-errors.ts`：

```ts
import type { ImageProcessingErrorCode } from './image-types';

const messages: Record<ImageProcessingErrorCode, string> = {
  IMAGE_INVALID: '无法读取该图片，文件可能已损坏',
  IMAGE_UNSUPPORTED_FORMAT: '暂不支持该图片格式，请选择 JPEG、PNG、WebP、HEIC 或 HEIF',
  IMAGE_INPUT_TOO_LARGE: '原始图片过大，请选择小于 40 MB 的图片',
  IMAGE_DIMENSIONS_TOO_LARGE: '图片尺寸过大，无法安全处理',
  IMAGE_PROCESSING_FAILED: '图片处理失败，请重新选择一张图片',
  IMAGE_OUTPUT_TOO_LARGE: '图片处理后仍超过 10 MB，请选择体积较小的图片',
  IMAGE_PROCESSING_UNAVAILABLE: '图片处理暂时不可用，请稍后重试',
};

export class ImageProcessingError extends Error {
  constructor(
    public readonly code: ImageProcessingErrorCode,
    public readonly status: number,
    options?: { cause?: unknown },
  ) {
    super(messages[code], options);
    this.name = 'ImageProcessingError';
  }
}

export function isImageProcessingErrorCode(value: unknown): value is ImageProcessingErrorCode {
  return typeof value === 'string' && value in messages;
}

export function imageErrorPayload(error: unknown, fallbackStatus = 500) {
  if (error instanceof ImageProcessingError) {
    return { status: error.status, body: { code: error.code, message: error.message } };
  }
  return {
    status: fallbackStatus,
    body: {
      code: 'IMAGE_PROCESSING_UNAVAILABLE' as const,
      message: messages.IMAGE_PROCESSING_UNAVAILABLE,
    },
  };
}
```

- [ ] **Step 5: 实现签名识别**

创建 `apps/web/src/features/image-upload/image-signature.ts`，只读取前 16 字节：

```ts
import type { UploadImageMime } from './image-types';

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx']);
const HEIF_BRANDS = new Set(['mif1', 'msf1']);

export function detectImageMime(bytes: Uint8Array): UploadImageMime | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (matches(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  if (ascii(bytes, 4, 4) !== 'ftyp') return null;

  const brand = ascii(bytes, 8, 4);
  if (HEIC_BRANDS.has(brand)) return 'image/heic';
  if (HEIF_BRANDS.has(brand)) return 'image/heif';
  return null;
}

function matches(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
```

- [ ] **Step 6: 运行测试**

Run:

```powershell
npx.cmd vitest run tests/image-signature.test.ts
```

Expected: 6 个案例全部通过。

- [ ] **Step 7: 提交**

```powershell
git add apps/web/src/features/image-upload apps/web/tests/image-signature.test.ts
git commit -m "feat: define image upload limits and signatures"
```

---

### Task 3: 实现普通图片原样直通、等比缩放和压缩

**Files:**
- Create: `apps/web/src/features/image-upload/browser-image-codec.ts`
- Create: `apps/web/src/features/image-upload/browser-image-processor.ts`
- Create: `apps/web/tests/browser-image-processor.test.ts`

- [ ] **Step 1: 写纯编排失败测试**

测试通过注入 codec，不在 Node Vitest 中直接依赖真实 Canvas：

```ts
import { processBrowserImage } from '../src/features/image-upload/browser-image-processor';

const smallJpeg = new File([new Uint8Array(1024)], 'small.jpg', { type: 'image/jpeg' });

it('keeps a compliant JPEG byte-for-byte', async () => {
  const codec = {
    inspect: vi.fn(async () => ({ width: 1200, height: 800 })),
    encode: vi.fn(),
    toDataUrl: vi.fn(async () => 'data:image/jpeg;base64,b3JpZ2luYWw='),
  };

  const result = await processBrowserImage(smallJpeg, 'image/jpeg', codec);

  expect(result.processing).toBe('original');
  expect(result.bytes).toBe(smallJpeg.size);
  expect(codec.encode).not.toHaveBeenCalled();
});

it('resizes a 6000px image without cropping', async () => {
  const output = new Blob([new Uint8Array(2 * 1024 * 1024)], { type: 'image/jpeg' });
  const codec = {
    inspect: vi.fn(async () => ({ width: 6000, height: 3000 })),
    encode: vi.fn(async () => output),
    toDataUrl: vi.fn(async () => 'data:image/jpeg;base64,b3V0cHV0'),
  };

  const result = await processBrowserImage(smallJpeg, 'image/jpeg', codec);

  expect(codec.encode).toHaveBeenCalledWith(
    smallJpeg,
    expect.objectContaining({ width: 4096, height: 2048, mimeType: 'image/jpeg' }),
  );
  expect(result.processing).toBe('client-resized');
});

it('rejects when every compression attempt remains over 10 MiB', async () => {
  const huge = new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'image/jpeg' });
  const codec = {
    inspect: vi.fn(async () => ({ width: 4096, height: 4096 })),
    encode: vi.fn(async () => huge),
    toDataUrl: vi.fn(),
  };

  await expect(processBrowserImage(huge, 'image/jpeg', codec)).rejects.toMatchObject({
    code: 'IMAGE_OUTPUT_TOO_LARGE',
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
npx.cmd vitest run tests/browser-image-processor.test.ts
```

Expected: FAIL，两个生产模块尚不存在。

- [ ] **Step 3: 实现浏览器 codec**

`browser-image-codec.ts` 提供：

```ts
export type BrowserImageCodec = {
  inspect(file: Blob): Promise<{ width: number; height: number }>;
  encode(
    file: Blob,
    options: { width: number; height: number; mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; quality: number },
  ): Promise<Blob>;
  toDataUrl(file: Blob): Promise<string>;
};

export const browserImageCodec: BrowserImageCodec = {
  async inspect(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  },
  async encode(file, options) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const canvas = document.createElement('canvas');
      canvas.width = options.width;
      canvas.height = options.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('2D canvas unavailable');
      context.drawImage(bitmap, 0, 0, options.width, options.height);
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed'))),
          options.mimeType,
          options.mimeType === 'image/png' ? undefined : options.quality,
        );
      });
    } finally {
      bitmap.close();
    }
  },
  async toDataUrl(file) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
      reader.readAsDataURL(file);
    });
  },
};
```

- [ ] **Step 4: 实现压缩循环**

`browser-image-processor.ts` 要求：

- 先 `inspect`，同时满足 10 MiB 和 4096px 时直接 `toDataUrl(file)`。
- 初始目标尺寸为 `min(1, 4096 / max(width, height))`。
- JPEG/WebP 质量序列固定为 `[0.92, 0.86, 0.8, 0.72, 0.64, 0.56, 0.48]`。
- PNG 使用无损编码；若仍超限，将宽高乘 `0.9` 后重试。
- 所有格式在质量序列耗尽后，每轮把宽高乘 `0.9`，最长 12 轮。
- 每轮保持 `targetWidth / targetHeight === sourceWidth / sourceHeight` 的四舍五入误差不超过 1px。
- 成功结果的 `processing`：仅尺寸变化为 `client-resized`，仅体积变化或二者同时变化为 `client-compressed`。
- 最终仍超限抛 `IMAGE_OUTPUT_TOO_LARGE`。

核心入口签名：

```ts
export async function processBrowserImage(
  file: Blob,
  mimeType: FinalImageMime,
  codec: BrowserImageCodec = browserImageCodec,
): Promise<ProcessedUploadImage>;
```

- [ ] **Step 5: 补齐透明 PNG和宽高比测试**

增加断言：

```ts
expect(codec.encode).toHaveBeenCalledWith(
  expect.any(Blob),
  expect.objectContaining({ mimeType: 'image/png' }),
);
expect(result.width / result.height).toBeCloseTo(sourceWidth / sourceHeight, 2);
```

测试必须确认 PNG 从未被传入 `image/jpeg`。

- [ ] **Step 6: 运行测试**

Run:

```powershell
npx.cmd vitest run tests/browser-image-processor.test.ts
```

Expected: 原样直通、尺寸压缩、体积压缩、透明 PNG和失败边界全部通过。

- [ ] **Step 7: 提交**

```powershell
git add apps/web/src/features/image-upload/browser-image-codec.ts apps/web/src/features/image-upload/browser-image-processor.ts apps/web/tests/browser-image-processor.test.ts
git commit -m "feat: preprocess standard images in browser"
```

---

### Task 4: 实现 HEIC/HEIF 浏览器优先与服务端兜底编排

**Files:**
- Create: `apps/web/src/features/image-upload/heic-client-converter.ts`
- Create: `apps/web/src/features/image-upload/image-processing-client.ts`
- Create: `apps/web/tests/image-processing-client.test.ts`

- [ ] **Step 1: 写双路径失败测试**

```ts
import { processUploadImage } from '../src/features/image-upload/image-processing-client';

it('uses browser HEIC conversion without calling the server', async () => {
  const jpeg = new Blob([new Uint8Array(100)], { type: 'image/jpeg' });
  const deps = {
    readSignature: vi.fn(async () => 'image/heic' as const),
    convertHeicInBrowser: vi.fn(async () => jpeg),
    convertHeicOnServer: vi.fn(),
    processBrowserImage: vi.fn(async () => ({
      dataUrl: 'data:image/jpeg;base64,abc',
      mimeType: 'image/jpeg' as const,
      bytes: 100,
      width: 100,
      height: 100,
      processing: 'client-compressed' as const,
    })),
  };

  const result = await processUploadImage(
    new File([new Uint8Array(100)], 'photo.heic', { type: 'image/heic' }),
    deps,
  );

  expect(result.processing).toBe('client-heic-converted');
  expect(deps.convertHeicOnServer).not.toHaveBeenCalled();
});

it('falls back to the server when browser HEIC conversion fails', async () => {
  const expected = {
    dataUrl: 'data:image/jpeg;base64,server',
    mimeType: 'image/jpeg' as const,
    bytes: 120,
    width: 1200,
    height: 900,
    processing: 'server-heic-converted' as const,
  };
  const deps = {
    readSignature: vi.fn(async () => 'image/heif' as const),
    convertHeicInBrowser: vi.fn(async () => {
      throw new Error('browser decoder unavailable');
    }),
    convertHeicOnServer: vi.fn(async () => expected),
    processBrowserImage: vi.fn(),
  };

  await expect(
    processUploadImage(new File([new Uint8Array(100)], 'photo.heif'), deps),
  ).resolves.toEqual(expected);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
npx.cmd vitest run tests/image-processing-client.test.ts
```

Expected: FAIL，客户端编排模块不存在。

- [ ] **Step 3: 实现浏览器 HEIC 转换器**

`heic-client-converter.ts`：

```ts
export async function convertHeicInBrowser(file: Blob): Promise<Blob> {
  const { heicTo } = await import('heic-to/csp');
  const converted = await heicTo({
    blob: file,
    type: 'image/jpeg',
    quality: 0.92,
  });
  if (!(converted instanceof Blob)) throw new Error('HEIC conversion returned no image');
  return converted;
}
```

禁止静态导入 `heic-to`，避免 Next 服务端构建尝试执行浏览器 WASM 路径。

- [ ] **Step 4: 实现服务端兜底客户端**

在 `image-processing-client.ts` 中：

```ts
export async function convertHeicOnServer(file: File, signal?: AbortSignal) {
  const formData = new FormData();
  formData.set('image', file);
  const response = await fetch('/api/image-processing/convert', {
    method: 'POST',
    body: formData,
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ImageProcessingError(
      isImageProcessingErrorCode(body.code) ? body.code : 'IMAGE_PROCESSING_UNAVAILABLE',
      response.status,
    );
  }
  return body.image as ProcessedUploadImage;
}
```

`processUploadImage(file, deps, signal)` 必须：

1. 读取前 16 字节并用 `detectImageMime` 判断真实格式。
2. 拒绝 GIF、SVG、AVIF 和随机字节。
3. 普通格式调用 `processBrowserImage`。
4. HEIC/HEIF 先调用 `convertHeicInBrowser`，成功后将 JPEG 送入 `processBrowserImage`。
5. 浏览器转换失败后调用服务端。
6. `AbortError` 原样抛出，不触发服务端第二次请求。
7. 客户端成功转换后覆盖 `processing` 为 `client-heic-converted`。

- [ ] **Step 5: 补齐取消和伪造 MIME 测试**

测试：

- 文件名为 `.jpg`、MIME 为 JPEG，但签名为 HEIC时走 HEIC。
- 文件名为 `.heic`、MIME 为 HEIC，但签名为随机字节时返回 `IMAGE_UNSUPPORTED_FORMAT`。
- `AbortError` 不调用服务端。

- [ ] **Step 6: 运行测试**

Run:

```powershell
npx.cmd vitest run tests/image-processing-client.test.ts
```

Expected: 普通格式、客户端 HEIC、服务端兜底、取消和伪造格式全部通过。

- [ ] **Step 7: 提交**

```powershell
git add apps/web/src/features/image-upload/heic-client-converter.ts apps/web/src/features/image-upload/image-processing-client.ts apps/web/tests/image-processing-client.test.ts
git commit -m "feat: add transparent HEIC client fallback"
```

---

### Task 5: 实现服务端 HEIC/HEIF 转换器与 API

**Files:**
- Create: `apps/web/src/features/image-upload/server/heic-converter.ts`
- Create: `apps/web/src/app/api/image-processing/convert/route.ts`
- Create: `apps/web/tests/heic-converter.test.ts`
- Create: `apps/web/tests/image-processing-api.test.ts`

- [ ] **Step 1: 写转换器失败测试**

转换器接收可注入依赖，单元测试不依赖真实 HEIC 二进制：

```ts
it('converts HEIC to a metadata-free JPEG within both limits', async () => {
  const decodeHeic = vi.fn(async () => Buffer.from('decoded-jpeg'));
  const normalizeJpeg = vi.fn(async () => ({
    buffer: Buffer.alloc(200),
    width: 2048,
    height: 1536,
  }));

  const result = await convertHeicBuffer({
    input: Buffer.from('\0\0\0\u0018ftypheic'),
    decodeHeic,
    normalizeJpeg,
  });

  expect(result.mimeType).toBe('image/jpeg');
  expect(result.bytes).toBe(200);
  expect(result.processing).toBe('server-heic-converted');
});
```

另外覆盖：输入超过 40 MiB、非 HEIC 签名、输出超过 10 MiB、输出最长边超过 4096px。

- [ ] **Step 2: 运行转换器测试确认失败**

Run:

```powershell
npx.cmd vitest run tests/heic-converter.test.ts
```

Expected: FAIL，转换器不存在。

- [ ] **Step 3: 实现服务端转换器**

`heic-converter.ts`：

```ts
import convert from 'heic-convert';
import sharp from 'sharp';

export async function decodeHeic(input: Buffer) {
  return Buffer.from(await convert({ buffer: input, format: 'JPEG', quality: 0.92 }));
}

export async function normalizeJpeg(input: Buffer) {
  let quality = 90;
  let maxEdge = 4096;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, info } = await sharp(input, {
      failOn: 'error',
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    if (data.length <= MAX_FINAL_IMAGE_BYTES) {
      return { buffer: data, width: info.width, height: info.height };
    }
    if (quality > 50) quality -= 8;
    else maxEdge = Math.max(512, Math.round(maxEdge * 0.9));
  }
  throw new ImageProcessingError('IMAGE_OUTPUT_TOO_LARGE', 422);
}
```

不要调用 `.withMetadata()`，以移除 GPS、设备型号等 EXIF。

- [ ] **Step 4: 写 Route Handler 失败测试**

`image-processing-api.test.ts` mock `convertHeicBuffer`，覆盖：

- 缺少 `image` 返回 400 / `IMAGE_INVALID`。
- 多文件或非 `File` 返回 400。
- `Content-Length > 40 MiB` 在 `request.formData()` 前返回 413。
- 转换成功返回 `{ image: ProcessedUploadImage }`。
- `ImageProcessingError` 保留 code、message 和 status。
- 未知异常返回 503 / `IMAGE_PROCESSING_UNAVAILABLE`。

- [ ] **Step 5: 实现 Route Handler**

`apps/web/src/app/api/image-processing/convert/route.ts`：

```ts
import { NextResponse } from 'next/server';
import { imageErrorPayload, ImageProcessingError } from '@/features/image-upload/image-errors';
import { MAX_HEIC_SOURCE_BYTES } from '@/features/image-upload/image-types';
import { convertHeicBuffer } from '@/features/image-upload/server/heic-converter';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_HEIC_SOURCE_BYTES) {
      throw new ImageProcessingError('IMAGE_INPUT_TOO_LARGE', 413);
    }
    const formData = await request.formData();
    const entries = formData.getAll('image');
    if (entries.length !== 1 || !(entries[0] instanceof File)) {
      throw new ImageProcessingError('IMAGE_INVALID', 400);
    }
    const file = entries[0];
    if (file.size > MAX_HEIC_SOURCE_BYTES) {
      throw new ImageProcessingError('IMAGE_INPUT_TOO_LARGE', 413);
    }
    const image = await convertHeicBuffer({ input: Buffer.from(await file.arrayBuffer()) });
    return NextResponse.json({ image });
  } catch (error) {
    const payload = imageErrorPayload(error, 503);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}
```

- [ ] **Step 6: 运行服务端测试**

Run:

```powershell
npx.cmd vitest run tests/heic-converter.test.ts tests/image-processing-api.test.ts
```

Expected: 转换器和 API 全部通过，日志和响应中不包含输入 buffer。

- [ ] **Step 7: 提交**

```powershell
git add apps/web/src/features/image-upload/server/heic-converter.ts apps/web/src/app/api/image-processing/convert/route.ts apps/web/tests/heic-converter.test.ts apps/web/tests/image-processing-api.test.ts
git commit -m "feat: add server HEIC conversion fallback"
```

---

### Task 6: 增加生成服务不可绕过的图片强校验

**Files:**
- Create: `apps/web/src/features/image-upload/server/validate-generation-image.ts`
- Create: `apps/web/tests/validate-generation-image.test.ts`
- Create: `apps/web/tests/test-image-fixtures.ts`
- Modify: `apps/web/src/features/generation/server/generation-service.ts`
- Modify: `apps/web/tests/generation-service.test.ts`

- [ ] **Step 1: 建立真实微型图片 fixture**

`test-image-fixtures.ts` 使用固定有效的 1x1 PNG/JPEG Data URL：

```ts
export const tinyPngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
```

用 `sharp` 在测试内生成超尺寸和超体积图片，不提交大型二进制 fixture。

- [ ] **Step 2: 写强校验失败测试**

覆盖：

```ts
await expect(validateGenerationImageDataUrl(tinyPngDataUrl)).resolves.toMatchObject({
  mimeType: 'image/png',
  width: 1,
  height: 1,
});

await expect(validateGenerationImageDataUrl('data:image/png;base64,aW52YWxpZA=='))
  .rejects.toMatchObject({ code: 'IMAGE_INVALID' });

await expect(validateGenerationImageDataUrl('data:image/heic;base64,AAAA'))
  .rejects.toMatchObject({ code: 'IMAGE_UNSUPPORTED_FORMAT' });
```

另外用 mock 或 `sharp` buffer 覆盖：

- 实际签名 JPEG但声明 PNG。
- 实际字节超过 10 MiB。
- 宽或高超过 4096px。
- 像素总量超过 `4096 * 4096`。

- [ ] **Step 3: 运行测试确认失败**

Run:

```powershell
npx.cmd vitest run tests/validate-generation-image.test.ts
```

Expected: FAIL，校验模块不存在。

- [ ] **Step 4: 实现强校验**

`validate-generation-image.ts`：

```ts
import sharp from 'sharp';

export async function validateGenerationImageDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new ImageProcessingError('IMAGE_INVALID', 400);

  const declaredMime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) throw new ImageProcessingError('IMAGE_INVALID', 400);
  if (buffer.length > MAX_FINAL_IMAGE_BYTES) {
    throw new ImageProcessingError('IMAGE_OUTPUT_TOO_LARGE', 413);
  }

  const detectedMime = detectImageMime(buffer.subarray(0, 16));
  if (!detectedMime || !['image/jpeg', 'image/png', 'image/webp'].includes(detectedMime)) {
    throw new ImageProcessingError('IMAGE_UNSUPPORTED_FORMAT', 415);
  }
  if (declaredMime !== detectedMime) throw new ImageProcessingError('IMAGE_INVALID', 400);

  const metadata = await sharp(buffer, {
    failOn: 'error',
    limitInputPixels: MAX_FINAL_IMAGE_PIXELS,
  }).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) throw new ImageProcessingError('IMAGE_INVALID', 400);
  if (
    Math.max(width, height) > MAX_FINAL_IMAGE_EDGE ||
    width * height > MAX_FINAL_IMAGE_PIXELS
  ) {
    throw new ImageProcessingError('IMAGE_DIMENSIONS_TOO_LARGE', 422);
  }
  return { mimeType: detectedMime as FinalImageMime, buffer, width, height };
}
```

捕获 `sharp` 解码异常并映射为 `IMAGE_INVALID`，不能把底层 decoder 错误直接返回客户端。

- [ ] **Step 5: 在保存前接入生成服务**

在 `generation-service.ts` 的 `toImageAsset()` 之前：

```ts
let uploadedImageAsset: ImageAssetRecord | null = null;
if (input.request.uploadedImageDataUrl) {
  const validated = await validateGenerationImageDataUrl(input.request.uploadedImageDataUrl);
  uploadedImageAsset = {
    id: makeId('asset'),
    ownerId: input.ownerId,
    kind: 'uploaded_image',
    mimeType: validated.mimeType,
    base64: validated.buffer.toString('base64'),
  };
  await store.saveImageAsset(uploadedImageAsset);
  logger.step('generation.uploaded_image.saved', {
    image: {
      ...summarizeImageDataUrl(input.request.uploadedImageDataUrl),
      width: validated.width,
      height: validated.height,
    },
  });
}
```

删除或缩小原 `toImageAsset()`，避免未校验路径继续存在。

- [ ] **Step 6: 修复旧测试中的伪造 Data URL**

将 `generation-service.test.ts` 中的：

```ts
'data:image/png;base64,input'
'data:image/jpeg;base64,input'
```

替换为 `tinyPngDataUrl`。Provider 断言同步使用该 fixture。

新增测试确认校验失败时：

- `store.saveImageAsset` 未调用。
- `imagePublisher.publish` 未调用。
- provider 未调用。
- 错误码为 `IMAGE_INVALID` 或对应边界码。

- [ ] **Step 7: 运行测试**

Run:

```powershell
npx.cmd vitest run tests/validate-generation-image.test.ts tests/generation-service.test.ts
```

Expected: 强校验测试和生成服务测试全部通过。

- [ ] **Step 8: 提交**

```powershell
git add apps/web/src/features/image-upload/server/validate-generation-image.ts apps/web/src/features/generation/server/generation-service.ts apps/web/tests/test-image-fixtures.ts apps/web/tests/validate-generation-image.test.ts apps/web/tests/generation-service.test.ts
git commit -m "feat: validate input images before persistence"
```

---

### Task 7: 为两个生成 API 映射稳定图片错误

**Files:**
- Modify: `apps/web/src/app/api/generation-tasks/route.ts`
- Modify: `apps/web/src/app/api/templates/[id]/generation-tasks/route.ts`
- Modify: `apps/web/tests/request-owner-api.test.ts`
- Modify: `apps/web/tests/templates-api.test.ts`

- [ ] **Step 1: 写 API 错误映射失败测试**

让 mock generation service 抛出：

```ts
new ImageProcessingError('IMAGE_OUTPUT_TOO_LARGE', 413)
```

断言两个 API 都返回：

```ts
expect(response.status).toBe(413);
expect(await response.json()).toEqual({
  code: 'IMAGE_OUTPUT_TOO_LARGE',
  message: '图片处理后仍超过 10 MB，请选择体积较小的图片',
});
```

未知错误仍保持当前通用 500 文案。

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
npx.cmd vitest run tests/request-owner-api.test.ts tests/templates-api.test.ts
```

Expected: 新增断言 FAIL，当前路由把图片错误包装成 500。

- [ ] **Step 3: 修改两个路由**

两个 catch 块优先调用：

```ts
if (error instanceof ImageProcessingError) {
  const payload = imageErrorPayload(error);
  return NextResponse.json(payload.body, { status: payload.status });
}
```

保留原有非图片错误处理，不改变登录、owner 和模板不存在状态。

- [ ] **Step 4: 运行测试**

Run:

```powershell
npx.cmd vitest run tests/request-owner-api.test.ts tests/templates-api.test.ts
```

Expected: 两个 API 套件全部通过。

- [ ] **Step 5: 提交**

```powershell
git add apps/web/src/app/api/generation-tasks/route.ts apps/web/src/app/api/templates/[id]/generation-tasks/route.ts apps/web/tests/request-owner-api.test.ts apps/web/tests/templates-api.test.ts
git commit -m "fix: return stable image validation errors"
```

---

### Task 8: 将共享上传组件改为状态化处理器

**Files:**
- Modify: `apps/web/src/components/ImageUploader.tsx`
- Create: `apps/web/tests/image-uploader.test.tsx`
- Modify: `apps/web/vitest.config.ts`

- [ ] **Step 1: 为组件测试启用单文件 jsdom**

在 `image-uploader.test.tsx` 顶部使用：

```ts
// @vitest-environment jsdom
```

安装测试所需包：

```powershell
npm.cmd install --save-dev jsdom@26.1.0 @testing-library/react@16.3.0 @testing-library/user-event@14.6.1
```

不把整个 Vitest 环境改成 jsdom，现有服务端测试继续使用 Node。

同时修改 `apps/web/vitest.config.ts` 的 include，使 `.tsx` 测试会被发现：

```ts
include: ['tests/**/*.test.{ts,tsx}'],
```

- [ ] **Step 2: 写组件状态失败测试**

mock `processUploadImage`，覆盖：

- 选择文件后显示“正在处理图片”。
- 处理中 input 和移除按钮不可操作。
- 成功后显示“上传成功”，预览 `object-contain`，调用 `onChange(image)`。
- 失败显示中文消息，不调用 `onChange`。
- 快速选择 A、B，A 后完成时不能覆盖 B。
- 卸载时 abort 当前处理。

组件 props 固定为：

```ts
type ImageUploaderProps = {
  image?: ProcessedUploadImage;
  onChange: (image?: ProcessedUploadImage) => void;
  onProcessingChange?: (processing: boolean) => void;
};
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```powershell
npx.cmd vitest run tests/image-uploader.test.tsx
```

Expected: FAIL，现组件仍直接使用 `FileReader` 和字符串回调。

- [ ] **Step 4: 实现状态化组件**

关键实现：

```tsx
const [status, setStatus] = useState<'idle' | 'processing' | 'ready' | 'error'>(
  image ? 'ready' : 'idle',
);
const [error, setError] = useState<string | null>(null);
const requestIdRef = useRef(0);
const abortRef = useRef<AbortController | null>(null);

async function handleFile(file: File) {
  const requestId = ++requestIdRef.current;
  abortRef.current?.abort();
  const controller = new AbortController();
  abortRef.current = controller;
  setStatus('processing');
  setError(null);
  onProcessingChange?.(true);
  try {
    const nextImage = await processUploadImage(file, undefined, controller.signal);
    if (requestId !== requestIdRef.current) return;
    onChange(nextImage);
    setStatus('ready');
  } catch (processingError) {
    if (controller.signal.aborted || requestId !== requestIdRef.current) return;
    setStatus('error');
    setError(
      processingError instanceof Error
        ? processingError.message
        : '图片处理失败，请重新选择一张图片',
    );
  } finally {
    if (requestId === requestIdRef.current) onProcessingChange?.(false);
  }
}
```

预览改为：

```tsx
<img
  src={image.dataUrl}
  alt="已上传图片预览"
  className="aspect-[4/3] w-full rounded-lg bg-canvas object-contain"
/>
```

input 的 accept 明确为：

```text
image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif
```

- [ ] **Step 5: 运行组件测试**

Run:

```powershell
npx.cmd vitest run tests/image-uploader.test.tsx
```

Expected: 状态、竞态、取消、错误和完整预览测试全部通过。

- [ ] **Step 6: 提交**

```powershell
git add apps/web/package.json apps/web/package-lock.json apps/web/vitest.config.ts apps/web/src/components/ImageUploader.tsx apps/web/tests/image-uploader.test.tsx
git commit -m "feat: add stateful image upload processing"
```

---

### Task 9: 接入自由生图页和模板生图页

**Files:**
- Modify: `apps/web/src/app/image/page.tsx`
- Modify: `apps/web/src/app/templates/image/[id]/TemplateImageClient.tsx`

- [ ] **Step 1: 将页面状态改为处理结果对象**

两个页面统一：

```ts
const [uploadedImage, setUploadedImage] = useState<ProcessedUploadImage | undefined>();
const [imageProcessing, setImageProcessing] = useState(false);
const uploadedImageDataUrl = uploadedImage?.dataUrl;
```

上传成功日志增加非敏感信息：

```ts
logFrontendEvent('frontend.image.uploaded', {
  image: summarizeImageDataUrl(image.dataUrl),
  width: image.width,
  height: image.height,
  processing: image.processing,
  source: 'free', // 模板页使用 'template'
});
```

- [ ] **Step 2: 禁止处理期间生成**

自由生图：

```tsx
<ChatComposer
  value={requestText}
  loading={loading || imageProcessing}
  onChange={setRequestText}
  onSubmit={handleSubmit}
/>
```

`handleSubmit()` 开头增加：

```ts
if (imageProcessing) {
  setError('图片仍在处理中，请稍候');
  return;
}
```

模板页按钮：

```tsx
disabled={loading || imageProcessing || !uploadedImage}
```

按钮文案：

```tsx
{imageProcessing ? '正在处理图片...' : loading ? '生成中...' : '生成模板图片'}
```

- [ ] **Step 3: 接入共享组件**

两个页面：

```tsx
<ImageUploader
  image={uploadedImage}
  onChange={handleUploadedImageChange}
  onProcessingChange={setImageProcessing}
/>
```

成功生成后清理 `setUploadedImage(undefined)`；会话切换、删除和重置逻辑同步改名，不改变历史任务中已经保存的 `uploadedImageDataUrl`。

- [ ] **Step 4: 修复缩略图语义**

模板页和 `QuickActionBar` 的小缩略图可以继续 `object-cover`，因为它只是状态图标；上传面板的大预览必须 `object-contain`。

- [ ] **Step 5: 运行相关测试和 TypeScript**

Run:

```powershell
npx.cmd tsc --noEmit
npx.cmd vitest run tests/image-uploader.test.tsx tests/image-processing-client.test.ts
```

Expected: 无类型错误，页面传参与组件类型一致。

- [ ] **Step 6: 提交**

```powershell
git add apps/web/src/app/image/page.tsx apps/web/src/app/templates/image/[id]/TemplateImageClient.tsx
git commit -m "feat: integrate stable uploads into image flows"
```

---

### Task 10: 增加移动端 E2E 与服务端隐私断言

**Files:**
- Modify: `apps/web/e2e/mobile-image-flow.spec.ts`
- Modify: `apps/web/tests/run-logger.test.ts`
- Modify: `apps/web/tests/generation-service.test.ts`

- [ ] **Step 1: 增加大图处理 UI E2E**

为测试避免提交十几 MB fixture，使用 `page.addInitScript` 或 route mock 控制处理耗时，并上传可生成的小 PNG。验证：

```ts
await page.getByRole('button', { name: /上传图片/ }).click();
await page.locator('input[type="file"]').setInputFiles({
  name: 'large-product.png',
  mimeType: 'image/png',
  buffer: tinyPng,
});
await expect(page.getByText('正在处理图片')).toBeVisible();
await expect(page.getByRole('button', { name: '发送' })).toBeDisabled();
await expect(page.getByText('上传成功')).toBeVisible();
```

通过测试专用依赖注入或浏览器 mock 延迟处理函数，禁止在生产代码加入 `E2E_*` 分支。

- [ ] **Step 2: 增加 HEIC 双路径 E2E**

使用一个小型 MIT 许可 HEIC fixture，来源固定为 `heic-convert` 仓库的测试图片，并在 `apps/web/e2e/fixtures/NOTICE.md` 记录来源 URL、提交 SHA 和许可。

两个场景：

1. 正常浏览器转换后显示 JPEG 预览并能 mock 生成。
2. 用 `page.route('/api/image-processing/convert')` 返回 `server-heic-converted` 结果，模拟客户端转换不可用后服务端兜底。

若 Chromium 环境下 WASM 客户端转换不稳定，第一条测试下沉为浏览器组件集成测试；E2E 至少保留服务端兜底与完整用户流程。

- [ ] **Step 3: 增加失败恢复和布局 E2E**

验证：

- 处理 API 返回 `IMAGE_PROCESSING_FAILED` 时展示中文错误。
- 错误后可以选择新图片并成功。
- iPhone 13 viewport 中上传状态、预览、移除按钮和底部“完成”按钮不重叠。
- 大预览 `object-fit` 为 `contain`。

- [ ] **Step 4: 增加日志隐私断言**

在单元测试中确认序列化日志不包含：

```ts
expect(JSON.stringify(logger.steps)).not.toContain('data:image/');
expect(JSON.stringify(logger.steps)).not.toContain(tinyPngDataUrl.split(',')[1]);
expect(JSON.stringify(logger.steps)).not.toContain('GPS');
```

只允许 `mimeType`、`bytes`、`width`、`height`、`processing` 和 hash。

- [ ] **Step 5: 运行 mock E2E**

Run:

```powershell
$env:GENERATION_PROVIDER='mock'
npx.cmd playwright test e2e/mobile-image-flow.spec.ts --reporter=list --workers=1
```

Expected: 现有 14 条 E2E 与新增图片处理场景全部通过；日志中没有真实模型请求。

- [ ] **Step 6: 提交**

```powershell
git add apps/web/e2e apps/web/tests/run-logger.test.ts apps/web/tests/generation-service.test.ts
git commit -m "test: cover stable mobile image uploads"
```

---

### Task 11: 全量验证、真实链路人工验收与中文文档更新

**Files:**
- Modify: `CURRENT_STATUS.md`
- Modify: `NEXT_TASKS.md`
- Modify: `ARCHITECTURE.md`
- Modify: `DECISIONS.md`

- [ ] **Step 1: 运行全量单元测试**

Run:

```powershell
npm.cmd test
```

Expected: 现有 32 个测试文件、165 条测试继续通过，新增测试全部通过；不得减少旧测试数量。

- [ ] **Step 2: 运行生产构建**

Run:

```powershell
npx.cmd prisma generate
npm.cmd run build
```

Expected: Prisma Client 生成成功；Next.js 编译、类型检查、静态页面生成全部通过；客户端 bundle 不包含 `heic-convert` 或 `sharp`。

- [ ] **Step 3: 运行全量 mock E2E**

Run:

```powershell
$env:GENERATION_PROVIDER='mock'
npm.cmd run e2e
```

Expected: 全部通过，不产生 APIMart 费用。

- [ ] **Step 4: 验证忽略文件和敏感信息**

Run:

```powershell
git check-ignore -v apps/web/.env apps/web/.env.local
git diff origin/main...HEAD -- . ':!apps/web/package-lock.json' | Select-String -Pattern 'API_KEY|SECRET_KEY|DATABASE_URL|200519|BEGIN PRIVATE KEY'
```

Expected: `.env` 和 `.env.local` 均被忽略；差异中只有环境变量名称或示例，不包含真实值。

- [ ] **Step 5: 人工真实链路验收一次**

使用本机忽略的 `.env.local` 启动服务，依次上传：

1. 小于 10 MiB、最长边小于 4096px 的普通 JPEG，确认日志为 `processing=original`。
2. 大于 10 MiB 或最长边大于 4096px 的图片，确认输出不超过限制。
3. iPhone HEIC/HEIF，确认用户无需手工转换。

只对一个处理完成的参考图点击真实生成一次。服务端日志必须显示：

- 最终 MIME 为 JPEG、PNG 或 WebP。
- 最终字节不超过 10 MiB。
- 最长边不超过 4096px。
- 上传来源为腾讯 COS。
- provider 为 `APIMartImageProvider`。
- 不出现完整 base64。

- [ ] **Step 6: 更新中文项目文档**

更新内容：

- `CURRENT_STATUS.md`：记录功能完成状态、最终测试数量和真实验收结果。
- `NEXT_TASKS.md`：移除“上传图片压缩与大小限制”P0，保留“图片对象存储长期化”和“安全审核错误体验”。
- `ARCHITECTURE.md`：增加浏览器预处理、HEIC 服务端兜底和生成服务强校验的数据流。
- `DECISIONS.md`：记录 10 MiB、4096px、不保留原图、HEIC 双重保障和不做主体识别的决定。

不得把真实环境配置写进文档。

- [ ] **Step 7: 最终提交**

```powershell
git add CURRENT_STATUS.md NEXT_TASKS.md ARCHITECTURE.md DECISIONS.md
git commit -m "docs: record stable image upload pipeline"
```

- [ ] **Step 8: 最终状态检查**

Run:

```powershell
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: 工作区干净；提交历史按依赖、普通图片、HEIC、服务端校验、UI、E2E、文档分层清晰。

---

## 实施完成后的审查门槛

- 使用 `superpowers:requesting-code-review` 做规格符合性和代码质量两阶段审查。
- P0 问题全部修复后重新运行受影响测试，不接受“已有测试之前通过”作为最终证据。
- 使用 `superpowers:verification-before-completion` 重新确认测试、构建、mock E2E、敏感信息扫描和 Git 状态。
- 先推送 `image-upload-stability` 并创建 PR 到 `main`；不 force push。
- PR 合并和 `main` 验证前，不删除分支、工作树或此前保留的安全 stash。
