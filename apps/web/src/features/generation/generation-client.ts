import type { GenerationTask, GenerationTaskRequest } from './generation-types';

export async function createGenerationTask(request: GenerationTaskRequest): Promise<GenerationTask> {
  const response = await fetch('/api/generation-tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error('生成失败，请稍后再试');
  }

  return response.json() as Promise<GenerationTask>;
}

export async function regenerateTask(taskId: string): Promise<GenerationTask> {
  const response = await fetch(`/api/generation-tasks/${taskId}/regenerate`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('重新生成失败，请稍后再试');
  }

  return response.json() as Promise<GenerationTask>;
}

export async function modifyTask(
  taskId: string,
  selectedResultId: string,
  modificationText: string,
): Promise<GenerationTask> {
  const response = await fetch(`/api/generation-tasks/${taskId}/modify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selectedResultId, modificationText }),
  });

  if (!response.ok) {
    throw new Error('二次修改失败，请稍后再试');
  }

  return response.json() as Promise<GenerationTask>;
}
