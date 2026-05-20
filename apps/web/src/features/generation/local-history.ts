import type { GenerationTask } from './generation-types';

const HISTORY_KEY = 'ai-marketing-local-history';
const MAX_HISTORY_ITEMS = 10;

export function saveTaskToHistory(task: GenerationTask) {
  const storage = getStorage();
  if (!storage) return;

  const existing = loadTaskHistory();
  const next = [task, ...existing.filter((item) => item.id !== task.id)].slice(0, MAX_HISTORY_ITEMS);
  storage.setItem(HISTORY_KEY, JSON.stringify(next));
}

export function loadTaskHistory(): GenerationTask[] {
  const storage = getStorage();
  if (!storage) return [];

  const raw = storage.getItem(HISTORY_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GenerationTask[]) : [];
  } catch {
    return [];
  }
}

function getStorage(): Storage | null {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
}
