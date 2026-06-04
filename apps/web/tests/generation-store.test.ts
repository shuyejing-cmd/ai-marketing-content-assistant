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

const templateTask: GenerationTask = {
  ...task,
  id: 'task_template_1',
  request: {
    ...task.request,
    templateId: 'tpl_1',
  },
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
        kind: 'free',
        templateId: null,
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

  it('returns a Prisma task for the matching owner and null for a different owner', async () => {
    const prisma = createMockPrisma({ session: null, taskRecord: createTaskRecord(task) });
    vi.mocked(getPrismaClient).mockReturnValue(prisma);

    const store = createGenerationStore();

    await expect(store.getTaskForOwner?.('owner_1', 'task_1')).resolves.toEqual(task);

    vi.mocked(prisma.generationTask.findFirst).mockResolvedValueOnce(null);
    await expect(store.getTaskForOwner?.('owner_2', 'task_1')).resolves.toBeNull();
    expect(prisma.generationTask.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 'task_1', ownerId: 'owner_1' },
      include: { results: true },
    });
    expect(prisma.generationTask.findFirst).toHaveBeenNthCalledWith(2, {
      where: { id: 'task_1', ownerId: 'owner_2' },
      include: { results: true },
    });
  });

  it('stores a null Prisma sessionId and skips current-task update when a free task receives a template session', async () => {
    const prisma = createMockPrisma({
      session: createSessionRecord({ id: 'session_template', kind: 'template', templateId: 'tpl_1' }),
    });
    vi.mocked(getPrismaClient).mockReturnValue(prisma);

    const store = createGenerationStore();
    await store.saveTask(task, { ownerId: 'owner_1', sessionId: 'session_template' });

    expect(prisma.generationTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessionId: null }),
      }),
    );
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('stores a null Prisma sessionId and skips current-task update when a template task receives a free session', async () => {
    const prisma = createMockPrisma({
      session: createSessionRecord({ id: 'session_free', kind: 'free', templateId: null }),
    });
    vi.mocked(getPrismaClient).mockReturnValue(prisma);

    const store = createGenerationStore();
    await store.saveTask(templateTask, { ownerId: 'owner_1', sessionId: 'session_free' });

    expect(prisma.generationTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessionId: null }),
      }),
    );
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('stores a null Prisma sessionId and skips current-task update when a template task receives another template session', async () => {
    const prisma = createMockPrisma({
      session: createSessionRecord({ id: 'session_template_2', kind: 'template', templateId: 'tpl_2' }),
    });
    vi.mocked(getPrismaClient).mockReturnValue(prisma);

    const store = createGenerationStore();
    await store.saveTask(templateTask, { ownerId: 'owner_1', sessionId: 'session_template_2' });

    expect(prisma.generationTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessionId: null }),
      }),
    );
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('keeps a Prisma template sessionId and updates current task when template scope matches', async () => {
    const prisma = createMockPrisma({
      session: createSessionRecord({ id: 'session_template_1', kind: 'template', templateId: 'tpl_1' }),
    });
    vi.mocked(getPrismaClient).mockReturnValue(prisma);

    const store = createGenerationStore();
    await store.saveTask(templateTask, { ownerId: 'owner_1', sessionId: 'session_template_1' });

    expect(prisma.generationTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessionId: 'session_template_1' }),
      }),
    );
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: 'session_template_1', ownerId: 'owner_1' },
      data: {
        currentTaskId: 'task_template_1',
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

  it('returns a memory task for the matching owner and null for a different owner', async () => {
    vi.mocked(getPrismaClient).mockReturnValue(null);

    const store = createGenerationStore();
    await store.saveTask(task, { ownerId: 'owner_1' });

    await expect(store.getTaskForOwner?.('owner_1', 'task_1')).resolves.toEqual(task);
    await expect(store.getTaskForOwner?.('owner_2', 'task_1')).resolves.toBeNull();
  });

  it('stores a null memory sessionId and skips current-task update when a free task receives a template session', async () => {
    vi.mocked(getPrismaClient).mockReturnValue(null);
    const sessions = createSessionRepository(null);
    const session = await sessions.createSession('owner_1', { kind: 'template', templateId: 'tpl_1' });

    const store = createGenerationStore();
    await store.saveTask(task, { ownerId: 'owner_1', sessionId: session.id });

    await expect(store.listTasksForSession?.('owner_1', session.id)).resolves.toEqual([]);
    await expect(sessions.getSession('owner_1', session.id)).resolves.toEqual(
      expect.objectContaining({ currentTaskId: null }),
    );
  });

  it('stores a null memory sessionId and skips current-task update when a template task receives a free session', async () => {
    vi.mocked(getPrismaClient).mockReturnValue(null);
    const sessions = createSessionRepository(null);
    const session = await sessions.createSession('owner_1');

    const store = createGenerationStore();
    await store.saveTask(templateTask, { ownerId: 'owner_1', sessionId: session.id });

    await expect(store.listTasksForSession?.('owner_1', session.id)).resolves.toEqual([]);
    await expect(sessions.getSession('owner_1', session.id)).resolves.toEqual(
      expect.objectContaining({ currentTaskId: null }),
    );
  });

  it('stores a null memory sessionId and skips current-task update when a template task receives another template session', async () => {
    vi.mocked(getPrismaClient).mockReturnValue(null);
    const sessions = createSessionRepository(null);
    const session = await sessions.createSession('owner_1', { kind: 'template', templateId: 'tpl_2' });

    const store = createGenerationStore();
    await store.saveTask(templateTask, { ownerId: 'owner_1', sessionId: session.id });

    await expect(store.listTasksForSession?.('owner_1', session.id)).resolves.toEqual([]);
    await expect(sessions.getSession('owner_1', session.id)).resolves.toEqual(
      expect.objectContaining({ currentTaskId: null }),
    );
  });

  it('keeps a memory template sessionId and updates current task when template scope matches', async () => {
    vi.mocked(getPrismaClient).mockReturnValue(null);
    const sessions = createSessionRepository(null);
    const session = await sessions.createSession('owner_1', { kind: 'template', templateId: 'tpl_1' });

    const store = createGenerationStore();
    await store.saveTask(templateTask, { ownerId: 'owner_1', sessionId: session.id });

    await expect(store.listTasksForSession?.('owner_1', session.id)).resolves.toEqual([templateTask]);
    await expect(sessions.getSession('owner_1', session.id)).resolves.toEqual(
      expect.objectContaining({ currentTaskId: 'task_template_1', title: 'Launch a citrus mi' }),
    );
  });
});

function createMockPrisma({ session, taskRecord = null }: { session: unknown; taskRecord?: unknown }) {
  return {
    generationTask: {
      create: vi.fn(async () => ({})),
      findFirst: vi.fn(async () => taskRecord),
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

function createSessionRecord(overrides: Record<string, unknown>) {
  return {
    id: 'session_1',
    ownerId: 'owner_1',
    kind: 'free',
    templateId: null,
    title: 'Existing',
    currentTaskId: null,
    createdAt: new Date('2026-05-27T00:00:00.000Z'),
    updatedAt: new Date('2026-05-27T00:00:00.000Z'),
    ...overrides,
  };
}

function createTaskRecord(input: GenerationTask) {
  return {
    id: input.id,
    ownerId: 'owner_1',
    sessionId: null,
    status: input.status,
    errorMessage: input.errorMessage ?? null,
    requestJson: input.request,
    createdAt: new Date('2026-05-27T00:00:00.000Z'),
    results: input.results,
  };
}
