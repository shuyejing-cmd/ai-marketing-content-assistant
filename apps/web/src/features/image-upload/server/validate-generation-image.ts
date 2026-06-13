import sharp from 'sharp';
import { ImageProcessingError } from '../image-errors';
import { detectImageMime, MAX_IMAGE_SIGNATURE_BYTES } from '../image-signature';
import {
  MAX_FINAL_IMAGE_BYTES,
  MAX_FINAL_IMAGE_EDGE,
  MAX_FINAL_IMAGE_PIXELS,
  type FinalImageMime,
} from '../image-types';

type ValidatedGenerationImage = {
  mimeType: FinalImageMime;
  buffer: Buffer;
  width: number;
  height: number;
};

const DATA_URL_PATTERN =
  /^data:([a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*);base64,([A-Za-z0-9+/]+={0,2})$/;

export async function validateGenerationImageDataUrl(
  dataUrl: string,
): Promise<ValidatedGenerationImage> {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) throw invalidImage();

  const declaredMime = match[1];
  const encoded = match[2];
  if (encoded.length % 4 !== 0) throw invalidImage();
  const decodedBytes = decodedBase64Bytes(encoded);
  if (decodedBytes === 0) throw invalidImage();
  if (decodedBytes > MAX_FINAL_IMAGE_BYTES) {
    throw new ImageProcessingError('IMAGE_OUTPUT_TOO_LARGE', 413);
  }

  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length !== decodedBytes || buffer.toString('base64') !== encoded) {
    throw invalidImage();
  }

  const detectedMime = detectImageMime(buffer.subarray(0, MAX_IMAGE_SIGNATURE_BYTES));
  if (detectedMime === 'image/heic' || detectedMime === 'image/heif') {
    throw new ImageProcessingError('IMAGE_UNSUPPORTED_FORMAT', 415);
  }
  if (detectedMime === null) {
    if (isFinalImageMime(declaredMime)) throw invalidImage();
    throw new ImageProcessingError('IMAGE_UNSUPPORTED_FORMAT', 415);
  }
  if (declaredMime !== detectedMime) throw invalidImage();

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: MAX_FINAL_IMAGE_PIXELS,
    }).metadata();
  } catch (error) {
    if (isPixelLimitError(error)) {
      throw new ImageProcessingError('IMAGE_DIMENSIONS_TOO_LARGE', 422);
    }
    throw invalidImage(error);
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw invalidImage();
  }
  if (
    Math.max(width, height) > MAX_FINAL_IMAGE_EDGE ||
    width * height > MAX_FINAL_IMAGE_PIXELS
  ) {
    throw new ImageProcessingError('IMAGE_DIMENSIONS_TOO_LARGE', 422);
  }

  try {
    await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: MAX_FINAL_IMAGE_PIXELS,
    })
      .stats();
  } catch (error) {
    throw invalidImage(error);
  }

  return { mimeType: detectedMime, buffer, width, height };
}

function isFinalImageMime(value: unknown): value is FinalImageMime {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp';
}

function decodedBase64Bytes(encoded: string) {
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  return (encoded.length / 4) * 3 - padding;
}

function isPixelLimitError(error: unknown) {
  return error instanceof Error && /pixel limit/i.test(error.message);
}

function invalidImage(cause?: unknown) {
  return new ImageProcessingError('IMAGE_INVALID', 400, cause === undefined ? undefined : { cause });
}
