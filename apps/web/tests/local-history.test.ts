import type { GenerationTask } from '../src/features/generation/generation-types';
import { loadTaskHistory, saveTaskToHistory } from '../src/features/generation/local-history';

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

describe('local generation history', () => {
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

  it('saves newest task first and deduplicates by task id', () => {
    saveTaskToHistory(baseTask);
    saveTaskToHistory({ ...baseTask, request: { ...baseTask.request, requestText: '更新后的需求' } });

    expect(loadTaskHistory()).toHaveLength(1);
    expect(loadTaskHistory()[0].request.requestText).toBe('更新后的需求');
  });

  it('keeps at most ten tasks', () => {
    for (let index = 0; index < 12; index += 1) {
      saveTaskToHistory({ ...baseTask, id: `task_${index}` });
    }

    expect(loadTaskHistory()).toHaveLength(10);
    expect(loadTaskHistory()[0].id).toBe('task_11');
  });
});
