import { createSessionRepository } from '../src/features/generation/server/session-repository';

type SessionRecord = {
  id: string;
  ownerId: string;
  title: string;
  kind?: string;
  templateId?: string | null;
  currentTaskId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

describe('session repository', () => {
  it('creates, renames, and deletes database sessions for one anonymous owner', async () => {
    const sessions = new Map<string, SessionRecord>();
    const repository = createSessionRepository({
      session: {
        create: vi.fn(async ({ data }) => {
          const session = {
            id: data.id,
            ownerId: data.ownerId,
            title: data.title,
            currentTaskId: data.currentTaskId ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          sessions.set(session.id, session);
          return session;
        }),
        update: vi.fn(async ({ where, data }) => {
          const session = sessions.get(where.id);
          if (!session || session.ownerId !== where.ownerId) throw new Error('not found');
          const next = { ...session, ...data, updatedAt: new Date() };
          sessions.set(session.id, next);
          return next;
        }),
        delete: vi.fn(async ({ where }) => {
          const session = sessions.get(where.id);
          if (!session || session.ownerId !== where.ownerId) throw new Error('not found');
          sessions.delete(session.id);
          return session;
        }),
        findFirst: vi.fn(async ({ where }) => {
          const session = sessions.get(where.id);
          return session && session.ownerId === where.ownerId ? session : null;
        }),
      },
    });
    const ownerId = `owner_${Date.now()}`;

    const created = await repository.createSession(ownerId);
    expect(created.title).toBe('新的图片会话');
    expect(created.ownerId).toBe(ownerId);

    const renamed = await repository.renameSession(ownerId, created.id, '周末新品活动');
    expect(renamed.title).toBe('周末新品活动');

    await repository.deleteSession(ownerId, created.id);
    await expect(repository.getSession(ownerId, created.id)).resolves.toBeNull();
  });

  it('creates and lists free sessions separately from template sessions', async () => {
    const findMany = vi.fn(async ({ where, take }: { where: { ownerId: string; kind?: string; templateId?: string | null }; take: number }) =>
      Array.from(sessions.values())
        .filter((session) => session.ownerId === where.ownerId)
        .filter((session) => (where.kind ? (session.kind ?? 'free') === where.kind : true))
        .filter((session) => (where.templateId !== undefined ? (session.templateId ?? null) === where.templateId : true))
        .slice(0, take),
    );
    const sessions = new Map<string, SessionRecord>([
      ['free_1', makeSession({ id: 'free_1', kind: 'free', templateId: null })],
      ['legacy_1', makeSession({ id: 'legacy_1' })],
      ['template_1', makeSession({ id: 'template_1', kind: 'template', templateId: 'tpl_1' })],
      ['template_2', makeSession({ id: 'template_2', kind: 'template', templateId: 'tpl_2' })],
    ]);
    const repository = createSessionRepository({
      session: {
        create: vi.fn(async ({ data }) => {
          sessions.set(data.id, data);
          return data;
        }),
        update: vi.fn(),
        delete: vi.fn(),
        findFirst: vi.fn(),
        findMany,
      },
    });

    const free = await repository.listSessions('owner_1', { kind: 'free' });
    const template = await repository.listSessions('owner_1', { kind: 'template', templateId: 'tpl_1' });
    const createdTemplate = await repository.createSession('owner_1', { kind: 'template', templateId: 'tpl_1' });

    expect(free.map((session) => session.id)).toEqual(['free_1', 'legacy_1']);
    expect(template.map((session) => session.id)).toEqual(['template_1']);
    expect(createdTemplate.kind).toBe('template');
    expect(createdTemplate.templateId).toBe('tpl_1');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: 'owner_1', kind: 'free' } }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: 'owner_1', kind: 'template', templateId: 'tpl_1' } }));
  });
});

function makeSession(overrides: Partial<SessionRecord>): SessionRecord {
  return {
    id: overrides.id ?? 'session_1',
    ownerId: 'owner_1',
    title: 'session',
    currentTaskId: null,
    createdAt: new Date('2026-05-26T00:00:00.000Z'),
    updatedAt: new Date('2026-05-26T00:00:00.000Z'),
    ...overrides,
  };
}
