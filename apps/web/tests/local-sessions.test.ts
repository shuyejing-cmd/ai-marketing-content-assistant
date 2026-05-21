import type { GenerationTask } from '../src/features/generation/generation-types';
import {
  createEmptySession,
  getCurrentSessionId,
  loadSessions,
  saveTaskToCurrentSession,
  setCurrentSessionId,
} from '../src/features/generation/local-sessions';

const baseTask: GenerationTask = {
  id: 'task_a',
  status: 'succeeded',
  request: {
    requestText: '给新品奶茶做朋友圈宣传图',
    channels: ['wechat'],
    scene: 'new_product',
    style: 'young_trendy',
    campaignInfo: {},
  },
  results: [],
};

describe('local generation sessions', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        clear: () => store.clear(),
        getItem: (key: string) => store.get(key) ?? null,
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        removeItem: (key: string) => store.delete(key),
        setItem: (key: string, value: string) => store.set(key, value),
        get length() {
          return store.size;
        },
      },
    });
  });

  it('creates an empty current session', () => {
    const session = createEmptySession();

    expect(getCurrentSessionId()).toBe(session.id);
    expect(loadSessions()[0]).toMatchObject({
      id: session.id,
      title: '新的图片会话',
      tasks: [],
      activeTaskId: null,
    });
  });

  it('saves tasks into current session and updates title', () => {
    const session = createEmptySession();
    const updated = saveTaskToCurrentSession(baseTask);

    expect(updated.id).toBe(session.id);
    expect(updated.title).toBe('给新品奶茶做朋友圈宣传图');
    expect(updated.activeTaskId).toBe(baseTask.id);
    expect(updated.tasks).toEqual([baseTask]);
  });

  it('can switch current session and keeps at most twenty sessions', () => {
    const sessions = Array.from({ length: 22 }, () => createEmptySession());
    setCurrentSessionId(sessions[5].id);

    expect(getCurrentSessionId()).toBe(sessions[5].id);
    expect(loadSessions()).toHaveLength(20);
  });

  it('returns an empty list for corrupted storage data', () => {
    localStorage.setItem('ai-marketing-generation-sessions', '{not-json');

    expect(loadSessions()).toEqual([]);
  });
});
