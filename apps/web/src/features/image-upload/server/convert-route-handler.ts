import { NextResponse } from 'next/server';
import {
  ImageProcessingError,
  imageErrorPayload,
} from '../image-errors';
import { MAX_HEIC_SOURCE_BYTES } from '../image-types';
import {
  convertHeicBuffer,
  imageProcessingAdmission,
  readSingleHeicUpload,
} from './heic-converter';

const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
const MAX_HEIC_CONVERT_REQUEST_BYTES =
  MAX_HEIC_SOURCE_BYTES + MULTIPART_OVERHEAD_BYTES;
const DEFAULT_REQUEST_DEADLINE_MS = 45_000;

type ConvertPostOptions = {
  deadlineMs?: number;
};

function oversizedUpload() {
  return new ImageProcessingError('IMAGE_INPUT_TOO_LARGE', 413);
}

export async function handleConvertPost(
  request: Request,
  { deadlineMs = DEFAULT_REQUEST_DEADLINE_MS }: ConvertPostOptions = {},
) {
  const contentLength = Number(request.headers.get('content-length'));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_HEIC_CONVERT_REQUEST_BYTES
  ) {
    return errorResponse(oversizedUpload());
  }

  const deadline = new AbortController();
  const onRequestAbort = () => deadline.abort(abortReason(request.signal));
  request.signal.addEventListener('abort', onRequestAbort, { once: true });
  const timeoutId = setTimeout(() => {
    deadline.abort(
      new ImageProcessingError('IMAGE_PROCESSING_UNAVAILABLE', 503),
    );
  }, deadlineMs);

  let release: (() => void) | undefined;
  try {
    release = await imageProcessingAdmission.acquire(deadline.signal);
    const input = await readSingleHeicUpload(request, deadline.signal);
    if (deadline.signal.aborted) throw abortReason(deadline.signal);
    const processed = await convertHeicBuffer({
      input,
      signal: deadline.signal,
    });
    return NextResponse.json({ image: processed });
  } catch (error) {
    if (request.signal.aborted || isAbortError(error)) {
      return errorResponse(
        new ImageProcessingError('IMAGE_PROCESSING_FAILED', 400, {
          cause: error,
        }),
      );
    }
    if (deadline.signal.aborted) {
      return errorResponse(abortReason(deadline.signal));
    }
    return errorResponse(error);
  } finally {
    clearTimeout(timeoutId);
    request.signal.removeEventListener('abort', onRequestAbort);
    release?.();
  }
}

function errorResponse(error: unknown) {
  const payload = imageErrorPayload(error, 503);
  return NextResponse.json(payload.body, { status: payload.status });
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException
      ? error.name === 'AbortError'
      : error instanceof Error && error.name === 'AbortError'
  );
}

function abortReason(signal: AbortSignal) {
  return (
    signal.reason ??
    new DOMException('The operation was aborted', 'AbortError')
  );
}
