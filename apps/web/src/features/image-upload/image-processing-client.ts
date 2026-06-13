import { browserImageCodec } from './browser-image-codec';
import { processBrowserImage as processBrowserImageDefault } from './browser-image-processor';
import {
  ImageProcessingError,
  isImageProcessingErrorCode,
} from './image-errors';
import { convertHeicInBrowser as convertHeicInBrowserDefault } from './heic-client-converter';
import { detectImageMime, readImageSignature } from './image-signature';
import {
  MAX_FINAL_IMAGE_BYTES,
  MAX_FINAL_IMAGE_EDGE,
  MAX_HEIC_SOURCE_BYTES,
  type FinalImageMime,
  type ProcessedUploadImage,
} from './image-types';

type DecodedImageDimensions = {
  width: number;
  height: number;
};

type InspectDecodedImage = (blob: Blob) => Promise<DecodedImageDimensions>;

export type ImageProcessingClientDeps = {
  readSignature(file: Blob): Promise<Uint8Array>;
  convertHeicInBrowser(file: Blob): Promise<Blob>;
  convertHeicOnServer(
    file: Blob,
    signal?: AbortSignal,
    inspectDecodedImage?: InspectDecodedImage,
  ): Promise<ProcessedUploadImage>;
  inspectDecodedImage: InspectDecodedImage;
  processBrowserImage(
    file: Blob,
    mimeType: FinalImageMime,
  ): Promise<ProcessedUploadImage>;
};

const defaultDeps: ImageProcessingClientDeps = {
  readSignature: readImageSignature,
  convertHeicInBrowser: convertHeicInBrowserDefault,
  convertHeicOnServer,
  inspectDecodedImage,
  processBrowserImage: processBrowserImageDefault,
};

export async function inspectDecodedImage(blob: Blob): Promise<DecodedImageDimensions> {
  const session = await browserImageCodec.open(blob);
  try {
    return {
      width: session.width,
      height: session.height,
    };
  } finally {
    session.close();
  }
}

export async function convertHeicOnServer(
  file: Blob,
  signal?: AbortSignal,
  inspect: InspectDecodedImage = inspectDecodedImage,
): Promise<ProcessedUploadImage> {
  throwIfAborted(signal);
  const formData = new FormData();
  formData.append('image', file);

  try {
    throwIfAborted(signal);
    const response = await fetch('/api/image-processing/convert', {
      method: 'POST',
      body: formData,
      signal,
    });
    throwIfAborted(signal);
    const body = await readJson(response, signal);
    throwIfAborted(signal);

    if (!response.ok) {
      const code = readErrorCode(body);
      if (code) {
        throw new ImageProcessingError(code, response.status);
      }
      throw unavailable();
    }

    const image = await readServerImage(body, inspect, signal);
    throwIfAborted(signal);
    if (!image) {
      throw unavailable();
    }
    return image;
  } catch (error) {
    throwIfAborted(signal);
    if (isAbortError(error) || error instanceof ImageProcessingError) {
      throw error;
    }
    throw unavailable(error);
  }
}

export async function processUploadImage(
  file: Blob,
  deps: ImageProcessingClientDeps = defaultDeps,
  signal?: AbortSignal,
): Promise<ProcessedUploadImage> {
  throwIfAborted(signal);
  if (file.size > MAX_HEIC_SOURCE_BYTES) {
    throw new ImageProcessingError('IMAGE_INPUT_TOO_LARGE', 413);
  }

  throwIfAborted(signal);
  const signature = await deps.readSignature(file);
  throwIfAborted(signal);
  const mimeType = detectImageMime(signature);
  if (!mimeType) {
    throw new ImageProcessingError('IMAGE_UNSUPPORTED_FORMAT', 415);
  }

  if (isFinalImageMime(mimeType)) {
    throwIfAborted(signal);
    const result = await deps.processBrowserImage(file, mimeType);
    throwIfAborted(signal);
    return result;
  }

  let converted: Blob;
  try {
    throwIfAborted(signal);
    converted = await deps.convertHeicInBrowser(file);
    throwIfAborted(signal);
    await assertClientJpeg(converted);
    throwIfAborted(signal);
    const dimensions = await deps.inspectDecodedImage(converted);
    throwIfAborted(signal);
    assertDecodedDimensions(dimensions);
  } catch (error) {
    throwIfAborted(signal);
    if (isAbortError(error)) {
      throw error;
    }
    throwIfAborted(signal);
    const serverResult = await deps.convertHeicOnServer(
      file,
      signal,
      deps.inspectDecodedImage,
    );
    throwIfAborted(signal);
    return serverResult;
  }

  throwIfAborted(signal);
  const result = await deps.processBrowserImage(converted, 'image/jpeg');
  throwIfAborted(signal);
  return {
    ...result,
    processing: 'client-heic-converted',
  };
}

async function assertClientJpeg(converted: Blob): Promise<void> {
  if (
    !(converted instanceof Blob) ||
    converted.size <= 0 ||
    (converted.type !== '' && converted.type !== 'image/jpeg')
  ) {
    throw new Error('Client HEIC conversion returned an invalid JPEG Blob');
  }

  const signature = await readImageSignature(converted);
  if (detectImageMime(signature) !== 'image/jpeg') {
    throw new Error('Client HEIC conversion returned invalid JPEG content');
  }
}

async function readJson(response: Response, signal?: AbortSignal): Promise<unknown> {
  throwIfAborted(signal);
  try {
    const body: unknown = await response.json();
    throwIfAborted(signal);
    return body;
  } catch {
    throwIfAborted(signal);
    return null;
  }
}

function readErrorCode(body: unknown) {
  if (!isRecord(body)) return null;
  return isImageProcessingErrorCode(body.code) ? body.code : null;
}

async function readServerImage(
  body: unknown,
  inspect: InspectDecodedImage,
  signal?: AbortSignal,
): Promise<ProcessedUploadImage | null> {
  if (!isRecord(body) || !isRecord(body.image)) return null;
  const image = body.image;
  const dataUrl = image.dataUrl;

  if (
    !isFinalImageMime(image.mimeType) ||
    typeof dataUrl !== 'string' ||
    !isPositiveInteger(image.bytes) ||
    image.bytes > MAX_FINAL_IMAGE_BYTES ||
    !isPositiveInteger(image.width) ||
    image.width > MAX_FINAL_IMAGE_EDGE ||
    !isPositiveInteger(image.height) ||
    image.height > MAX_FINAL_IMAGE_EDGE ||
    image.processing !== 'server-heic-converted'
  ) {
    return null;
  }

  const bytes = decodeImageDataUrl(dataUrl, image.mimeType);
  if (
    !bytes ||
    bytes.byteLength !== image.bytes ||
    detectImageMime(bytes.slice(0, 4096)) !== image.mimeType
  ) {
    return null;
  }

  const blob = new Blob([new Uint8Array(bytes)], { type: image.mimeType });
  throwIfAborted(signal);
  const dimensions = await inspect(blob);
  throwIfAborted(signal);
  if (
    !hasValidDecodedDimensions(dimensions) ||
    dimensions.width !== image.width ||
    dimensions.height !== image.height
  ) {
    return null;
  }

  return {
    mimeType: image.mimeType,
    dataUrl,
    bytes: image.bytes,
    width: image.width,
    height: image.height,
    processing: image.processing,
  };
}

function assertDecodedDimensions(dimensions: DecodedImageDimensions): void {
  if (!hasValidDecodedDimensions(dimensions)) {
    throw new Error('Decoded image dimensions are invalid');
  }
}

function hasValidDecodedDimensions(
  dimensions: DecodedImageDimensions,
): boolean {
  return (
    isPositiveInteger(dimensions.width) &&
    dimensions.width <= MAX_FINAL_IMAGE_EDGE &&
    isPositiveInteger(dimensions.height) &&
    dimensions.height <= MAX_FINAL_IMAGE_EDGE &&
    dimensions.width * dimensions.height <= 40_000_000
  );
}

function decodeImageDataUrl(
  value: unknown,
  mimeType: FinalImageMime,
): Uint8Array | null {
  if (typeof value !== 'string') return null;
  const prefix = `data:${mimeType};base64,`;
  if (!value.startsWith(prefix)) return null;

  const encoded = value.slice(prefix.length);
  if (
    encoded.length > Math.ceil(MAX_FINAL_IMAGE_BYTES / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  ) {
    return null;
  }

  try {
    const decoded = atob(encoded);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function isFinalImageMime(value: unknown): value is FinalImageMime {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp';
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === 'AbortError';
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason ?? new DOMException('Aborted', 'AbortError');
}

function unavailable(cause?: unknown): ImageProcessingError {
  return new ImageProcessingError('IMAGE_PROCESSING_UNAVAILABLE', 503, { cause });
}
