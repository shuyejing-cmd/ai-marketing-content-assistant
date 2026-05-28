import { NextRequest, NextResponse } from 'next/server';
import { createSessionRepository } from '@/features/generation/server/session-repository';
import type { SessionScope } from '@/features/generation/server/session-repository';
import { getGenerationService } from '@/features/generation/server/runtime';
import type { GenerationTask } from '@/features/generation/generation-types';
import { getRequestOwner } from '@/features/auth/server/request-auth';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as { title?: string };
  const { ownerId } = await getRequestOwner(request);
  const session = await createSessionRepository().renameSession(ownerId, id, body.title ?? '');
  return NextResponse.json(await hydrateSession(ownerId, session));
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const { ownerId } = await getRequestOwner(request);
  try {
    await createSessionRepository().deleteSession(ownerId, id);
    return NextResponse.json({ ok: true, deleted: true });
  } catch (error) {
    if (isNotFoundError(error)) {
      return NextResponse.json({ ok: true, deleted: false });
    }
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : '删除会话失败' },
      { status: 500 },
    );
  }
}

function isNotFoundError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  return 'code' in error && (error as { code?: unknown }).code === 'P2025';
}

async function hydrateSession(ownerId: string, session: {
  id: string;
  title: string;
  kind?: string;
  templateId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  currentTaskId: string | null;
}) {
  const scope = getSessionScope(session);
  const generationService = getGenerationService();
  const allTasks = await generationService.listTasksForSession(ownerId, session.id);
  const tasks = filterTasksForScope(allTasks, scope);
  const fetchedActiveTask = session.currentTaskId ? await generationService.getTask(session.currentTaskId) : null;
  const activeTask = session.currentTaskId
    ? tasks.find((task) => task.id === session.currentTaskId) ??
      (fetchedActiveTask && taskMatchesScope(fetchedActiveTask, scope) ? fetchedActiveTask : null)
    : tasks.at(-1) ?? null;
  return {
    id: session.id,
    title: session.title,
    kind: session.kind ?? scope.kind,
    templateId: session.templateId ?? (scope.kind === 'template' ? scope.templateId : null),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    tasks,
    activeTaskId: activeTask?.id ?? null,
  };
}

function getSessionScope(session: { kind?: string; templateId?: string | null }): SessionScope {
  if (session.kind === 'template' && session.templateId) {
    return { kind: 'template', templateId: session.templateId };
  }
  return { kind: 'free' };
}

function filterTasksForScope(tasks: GenerationTask[], scope: SessionScope) {
  return tasks.filter((task) => taskMatchesScope(task, scope));
}

function taskMatchesScope(task: GenerationTask, scope: SessionScope) {
  if (scope.kind === 'template') {
    return task.request.templateId === scope.templateId;
  }
  return !task.request.templateId;
}
