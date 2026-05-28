import { NextRequest, NextResponse } from 'next/server';
import { createSessionRepository } from '@/features/generation/server/session-repository';
import type { SessionScope } from '@/features/generation/server/session-repository';
import { getGenerationService } from '@/features/generation/server/runtime';
import type { GenerationTask } from '@/features/generation/generation-types';
import { getRequestOwner } from '@/features/auth/server/request-auth';

export async function GET(request: NextRequest) {
  const { ownerId } = await getRequestOwner(request);
  const scope = getScope(request);
  const sessions = await createSessionRepository().listSessions(ownerId, scope);
  const hydrated = await Promise.all(sessions.map((session) => hydrateSession(ownerId, session, scope)));
  return NextResponse.json(hydrated);
}

export async function POST(request: NextRequest) {
  const { ownerId } = await getRequestOwner(request);
  const body = (await request.json().catch(() => ({}))) as Partial<SessionScope>;
  const scope = normalizeScope(body);
  const session = await createSessionRepository().createSession(ownerId, scope);
  return NextResponse.json(await hydrateSession(ownerId, session, scope), { status: 201 });
}

function getScope(request: NextRequest): SessionScope {
  const url = new URL(request.url);
  const templateId = url.searchParams.get('templateId')?.trim();
  if (templateId) return { kind: 'template', templateId };
  return { kind: 'free' };
}

function normalizeScope(input: Partial<SessionScope>): SessionScope {
  if (input.kind === 'template' && 'templateId' in input && typeof input.templateId === 'string' && input.templateId.trim()) {
    return { kind: 'template', templateId: input.templateId.trim() };
  }
  return { kind: 'free' };
}

async function hydrateSession(ownerId: string, session: {
  id: string;
  title: string;
  kind?: string;
  templateId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  currentTaskId: string | null;
}, scope: SessionScope) {
  const generationService = getGenerationService();
  const allTasks = await generationService.listTasksForSession(ownerId, session.id);
  const tasks = filterTasksForScope(allTasks, scope);
  const fetchedActiveTask = session.currentTaskId
    ? await generationService.getTaskForOwner(ownerId, session.currentTaskId)
    : null;
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

function filterTasksForScope(tasks: GenerationTask[], scope: SessionScope) {
  return tasks.filter((task) => taskMatchesScope(task, scope));
}

function taskMatchesScope(task: GenerationTask, scope: SessionScope) {
  if (scope.kind === 'template') {
    return task.request.templateId === scope.templateId;
  }
  return !task.request.templateId;
}
