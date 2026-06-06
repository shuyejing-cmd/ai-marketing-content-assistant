import type { GenerationTask } from '../src/features/generation/generation-types';
import type { GenerationSession } from '../src/features/generation/local-sessions';
import { upsertTaskIntoSession } from '../src/features/generation/session-task-order';

const baseTask: GenerationTask = {
  id: 'task_a',
  status: 'succeeded',
  request: {
    requestText: '第一次生成',
    channels: ['wechat'],
    scene: 'new_product',
    style: 'young_trendy',
    campaignInfo: {},
  },
  results: [],
};

describe('upsertTaskIntoSession', () => {
  it('appends new tasks after existing conversation records', () => {
    const session: GenerationSession = {
      id: 'session_1',
      title: '旧会话',
      createdAt: '2026-05-25T00:00:00.000Z',
      updatedAt: '2026-05-25T00:00:00.000Z',
      tasks: [baseTask],
      activeTaskId: baseTask.id,
    };
    const nextTask: GenerationTask = {
      ...baseTask,
      id: 'task_b',
      request: { ...baseTask.request, requestText: '第二次生成' },
    };

    const updated = upsertTaskIntoSession(session, nextTask, '2026-05-25T01:00:00.000Z');

    expect(updated.tasks.map((task) => task.id)).toEqual(['task_a', 'task_b']);
    expect(updated.activeTaskId).toBe('task_b');
  });

  it('replaces an existing task without moving it to the top', () => {
    const secondTask: GenerationTask = { ...baseTask, id: 'task_b' };
    const session: GenerationSession = {
      id: 'session_1',
      title: '旧会话',
      createdAt: '2026-05-25T00:00:00.000Z',
      updatedAt: '2026-05-25T00:00:00.000Z',
      tasks: [baseTask, secondTask],
      activeTaskId: secondTask.id,
    };
    const replacement: GenerationTask = {
      ...baseTask,
      id: 'task_a',
      request: { ...baseTask.request, requestText: '第一次生成更新' },
    };

    const updated = upsertTaskIntoSession(session, replacement, '2026-05-25T01:00:00.000Z');

    expect(updated.tasks.map((task) => task.id)).toEqual(['task_a', 'task_b']);
    expect(updated.tasks[0].request.requestText).toBe('第一次生成更新');
  });
});
