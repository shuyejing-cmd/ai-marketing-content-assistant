import { createHash } from 'node:crypto';

import { createAuthService, getAuthService } from '../src/features/auth/server/auth-service';
import { createGenerationStore } from '../src/features/generation/server/generation-store';
import { createSessionRepository } from '../src/features/generation/server/session-repository';
import {
  AUTH_COOKIE_NAME,
  clearAuthCookie,
  readAuthCookie,
  readCookie,
  setAuthCookie,
} from '../src/features/auth/server/cookies';
import { isAnonymousOwnerId } from '../src/features/auth/server/owner';
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

function createPrismaMock({ withTransaction = false } = {}) {
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
    ...(withTransaction
      ? {
          $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
        }
      : {}),
  };

  return { prisma, users, authSessions, sessions, generationTasks, imageAssets };
}

describe('auth service', () => {
  const originalAdminEmails = process.env.AUTH_ADMIN_EMAILS;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.AUTH_ADMIN_EMAILS = originalAdminEmails;
    process.env.DATABASE_URL = originalDatabaseUrl;
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

  it('uses a transaction when binding anonymous rows if the client supports it', async () => {
    const store = createPrismaMock({ withTransaction: true });
    const service = createAuthService(store.prisma);

    await service.register({
      email: 'person@example.com',
      password: 'password123',
      anonymousOwnerId: 'owner_anon',
    });

    expect(store.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(store.prisma.$transaction).toHaveBeenCalledWith([expect.any(Promise), expect.any(Promise), expect.any(Promise)]);
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

  it('binds anonymous rows during login', async () => {
    const store = createPrismaMock();
    const service = createAuthService(store.prisma);
    const passwordHash = await hashPassword('password123');
    store.users.push({ id: 'user_existing', email: 'person@example.com', passwordHash, role: 'user' });

    await service.login({
      email: 'person@example.com',
      password: 'password123',
      anonymousOwnerId: 'owner_anon',
    });

    expect(store.sessions[0].ownerId).toBe('user:user_existing');
    expect(store.generationTasks[0].ownerId).toBe('user:user_existing');
    expect(store.imageAssets[0].ownerId).toBe('user:user_existing');
  });

  it('reads users by raw session token and logs out by raw token', async () => {
    const store = createPrismaMock();
    const service = createAuthService(store.prisma);
    const registered = await service.register({ email: 'person@example.com', password: 'password123' });

    await expect(service.getUserBySessionToken(registered.sessionToken)).resolves.toEqual(registered.user);

    await service.logout(registered.sessionToken);

    await expect(service.getUserBySessionToken(registered.sessionToken)).resolves.toBeNull();
  });

  it('returns null for expired sessions and deletes expired rows during cleanup', async () => {
    const store = createPrismaMock();
    const service = createAuthService(store.prisma);
    const registered = await service.register({ email: 'person@example.com', password: 'password123' });
    const now = new Date('2026-05-28T00:00:00.000Z');
    store.authSessions[0].expiresAt = new Date('2026-05-27T00:00:00.000Z');
    store.authSessions.push({
      id: 'auth_session_future',
      userId: registered.user.id,
      tokenHash: tokenHash('session_future'),
      expiresAt: new Date('2026-05-29T00:00:00.000Z'),
    });

    await expect(service.getUserBySessionToken(registered.sessionToken)).resolves.toBeNull();
    await expect(service.cleanupExpiredSessions(now)).resolves.toEqual({ count: 1 });
    expect(store.authSessions).toHaveLength(1);
    expect(store.authSessions[0].id).toBe('auth_session_future');
  });

  it('ignores malformed session tokens before querying or deleting sessions', async () => {
    const store = createPrismaMock();
    const service = createAuthService(store.prisma);

    await expect(service.getUserBySessionToken('bad-token')).resolves.toBeNull();
    await service.logout('bad-token');

    expect(store.prisma.authSession.findUnique).not.toHaveBeenCalled();
    expect(store.prisma.authSession.deleteMany).not.toHaveBeenCalled();
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

  it('uses an in-memory auth store when DATABASE_URL is not configured', async () => {
    delete process.env.DATABASE_URL;
    const anonymousOwnerId = `owner_memory_${Date.now()}`;
    const service = getAuthService();
    const sessions = createSessionRepository(null);
    const generationStore = createGenerationStore();
    const anonymousSession = await sessions.createSession(anonymousOwnerId);
    const assetId = `asset_memory_${Date.now()}`;
    await generationStore.saveImageAsset({
      id: assetId,
      ownerId: anonymousOwnerId,
      kind: 'uploaded_image',
      mimeType: 'image/png',
      base64: Buffer.from('memory-asset').toString('base64'),
    });

    const registered = await service.register({
      email: `memory-admin-${Date.now()}@example.com`,
      password: 'password123',
      anonymousOwnerId,
    });
    const login = await service.login({
      email: registered.user.email,
      password: 'password123',
    });

    expect(registered.user.role).toBe('user');
    expect(login.user).toEqual(registered.user);
    await expect(service.getUserBySessionToken(login.sessionToken)).resolves.toEqual(registered.user);
    await expect(sessions.getSession(`user:${registered.user.id}`, anonymousSession.id)).resolves.toEqual(
      expect.objectContaining({ id: anonymousSession.id, ownerId: `user:${registered.user.id}` }),
    );
    await expect(generationStore.getImageAsset(assetId)).resolves.toEqual(
      expect.objectContaining({ id: assetId, ownerId: `user:${registered.user.id}` }),
    );

    await service.logout(login.sessionToken);
    await expect(service.getUserBySessionToken(login.sessionToken)).resolves.toBeNull();
  });
});

describe('owner helpers', () => {
  it('recognizes legacy anonymous owner ids without accepting account owner ids', () => {
    expect(isAnonymousOwnerId('owner_browser_1')).toBe(true);
    expect(isAnonymousOwnerId('owner_123_abc')).toBe(true);
    expect(isAnonymousOwnerId('user:123')).toBe(false);
    expect(isAnonymousOwnerId('browser_owner_1')).toBe(false);
  });
});

describe('auth cookie helpers', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('reads and decodes cookie values', () => {
    const request = new Request('https://example.com', {
      headers: {
        cookie: `other=value; ${AUTH_COOKIE_NAME}=session_%E4%B8%AD; encoded=a%3Db`,
      },
    });

    expect(readCookie(request, 'encoded')).toBe('a=b');
    expect(readAuthCookie(request)).toBe('session_中');
    expect(readCookie(request, 'missing')).toBeNull();
  });

  it('sets auth cookies with secure attributes only in production and clears them', () => {
    process.env.NODE_ENV = 'test';
    const expiresAt = new Date('2026-06-27T00:00:00.000Z');
    const response = new Response(null);

    setAuthCookie(response, 'session_token', expiresAt);

    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain(`${AUTH_COOKIE_NAME}=session_token`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Expires=Sat, 27 Jun 2026 00:00:00 GMT');
    expect(setCookie).not.toContain('Secure');

    process.env.NODE_ENV = 'production';
    const productionResponse = new Response(null);
    setAuthCookie(productionResponse, 'session_token', expiresAt);
    expect(productionResponse.headers.get('set-cookie')).toContain('Secure');

    const clearResponse = new Response(null);
    clearAuthCookie(clearResponse);
    expect(clearResponse.headers.get('set-cookie')).toContain(`${AUTH_COOKIE_NAME}=`);
    expect(clearResponse.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  });
});
