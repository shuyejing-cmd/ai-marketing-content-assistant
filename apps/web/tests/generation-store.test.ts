import { createGenerationStore } from '../src/features/generation/server/generation-store';
import { getPrismaClient } from '../src/features/generation/server/prisma';
import { createSessionRepository } from '../src/features/generation/server/session-repository';
import type { GenerationTask } from '../src/features/generation/generation-types';

vi.mock('../src/features/generation/server/prisma', () => ({
  getPrismaClient: vi.fn(),
}));

const task: GenerationTask = {
  id: 'task_1',
  status: 'succeeded',
  request: {
    requestText: 'Launch a citrus milk tea poster',
    channels: ['wechat'],
    scene: 'new_product',
    style: 'young_trendy',
    campaignInfo: { productName: 'Citrus Milk Tea' },
  },
  results: [],
};

describe('generation store', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPrismaClient).mockReset();
    const globalStore = globalThis as unknown as {
      generationMemoryTasks?: Map<string, GenerationTask>;
      generationMemoryTaskMeta?: Map<string, unknown>;
      generationMemorySessions?: Map<string, unknown>;
    };
    globalStore.generationMemoryTasks?.clear();
    globalStore.generationMemoryTaskMeta?.clear();
    globalStore.generationMemorySessions?.clear();
  });

  it('stores a null Prisma sessionId and skips current-task update when the session belongs to another owner', async () => {
    const prisma = createMockPrisma({ session: null });
    vi.mocked(getPrismaClient).mockReturnValue(prisma);

    const store = createGenerationStore();
    await store.saveTask(task, { ownerId: 'owner_attacker', sessionId: 'session_victim' });

    expect(prisma.session.findFirst).toHaveBeenCalledWith({
      where: { id: 'session_victim', ownerId: 'owner_attacker' },
    });
    expect(prisma.generationTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: 'owner_attacker',
          sessionId: null,
        }),
      }),
    );
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('keeps a Prisma sessionId and updates current task when the session matches the owner', async () => {
    const prisma = createMockPrisma({
      session: {
        id: 'session_1',
        ownerId: 'owner_1',
        title: 'Existing',
        currentTaskId: null,
        createdAt: new Date('2026-05-27T00:00:00.000Z'),
        updatedAt: new Date('2026-05-27T00:00:00.000Z'),
      },
    });
    vi.mocked(getPrismaClient).mockReturnValue(prisma);

    const store = createGenerationStore();
    await store.saveTask(task, { ownerId: 'owner_1', sessionId: 'session_1' });

    expect(prisma.session.findFirst).toHaveBeenCalledWith({
      where: { id: 'session_1', ownerId: 'owner_1' },
    });
    expect(prisma.generationTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: 'owner_1',
          sessionId: 'session_1',
        }),
      }),
    );
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: 'session_1', ownerId: 'owner_1' },
      data: {
        currentTaskId: 'task_1',
        title: 'Launch a citrus mi',
      },
    });
  });

  it('stores a null memory sessionId and skips current-task update when the session belongs to another owner', async () => {
    vi.mocked(getPrismaClient).mockReturnValue(null);
    const sessions = createSessionRepository(null);
    const victimSession = await sessions.createSession('owner_victim');

    const store = createGenerationStore();
    await store.saveTask(task, { ownerId: 'owner_attacker', sessionId: victimSession.id });

    await expect(store.listTasksForSession?.('owner_attacker', victimSession.id)).resolves.toEqual([]);
    await expect(sessions.getSession('owner_victim', victimSession.id)).resolves.toEqual(
      expect.objectContaining({ currentTaskId: null }),
    );
  });

  it('keeps a memory sessionId and updates current task when the session matches the owner', async () => {
    vi.mocked(getPrismaClient).mockReturnValue(null);
    const sessions = createSessionRepository(null);
    const session = await sessions.createSession('owner_1');

    const store = createGenerationStore();
    await store.saveTask(task, { ownerId: 'owner_1', sessionId: session.id });

    await expect(store.listTasksForSession?.('owner_1', session.id)).resolves.toEqual([task]);
    await expect(sessions.getSession('owner_1', session.id)).resolves.toEqual(
      expect.objectContaining({ currentTaskId: 'task_1', title: 'Launch a citrus mi' }),
    );
  });
});

function createMockPrisma({ session }: { session: unknown }) {
  return {
    generationTask: {
      create: vi.fn(async () => ({})),
    },
    session: {
      findFirst: vi.fn(async () => session),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    promptLog: {
      create: vi.fn(),
    },
    imageAsset: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  } as unknown as ReturnType<typeof getPrismaClient>;
}
