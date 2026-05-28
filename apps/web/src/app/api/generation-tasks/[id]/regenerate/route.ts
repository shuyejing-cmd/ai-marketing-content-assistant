import { NextResponse } from 'next/server';
import { getRequestOwner } from '@/features/auth/server/request-auth';
import { getGenerationService } from '@/features/generation/server/runtime';
import { createTemplateRepository } from '@/features/templates/server/template-repository';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { ownerId } = await getRequestOwner(request);
  const service = getGenerationService();
  const previous = await service.getTaskForOwner(ownerId, id);
  if (!previous) {
    return NextResponse.json({ message: 'Task not found' }, { status: 404 });
  }

  try {
    const templateInstruction = previous.request.templateId
      ? (await createTemplateRepository().getAdminTemplate(previous.request.templateId))?.prompt
      : undefined;
    const task = await service.createTask({
      ownerId,
      sessionId: body.sessionId ?? null,
      request: previous.request,
      templateInstruction,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : '重新生成失败' },
      { status: 500 },
    );
  }
}
