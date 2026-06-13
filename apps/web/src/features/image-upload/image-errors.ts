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
  return typeof value === 'string' && Object.hasOwn(messages, value);
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
