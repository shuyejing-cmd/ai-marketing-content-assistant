import 'server-only';

import { once } from 'node:events';
import Busboy from 'busboy';
import libheif from 'libheif-js/wasm-bundle';
import sharp from 'sharp';
import { ImageProcessingError } from '../image-errors';
import { detectImageMime, MAX_IMAGE_SIGNATURE_BYTES } from '../image-signature';
import {
  MAX_FINAL_IMAGE_BYTES,
  MAX_FINAL_IMAGE_EDGE,
  MAX_FINAL_IMAGE_PIXELS,
  MAX_HEIC_SOURCE_BYTES,
  type ProcessedUploadImage,
} from '../image-types';

const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
const MAX_HEIC_REQUEST_BYTES =
  MAX_HEIC_SOURCE_BYTES + MAX_MULTIPART_OVERHEAD_BYTES;
const MAX_NORMALIZE_ATTEMPTS = 12;
const MIN_JPEG_QUALITY = 50;
const MIN_NORMALIZE_EDGE = 512;
const NORMALIZE_EDGE_FACTOR = 0.9;

type SharpOutput = {
  data: Buffer;
  info: {
    width: number;
    height: number;
  };
};

type SharpPipeline = {
  resize(options: {
    width: number;
    height: number;
    fit: 'inside';
    withoutEnlargement: true;
  }): SharpPipeline;
  jpeg(options: { quality: number; mozjpeg: true }): SharpPipeline;
  toBuffer(options: { resolveWithObject: true }): Promise<SharpOutput>;
};

export type SharpFactory = (
  input: Buffer,
  options: {
    raw: { width: number; height: number; channels: 4 };
    failOn: 'error';
    limitInputPixels: number;
  },
) => SharpPipeline;

export type RgbaImage = {
  data: Uint8Array;
  width: number;
  height: number;
};

type LibHeifImage = {
  get_width(): number;
  get_height(): number;
  display(
    target: RgbaImage,
    callback: (result: RgbaImage | null | undefined) => void,
  ): void;
  free(): void;
};

type LibHeifDecoder = {
  decode(input: Uint8Array): LibHeifImage[];
  decoder?: {
    delete?: () => void;
  };
};

export type LibHeifModule = {
  ready: Promise<unknown>;
  HeifDecoder: new () => LibHeifDecoder;
};

type ProcessingOperationOptions = {
  signal?: AbortSignal;
};

type DecodeHeic = (
  input: Buffer,
  options?: ProcessingOperationOptions,
) => Promise<RgbaImage>;
type NormalizeJpeg = (
  input: RgbaImage,
  options?: ProcessingOperationOptions,
) => Promise<SharpOutput>;

export type ConvertHeicBufferOptions = {
  input: Buffer;
  decodeHeic?: DecodeHeic;
  normalizeJpeg?: NormalizeJpeg;
  signal?: AbortSignal;
};

type AdmissionJob = {
  signal: AbortSignal;
  resolve: (release: () => void) => void;
  reject: (reason?: unknown) => void;
  onAbort: () => void;
};

export class ImageProcessingAdmission {
  private active = 0;
  private readonly waiting: AdmissionJob[] = [];

  constructor(
    private readonly maxActive = 1,
    private readonly maxWaiting = 4,
  ) {}

  acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) {
      return Promise.reject(abortReason(signal));
    }

    return new Promise((resolve, reject) => {
      const job: AdmissionJob = {
        signal,
        resolve,
        reject,
        onAbort: () => {
          const index = this.waiting.indexOf(job);
          if (index >= 0) {
            this.waiting.splice(index, 1);
          }
          reject(abortReason(signal));
        },
      };

      if (this.active < this.maxActive) {
        this.start(job);
        return;
      }
      if (this.waiting.length >= this.maxWaiting) {
        reject(new ImageProcessingError('IMAGE_PROCESSING_UNAVAILABLE', 503));
        return;
      }

      signal.addEventListener('abort', job.onAbort, { once: true });
      this.waiting.push(job);
    });
  }

  private start(job: AdmissionJob) {
    job.signal.removeEventListener('abort', job.onAbort);
    if (job.signal.aborted) {
      job.reject(abortReason(job.signal));
      this.promote();
      return;
    }

    this.active += 1;
    let released = false;
    job.resolve(() => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.promote();
    });
  }

  private promote() {
    while (this.active < this.maxActive) {
      const next = this.waiting.shift();
      if (!next) return;
      this.start(next);
    }
  }
}

export const imageProcessingAdmission = new ImageProcessingAdmission(1, 4);

const defaultSharpFactory: SharpFactory = (input, options) =>
  sharp(input, options);
const defaultLibHeif = libheif as LibHeifModule;

function processingFailure(cause: unknown) {
  return new ImageProcessingError('IMAGE_PROCESSING_FAILED', 422, { cause });
}

function invalidUpload() {
  return new ImageProcessingError('IMAGE_INVALID', 400);
}

function oversizedUpload() {
  return new ImageProcessingError('IMAGE_INPUT_TOO_LARGE', 413);
}

function abortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortReason(signal);
}

function awaitAbortable<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(abortReason(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function validDimensions(width: number, height: number) {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0
  );
}

export async function readSingleHeicUpload(
  request: Request,
  signal: AbortSignal = request.signal,
): Promise<Buffer> {
  if (!request.body) throw invalidUpload();
  throwIfAborted(signal);

  let parser: ReturnType<typeof Busboy>;
  try {
    parser = Busboy({
      headers: {
        'content-type': request.headers.get('content-type') ?? undefined,
      },
      limits: {
        files: 1,
        fields: 0,
        parts: 2,
        fileSize: MAX_HEIC_SOURCE_BYTES + 1,
      },
    });
  } catch {
    throw invalidUpload();
  }

  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let bodyBytes = 0;
  let fileBytes = 0;
  let fileCount = 0;
  let failure: unknown;
  let cancellation: Promise<void> | undefined;

  const stop = (reason: unknown) => {
    if (failure !== undefined) return;
    failure = reason;
    cancellation = reader.cancel(reason).catch(() => undefined);
    if (!parser.destroyed) parser.destroy();
  };

  parser.on('file', (fieldName, stream) => {
    fileCount += 1;
    if (fieldName !== 'image' || fileCount !== 1) {
      stop(invalidUpload());
    }
    stream.on('limit', () => stop(oversizedUpload()));
    stream.on('error', () => stop(invalidUpload()));
    stream.on('data', (chunk: Buffer) => {
      fileBytes += chunk.length;
      if (fileBytes > MAX_HEIC_SOURCE_BYTES) {
        stop(oversizedUpload());
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
  });
  parser.on('field', () => stop(invalidUpload()));
  parser.on('filesLimit', () => stop(invalidUpload()));
  parser.on('fieldsLimit', () => stop(invalidUpload()));
  parser.on('partsLimit', () => stop(invalidUpload()));
  parser.on('error', () => stop(invalidUpload()));

  const onAbort = () => stop(abortReason(signal));
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (failure !== undefined) throw failure;
      if (done) break;

      bodyBytes += value.byteLength;
      if (bodyBytes > MAX_HEIC_REQUEST_BYTES) {
        stop(oversizedUpload());
        throw failure;
      }

      const writable = parser.write(Buffer.from(value));
      if (failure !== undefined) throw failure;
      if (!writable) {
        await Promise.race([once(parser, 'drain'), once(parser, 'close')]);
        if (failure !== undefined) throw failure;
      }
    }

    parser.end();
    await once(parser, 'close');
    if (failure !== undefined) throw failure;
  } catch (error) {
    if (failure === undefined) {
      stop(signal.aborted ? abortReason(signal) : invalidUpload());
    }
    await cancellation;
    throw failure ?? error;
  } finally {
    signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }

  if (fileCount !== 1 || fileBytes === 0) throw invalidUpload();
  return Buffer.concat(chunks, fileBytes);
}

export async function decodeHeicToRgba(
  input: Buffer,
  module: LibHeifModule = defaultLibHeif,
  options: ProcessingOperationOptions = {},
): Promise<RgbaImage> {
  let decoder: LibHeifDecoder | undefined;
  let images: LibHeifImage[] = [];

  try {
    await awaitAbortable(module.ready, options.signal);
    throwIfAborted(options.signal);
    decoder = new module.HeifDecoder();
    // libheif decode is synchronous WASM and cannot be preempted on this thread.
    // The deadline is observed immediately before and after the call.
    images = decoder.decode(input);
    throwIfAborted(options.signal);
    const image = images[0];
    if (!image) {
      throw processingFailure(new Error('HEIC contains no image frames'));
    }

    const width = image.get_width();
    const height = image.get_height();
    if (!validDimensions(width, height)) {
      throw processingFailure(new Error('HEIC frame dimensions are invalid'));
    }
    if (
      width > MAX_FINAL_IMAGE_EDGE ||
      height > MAX_FINAL_IMAGE_EDGE ||
      width * height > MAX_FINAL_IMAGE_PIXELS
    ) {
      throw new ImageProcessingError('IMAGE_DIMENSIONS_TOO_LARGE', 422);
    }

    const target: RgbaImage = {
      data: new Uint8Array(width * height * 4),
      width,
      height,
    };
    let displayed: RgbaImage;
    try {
      // libheif display may retain and write through the WASM-backed image.
      // Once started it cannot be safely preempted; keep native resources and
      // the admission slot until the callback or synchronous throw completes.
      displayed = await displayHeifImage(image, target);
    } catch (error) {
      throwIfAborted(options.signal);
      throw error;
    }
    throwIfAborted(options.signal);

    if (
      displayed.width !== width ||
      displayed.height !== height ||
      displayed.data.length !== width * height * 4
    ) {
      throw processingFailure(new Error('HEIC decoder returned invalid RGBA data'));
    }
    return {
      data: new Uint8Array(
        displayed.data.buffer,
        displayed.data.byteOffset,
        displayed.data.byteLength,
      ),
      width,
      height,
    };
  } catch (error) {
    if (error instanceof ImageProcessingError) throw error;
    throw processingFailure(error);
  } finally {
    for (const image of images) {
      image.free();
    }
    decoder?.decoder?.delete?.();
  }
}

function displayHeifImage(
  image: LibHeifImage,
  target: RgbaImage,
): Promise<RgbaImage> {
  return new Promise<RgbaImage>((resolve, reject) => {
    let settled = false;
    const finish = (
      settle: (value: RgbaImage | PromiseLike<RgbaImage>) => void,
      value: RgbaImage,
    ) => {
      if (settled) return;
      settled = true;
      settle(value);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    try {
      image.display(target, (result) => {
        if (!result) {
          fail(new Error('HEIC display returned no data'));
          return;
        }
        finish(resolve, result);
      });
    } catch (error) {
      fail(error);
    }
  });
}

export async function normalizeRgbaToJpeg(
  input: RgbaImage,
  sharpFactory: SharpFactory = defaultSharpFactory,
  options: ProcessingOperationOptions = {},
): Promise<SharpOutput> {
  let quality = 90;
  let maxEdge = MAX_FINAL_IMAGE_EDGE;
  const buffer = Buffer.from(
    input.data.buffer,
    input.data.byteOffset,
    input.data.byteLength,
  );

  for (let attempt = 0; attempt < MAX_NORMALIZE_ATTEMPTS; attempt += 1) {
    throwIfAborted(options.signal);
    let output: SharpOutput;
    try {
      output = await sharpFactory(buffer, {
        raw: { width: input.width, height: input.height, channels: 4 },
        failOn: 'error',
        limitInputPixels: MAX_FINAL_IMAGE_PIXELS,
      })
        .resize({
          width: maxEdge,
          height: maxEdge,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      // Sharp/libvips work is not raced: the admission slot remains held until
      // the native operation settles, then the request deadline is observed.
      throwIfAborted(options.signal);
    } catch (error) {
      if (error instanceof ImageProcessingError) throw error;
      throw processingFailure(error);
    }

    if (output.data.length <= MAX_FINAL_IMAGE_BYTES) return output;
    if (quality > MIN_JPEG_QUALITY) {
      quality = Math.max(MIN_JPEG_QUALITY, quality - 8);
    } else {
      maxEdge = Math.max(
        MIN_NORMALIZE_EDGE,
        Math.floor(maxEdge * NORMALIZE_EDGE_FACTOR),
      );
    }
  }

  throw new ImageProcessingError('IMAGE_OUTPUT_TOO_LARGE', 422);
}

export async function convertHeicBuffer({
  input,
  decodeHeic = (source, options) =>
    decodeHeicToRgba(source, defaultLibHeif, options),
  normalizeJpeg = (source, options) =>
    normalizeRgbaToJpeg(source, defaultSharpFactory, options),
  signal,
}: ConvertHeicBufferOptions): Promise<ProcessedUploadImage> {
  throwIfAborted(signal);
  if (input.length === 0) throw invalidUpload();
  if (input.length > MAX_HEIC_SOURCE_BYTES) throw oversizedUpload();

  const mimeType = detectImageMime(input.subarray(0, MAX_IMAGE_SIGNATURE_BYTES));
  if (mimeType !== 'image/heic' && mimeType !== 'image/heif') {
    throw new ImageProcessingError('IMAGE_UNSUPPORTED_FORMAT', 415);
  }

  let decoded: RgbaImage;
  try {
    decoded = signal
      ? await decodeHeic(input, { signal })
      : await decodeHeic(input);
    throwIfAborted(signal);
  } catch (error) {
    if (error instanceof ImageProcessingError) throw error;
    throw processingFailure(error);
  }

  let output: SharpOutput;
  try {
    output = signal
      ? await normalizeJpeg(decoded, { signal })
      : await normalizeJpeg(decoded);
    throwIfAborted(signal);
  } catch (error) {
    if (error instanceof ImageProcessingError) throw error;
    throw processingFailure(error);
  }

  if (output.data.length === 0) {
    throw processingFailure(new Error('JPEG output is empty'));
  }
  if (output.data.length > MAX_FINAL_IMAGE_BYTES) {
    throw new ImageProcessingError('IMAGE_OUTPUT_TOO_LARGE', 422);
  }

  const { width, height } = output.info;
  if (!validDimensions(width, height)) {
    throw processingFailure(new Error('JPEG output dimensions are invalid'));
  }
  if (
    width > MAX_FINAL_IMAGE_EDGE ||
    height > MAX_FINAL_IMAGE_EDGE ||
    width * height > MAX_FINAL_IMAGE_PIXELS
  ) {
    throw new ImageProcessingError('IMAGE_DIMENSIONS_TOO_LARGE', 422);
  }
  if (
    detectImageMime(output.data.subarray(0, MAX_IMAGE_SIGNATURE_BYTES)) !==
    'image/jpeg'
  ) {
    throw processingFailure(new Error('Normalized output is not a JPEG'));
  }

  return {
    dataUrl: `data:image/jpeg;base64,${output.data.toString('base64')}`,
    mimeType: 'image/jpeg',
    bytes: output.data.length,
    width,
    height,
    processing: 'server-heic-converted',
  };
}
