import { NextRequest, NextResponse } from 'next/server';
import type { GenerationTaskRequest } from '@/features/generation/generation-types';
import { getGenerationService } from '@/features/generation/server/runtime';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const generationRequest = unwrapGenerationRequest(body);
    const task = await getGenerationService().createTask({
      ownerId: body.ownerId ?? request.headers.get('x-owner-id') ?? 'anonymous',
      sessionId: body.sessionId ?? null,
      request: generationRequest,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : '生成失败' },
      { status: 500 },
    );
  }
}

function unwrapGenerationRequest(body: GenerationTaskRequest | { request: GenerationTaskRequest }) {
  return 'request' in body ? body.request : body;
}
