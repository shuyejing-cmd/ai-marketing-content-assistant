import { NextResponse } from 'next/server';
import { createBackendRunLogger } from '@/features/generation/server/run-logger';

type DevRunLogBody = {
  event?: string;
  sessionId?: string | null;
  ownerId?: string | null;
  [key: string]: unknown;
};

const allowedEvents = new Set([
  'frontend.image.uploaded',
  'frontend.option.changed',
  'frontend.generation.submit',
]);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as DevRunLogBody;
  const event = typeof body.event === 'string' ? body.event : 'frontend.unknown';

  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ ok: true, logged: false });
  }

  if (!allowedEvents.has(event)) {
    return NextResponse.json({ ok: true, logged: false });
  }

  const logger = createBackendRunLogger('frontend', {
    ownerId: body.ownerId ?? null,
    sessionId: body.sessionId ?? null,
  });
  logger.step(event, sanitizeFrontendMeta(body));

  return NextResponse.json({ ok: true, logged: true });
}

function sanitizeFrontendMeta(body: DevRunLogBody): Record<string, unknown> {
  const { event: _event, ownerId: _ownerId, sessionId: _sessionId, ...meta } = body;
  return flattenImageSummary(removeRawImageData(meta));
}

function removeRawImageData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeRawImageData);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => {
      if (/raw|dataUrl|base64$/i.test(key)) return [key, '[redacted]'];
      return [key, removeRawImageData(nestedValue)];
    }),
  );
}

function flattenImageSummary(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  if (!('image' in value)) return value as Record<string, unknown>;

  const { image, ...rest } = value as Record<string, unknown>;
  if (!image || typeof image !== 'object') return rest;

  const imageSummary = image as Record<string, unknown>;
  return {
    ...rest,
    mimeType: imageSummary.mimeType,
    base64Length: imageSummary.base64Length,
    estimatedBytes: imageSummary.estimatedBytes,
    hash: imageSummary.hash,
  };
}
