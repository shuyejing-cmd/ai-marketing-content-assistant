import { getPrismaClient } from './prisma';
import { makeId } from './ids';

type SessionRecord = {
  id: string;
  ownerId: string;
  kind?: string;
  templateId?: string | null;
  title: string;
  currentTaskId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SessionScope =
  | { kind: 'free' }
  | { kind: 'template'; templateId: string };

type SessionWhere = {
  id?: string;
  ownerId: string;
  kind?: string;
  templateId?: string | null;
};

type SessionDelegate = {
  create(input: { data: SessionRecord }): Promise<SessionRecord>;
  update(input: { where: { id: string; ownerId: string }; data: Partial<SessionRecord> }): Promise<SessionRecord>;
  delete(input: { where: { id: string; ownerId: string } }): Promise<SessionRecord>;
  findFirst(input: { where: SessionWhere; orderBy?: { updatedAt: 'desc' }; take?: number }): Promise<SessionRecord | null>;
  findMany?(input: { where: SessionWhere; orderBy: { updatedAt: 'desc' }; take: number }): Promise<SessionRecord[]>;
};

type PrismaLike = {
  session: SessionDelegate;
};

const DEFAULT_TITLE = '新的图片会话';

const globalForSessions = globalThis as unknown as {
  generationMemorySessions?: Map<string, SessionRecord>;
};
const memorySessions = (globalForSessions.generationMemorySessions ??= new Map<string, SessionRecord>());

export function reassignMemorySessionOwner(previousOwnerId: string, nextOwnerId: string) {
  let count = 0;
  for (const [id, session] of memorySessions.entries()) {
    if (session.ownerId === previousOwnerId) {
      memorySessions.set(id, normalizeSessionRecord({ ...session, ownerId: nextOwnerId, updatedAt: new Date() }));
      count += 1;
    }
  }
  return count;
}

export function createSessionRepository(prisma: PrismaLike | null = getPrismaClient()) {
  const memory = prisma ? null : createMemorySessionDelegate();
  const session = (prisma?.session ?? memory) as SessionDelegate;

  return {
    async listSessions(ownerId: string, scope: SessionScope = { kind: 'free' }) {
      if (session.findMany) {
        const sessions = await session.findMany({
          where: createScopeWhere(ownerId, scope),
          orderBy: { updatedAt: 'desc' },
          take: 20,
        });
        return sessions.map(normalizeSessionRecord);
      }
      return [];
    },

    async createSession(ownerId: string, scope: SessionScope = { kind: 'free' }) {
      const now = new Date();
      return normalizeSessionRecord(await session.create({
        data: {
          id: makeId('session'),
          ownerId,
          kind: scope.kind,
          templateId: scope.kind === 'template' ? scope.templateId : null,
          title: DEFAULT_TITLE,
          currentTaskId: null,
          createdAt: now,
          updatedAt: now,
        },
      }));
    },

    async renameSession(ownerId: string, sessionId: string, title: string) {
      return normalizeSessionRecord(await session.update({
        where: { id: sessionId, ownerId },
        data: { title: title.trim() || DEFAULT_TITLE },
      }));
    },

    async setCurrentTask(ownerId: string, sessionId: string, taskId: string, title: string) {
      return normalizeSessionRecord(await session.update({
        where: { id: sessionId, ownerId },
        data: { currentTaskId: taskId, title: title.trim() || DEFAULT_TITLE },
      }));
    },

    async deleteSession(ownerId: string, sessionId: string) {
      return session.delete({ where: { id: sessionId, ownerId } });
    },

    async getSession(ownerId: string, sessionId: string) {
      const record = await session.findFirst({ where: { id: sessionId, ownerId } });
      return record ? normalizeSessionRecord(record) : null;
    },
  };
}

function createScopeWhere(ownerId: string, scope: SessionScope): SessionWhere {
  if (scope.kind === 'template') {
    return { ownerId, kind: 'template', templateId: scope.templateId };
  }
  return { ownerId, kind: 'free' };
}

function normalizeSessionRecord(session: SessionRecord): SessionRecord {
  return {
    ...session,
    kind: session.kind ?? 'free',
    templateId: session.templateId ?? null,
  };
}

function createMemorySessionDelegate(): SessionDelegate {
  return {
    async create({ data }) {
      const next = normalizeSessionRecord(data);
      memorySessions.set(next.id, next);
      return next;
    },
    async update({ where, data }) {
      const existing = memorySessions.get(where.id);
      if (!existing || existing.ownerId !== where.ownerId) throw new Error('Session not found');
      const next = normalizeSessionRecord({ ...existing, ...data, updatedAt: new Date() });
      memorySessions.set(where.id, next);
      return next;
    },
    async delete({ where }) {
      const existing = memorySessions.get(where.id);
      if (!existing || existing.ownerId !== where.ownerId) throw new Error('Session not found');
      memorySessions.delete(where.id);
      return normalizeSessionRecord(existing);
    },
    async findFirst({ where }) {
      if (where.id) {
        const session = memorySessions.get(where.id);
        return session && matchesWhere(session, where) ? normalizeSessionRecord(session) : null;
      }
      const found = Array.from(memorySessions.values())
        .filter((session) => matchesWhere(session, where))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null;
      return found ? normalizeSessionRecord(found) : null;
    },
    async findMany({ where, take }) {
      return Array.from(memorySessions.values())
        .filter((session) => matchesWhere(session, where))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, take)
        .map(normalizeSessionRecord);
    },
  };
}

function matchesWhere(session: SessionRecord, where: SessionWhere) {
  if (session.ownerId !== where.ownerId) return false;
  if (where.id && session.id !== where.id) return false;
  if (where.kind && (session.kind ?? 'free') !== where.kind) return false;
  if (where.templateId !== undefined && (session.templateId ?? null) !== where.templateId) return false;
  return true;
}
