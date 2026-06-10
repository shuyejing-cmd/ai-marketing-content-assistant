import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  browserImageCodec,
  type BrowserImageCodec,
  type BrowserImageSession,
} from '../src/features/image-upload/browser-image-codec';
import { processBrowserImage } from '../src/features/image-upload/browser-image-processor';
import { MAX_FINAL_IMAGE_BYTES } from '../src/features/image-upload/image-types';

function blob(bytes: number, type: string): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

type MockSession = Omit<BrowserImageSession, 'encode' | 'close'> & {
  encode: Mock<BrowserImageSession['encode']>;
  close: Mock<BrowserImageSession['close']>;
};

type MockCodec = {
  [Key in keyof BrowserImageCodec]: Mock<BrowserImageCodec[Key]>;
};

function sessionWith(overrides: Partial<MockSession> = {}): MockSession {
  return {
    width: 1200,
    height: 800,
    encode: vi.fn(async (options) => blob(1024, options.mimeType)),
    close: vi.fn(),
    ...overrides,
  };
}

function codecWith(
  session: MockSession = sessionWith(),
  overrides: Partial<MockCodec> = {},
): MockCodec {
  return {
    open: vi.fn(async () => session),
    toDataUrl: vi.fn(async (_file, mimeType) => `data:${mimeType};base64,dGVzdA==`),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('processBrowserImage', () => {
  it('keeps a compliant JPEG byte-for-byte without encoding', async () => {
    const input = blob(1024, 'image/jpeg');
    const session = sessionWith();
    const codec = codecWith(session);

    const result = await processBrowserImage(input, 'image/jpeg', codec);

    expect(result).toEqual({
      dataUrl: 'data:image/jpeg;base64,dGVzdA==',
      mimeType: 'image/jpeg',
      bytes: input.size,
      width: 1200,
      height: 800,
      processing: 'original',
    });
    expect(session.encode).not.toHaveBeenCalled();
    expect(codec.toDataUrl).toHaveBeenCalledWith(input, 'image/jpeg');
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('trusts the externally confirmed MIME type for an original image', async () => {
    const input = blob(1024, 'application/octet-stream');
    const session = sessionWith();
    const codec = codecWith(session);

    const result = await processBrowserImage(input, 'image/jpeg', codec);

    expect(result.mimeType).toBe('image/jpeg');
    expect(result.dataUrl).toBe('data:image/jpeg;base64,dGVzdA==');
    expect(result.processing).toBe('original');
    expect(session.encode).not.toHaveBeenCalled();
    expect(codec.toDataUrl).toHaveBeenCalledWith(input, 'image/jpeg');
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('keeps the exact byte and edge limits as original without encoding', async () => {
    const input = blob(MAX_FINAL_IMAGE_BYTES, 'image/jpeg');
    const session = sessionWith({ width: 4096, height: 2048 });
    const codec = codecWith(session);

    const result = await processBrowserImage(input, 'image/jpeg', codec);

    expect(result).toMatchObject({
      bytes: MAX_FINAL_IMAGE_BYTES,
      width: 4096,
      height: 2048,
      processing: 'original',
    });
    expect(session.encode).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('resizes a 6000x3000 image to 4096x2048 without cropping', async () => {
    const input = blob(1024, 'image/jpeg');
    const output = blob(2 * 1024 * 1024, 'image/jpeg');
    const session = sessionWith({
      width: 6000,
      height: 3000,
      encode: vi.fn(async () => output),
    });
    const codec = codecWith(session);

    const result = await processBrowserImage(input, 'image/jpeg', codec);

    expect(session.encode).toHaveBeenCalledWith({
      width: 4096,
      height: 2048,
      mimeType: 'image/jpeg',
      quality: 0.92,
    });
    expect(result).toMatchObject({
      width: 4096,
      height: 2048,
      bytes: output.size,
      processing: 'client-resized',
    });
    expect(codec.open).toHaveBeenCalledOnce();
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('compresses a 12 MiB JPEG with the first quality attempt', async () => {
    const input = blob(12 * 1024 * 1024, 'image/jpeg');
    const output = blob(9 * 1024 * 1024, 'image/jpeg');
    const session = sessionWith({
      width: 3000,
      height: 2000,
      encode: vi.fn(async () => output),
    });
    const codec = codecWith(session);

    const result = await processBrowserImage(input, 'image/jpeg', codec);

    expect(session.encode).toHaveBeenCalledOnce();
    expect(session.encode).toHaveBeenCalledWith({
      width: 3000,
      height: 2000,
      mimeType: 'image/jpeg',
      quality: 0.92,
    });
    expect(result.processing).toBe('client-compressed');
    expect(result.bytes).toBe(output.size);
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('marks an image over both byte and dimension limits as compressed', async () => {
    const input = blob(12 * 1024 * 1024, 'image/jpeg');
    const session = sessionWith({
      width: 6000,
      height: 3000,
      encode: vi.fn(async () => blob(9 * 1024 * 1024, 'image/jpeg')),
    });
    const codec = codecWith(session);

    const result = await processBrowserImage(input, 'image/jpeg', codec);

    expect(result).toMatchObject({
      width: 4096,
      height: 2048,
      processing: 'client-compressed',
    });
  });

  it('keeps PNG output as PNG and uses lossless encoding', async () => {
    const input = blob(1024, 'image/png');
    const output = blob(2 * 1024 * 1024, 'image/png');
    const session = sessionWith({
      width: 5000,
      height: 2500,
      encode: vi.fn(async () => output),
    });
    const codec = codecWith(session);

    const result = await processBrowserImage(input, 'image/png', codec);

    expect(session.encode).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/png' }),
    );
    expect(result.mimeType).toBe('image/png');
    expect(result.processing).toBe('client-resized');
  });

  it('preserves aspect ratio within one pixel while shrinking dimensions', async () => {
    const input = blob(1024, 'image/webp');
    const session = sessionWith({
      width: 7001,
      height: 2345,
      encode: vi.fn(async (options) => blob(1024, options.mimeType)),
    });
    const codec = codecWith(session);

    const result = await processBrowserImage(input, 'image/webp', codec);
    const expectedHeight = (2345 / 7001) * result.width;

    expect(result.width).toBe(4096);
    expect(Math.abs(result.height - expectedHeight)).toBeLessThanOrEqual(1);
  });

  it('uses bounded quality and dimension attempts before reporting oversized output', async () => {
    const input = blob(MAX_FINAL_IMAGE_BYTES + 1, 'image/jpeg');
    const oversized = blob(MAX_FINAL_IMAGE_BYTES + 1, 'image/jpeg');
    const session = sessionWith({
      width: 4096,
      height: 2048,
      encode: vi.fn(async () => oversized),
    });
    const codec = codecWith(session);

    await expect(processBrowserImage(input, 'image/jpeg', codec)).rejects.toMatchObject({
      name: 'ImageProcessingError',
      code: 'IMAGE_OUTPUT_TOO_LARGE',
      status: 422,
    });
    expect(session.encode).toHaveBeenCalledTimes(12 * 7);
    const expectedQualities = [0.92, 0.86, 0.8, 0.72, 0.64, 0.56, 0.48];
    for (let sizeRound = 0; sizeRound < 12; sizeRound += 1) {
      const calls = session.encode.mock.calls.slice(sizeRound * 7, sizeRound * 7 + 7);
      expect(calls.map((call) => call[0].quality)).toEqual(expectedQualities);

      const expectedScale = 0.9 ** sizeRound;
      expect(calls[0]?.[0]).toMatchObject({
        width: Math.max(1, Math.round(4096 * expectedScale)),
        height: Math.max(1, Math.round(2048 * expectedScale)),
      });
    }
    const lastOptions = session.encode.mock.calls.at(-1)?.[0];
    if (!lastOptions) {
      throw new Error('Expected at least one encoding attempt');
    }
    expect(lastOptions.width).toBeGreaterThanOrEqual(1);
    expect(lastOptions.height).toBeGreaterThanOrEqual(1);
    expect(codec.open).toHaveBeenCalledOnce();
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('encodes PNG once per size round without a lossy quality sweep', async () => {
    const input = blob(MAX_FINAL_IMAGE_BYTES + 1, 'image/png');
    const session = sessionWith({
      width: 4096,
      height: 2048,
      encode: vi.fn(async () => blob(MAX_FINAL_IMAGE_BYTES + 1, 'image/png')),
    });
    const codec = codecWith(session);

    await expect(processBrowserImage(input, 'image/png', codec)).rejects.toMatchObject({
      code: 'IMAGE_OUTPUT_TOO_LARGE',
    });

    expect(session.encode).toHaveBeenCalledTimes(12);
    expect(session.encode.mock.calls.map((call) => call[0].quality)).toEqual(
      Array.from({ length: 12 }, () => 0.92),
    );
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('maps open failures to IMAGE_INVALID with the original cause', async () => {
    const cause = new Error('decode failed');
    const codec = codecWith(sessionWith(), {
      open: vi.fn(async () => {
        throw cause;
      }),
    });

    await expect(processBrowserImage(blob(1, 'image/jpeg'), 'image/jpeg', codec)).rejects.toMatchObject(
      {
        code: 'IMAGE_INVALID',
        status: 400,
        cause,
      },
    );
  });

  it.each([
    { width: 0, height: 100 },
    { width: 100, height: -1 },
    { width: Number.NaN, height: 100 },
  ])('rejects invalid inspected dimensions %#', async (dimensions) => {
    const session = sessionWith(dimensions);
    const codec = codecWith(session);

    await expect(processBrowserImage(blob(1, 'image/jpeg'), 'image/jpeg', codec)).rejects.toMatchObject(
      {
        code: 'IMAGE_INVALID',
        status: 400,
      },
    );
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('rejects images over 40 megapixels before encoding and closes the session', async () => {
    const session = sessionWith({ width: 8000, height: 5001 });
    const codec = codecWith(session);

    await expect(processBrowserImage(blob(1, 'image/jpeg'), 'image/jpeg', codec)).rejects.toMatchObject(
      {
        code: 'IMAGE_DIMENSIONS_TOO_LARGE',
        status: 422,
      },
    );
    expect(session.encode).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('rejects an encoded blob with a conflicting non-empty MIME type', async () => {
    const session = sessionWith({
      width: 5000,
      height: 2500,
      encode: vi.fn(async () => blob(1024, 'image/png')),
    });
    const codec = codecWith(session);

    await expect(processBrowserImage(blob(1, 'image/jpeg'), 'image/jpeg', codec)).rejects.toMatchObject(
      {
        code: 'IMAGE_PROCESSING_FAILED',
        status: 400,
      },
    );
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('rejects an encoded blob with an empty MIME type', async () => {
    const output = blob(1024, '');
    const session = sessionWith({
      width: 5000,
      height: 2500,
      encode: vi.fn(async () => output),
    });
    const codec = codecWith(session);

    await expect(processBrowserImage(blob(1, 'image/jpeg'), 'image/jpeg', codec)).rejects.toMatchObject(
      {
        code: 'IMAGE_PROCESSING_FAILED',
        status: 400,
      },
    );
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('maps data URL conversion failures to a stable processing error', async () => {
    const cause = new Error('reader failed');
    const session = sessionWith();
    const codec = codecWith(session, {
      toDataUrl: vi.fn(async () => {
        throw cause;
      }),
    });

    await expect(processBrowserImage(blob(1, 'image/jpeg'), 'image/jpeg', codec)).rejects.toMatchObject(
      {
        code: 'IMAGE_PROCESSING_FAILED',
        status: 400,
        cause,
      },
    );
    expect(session.close).toHaveBeenCalledOnce();
  });
});

describe('browserImageCodec', () => {
  it('opens one oriented bitmap session and exposes its dimensions', async () => {
    const close = vi.fn();
    const createImageBitmap = vi.fn(async () => ({ width: 640, height: 480, close }));
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const input = blob(1, 'image/jpeg');

    const session = await browserImageCodec.open(input);

    expect(session.width).toBe(640);
    expect(session.height).toBe(480);
    expect(createImageBitmap).toHaveBeenCalledWith(input, {
      imageOrientation: 'from-image',
    });
    expect(createImageBitmap).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    session.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it('reuses one bitmap, preserves PNG transparency, and passes undefined quality', async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    const toBlob = vi.fn(
      (callback: BlobCallback, type?: string, quality?: number) =>
        callback(blob(100, type ?? '')),
    );
    const bitmap = { width: 640, height: 480, close };
    const createImageBitmap = vi.fn(async () => bitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({ drawImage, fillRect })),
        toBlob,
      })),
    });

    const input = blob(1, 'image/png');
    const session = await browserImageCodec.open(input);
    const first = await session.encode({
      width: 400,
      height: 200,
      mimeType: 'image/png',
      quality: 0.48,
    });
    const second = await session.encode({
      width: 200,
      height: 100,
      mimeType: 'image/png',
      quality: 0.92,
    });

    expect(first.type).toBe('image/png');
    expect(second.type).toBe('image/png');
    expect(createImageBitmap).toHaveBeenCalledWith(input, {
      imageOrientation: 'from-image',
    });
    expect(createImageBitmap).toHaveBeenCalledOnce();
    expect(drawImage).toHaveBeenNthCalledWith(1, bitmap, 0, 0, 400, 200);
    expect(drawImage).toHaveBeenNthCalledWith(2, bitmap, 0, 0, 200, 100);
    expect(fillRect).not.toHaveBeenCalled();
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', undefined);
    session.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it('normalizes a mismatched Blob type before reading a data URL', async () => {
    let readBlob: Blob | undefined;
    class SuccessfulFileReader {
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;

      readAsDataURL(file: Blob) {
        readBlob = file;
        this.result = `data:${file.type};base64,dGVzdA==`;
        this.onload?.({} as ProgressEvent<FileReader>);
      }
    }
    vi.stubGlobal('FileReader', SuccessfulFileReader);

    const result = await browserImageCodec.toDataUrl(
      blob(1, 'application/octet-stream'),
      'image/jpeg',
    );

    expect(readBlob?.type).toBe('image/jpeg');
    expect(result).toBe('data:image/jpeg;base64,dGVzdA==');
  });

  it('rejects with the FileReader error', async () => {
    const cause = new Error('read failed');
    class FailingFileReader {
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = cause as unknown as DOMException;
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;

      readAsDataURL() {
        this.onerror?.({} as ProgressEvent<FileReader>);
      }
    }
    vi.stubGlobal('FileReader', FailingFileReader);

    await expect(
      browserImageCodec.toDataUrl(blob(1, 'image/jpeg'), 'image/jpeg'),
    ).rejects.toBe(cause);
  });
});
