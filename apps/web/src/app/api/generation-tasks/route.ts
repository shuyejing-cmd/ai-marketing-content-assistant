import { NextRequest, NextResponse } from 'next/server';
import type { GenerationTaskRequest } from '@/features/generation/generation-types';
import { getGenerationService } from '@/features/generation/server/runtime';
import { getRequestOwner } from '@/features/auth/server/request-auth';
import { ImageProcessingError, imageErrorPayload } from '@/features/image-upload/image-errors';
import { readBoundedJson } from '@/features/image-upload/server/read-bounded-json';

export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedJson<
      (GenerationTaskRequest & {
        ownerId?: unknown;
        sessionId?: string | null;
      }) | {
        request: GenerationTaskRequest;
        sessionId?: string | null;
      }
    >(request);
    const generationRequest = unwrapGenerationRequest(body);
    const { ownerId } = await getRequestOwner(request);
    const task = await getGenerationService().createTask({
      ownerId,
      sessionId: body.sessionId ?? null,
      request: generationRequest,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      const payload = imageErrorPayload(error);
      return NextResponse.json(payload.body, { status: payload.status });
    }
    return NextResponse.json(
      { message: error instanceof Error ? error.message : '生成失败' },
      { status: 500 },
    );
  }
}

function unwrapGenerationRequest(body: (GenerationTaskRequest & { ownerId?: unknown }) | { request: GenerationTaskRequest }) {
  if ('request' in body) return body.request;
  const { ownerId: _ownerId, ...generationRequest } = body;
  return generationRequest;
}
