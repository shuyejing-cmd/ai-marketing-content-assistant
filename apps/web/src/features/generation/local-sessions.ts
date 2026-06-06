import type { GenerationTask } from './generation-types';

export type GenerationSession = {
  id: string;
  title: string;
  kind?: 'free' | 'template';
  templateId?: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: GenerationTask[];
  activeTaskId: string | null;
};

const SESSIONS_KEY = 'ai-marketing-generation-sessions';
const CURRENT_SESSION_KEY = 'ai-marketing-current-generation-session-id';
const MAX_SESSIONS = 20;
const DEFAULT_TITLE = '新的图片会话';

export function createEmptySession(): GenerationSession {
  const now = new Date().toISOString();
  const session: GenerationSession = {
    id: createSessionId(),
    title: DEFAULT_TITLE,
    createdAt: now,
    updatedAt: now,
    tasks: [],
    activeTaskId: null,
  };

  saveSessions([session, ...loadSessions()]);
  setCurrentSessionId(session.id);
  return session;
}

export function loadSessions(): GenerationSession[] {
  const storage = getStorage();
  if (!storage) return [];

  const raw = storage.getItem(SESSIONS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GenerationSession[]) : [];
  } catch {
    return [];
  }
}

export function saveTaskToCurrentSession(task: GenerationTask): GenerationSession {
  const sessions = loadSessions();
  const currentSessionId = getCurrentSessionId();
  const fallbackSession = sessions[0] ?? createEmptySession();
  const currentSession = sessions.find((session) => session.id === currentSessionId) ?? fallbackSession;
  const now = new Date().toISOString();
  const updatedSession: GenerationSession = {
    ...currentSession,
    title: createSessionTitle(task.request.requestText),
    updatedAt: now,
    tasks: [...currentSession.tasks.filter((item) => item.id !== task.id), task],
    activeTaskId: task.id,
  };

  const nextSessions = [
    updatedSession,
    ...loadSessions().filter((session) => session.id !== updatedSession.id),
  ];
  saveSessions(nextSessions);
  setCurrentSessionId(updatedSession.id);
  return updatedSession;
}

export function getCurrentSessionId(): string | undefined {
  return getStorage()?.getItem(CURRENT_SESSION_KEY) ?? undefined;
}

export function setCurrentSessionId(sessionId: string) {
  getStorage()?.setItem(CURRENT_SESSION_KEY, sessionId);
}

export function getActiveTask(session: GenerationSession | undefined): GenerationTask | null {
  if (!session || !session.activeTaskId) return null;
  return session.tasks.find((task) => task.id === session.activeTaskId) ?? null;
}

function saveSessions(sessions: GenerationSession[]) {
  getStorage()?.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
}

function createSessionTitle(requestText: string) {
  const normalized = requestText.trim();
  return normalized.length > 0 ? normalized.slice(0, 18) : DEFAULT_TITLE;
}

function createSessionId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `session_${crypto.randomUUID()}`;
  }
  return `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function getStorage(): Storage | null {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
}
