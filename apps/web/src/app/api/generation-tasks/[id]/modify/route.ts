import { NextRequest, NextResponse } from 'next/server';
import { getGenerationService } from '@/features/generation/server/runtime';
import { createTemplateRepository } from '@/features/templates/server/template-repository';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const service = getGenerationService();
  const previous = await service.getTask(id);
  if (!previous) {
    return NextResponse.json({ message: 'Task not found' }, { status: 404 });
  }

  const body = (await request.json()) as {
    selectedResultId: string;
    modificationText: string;
    ownerId?: string;
    sessionId?: string;
  };
  try {
    const templateInstruction = previous.request.templateId
      ? (await createTemplateRepository().getAdminTemplate(previous.request.templateId))?.prompt
      : undefined;
    const task = await service.createTask({
      ownerId: request.headers.get('x-owner-id') ?? body.ownerId ?? 'anonymous',
      sessionId: body.sessionId ?? null,
      request: previous.request,
      modificationText: body.modificationText,
      templateInstruction,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : '二次修改失败' },
      { status: 500 },
    );
  }
}
