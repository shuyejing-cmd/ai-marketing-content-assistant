import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { heicTo } from 'heic-to/csp';
import { convertHeicInBrowser } from '../src/features/image-upload/heic-client-converter';
import {
  convertHeicOnServer,
  inspectDecodedImage,
  processUploadImage,
  type ImageProcessingClientDeps,
} from '../src/features/image-upload/image-processing-client';
import { browserImageCodec } from '../src/features/image-upload/browser-image-codec';
import { ImageProcessingError } from '../src/features/image-upload/image-errors';
import {
  MAX_HEIC_SOURCE_BYTES,
  type FinalImageMime,
  type ProcessedUploadImage,
} from '../src/features/image-upload/image-types';

vi.mock('heic-to/csp', () => ({
  heicTo: vi.fn(),
}));

const mockedHeicTo = vi.mocked(heicTo);

function ascii(value: string): number[] {
  return Array.from(value, (character) => character.charCodeAt(0));
}

function signatureFor(mimeType: FinalImageMime | 'image/heic' | 'image/heif'): Uint8Array {
  if (mimeType === 'image/jpeg') return new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  if (mimeType === 'image/png') {
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (mimeType === 'image/webp') {
    return new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')]);
  }

  const brand = mimeType === 'image/heic' ? 'heic' : 'mif1';
  return new Uint8Array([0, 0, 0, 16, ...ascii('ftyp'), ...ascii(brand), 0, 0, 0, 0]);
}

function imageBlob(mimeType: FinalImageMime, type = mimeType): Blob {
  return new Blob([signatureFor(mimeType)], { type });
}

function dataUrlFor(mimeType: FinalImageMime, bytes = signatureFor(mimeType)): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

function fileWith(
  signature: Uint8Array,
  options: { size?: number; type?: string; name?: string } = {},
): File {
  const size = options.size ?? signature.byteLength;
  const contents = new Uint8Array(size);
  contents.set(signature.slice(0, size));
  return new File([contents], options.name ?? 'upload.bin', {
    type: options.type ?? 'application/octet-stream',
  });
}

function processed(
  overrides: Partial<ProcessedUploadImage> = {},
): ProcessedUploadImage {
  const mimeType = overrides.mimeType ?? 'image/jpeg';
  const bytes = signatureFor(mimeType);
  return {
    dataUrl: dataUrlFor(mimeType, bytes),
    mimeType,
    bytes: bytes.byteLength,
    width: 2,
    height: 2,
    processing: 'original',
    ...overrides,
  };
}

function serverProcessed(
  overrides: Partial<ProcessedUploadImage> = {},
): ProcessedUploadImage {
  return processed({
    processing: 'server-heic-converted',
    ...overrides,
  });
}

function depsWith(
  overrides: Partial<ImageProcessingClientDeps> = {},
): ImageProcessingClientDeps {
  return {
    readSignature: vi.fn(async (file: Blob) => new Uint8Array(await file.arrayBuffer())),
    convertHeicInBrowser: vi.fn(async () => imageBlob('image/jpeg')),
    convertHeicOnServer: vi.fn(async () =>
      processed({ processing: 'server-heic-converted' })),
    inspectDecodedImage: vi.fn(async () => ({ width: 2, height: 2 })),
    processBrowserImage: vi.fn(async (_file, mimeType) =>
      processed({ mimeType })),
    ...overrides,
  };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  mockedHeicTo.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('processUploadImage', () => {
  it.each([
    ['image/jpeg', 'photo.png'],
    ['image/png', 'photo.webp'],
    ['image/webp', 'photo.jpg'],
  ] as const)('processes a signed %s image in the browser', async (mimeType, name) => {
    const file = fileWith(signatureFor(mimeType), {
      name,
      type: 'image/heic',
    });
    const deps = depsWith();

    const result = await processUploadImage(file, deps);

    expect(deps.processBrowserImage).toHaveBeenCalledWith(file, mimeType);
    expect(deps.convertHeicInBrowser).not.toHaveBeenCalled();
    expect(deps.convertHeicOnServer).not.toHaveBeenCalled();
    expect(result.mimeType).toBe(mimeType);
  });

  it('uses a valid client HEIC conversion without calling the server', async () => {
    const file = fileWith(signatureFor('image/heic'));
    const converted = imageBlob('image/jpeg', '');
    const browserResult = processed({ processing: 'client-compressed' });
    const deps = depsWith({
      convertHeicInBrowser: vi.fn(async () => converted),
      processBrowserImage: vi.fn(async () => browserResult),
    });

    const result = await processUploadImage(file, deps);

    expect(deps.processBrowserImage).toHaveBeenCalledWith(converted, 'image/jpeg');
    expect(deps.inspectDecodedImage).toHaveBeenCalledWith(converted);
    expect(deps.convertHeicOnServer).not.toHaveBeenCalled();
    expect(result).toEqual({
      ...browserResult,
      processing: 'client-heic-converted',
    });
  });

  it('falls back to the server when client HEIC conversion fails', async () => {
    const cause = new Error('wasm failed');
    const serverResult = processed({ processing: 'server-heic-converted' });
    const signal = new AbortController().signal;
    const file = fileWith(signatureFor('image/heif'));
    const deps = depsWith({
      convertHeicInBrowser: vi.fn(async () => {
        throw cause;
      }),
      convertHeicOnServer: vi.fn(async () => serverResult),
    });

    await expect(processUploadImage(file, deps, signal)).resolves.toBe(serverResult);
    expect(deps.convertHeicOnServer).toHaveBeenCalledWith(
      file,
      signal,
      deps.inspectDecodedImage,
    );
    expect(deps.processBrowserImage).not.toHaveBeenCalled();
  });

  it('falls back when a JPEG-signature client conversion cannot be decoded', async () => {
    const converted = imageBlob('image/jpeg');
    const deps = depsWith({
      convertHeicInBrowser: vi.fn(async () => converted),
      inspectDecodedImage: vi.fn(async () => {
        throw new Error('decode failed');
      }),
    });

    await processUploadImage(fileWith(signatureFor('image/heic')), deps);

    expect(deps.inspectDecodedImage).toHaveBeenCalledWith(converted);
    expect(deps.processBrowserImage).not.toHaveBeenCalled();
    expect(deps.convertHeicOnServer).toHaveBeenCalledOnce();
  });

  it.each([
    { width: 0, height: 2 },
    { width: 1.5, height: 2 },
    { width: 4097, height: 2 },
  ])('falls back when client HEIC dimensions are invalid %#', async (dimensions) => {
    const deps = depsWith({
      inspectDecodedImage: vi.fn(async () => dimensions),
    });

    await processUploadImage(fileWith(signatureFor('image/heic')), deps);

    expect(deps.processBrowserImage).not.toHaveBeenCalled();
    expect(deps.convertHeicOnServer).toHaveBeenCalledOnce();
  });

  it('does not fall back when client conversion is aborted', async () => {
    const abort = new DOMException('cancelled', 'AbortError');
    const deps = depsWith({
      convertHeicInBrowser: vi.fn(async () => {
        throw abort;
      }),
    });

    await expect(
      processUploadImage(fileWith(signatureFor('image/heic')), deps),
    ).rejects.toBe(abort);
    expect(deps.convertHeicOnServer).not.toHaveBeenCalled();
  });

  it('does not call any dependency when already aborted and preserves a custom reason', async () => {
    const reason = new Error('user cancelled');
    const controller = new AbortController();
    controller.abort(reason);
    const deps = depsWith();

    await expect(
      processUploadImage(fileWith(signatureFor('image/heic')), deps, controller.signal),
    ).rejects.toBe(reason);
    expect(deps.readSignature).not.toHaveBeenCalled();
    expect(deps.convertHeicInBrowser).not.toHaveBeenCalled();
    expect(deps.convertHeicOnServer).not.toHaveBeenCalled();
    expect(deps.inspectDecodedImage).not.toHaveBeenCalled();
    expect(deps.processBrowserImage).not.toHaveBeenCalled();
  });

  it('checks for abort after reading the upload signature', async () => {
    const reason = new Error('cancelled after signature');
    const controller = new AbortController();
    const deps = depsWith({
      readSignature: vi.fn(async () => {
        controller.abort(reason);
        return signatureFor('image/jpeg');
      }),
    });

    await expect(
      processUploadImage(fileWith(signatureFor('image/jpeg')), deps, controller.signal),
    ).rejects.toBe(reason);
    expect(deps.processBrowserImage).not.toHaveBeenCalled();
  });

  it('checks for abort after client HEIC conversion without falling back', async () => {
    const reason = new Error('cancelled after conversion');
    const controller = new AbortController();
    const deps = depsWith({
      convertHeicInBrowser: vi.fn(async () => {
        controller.abort(reason);
        return imageBlob('image/jpeg');
      }),
    });

    await expect(
      processUploadImage(fileWith(signatureFor('image/heic')), deps, controller.signal),
    ).rejects.toBe(reason);
    expect(deps.processBrowserImage).not.toHaveBeenCalled();
    expect(deps.inspectDecodedImage).not.toHaveBeenCalled();
    expect(deps.convertHeicOnServer).not.toHaveBeenCalled();
  });

  it('checks for abort after inspecting a converted HEIC image', async () => {
    const reason = new Error('cancelled after inspect');
    const controller = new AbortController();
    const deps = depsWith({
      inspectDecodedImage: vi.fn(async () => {
        controller.abort(reason);
        return { width: 2, height: 2 };
      }),
    });

    await expect(
      processUploadImage(fileWith(signatureFor('image/heic')), deps, controller.signal),
    ).rejects.toBe(reason);
    expect(deps.processBrowserImage).not.toHaveBeenCalled();
    expect(deps.convertHeicOnServer).not.toHaveBeenCalled();
  });

  it('checks for abort after browser image processing', async () => {
    const reason = new Error('cancelled after browser processing');
    const controller = new AbortController();
    const deps = depsWith({
      processBrowserImage: vi.fn(async () => {
        controller.abort(reason);
        return processed();
      }),
    });

    await expect(
      processUploadImage(fileWith(signatureFor('image/jpeg')), deps, controller.signal),
    ).rejects.toBe(reason);
  });

  it('propagates browser processing errors after a successful HEIC conversion', async () => {
    const processingError = new ImageProcessingError('IMAGE_OUTPUT_TOO_LARGE', 422);
    const deps = depsWith({
      processBrowserImage: vi.fn(async () => {
        throw processingError;
      }),
    });

    await expect(
      processUploadImage(fileWith(signatureFor('image/heic')), deps),
    ).rejects.toBe(processingError);
    expect(deps.convertHeicOnServer).not.toHaveBeenCalled();
  });

  it('rejects random bytes using the signature instead of extension or declared MIME', async () => {
    const deps = depsWith();
    const file = fileWith(new Uint8Array([1, 2, 3, 4]), {
      name: 'fake.heic',
      type: 'image/heic',
    });

    await expect(processUploadImage(file, deps)).rejects.toMatchObject({
      code: 'IMAGE_UNSUPPORTED_FORMAT',
      status: 415,
    });
    expect(deps.processBrowserImage).not.toHaveBeenCalled();
    expect(deps.convertHeicInBrowser).not.toHaveBeenCalled();
    expect(deps.convertHeicOnServer).not.toHaveBeenCalled();
  });

  it('allows exactly 40 MiB and rejects one byte more before conversion', async () => {
    const atLimit = fileWith(signatureFor('image/heic'), {
      size: MAX_HEIC_SOURCE_BYTES,
    });
    const overLimit = fileWith(signatureFor('image/heic'), {
      size: MAX_HEIC_SOURCE_BYTES + 1,
    });
    const atLimitDeps = depsWith({
      readSignature: vi.fn(async () => signatureFor('image/heic')),
    });
    const overLimitDeps = depsWith({
      readSignature: vi.fn(async () => signatureFor('image/heic')),
    });

    await expect(processUploadImage(atLimit, atLimitDeps)).resolves.toMatchObject({
      processing: 'client-heic-converted',
    });
    await expect(processUploadImage(overLimit, overLimitDeps)).rejects.toMatchObject({
      code: 'IMAGE_INPUT_TOO_LARGE',
      status: 413,
    });
    expect(overLimitDeps.readSignature).not.toHaveBeenCalled();
    expect(overLimitDeps.convertHeicInBrowser).not.toHaveBeenCalled();
    expect(overLimitDeps.convertHeicOnServer).not.toHaveBeenCalled();
    expect(overLimitDeps.processBrowserImage).not.toHaveBeenCalled();
  });

  it.each([
    new Blob([], { type: 'image/jpeg' }),
    imageBlob('image/jpeg', 'image/png'),
    new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }),
    imageBlob('image/png', ''),
  ])('falls back when the client HEIC output Blob is invalid', async (converted) => {
    const deps = depsWith({
      convertHeicInBrowser: vi.fn(async () => converted),
    });

    await processUploadImage(fileWith(signatureFor('image/heic')), deps);

    expect(deps.processBrowserImage).not.toHaveBeenCalled();
    expect(deps.convertHeicOnServer).toHaveBeenCalledOnce();
  });
});

describe('convertHeicOnServer', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'] as const)(
    'posts the image and accepts a valid server-converted %s result',
    async (mimeType) => {
      const image = serverProcessed({ mimeType });
      const fetchMock = vi.fn(async () =>
        jsonResponse({
          ignored: 'top-level',
          image: { ...image, ignored: 'image-level' },
        }));
      vi.stubGlobal('fetch', fetchMock);
      const file = fileWith(signatureFor('image/heic'));
      const signal = new AbortController().signal;
      const inspect = vi.fn(async () => ({ width: 2, height: 2 }));

      await expect(convertHeicOnServer(file, signal, inspect)).resolves.toEqual(image);
      expect(inspect).toHaveBeenCalledWith(expect.any(Blob));
      const inspectedBlob = inspect.mock.calls[0]?.[0];
      expect(inspectedBlob?.type).toBe(mimeType);
      expect(inspectedBlob?.size).toBe(image.bytes);

      expect(fetchMock).toHaveBeenCalledWith('/api/image-processing/convert', {
        method: 'POST',
        body: expect.any(FormData),
        signal,
      });
      const request = fetchMock.mock.calls[0]?.[1];
      expect((request?.body as FormData).get('image')).toBe(file);
    },
  );

  it.each([
    null,
    {},
    { image: null },
    { image: serverProcessed({ mimeType: 'image/heic' as FinalImageMime }) },
    { image: serverProcessed({ dataUrl: 42 as unknown as string }) },
    { image: serverProcessed({ dataUrl: 'data:image/jpeg;base64,%%%%' }) },
    { image: serverProcessed({ dataUrl: dataUrlFor('image/png') }) },
    { image: serverProcessed({ dataUrl: dataUrlFor('image/jpeg'), bytes: 3 }) },
    {
      image: serverProcessed({
        dataUrl: dataUrlFor('image/jpeg', signatureFor('image/png')),
        bytes: signatureFor('image/png').byteLength,
      }),
    },
    { image: serverProcessed({ bytes: 0 }) },
    { image: serverProcessed({ bytes: 1.5 }) },
    { image: serverProcessed({ bytes: 10 * 1024 * 1024 + 1 }) },
    { image: serverProcessed({ width: Number.NaN }) },
    { image: serverProcessed({ width: 1.5 }) },
    { image: serverProcessed({ width: 4097 }) },
    { image: serverProcessed({ height: -1 }) },
    { image: serverProcessed({ height: 4097 }) },
    { image: serverProcessed({ processing: 'original' }) },
  ])('rejects a malformed successful response %#', async (body) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(body)));

    await expect(
      convertHeicOnServer(
        fileWith(signatureFor('image/heic')),
        undefined,
        async () => ({ width: 2, height: 2 }),
      ),
    ).rejects.toMatchObject({
      code: 'IMAGE_PROCESSING_UNAVAILABLE',
      status: 503,
    });
  });

  it('uses a known server error code and response status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(
        { code: 'IMAGE_OUTPUT_TOO_LARGE', message: 'too large' },
        { status: 422 },
      )));

    await expect(
      convertHeicOnServer(
        fileWith(signatureFor('image/heic')),
        undefined,
        async () => ({ width: 2, height: 2 }),
      ),
    ).rejects.toMatchObject({
      code: 'IMAGE_OUTPUT_TOO_LARGE',
      status: 422,
    });
  });

  it('maps malformed JSON and unknown network errors to unavailable', async () => {
    const malformed = vi.fn(async () => new Response('not json', { status: 502 }));
    vi.stubGlobal('fetch', malformed);
    await expect(
      convertHeicOnServer(
        fileWith(signatureFor('image/heic')),
        undefined,
        async () => ({ width: 2, height: 2 }),
      ),
    ).rejects.toMatchObject({
      code: 'IMAGE_PROCESSING_UNAVAILABLE',
      status: 503,
    });

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network down');
    }));
    await expect(
      convertHeicOnServer(
        fileWith(signatureFor('image/heic')),
        undefined,
        async () => ({ width: 2, height: 2 }),
      ),
    ).rejects.toMatchObject({
      code: 'IMAGE_PROCESSING_UNAVAILABLE',
      status: 503,
    });
  });

  it('preserves AbortError from fetch', async () => {
    const abort = new DOMException('cancelled', 'AbortError');
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw abort;
    }));

    await expect(
      convertHeicOnServer(fileWith(signatureFor('image/heic'))),
    ).rejects.toBe(abort);
  });

  it('rejects a four-byte signed server image when decoding fails', async () => {
    const image = serverProcessed();
    const inspect = vi.fn(async () => {
      throw new Error('decode failed');
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ image })));

    await expect(
      convertHeicOnServer(fileWith(signatureFor('image/heic')), undefined, inspect),
    ).rejects.toMatchObject({
      code: 'IMAGE_PROCESSING_UNAVAILABLE',
      status: 503,
    });
  });

  it('rejects server dimensions that do not match decoded dimensions', async () => {
    const image = serverProcessed({ width: 2, height: 2 });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ image })));

    await expect(
      convertHeicOnServer(
        fileWith(signatureFor('image/heic')),
        undefined,
        async () => ({ width: 3, height: 2 }),
      ),
    ).rejects.toMatchObject({
      code: 'IMAGE_PROCESSING_UNAVAILABLE',
      status: 503,
    });
  });

  it('preserves a custom abort reason after server image inspection', async () => {
    const reason = new Error('cancelled during server inspect');
    const controller = new AbortController();
    const image = serverProcessed();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ image })));

    await expect(
      convertHeicOnServer(
        fileWith(signatureFor('image/heic')),
        controller.signal,
        async () => {
          controller.abort(reason);
          return { width: 2, height: 2 };
        },
      ),
    ).rejects.toBe(reason);
  });

  it('does not call fetch when already aborted and preserves a custom reason', async () => {
    const reason = new Error('cancelled before fetch');
    const controller = new AbortController();
    controller.abort(reason);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      convertHeicOnServer(
        fileWith(signatureFor('image/heic')),
        controller.signal,
        async () => ({ width: 2, height: 2 }),
      ),
    ).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves a custom abort reason when response.json aborts in progress', async () => {
    const reason = new Error('cancelled while reading json');
    const controller = new AbortController();
    const response = {
      ok: true,
      status: 200,
      json: vi.fn(async () => {
        controller.abort(reason);
        throw new SyntaxError('interrupted json');
      }),
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn(async () => response));

    await expect(
      convertHeicOnServer(
        fileWith(signatureFor('image/heic')),
        controller.signal,
        async () => ({ width: 2, height: 2 }),
      ),
    ).rejects.toBe(reason);
  });
});

describe('inspectDecodedImage', () => {
  it('reads dimensions through the task 3 codec and always closes the session', async () => {
    const close = vi.fn();
    const open = vi.spyOn(browserImageCodec, 'open').mockResolvedValue({
      width: 640,
      height: 480,
      encode: vi.fn(),
      close,
    });
    const image = imageBlob('image/jpeg');

    await expect(inspectDecodedImage(image)).resolves.toEqual({
      width: 640,
      height: 480,
    });
    expect(open).toHaveBeenCalledWith(image);
    expect(close).toHaveBeenCalledOnce();
    open.mockRestore();
  });
});

describe('convertHeicInBrowser', () => {
  it('dynamically converts HEIC to a JPEG Blob with the required quality', async () => {
    const output = imageBlob('image/jpeg');
    mockedHeicTo.mockResolvedValue(output);
    const file = fileWith(signatureFor('image/heic'));

    await expect(convertHeicInBrowser(file)).resolves.toBe(output);
    expect(mockedHeicTo).toHaveBeenCalledWith({
      blob: file,
      type: 'image/jpeg',
      quality: 0.92,
    });
  });

  it('rejects a dynamic converter result that is not a Blob', async () => {
    mockedHeicTo.mockResolvedValue({} as Blob);

    await expect(
      convertHeicInBrowser(fileWith(signatureFor('image/heic'))),
    ).rejects.toThrow('Blob');
  });
});
