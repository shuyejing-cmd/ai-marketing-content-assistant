import { ImageProcessingError } from '../image-errors';

export const MAX_GENERATION_REQUEST_BYTES = 16 * 1024 * 1024;

function oversizedRequest() {
  return new ImageProcessingError('IMAGE_INPUT_TOO_LARGE', 413);
}

export async function readBoundedJson<T = unknown>(
  request: Request,
  maxBytes = MAX_GENERATION_REQUEST_BYTES,
): Promise<T> {
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      const error = oversizedRequest();
      await request.body?.cancel(error).catch(() => undefined);
      throw error;
    }
  }

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          const error = oversizedRequest();
          await reader.cancel(error).catch(() => undefined);
          throw error;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
  return JSON.parse(text) as T;
}
