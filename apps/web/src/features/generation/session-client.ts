import type { GenerationSession } from './local-sessions';

export type SessionScope =
  | { kind: 'free' }
  | { kind: 'template'; templateId: string };

export async function listSessions(
  ownerId: string,
  scope: SessionScope = { kind: 'free' },
): Promise<GenerationSession[]> {
  const response = await fetch(`/api/generation-sessions${toScopeQuery(scope)}`, {
    headers: { 'x-owner-id': ownerId },
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, '读取历史会话失败'));
  return response.json() as Promise<GenerationSession[]>;
}

export async function createSession(
  ownerId: string,
  scope: SessionScope = { kind: 'free' },
): Promise<GenerationSession> {
  const response = await fetch('/api/generation-sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-owner-id': ownerId,
    },
    body: JSON.stringify(scope),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, '新建会话失败'));
  return response.json() as Promise<GenerationSession>;
}

export async function renameSession(ownerId: string, sessionId: string, title: string): Promise<GenerationSession> {
  const response = await fetch(`/api/generation-sessions/${sessionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-owner-id': ownerId,
    },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, '重命名会话失败'));
  return response.json() as Promise<GenerationSession>;
}

export async function deleteSession(ownerId: string, sessionId: string): Promise<void> {
  const response = await fetch(`/api/generation-sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { 'x-owner-id': ownerId },
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, '删除会话失败'));
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const body = await response.json();
    return typeof body.message === 'string' ? body.message : fallback;
  } catch {
    return fallback;
  }
}

function toScopeQuery(scope: SessionScope) {
  if (scope.kind === 'template') {
    return `?templateId=${encodeURIComponent(scope.templateId)}`;
  }
  return '?kind=free';
}
