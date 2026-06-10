import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageProcessingError } from '../src/features/image-upload/image-errors';
import {
  MAX_FINAL_IMAGE_BYTES,
  MAX_FINAL_IMAGE_PIXELS,
  MAX_HEIC_SOURCE_BYTES,
} from '../src/features/image-upload/image-types';

vi.mock('server-only', () => ({}));

import {
  ImageProcessingAdmission,
  convertHeicBuffer,
  decodeHeicToRgba,
  normalizeRgbaToJpeg,
  type LibHeifModule,
  type RgbaImage,
  type SharpFactory,
} from '../src/features/image-upload/server/heic-converter';

afterEach(() => {
  vi.useRealTimers();
});

function heic(bytes = 32): Buffer {
  const input = Buffer.alloc(bytes);
  input.writeUInt32BE(24, 0);
  input.write('ftyp', 4, 'ascii');
  input.write('heic', 8, 'ascii');
  input.writeUInt32BE(0, 12);
  input.write('mif1', 16, 'ascii');
  input.write('heic', 20, 'ascii');
  return input;
}

function jpeg(bytes = 32): Buffer {
  const output = Buffer.alloc(bytes);
  output.set([0xff, 0xd8, 0xff, 0xe0]);
  return output;
}

function rgba(width = 4, height = 3): RgbaImage {
  return { data: new Uint8Array(width * height * 4), width, height };
}

function normalized(
  overrides: Partial<{
    data: Buffer;
    info: { width: number; height: number };
  }> = {},
) {
  return {
    data: jpeg(),
    info: { width: 1200, height: 800 },
    ...overrides,
  };
}

function libheifFixture(options: {
  images?: Array<{
    width?: number;
    height?: number;
    displayData?: RgbaImage | null;
    displayError?: Error;
    displayNeverReturns?: boolean;
  }>;
  decodeError?: Error;
} = {}) {
  const deleteDecoder = vi.fn();
  const displayCallbacks: Array<
    (result: RgbaImage | null | undefined) => void
  > = [];
  const images = (options.images ?? [{ width: 4, height: 3 }]).map((item) => {
    const width = item.width ?? 4;
    const height = item.height ?? 3;
    return {
      get_width: vi.fn(() => width),
      get_height: vi.fn(() => height),
      display: vi.fn(
        (
          target: RgbaImage,
          callback: (result: RgbaImage | null) => void,
        ) => {
          if (item.displayError) throw item.displayError;
          if (item.displayNeverReturns) {
            displayCallbacks.push(callback);
            return;
          }
          callback(
            item.displayData === undefined
              ? { ...target, data: new Uint8Array(target.data.length) }
              : item.displayData,
          );
        },
      ),
      free: vi.fn(),
    };
  });
  const decode = vi.fn(() => {
    if (options.decodeError) throw options.decodeError;
    return images;
  });
  const HeifDecoder = vi.fn(function HeifDecoder(this: {
    decode: typeof decode;
    decoder: { delete: typeof deleteDecoder };
  }) {
    this.decode = decode;
    this.decoder = { delete: deleteDecoder };
  });
  const module = {
    ready: Promise.resolve(),
    HeifDecoder,
  } as unknown as LibHeifModule;
  return {
    module,
    images,
    decode,
    deleteDecoder,
    HeifDecoder,
    displayCallbacks,
  };
}

describe('ImageProcessingAdmission', () => {
  it('allows one active job and four waiters, then rejects overflow', async () => {
    const admission = new ImageProcessingAdmission(1, 4);
    let first = await admission.acquire(new AbortController().signal);
    const waiters = Array.from({ length: 4 }, () =>
      admission.acquire(new AbortController().signal),
    );

    await expect(
      admission.acquire(new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'IMAGE_PROCESSING_UNAVAILABLE',
      status: 503,
    });

    for (const waiter of waiters) {
      first();
      const release = await waiter;
      first = release;
    }
    first();
  });

  it('removes an aborted waiter and never starts it', async () => {
    const admission = new ImageProcessingAdmission(1, 4);
    const releaseActive = await admission.acquire(new AbortController().signal);
    const aborted = new AbortController();
    const waiting = admission.acquire(aborted.signal);
    const next = admission.acquire(new AbortController().signal);

    aborted.abort(new DOMException('gone', 'AbortError'));
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });

    releaseActive();
    const releaseNext = await next;
    releaseNext();
  });

  it('checks abort again before promoting a waiter and releases idempotently', async () => {
    const admission = new ImageProcessingAdmission(1, 1);
    const releaseActive = await admission.acquire(new AbortController().signal);
    const controller = new AbortController();
    const waiting = admission.acquire(controller.signal);
    controller.abort(new DOMException('gone', 'AbortError'));

    releaseActive();
    releaseActive();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });

    const release = await admission.acquire(new AbortController().signal);
    release();
  });
});

describe('decodeHeicToRgba', () => {
  it('awaits ready, displays the first frame, and frees every image plus decoder', async () => {
    let markReady!: () => void;
    const fixture = libheifFixture({
      images: [{ width: 4, height: 3 }, { width: 2, height: 2 }],
    });
    fixture.module.ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });

    const pending = decodeHeicToRgba(heic(), fixture.module);
    expect(fixture.HeifDecoder).not.toHaveBeenCalled();
    markReady();

    await expect(pending).resolves.toEqual(rgba());
    expect(fixture.images[0]?.display).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 4,
        height: 3,
        data: expect.any(Uint8Array),
      }),
      expect.any(Function),
    );
    expect(fixture.images.every((image) => image.free.mock.calls.length === 1)).toBe(
      true,
    );
    expect(fixture.deleteDecoder).toHaveBeenCalledOnce();
  });

  it('deletes the decoder when decode throws', async () => {
    const fixture = libheifFixture({ decodeError: new Error('decode failed') });

    await expect(decodeHeicToRgba(heic(), fixture.module)).rejects.toMatchObject({
      code: 'IMAGE_PROCESSING_FAILED',
      status: 422,
    });
    expect(fixture.deleteDecoder).toHaveBeenCalledOnce();
  });

  it('deletes the decoder for an empty frame list', async () => {
    const fixture = libheifFixture({ images: [] });

    await expect(decodeHeicToRgba(heic(), fixture.module)).rejects.toMatchObject({
      code: 'IMAGE_PROCESSING_FAILED',
      status: 422,
    });
    expect(fixture.deleteDecoder).toHaveBeenCalledOnce();
  });

  it.each([
    { width: 4097, height: 1 },
    { width: 1, height: 4097 },
    { width: 4096, height: 4097 },
  ])('rejects unsafe dimensions before display %#', async ({ width, height }) => {
    const fixture = libheifFixture({ images: [{ width, height }] });

    await expect(decodeHeicToRgba(heic(), fixture.module)).rejects.toMatchObject({
      code: 'IMAGE_DIMENSIONS_TOO_LARGE',
      status: 422,
    });
    expect(fixture.images[0]?.display).not.toHaveBeenCalled();
    expect(fixture.images[0]?.free).toHaveBeenCalledOnce();
    expect(fixture.deleteDecoder).toHaveBeenCalledOnce();
  });

  it.each([
    { displayData: null, label: 'missing callback data' },
    {
      displayData: { data: new Uint8Array(47), width: 4, height: 3 },
      label: 'wrong RGBA length',
    },
    {
      displayData: { data: new Uint8Array(60), width: 5, height: 3 },
      label: 'wrong returned dimensions',
    },
  ])('rejects $label and frees native resources', async ({ displayData }) => {
    const fixture = libheifFixture({ images: [{ displayData }] });

    await expect(decodeHeicToRgba(heic(), fixture.module)).rejects.toMatchObject({
      code: 'IMAGE_PROCESSING_FAILED',
      status: 422,
    });
    expect(fixture.images[0]?.free).toHaveBeenCalledOnce();
    expect(fixture.deleteDecoder).toHaveBeenCalledOnce();
  });

  it('waits for a late display callback before observing abort and freeing native resources', async () => {
    const controller = new AbortController();
    const fixture = libheifFixture({
      images: [{ displayNeverReturns: true }],
    });

    const pending = decodeHeicToRgba(heic(), fixture.module, {
      signal: controller.signal,
    });
    let settled = false;
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'IMAGE_PROCESSING_UNAVAILABLE',
      status: 503,
    });
    void pending.catch(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(fixture.displayCallbacks).toHaveLength(1));
    controller.abort(
      new ImageProcessingError('IMAGE_PROCESSING_UNAVAILABLE', 503),
    );
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(fixture.images[0]?.free).not.toHaveBeenCalled();
    expect(fixture.deleteDecoder).not.toHaveBeenCalled();

    fixture.displayCallbacks[0]?.(rgba());

    await rejection;
    expect(fixture.images[0]?.free).toHaveBeenCalledOnce();
    expect(fixture.deleteDecoder).toHaveBeenCalledOnce();
  });
});

describe('normalizeRgbaToJpeg', () => {
  it('passes a zero-copy RGBA Buffer view and exact raw Sharp options', async () => {
    const input = rgba();
    const calls: Array<{ input: Buffer; options: unknown }> = [];
    const resize = vi.fn();
    const jpegEncode = vi.fn();
    const pipeline = {
      resize: vi.fn((options) => {
        resize(options);
        return pipeline;
      }),
      jpeg: vi.fn((options) => {
        jpegEncode(options);
        return pipeline;
      }),
      toBuffer: vi.fn(async () => normalized()),
    };
    const sharpFactory: SharpFactory = vi.fn((data, options) => {
      calls.push({ input: data, options });
      return pipeline;
    });

    await normalizeRgbaToJpeg(input, sharpFactory);

    expect(calls[0]?.input.buffer).toBe(input.data.buffer);
    expect(calls[0]?.options).toEqual({
      raw: { width: 4, height: 3, channels: 4 },
      failOn: 'error',
      limitInputPixels: MAX_FINAL_IMAGE_PIXELS,
    });
    expect(pipeline).not.toHaveProperty('rotate');
    expect(resize).toHaveBeenCalledWith({
      width: 4096,
      height: 4096,
      fit: 'inside',
      withoutEnlargement: true,
    });
    expect(jpegEncode).toHaveBeenCalledWith({ quality: 90, mozjpeg: true });
  });

  it('uses at most 12 encoding attempts', async () => {
    const attempts: number[] = [];
    const sharpFactory: SharpFactory = vi.fn(() => {
      attempts.push(1);
      const pipeline = {
        resize: vi.fn(() => pipeline),
        jpeg: vi.fn(() => pipeline),
        toBuffer: vi.fn(async () =>
          normalized({ data: jpeg(MAX_FINAL_IMAGE_BYTES + 1) }),
        ),
      };
      return pipeline;
    });

    await expect(normalizeRgbaToJpeg(rgba(), sharpFactory)).rejects.toMatchObject({
      code: 'IMAGE_OUTPUT_TOO_LARGE',
      status: 422,
    });
    expect(attempts).toHaveLength(12);
  });

  it('waits for an in-flight Sharp operation to settle before observing abort', async () => {
    let finish!: () => void;
    const controller = new AbortController();
    const pipeline = {
      resize: vi.fn(() => pipeline),
      jpeg: vi.fn(() => pipeline),
      toBuffer: vi.fn(
        () =>
          new Promise<ReturnType<typeof normalized>>((resolve) => {
            finish = () => resolve(normalized());
          }),
      ),
    };
    const sharpFactory: SharpFactory = vi.fn(() => pipeline);

    const pending = normalizeRgbaToJpeg(rgba(), sharpFactory, {
      signal: controller.signal,
    });
    controller.abort(
      new ImageProcessingError('IMAGE_PROCESSING_UNAVAILABLE', 503),
    );

    let settled = false;
    void pending.catch(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    finish();
    await expect(pending).rejects.toMatchObject({
      code: 'IMAGE_PROCESSING_UNAVAILABLE',
      status: 503,
    });
  });
});

describe('convertHeicBuffer', () => {
  it(
    'converts the real HEIC fixture with the default decoder and normalizer',
    async () => {
      const input = await readFile(
        new URL('./fixtures/RGB_8__29x100.heif', import.meta.url),
      );
      expect(createHash('sha256').update(input).digest('hex').toUpperCase()).toBe(
        'A28A4106084425AAF4B5B77ABA75C397ED4A0D87857C1F349BD0AB7BB35FC884',
      );

      const result = await convertHeicBuffer({ input });
      const encodedJpeg = result.dataUrl.replace(
        /^data:image\/jpeg;base64,/,
        '',
      );
      const jpegBuffer = Buffer.from(encodedJpeg, 'base64');
      const metadata = await sharp(jpegBuffer).metadata();

      expect(result).toMatchObject({
        processing: 'server-heic-converted',
        mimeType: 'image/jpeg',
      });
      expect(result.bytes).toBe(jpegBuffer.length);
      expect(result.bytes).toBeLessThanOrEqual(10 * 1024 * 1024);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.width).toBeLessThanOrEqual(4096);
      expect(result.height).toBeLessThanOrEqual(4096);
      expect(metadata.format).toBe('jpeg');
      expect(metadata.width).toBe(result.width);
      expect(metadata.height).toBe(result.height);
      expect(result.dataUrl).not.toContain(input.toString('base64'));
    },
    60_000,
  );

  it('decodes RGBA, normalizes once, and validates the final JPEG', async () => {
    const decoded = rgba();
    const output = normalized({
      data: jpeg(128),
      info: { width: 1024, height: 768 },
    });
    const decodeHeic = vi.fn(async () => decoded);
    const normalizeJpeg = vi.fn(async () => output);

    const result = await convertHeicBuffer({
      input: heic(),
      decodeHeic,
      normalizeJpeg,
    });

    expect(normalizeJpeg).toHaveBeenCalledWith(decoded);
    expect(result).toMatchObject({
      mimeType: 'image/jpeg',
      bytes: 128,
      width: 1024,
      height: 768,
    });
  });

  it('rejects invalid input before decoding', async () => {
    const decodeHeic = vi.fn();
    await expect(
      convertHeicBuffer({
        input: Buffer.alloc(MAX_HEIC_SOURCE_BYTES + 1),
        decodeHeic,
        normalizeJpeg: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_INPUT_TOO_LARGE', status: 413 });
    expect(decodeHeic).not.toHaveBeenCalled();
  });

  it.each([
    { data: Buffer.alloc(0), info: { width: 1, height: 1 } },
    { data: jpeg(MAX_FINAL_IMAGE_BYTES + 1), info: { width: 1, height: 1 } },
    { data: Buffer.from('not jpeg'), info: { width: 1, height: 1 } },
    { data: jpeg(), info: { width: 4097, height: 1 } },
  ])('rejects invalid normalized output %#', async (output) => {
    await expect(
      convertHeicBuffer({
        input: heic(),
        decodeHeic: async () => rgba(),
        normalizeJpeg: async () => output,
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});

describe('libheif-js integration', () => {
  it('loads the real wasm bundle API', async () => {
    const module = (await import('libheif-js/wasm-bundle')).default;
    await module.ready;
    expect(module.HeifDecoder).toBeTypeOf('function');
  });
});
