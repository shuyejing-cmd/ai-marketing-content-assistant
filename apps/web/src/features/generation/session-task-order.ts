import type { GenerationTask } from './generation-types';
import type { GenerationSession } from './local-sessions';

const DEFAULT_TITLE = '新的图片会话';

export function upsertTaskIntoSession(
  session: GenerationSession | null,
  task: GenerationTask,
  now = new Date().toISOString(),
): GenerationSession {
  const fallbackSession: GenerationSession = {
    id: `session_local_${Date.now()}`,
    title: createSessionTitle(task.request.requestText),
    createdAt: now,
    updatedAt: now,
    tasks: [],
    activeTaskId: null,
  };
  const target = session ?? fallbackSession;
  const existingIndex = target.tasks.findIndex((item) => item.id === task.id);
  const tasks =
    existingIndex >= 0
      ? target.tasks.map((item) => (item.id === task.id ? task : item))
      : [...target.tasks, task];

  return {
    ...target,
    title: createSessionTitle(task.request.requestText),
    updatedAt: now,
    tasks,
    activeTaskId: task.id,
  };
}

function createSessionTitle(requestText: string) {
  const normalized = requestText.trim();
  return normalized.length > 0 ? normalized.slice(0, 18) : DEFAULT_TITLE;
}
