import type { GenerationTask, GenerationTaskRequest } from './generation-types';

export type GenerationClientMeta = {
  ownerId?: string;
  sessionId?: string;
};

export async function createGenerationTask(
  request: GenerationTaskRequest,
  meta: GenerationClientMeta = {},
): Promise<GenerationTask> {
  const response = await fetch('/api/generation-tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(meta.ownerId ? { 'x-owner-id': meta.ownerId } : {}),
    },
    body: JSON.stringify({ request, ...meta }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, '生成失败，请稍后再试'));
  }

  return response.json() as Promise<GenerationTask>;
}

export async function regenerateTask(taskId: string, meta: GenerationClientMeta = {}): Promise<GenerationTask> {
  const response = await fetch(`/api/generation-tasks/${taskId}/regenerate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(meta.ownerId ? { 'x-owner-id': meta.ownerId } : {}),
    },
    body: JSON.stringify(meta),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, '重新生成失败，请稍后再试'));
  }

  return response.json() as Promise<GenerationTask>;
}

export async function modifyTask(
  taskId: string,
  selectedResultId: string,
  modificationText: string,
  meta: GenerationClientMeta = {},
): Promise<GenerationTask> {
  const response = await fetch(`/api/generation-tasks/${taskId}/modify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(meta.ownerId ? { 'x-owner-id': meta.ownerId } : {}),
    },
    body: JSON.stringify({ selectedResultId, modificationText, ...meta }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, '二次修改失败，请稍后再试'));
  }

  return response.json() as Promise<GenerationTask>;
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const body = await response.json();
    return typeof body.message === 'string' ? body.message : fallback;
  } catch {
    return fallback;
  }
}
