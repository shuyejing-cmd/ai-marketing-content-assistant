import { createHash } from 'node:crypto';

import { createAuthService } from '../src/features/auth/server/auth-service';
import { hashPassword } from '../src/features/auth/server/password';

import { vi } from 'vitest';

vi.mock('server-only', () => ({}));

type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
};

type StoredAuthSession = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  user?: StoredUser;
};

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function createPrismaMock() {
  const users: StoredUser[] = [];
  const authSessions: StoredAuthSession[] = [];
  const sessions = [{ id: 'session_1', ownerId: 'owner_anon' }];
  const generationTasks = [{ id: 'task_1', ownerId: 'owner_anon' }];
  const imageAssets = [{ id: 'asset_1', ownerId: 'owner_anon' }];

  const updateManyOwner = (rows: Array<{ ownerId: string }>) =>
    vi.fn(async ({ where, data }: { where: { ownerId: string }; data: { ownerId: string } }) => {
      let count = 0;
      for (const row of rows) {
        if (row.ownerId === where.ownerId) {
          row.ownerId = data.ownerId;
          count += 1;
        }
      }
      return { count };
    });

  const prisma = {
    user: {
      create: vi.fn(async ({ data }: { data: StoredUser }) => {
        if (users.some((user) => user.email === data.email)) {
          throw { code: 'P2002' };
        }
        users.push(data);
        return data;
      }),
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        return users.find((user) => user.email === where.email || user.id === where.id) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<StoredUser> }) => {
        const user = users.find((entry) => entry.id === where.id);
        if (!user) return null;
        Object.assign(user, data);
        return user;
      }),
    },
    authSession: {
      create: vi.fn(async ({ data, include }: { data: StoredAuthSession; include?: { user?: boolean } }) => {
        const row = { ...data };
        authSessions.push(row);
        return include?.user ? { ...row, user: users.find((user) => user.id === row.userId) } : row;
      }),
      findUnique: vi.fn(
        async ({
          where,
          include,
        }: {
          where: { tokenHash: string };
          include?: { user?: boolean };
        }) => {
          const row = authSessions.find((session) => session.tokenHash === where.tokenHash) ?? null;
          if (!row) return null;
          return include?.user ? { ...row, user: users.find((user) => user.id === row.userId) } : row;
        },
      ),
      deleteMany: vi.fn(async ({ where }: { where: { tokenHash?: string; expiresAt?: { lt: Date } } }) => {
        const before = authSessions.length;
        for (let index = authSessions.length - 1; index >= 0; index -= 1) {
          const session = authSessions[index];
          if (
            (where.tokenHash && session.tokenHash === where.tokenHash) ||
            (where.expiresAt?.lt && session.expiresAt < where.expiresAt.lt)
          ) {
            authSessions.splice(index, 1);
          }
        }
        return { count: before - authSessions.length };
      }),
    },
    session: {
      updateMany: updateManyOwner(sessions),
    },
    generationTask: {
      updateMany: updateManyOwner(generationTasks),
    },
    imageAsset: {
      updateMany: updateManyOwner(imageAssets),
    },
  };

  return { prisma, users, authSessions, sessions, generationTasks, imageAssets };
}

describe('auth service', () => {
  const originalAdminEmails = process.env.AUTH_ADMIN_EMAILS;

  afterEach(() => {
    process.env.AUTH_ADMIN_EMAILS = originalAdminEmails;
  });

  it('registers with a normalized email, creates a raw session token, and binds anonymous rows', async () => {
    const store = createPrismaMock();
    const service = createAuthService(store.prisma);

    const result = await service.register({
      email: '  Person@Example.COM ',
      password: 'password123',
      anonymousOwnerId: 'owner_anon',
    });

    expect(result.user.email).toBe('person@example.com');
    expect(result.user.role).toBe('user');
    expect(result.sessionToken).toMatch(/^session_/);
    expect(store.authSessions[0].tokenHash).toBe(tokenHash(result.sessionToken));
    expect(store.authSessions[0].tokenHash).not.toBe(result.sessionToken);
    expect(store.sessions[0].ownerId).toBe(`user:${result.user.id}`);
    expect(store.generationTasks[0].ownerId).toBe(`user:${result.user.id}`);
    expect(store.imageAssets[0].ownerId).toBe(`user:${result.user.id}`);
  });

  it('assigns admin role from AUTH_ADMIN_EMAILS', async () => {
    process.env.AUTH_ADMIN_EMAILS = 'admin@example.com, owner@example.com';
    const store = createPrismaMock();
    const service = createAuthService(store.prisma);

    const result = await service.register({ email: ' OWNER@example.com ', password: 'password123' });

    expect(result.user.role).toBe('admin');
  });

  it('logs in with a valid password and rejects an invalid password', async () => {
    const store = createPrismaMock();
    const service = createAuthService(store.prisma);
    const passwordHash = await hashPassword('password123');
    store.users.push({ id: 'user_existing', email: 'person@example.com', passwordHash, role: 'user' });

    await expect(service.login({ email: 'person@example.com', password: 'wrong-password' })).rejects.toThrow(
      '邮箱或密码不正确',
    );

    const result = await service.login({ email: ' PERSON@example.com ', password: 'password123' });

    expect(result.user.id).toBe('user_existing');
    expect(result.sessionToken).toMatch(/^session_/);
  });

  it('reads users by raw session token and logs out by raw token', async () => {
    const store = createPrismaMock();
    const service = createAuthService(store.prisma);
    const registered = await service.register({ email: 'person@example.com', password: 'password123' });

    await expect(service.getUserBySessionToken(registered.sessionToken)).resolves.toEqual(registered.user);

    await service.logout(registered.sessionToken);

    await expect(service.getUserBySessionToken(registered.sessionToken)).resolves.toBeNull();
  });

  it('validates registration input and duplicate email', async () => {
    const store = createPrismaMock();
    const service = createAuthService(store.prisma);

    await expect(service.register({ email: 'not-an-email', password: 'password123' })).rejects.toThrow(
      '邮箱格式不正确',
    );
    await expect(service.register({ email: 'person@example.com', password: 'short' })).rejects.toThrow(
      '密码至少需要 8 个字符',
    );

    await service.register({ email: 'person@example.com', password: 'password123' });

    await expect(service.register({ email: 'PERSON@example.com', password: 'password123' })).rejects.toThrow(
      '该邮箱已注册',
    );
  });
});
