import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageProcessingError } from '../src/features/image-upload/image-errors';
import {
  MAX_HEIC_SOURCE_BYTES,
  type ProcessedUploadImage,
} from '../src/features/image-upload/image-types';

const convertHeicBuffer = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock(
  '../src/features/image-upload/server/heic-converter',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../src/features/image-upload/server/heic-converter')
    >()),
    convertHeicBuffer,
  }),
);

import {
  POST,
  runtime,
} from '../src/app/api/image-processing/convert/route';
import { handleConvertPost } from '../src/features/image-upload/server/convert-route-handler';
import {
  imageProcessingAdmission,
  readSingleHeicUpload,
} from '../src/features/image-upload/server/heic-converter';

const processedImage: ProcessedUploadImage = {
  dataUrl: 'data:image/jpeg;base64,/9j/4A==',
  mimeType: 'image/jpeg',
  bytes: 4,
  width: 1,
  height: 1,
  processing: 'server-heic-converted',
};

afterEach(() => {
  vi.useRealTimers();
});

function multipartPrefix(boundary = 'test-boundary') {
  return Buffer.from(
    `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="image"; filename="photo.heic"\r\n' +
      'Content-Type: image/heic\r\n\r\n',
  );
}

function multipartBody(data: Uint8Array, boundary = 'test-boundary') {
  return Buffer.concat([
    multipartPrefix(boundary),
    Buffer.from(data),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

function requestFromBody(
  body: Uint8Array | ReadableStream<Uint8Array> | null,
  options: {
    boundary?: string;
    contentLength?: string;
    contentType?: string | null;
    signal?: AbortSignal;
  } = {},
) {
  const headers = new Headers();
  if (options.contentType !== null) {
    headers.set(
      'content-type',
      options.contentType ??
        `multipart/form-data; boundary=${options.boundary ?? 'test-boundary'}`,
    );
  }
  if (options.contentLength !== undefined) {
    headers.set('content-length', options.contentLength);
  }
  return new Request('http://localhost/api/image-processing/convert', {
    method: 'POST',
    headers,
    body,
    signal: options.signal,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

function singleFileRequest(
  data: Uint8Array = Buffer.from('heic'),
  options: { contentLength?: string; signal?: AbortSignal } = {},
) {
  return requestFromBody(multipartBody(data), options);
}

function cancellableChunks(chunks: Uint8Array[]) {
  let pulls = 0;
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      const chunk = chunks.shift();
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel,
  });
  return { stream, cancel, pulls: () => pulls };
}

function stalledUpload() {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(multipartPrefix());
    },
    cancel,
  });
  return { stream, cancel };
}

describe('readSingleHeicUpload', () => {
  it('accepts a file exactly at the 40 MiB boundary', async () => {
    const input = Buffer.alloc(MAX_HEIC_SOURCE_BYTES);
    await expect(
      readSingleHeicUpload(requestFromBody(multipartBody(input))),
    ).resolves.toHaveLength(MAX_HEIC_SOURCE_BYTES);
  });

  it.each([
    { label: 'missing', contentLength: undefined },
    { label: 'forged', contentLength: '128' },
  ])(
    'cancels a $label Content-Length stream as soon as the file exceeds 40 MiB',
    async ({ contentLength }) => {
      const prefix = multipartPrefix();
      const first = Buffer.concat([
        prefix,
        Buffer.alloc(MAX_HEIC_SOURCE_BYTES + 1),
      ]);
      const source = cancellableChunks([
        first,
        Buffer.from('must not be read'),
        Buffer.from('\r\n--test-boundary--\r\n'),
      ]);

      await expect(
        readSingleHeicUpload(
          requestFromBody(source.stream, { contentLength }),
        ),
      ).rejects.toMatchObject({
        code: 'IMAGE_INPUT_TOO_LARGE',
        status: 413,
      });
      expect(source.cancel).toHaveBeenCalledOnce();
      expect(source.pulls()).toBeLessThanOrEqual(2);
    },
  );

  it('cancels immediately when the raw multipart body exceeds 41 MiB', async () => {
    const source = cancellableChunks([
      Buffer.alloc(MAX_HEIC_SOURCE_BYTES + 1024 * 1024 + 1),
      Buffer.from('must not be read'),
    ]);

    await expect(
      readSingleHeicUpload(requestFromBody(source.stream)),
    ).rejects.toMatchObject({
      code: 'IMAGE_INPUT_TOO_LARGE',
      status: 413,
    });
    expect(source.cancel).toHaveBeenCalledOnce();
    expect(source.pulls()).toBeLessThanOrEqual(2);
  });

  it('cancels on parser syntax errors and maps them to 400', async () => {
    const source = cancellableChunks([
      Buffer.from('--test-boundary\r\nbroken header\r\n\r\n'),
      Buffer.from('must not be read'),
    ]);

    await expect(
      readSingleHeicUpload(requestFromBody(source.stream)),
    ).rejects.toMatchObject({
      code: 'IMAGE_INVALID',
      status: 400,
    });
    expect(source.cancel).toHaveBeenCalledOnce();
  });

  it('cancels and throws the abort reason while reading', async () => {
    const controller = new AbortController();
    const source = cancellableChunks([multipartPrefix(), Buffer.from('later')]);
    const pending = readSingleHeicUpload(
      requestFromBody(source.stream, { signal: controller.signal }),
    );

    controller.abort(new DOMException('client disconnected', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(source.cancel).toHaveBeenCalledOnce();
  });
});

describe('/api/image-processing/convert', () => {
  beforeEach(() => {
    convertHeicBuffer.mockReset();
    convertHeicBuffer.mockResolvedValue(processedImage);
  });

  it('uses the Node.js runtime', () => {
    expect(runtime).toBe('nodejs');
  });

  it('fast-rejects an obviously oversized Content-Length', async () => {
    const response = await POST(
      singleFileRequest(Buffer.from('heic'), {
        contentLength: String(MAX_HEIC_SOURCE_BYTES + 1024 * 1024 + 1),
      }),
    );
    expect(response.status).toBe(413);
    expect(convertHeicBuffer).not.toHaveBeenCalled();
  });

  it('holds admission across both body reading and conversion', async () => {
    let finish!: () => void;
    convertHeicBuffer.mockImplementationOnce(
      () =>
        new Promise<ProcessedUploadImage>((resolve) => {
          finish = () => resolve(processedImage);
        }),
    );
    const first = POST(singleFileRequest(Buffer.from('first')));
    await vi.waitFor(() => expect(convertHeicBuffer).toHaveBeenCalledTimes(1));

    const secondRequest = singleFileRequest(Buffer.from('second'));
    const getReader = vi.spyOn(secondRequest.body!, 'getReader');
    const second = POST(secondRequest);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(getReader).not.toHaveBeenCalled();
    expect(convertHeicBuffer).toHaveBeenCalledTimes(1);
    finish();
    await expect(first).resolves.toMatchObject({ status: 200 });
    await expect(second).resolves.toMatchObject({ status: 200 });
  });

  it('rejects beyond one active request and four waiters with 503', async () => {
    const release = await imageProcessingAdmission.acquire(
      new AbortController().signal,
    );
    const waiting = Array.from({ length: 4 }, () =>
      POST(singleFileRequest(Buffer.from('queued'))),
    );

    const overflow = await POST(singleFileRequest(Buffer.from('overflow')));
    expect(overflow.status).toBe(503);
    expect(await overflow.json()).toMatchObject({
      code: 'IMAGE_PROCESSING_UNAVAILABLE',
    });

    release();
    await Promise.all(waiting);
  });

  it('removes an aborted waiter, returns 400, and never converts it', async () => {
    const release = await imageProcessingAdmission.acquire(
      new AbortController().signal,
    );
    const controller = new AbortController();
    const aborted = POST(
      singleFileRequest(Buffer.from('aborted'), { signal: controller.signal }),
    );
    controller.abort(new DOMException('gone', 'AbortError'));

    const response = await aborted;
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'IMAGE_PROCESSING_FAILED',
    });
    expect(convertHeicBuffer).not.toHaveBeenCalled();

    release();
    const next = await POST(singleFileRequest(Buffer.from('next')));
    expect(next.status).toBe(200);
    expect(convertHeicBuffer).toHaveBeenCalledOnce();
  });

  it('releases admission when conversion fails', async () => {
    convertHeicBuffer.mockRejectedValueOnce(
      new ImageProcessingError('IMAGE_PROCESSING_FAILED', 422),
    );
    expect((await POST(singleFileRequest())).status).toBe(422);
    expect((await POST(singleFileRequest())).status).toBe(200);
  });

  it('times out in the admission queue, removes the waiter, and never reads it', async () => {
    vi.useFakeTimers();
    const release = await imageProcessingAdmission.acquire(
      new AbortController().signal,
    );
    const controller = new AbortController();
    const queuedRequest = singleFileRequest(Buffer.from('queued'), {
      signal: controller.signal,
    });
    const getReader = vi.spyOn(queuedRequest.body!, 'getReader');
    const queued = handleConvertPost(queuedRequest, { deadlineMs: 25 });

    await vi.advanceTimersByTimeAsync(25);
    controller.abort(new DOMException('test cleanup', 'AbortError'));
    const response = await queued;

    expect(response.status).toBe(503);
    expect(getReader).not.toHaveBeenCalled();
    expect(convertHeicBuffer).not.toHaveBeenCalled();
    release();

    expect((await POST(singleFileRequest(Buffer.from('next')))).status).toBe(200);
  });

  it('cancels a stalled upload at the deadline and releases admission', async () => {
    vi.useFakeTimers();
    const source = stalledUpload();
    const controller = new AbortController();
    const pending = handleConvertPost(
      requestFromBody(source.stream, { signal: controller.signal }),
      { deadlineMs: 25 },
    );

    await vi.advanceTimersByTimeAsync(25);
    controller.abort(new DOMException('test cleanup', 'AbortError'));
    const response = await pending;

    expect(response.status).toBe(503);
    expect(source.cancel).toHaveBeenCalledOnce();
    expect(convertHeicBuffer).not.toHaveBeenCalled();

    expect((await POST(singleFileRequest(Buffer.from('next')))).status).toBe(200);
  });

  it('passes the deadline signal through conversion and releases only after cancellation settles', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    let receivedSignal: AbortSignal | undefined;
    convertHeicBuffer.mockImplementationOnce(
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise<ProcessedUploadImage>((resolve, reject) => {
          receivedSignal = signal;
          finish = () => resolve(processedImage);
          signal?.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        }),
    );

    const pending = handleConvertPost(singleFileRequest(), { deadlineMs: 25 });
    for (
      let attempts = 0;
      attempts < 20 && convertHeicBuffer.mock.calls.length === 0;
      attempts += 1
    ) {
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(convertHeicBuffer).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(25);
    finish();
    const response = await pending;

    expect(response.status).toBe(503);
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(convertHeicBuffer).toHaveBeenCalledWith({
      input: expect.any(Buffer),
      signal: expect.any(AbortSignal),
    });

    expect((await POST(singleFileRequest(Buffer.from('next')))).status).toBe(200);
  });
});
