# Account Owner Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email/password accounts, HttpOnly login sessions, automatic anonymous `ownerId` binding on register/login, and user/admin isolation for existing image-marketing flows.

**Architecture:** Keep the current `apps/web` Next.js API Routes and existing `ownerId` columns. Add `User` and `AuthSession` tables, then make server-side auth resolve a stable account owner key (`user:<id>`) before generation/session/template APIs reach repositories. Frontend keeps anonymous usage, but register/login submits the current browser anonymous owner so the server migrates existing rows to the account owner.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/PostgreSQL, Node `crypto.scrypt`, Vitest, Playwright.

---

## File Structure

Create:

- `apps/web/src/features/auth/auth-client.ts` - browser client for `/api/auth/*`.
- `apps/web/src/features/auth/server/auth-types.ts` - shared auth types.
- `apps/web/src/features/auth/server/password.ts` - password hashing and verification.
- `apps/web/src/features/auth/server/cookies.ts` - auth cookie parse/set/clear helpers.
- `apps/web/src/features/auth/server/owner.ts` - user owner key and anonymous owner helpers.
- `apps/web/src/features/auth/server/auth-service.ts` - register/login/logout/current-user and anonymous owner binding.
- `apps/web/src/features/auth/server/request-auth.ts` - route helpers: `getCurrentUser`, `getRequestOwner`, `requireAdmin`.
- `apps/web/src/app/api/auth/register/route.ts`
- `apps/web/src/app/api/auth/login/route.ts`
- `apps/web/src/app/api/auth/logout/route.ts`
- `apps/web/src/app/api/auth/me/route.ts`
- `apps/web/src/app/auth/page.tsx`
- `apps/web/tests/auth-schema.test.ts`
- `apps/web/tests/auth-password.test.ts`
- `apps/web/tests/auth-service.test.ts`
- `apps/web/tests/auth-api.test.ts`
- `apps/web/tests/request-owner-api.test.ts`

Modify:

- `apps/web/prisma/schema.prisma` - add `User` and `AuthSession`.
- `apps/web/.env.example` - add `AUTH_ADMIN_EMAILS`.
- `apps/web/src/app/api/generation-sessions/route.ts` - use server owner.
- `apps/web/src/app/api/generation-sessions/[id]/route.ts` - use server owner.
- `apps/web/src/app/api/generation-tasks/route.ts` - ignore body owner.
- `apps/web/src/app/api/generation-tasks/[id]/regenerate/route.ts` - require task ownership.
- `apps/web/src/app/api/generation-tasks/[id]/modify/route.ts` - require task ownership.
- `apps/web/src/app/api/templates/[id]/generation-tasks/route.ts` - ignore body owner.
- `apps/web/src/app/api/admin/templates/route.ts` - require admin.
- `apps/web/src/app/api/admin/templates/[id]/route.ts` - require admin.
- `apps/web/src/app/api/image-assets/[id]/route.ts` - keep APIMart fallback compatible; see Task 8.
- `apps/web/src/features/generation/server/generation-service.ts` - expose owner-scoped task fetch.
- `apps/web/src/features/generation/server/generation-store.ts` - fetch tasks by owner.
- `apps/web/src/components/HomeMenuDrawer.tsx` - account state, auth links, admin-only template link.
- `apps/web/e2e/mobile-image-flow.spec.ts` - add multi-user isolation smoke coverage.

---

### Task 1: Add Auth Models To Prisma

**Files:**

- Modify: `apps/web/prisma/schema.prisma`
- Modify: `apps/web/.env.example`
- Test: `apps/web/tests/auth-schema.test.ts`

- [ ] **Step 1: Write the failing schema test**

Create `apps/web/tests/auth-schema.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('auth Prisma schema', () => {
  const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');

  it('defines account and login session models', () => {
    expect(schema).toContain('model User');
    expect(schema).toContain('email        String        @unique');
    expect(schema).toContain('passwordHash String');
    expect(schema).toContain('role         String        @default("user")');
    expect(schema).toContain('model AuthSession');
    expect(schema).toContain('tokenHash String   @unique');
    expect(schema).toContain('user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)');
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run from `apps/web`:

```powershell
npm.cmd test -- tests/auth-schema.test.ts
```

Expected: FAIL because `model User` and `model AuthSession` do not exist.

- [ ] **Step 3: Modify Prisma schema**

Append these models to `apps/web/prisma/schema.prisma` after `Template`:

```prisma
model User {
  id           String        @id
  email        String        @unique
  passwordHash String
  role         String        @default("user")
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  authSessions AuthSession[]

  @@index([role])
}

model AuthSession {
  id        String   @id
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}
```

Add the environment variable name to `apps/web/.env.example` under template/admin or auth-related variables:

```text
# Comma-separated emails that should receive the admin role on registration/login.
AUTH_ADMIN_EMAILS=
```

- [ ] **Step 4: Run the schema test to verify GREEN**

Run:

```powershell
npm.cmd test -- tests/auth-schema.test.ts
```

Expected: PASS.

- [ ] **Step 5: Generate Prisma artifacts**

Run:

```powershell
npm.cmd exec -- prisma migrate dev --name add_auth_users
npm.cmd exec -- prisma generate
```

Expected: migration created under `apps/web/prisma/migrations/*_add_auth_users`, Prisma Client generated successfully.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations apps/web/.env.example apps/web/tests/auth-schema.test.ts
git commit -m "feat: add account auth schema"
```

---

### Task 2: Add Password Hashing

**Files:**

- Create: `apps/web/src/features/auth/server/password.ts`
- Test: `apps/web/tests/auth-password.test.ts`

- [ ] **Step 1: Write the failing password tests**

Create `apps/web/tests/auth-password.test.ts`:

```ts
import { hashPassword, verifyPassword } from '../src/features/auth/server/password';

describe('password hashing', () => {
  it('stores a scrypt hash instead of the plain password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).not.toBe('correct horse battery staple');
    expect(hash).toMatch(/^scrypt-v1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it('verifies matching passwords and rejects wrong passwords', async () => {
    const hash = await hashPassword('correct horse battery staple');

    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  it('rejects malformed stored hashes', async () => {
    await expect(verifyPassword('anything', 'plain-text')).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```powershell
npm.cmd test -- tests/auth-password.test.ts
```

Expected: FAIL because `password.ts` does not exist.

- [ ] **Step 3: Implement password hashing**

Create `apps/web/src/features/auth/server/password.ts`:

```ts
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const VERSION = 'scrypt-v1';
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export async function hashPassword(password: string) {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${VERSION}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [version, saltBase64, hashBase64] = storedHash.split('$');
  if (version !== VERSION || !saltBase64 || !hashBase64) return false;

  const salt = Buffer.from(saltBase64, 'base64');
  const expected = Buffer.from(hashBase64, 'base64');
  if (expected.length !== KEY_LENGTH) return false;

  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
```

- [ ] **Step 4: Run the test to verify GREEN**

Run:

```powershell
npm.cmd test -- tests/auth-password.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/features/auth/server/password.ts apps/web/tests/auth-password.test.ts
git commit -m "feat: add password hashing"
```

---

### Task 3: Add Auth Service, Cookie Helpers, And Anonymous Binding

**Files:**

- Create: `apps/web/src/features/auth/server/auth-types.ts`
- Create: `apps/web/src/features/auth/server/owner.ts`
- Create: `apps/web/src/features/auth/server/cookies.ts`
- Create: `apps/web/src/features/auth/server/auth-service.ts`
- Test: `apps/web/tests/auth-service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `apps/web/tests/auth-service.test.ts`:

```ts
import { createAuthService } from '../src/features/auth/server/auth-service';
import { userOwnerId } from '../src/features/auth/server/owner';

describe('auth service', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('registers a user, creates a session token, and binds anonymous data', async () => {
    const prisma = createMemoryAuthPrisma();
    const service = createAuthService(prisma);

    const result = await service.register({
      email: ' Shop@Example.COM ',
      password: 'password123',
      anonymousOwnerId: 'owner_browser_1',
    });

    expect(result.user).toEqual(expect.objectContaining({
      email: 'shop@example.com',
      role: 'user',
    }));
    expect(result.sessionToken).toMatch(/^session_/);
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { ownerId: 'owner_browser_1' },
      data: { ownerId: userOwnerId(result.user) },
    });
    expect(prisma.generationTask.updateMany).toHaveBeenCalledWith({
      where: { ownerId: 'owner_browser_1' },
      data: { ownerId: userOwnerId(result.user) },
    });
    expect(prisma.imageAsset.updateMany).toHaveBeenCalledWith({
      where: { ownerId: 'owner_browser_1' },
      data: { ownerId: userOwnerId(result.user) },
    });
  });

  it('assigns admin role when AUTH_ADMIN_EMAILS contains the registered email', async () => {
    vi.stubEnv('AUTH_ADMIN_EMAILS', 'admin@example.com,owner@example.com');
    const service = createAuthService(createMemoryAuthPrisma());

    const result = await service.register({
      email: 'admin@example.com',
      password: 'password123',
      anonymousOwnerId: 'owner_browser_2',
    });

    expect(result.user.role).toBe('admin');
  });

  it('logs in with a valid password and rejects an invalid password', async () => {
    const prisma = createMemoryAuthPrisma();
    const service = createAuthService(prisma);
    await service.register({
      email: 'shop@example.com',
      password: 'password123',
      anonymousOwnerId: 'owner_browser_1',
    });

    await expect(service.login({
      email: 'shop@example.com',
      password: 'password123',
      anonymousOwnerId: 'owner_browser_3',
    })).resolves.toEqual(expect.objectContaining({
      user: expect.objectContaining({ email: 'shop@example.com' }),
      sessionToken: expect.stringMatching(/^session_/),
    }));
    await expect(service.login({
      email: 'shop@example.com',
      password: 'bad-password',
      anonymousOwnerId: 'owner_browser_4',
    })).rejects.toThrow('邮箱或密码不正确');
  });

  it('resolves and deletes login sessions by raw cookie token', async () => {
    const prisma = createMemoryAuthPrisma();
    const service = createAuthService(prisma);
    const registered = await service.register({
      email: 'shop@example.com',
      password: 'password123',
      anonymousOwnerId: 'owner_browser_1',
    });

    await expect(service.getUserBySessionToken(registered.sessionToken)).resolves.toEqual(
      expect.objectContaining({ email: 'shop@example.com' }),
    );
    await service.logout(registered.sessionToken);
    await expect(service.getUserBySessionToken(registered.sessionToken)).resolves.toBeNull();
  });
});

function createMemoryAuthPrisma() {
  const users = new Map<string, { id: string; email: string; passwordHash: string; role: string; createdAt: Date; updatedAt: Date }>();
  const sessions = new Map<string, { id: string; userId: string; tokenHash: string; expiresAt: Date; createdAt: Date }>();

  return {
    user: {
      create: vi.fn(async ({ data }) => {
        if (Array.from(users.values()).some((user) => user.email === data.email)) {
          const error = new Error('Unique constraint') as Error & { code: string };
          error.code = 'P2002';
          throw error;
        }
        const now = new Date();
        const row = { ...data, createdAt: now, updatedAt: now };
        users.set(row.id, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }) => {
        if ('email' in where) return Array.from(users.values()).find((user) => user.email === where.email) ?? null;
        if ('id' in where) return users.get(where.id) ?? null;
        return null;
      }),
      update: vi.fn(async ({ where, data }) => {
        const user = users.get(where.id);
        if (!user) throw new Error('not found');
        const next = { ...user, ...data, updatedAt: new Date() };
        users.set(where.id, next);
        return next;
      }),
    },
    authSession: {
      create: vi.fn(async ({ data }) => {
        sessions.set(data.id, data);
        return data;
      }),
      findFirst: vi.fn(async ({ where, include }) => {
        const row = Array.from(sessions.values()).find(
          (session) => session.tokenHash === where.tokenHash && session.expiresAt.getTime() > where.expiresAt.gt.getTime(),
        );
        if (!row) return null;
        return include?.user ? { ...row, user: users.get(row.userId) } : row;
      }),
      deleteMany: vi.fn(async ({ where }) => {
        let count = 0;
        for (const [id, row] of sessions.entries()) {
          if (row.tokenHash === where.tokenHash || row.expiresAt < where.expiresAt?.lt) {
            sessions.delete(id);
            count += 1;
          }
        }
        return { count };
      }),
    },
    session: { updateMany: vi.fn(async () => ({ count: 1 })) },
    generationTask: { updateMany: vi.fn(async () => ({ count: 1 })) },
    imageAsset: { updateMany: vi.fn(async () => ({ count: 1 })) },
  };
}
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```powershell
npm.cmd test -- tests/auth-service.test.ts
```

Expected: FAIL because auth service files do not exist.

- [ ] **Step 3: Create auth types**

Create `apps/web/src/features/auth/server/auth-types.ts`:

```ts
export type UserRole = 'user' | 'admin';

export type PublicUser = {
  id: string;
  email: string;
  role: UserRole;
};

export type UserRecord = PublicUser & {
  passwordHash: string;
};

export type AuthResult = {
  user: PublicUser;
  sessionToken: string;
  expiresAt: Date;
};
```

- [ ] **Step 4: Create owner helpers**

Create `apps/web/src/features/auth/server/owner.ts`:

```ts
export function userOwnerId(user: { id: string }) {
  return `user:${user.id}`;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isAnonymousOwnerId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('owner_');
}

export function getRoleForEmail(email: string, adminEmails = process.env.AUTH_ADMIN_EMAILS ?? '') {
  const normalized = normalizeEmail(email);
  const admins = adminEmails
    .split(',')
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
  return admins.includes(normalized) ? 'admin' : 'user';
}
```

- [ ] **Step 5: Create cookie helpers**

Create `apps/web/src/features/auth/server/cookies.ts`:

```ts
import { NextResponse } from 'next/server';

export const AUTH_COOKIE_NAME = 'ai_marketing_session';

export function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) return decodeURIComponent(rawValue.join('='));
  }
  return null;
}

export function readAuthCookie(request: Request) {
  return readCookie(request, AUTH_COOKIE_NAME);
}

export function setAuthCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  });
}
```

- [ ] **Step 6: Create auth service**

Create `apps/web/src/features/auth/server/auth-service.ts` with these exported functions and behavior:

```ts
import { createHash, randomBytes } from 'node:crypto';
import { getPrismaClient } from '@/features/generation/server/prisma';
import { makeId } from '@/features/generation/server/ids';
import { hashPassword, verifyPassword } from './password';
import type { AuthResult, PublicUser, UserRecord, UserRole } from './auth-types';
import { getRoleForEmail, isAnonymousOwnerId, normalizeEmail, userOwnerId } from './owner';

const SESSION_DAYS = 30;

type AuthPrisma = NonNullable<ReturnType<typeof getPrismaClient>>;

export function getAuthService() {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error('DATABASE_URL is required for account features');
  return createAuthService(prisma);
}

export function createAuthService(prisma: AuthPrisma) {
  return {
    async register(input: { email: string; password: string; anonymousOwnerId?: string | null }): Promise<AuthResult> {
      const email = validateEmail(input.email);
      validatePassword(input.password);
      const passwordHash = await hashPassword(input.password);
      const role = getRoleForEmail(email) as UserRole;
      try {
        const user = await prisma.user.create({
          data: {
            id: makeId('user'),
            email,
            passwordHash,
            role,
          },
        });
        await bindAnonymousOwner(prisma, input.anonymousOwnerId, userOwnerId(user));
        return createLoginSession(prisma, toPublicUser(user));
      } catch (error) {
        if (isUniqueConstraintError(error)) throw new Error('该邮箱已注册');
        throw error;
      }
    },

    async login(input: { email: string; password: string; anonymousOwnerId?: string | null }): Promise<AuthResult> {
      const email = validateEmail(input.email);
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
        throw new Error('邮箱或密码不正确');
      }
      const nextRole = getRoleForEmail(email) as UserRole;
      const updated = user.role === nextRole ? user : await prisma.user.update({ where: { id: user.id }, data: { role: nextRole } });
      await bindAnonymousOwner(prisma, input.anonymousOwnerId, userOwnerId(updated));
      return createLoginSession(prisma, toPublicUser(updated));
    },

    async getUserBySessionToken(token: string | null): Promise<PublicUser | null> {
      if (!token) return null;
      const row = await prisma.authSession.findFirst({
        where: {
          tokenHash: hashToken(token),
          expiresAt: { gt: new Date() },
        },
        include: { user: true },
      });
      return row?.user ? toPublicUser(row.user) : null;
    },

    async logout(token: string | null) {
      if (!token) return;
      await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
    },

    async cleanupExpiredSessions(now = new Date()) {
      await prisma.authSession.deleteMany({ where: { expiresAt: { lt: now } } });
    },
  };
}

async function createLoginSession(prisma: AuthPrisma, user: PublicUser): Promise<AuthResult> {
  const sessionToken = `session_${randomBytes(32).toString('base64url')}`;
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: {
      id: makeId('auth_session'),
      userId: user.id,
      tokenHash: hashToken(sessionToken),
      expiresAt,
    },
  });
  return { user, sessionToken, expiresAt };
}

async function bindAnonymousOwner(prisma: AuthPrisma, anonymousOwnerId: string | null | undefined, accountOwnerId: string) {
  if (!isAnonymousOwnerId(anonymousOwnerId) || anonymousOwnerId === accountOwnerId) return;
  await prisma.session.updateMany({ where: { ownerId: anonymousOwnerId }, data: { ownerId: accountOwnerId } });
  await prisma.generationTask.updateMany({ where: { ownerId: anonymousOwnerId }, data: { ownerId: accountOwnerId } });
  await prisma.imageAsset.updateMany({ where: { ownerId: anonymousOwnerId }, data: { ownerId: accountOwnerId } });
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function validateEmail(value: string) {
  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('邮箱格式不正确');
  return email;
}

function validatePassword(value: string) {
  if (value.length < 8) throw new Error('密码至少需要 8 个字符');
}

function toPublicUser(user: { id: string; email: string; role: string }): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role === 'admin' ? 'admin' : 'user',
  };
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002');
}
```

- [ ] **Step 7: Run service tests**

Run:

```powershell
npm.cmd test -- tests/auth-service.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add apps/web/src/features/auth/server apps/web/tests/auth-service.test.ts
git commit -m "feat: add auth service"
```

---

### Task 4: Add Auth API Routes

**Files:**

- Create: `apps/web/src/features/auth/server/request-auth.ts`
- Create: `apps/web/src/app/api/auth/register/route.ts`
- Create: `apps/web/src/app/api/auth/login/route.ts`
- Create: `apps/web/src/app/api/auth/logout/route.ts`
- Create: `apps/web/src/app/api/auth/me/route.ts`
- Test: `apps/web/tests/auth-api.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `apps/web/tests/auth-api.test.ts`:

```ts
import { POST as register } from '../src/app/api/auth/register/route';
import { POST as login } from '../src/app/api/auth/login/route';
import { POST as logout } from '../src/app/api/auth/logout/route';
import { GET as me } from '../src/app/api/auth/me/route';
import { getAuthService } from '../src/features/auth/server/auth-service';
import { AUTH_COOKIE_NAME } from '../src/features/auth/server/cookies';

vi.mock('../src/features/auth/server/auth-service', () => ({
  getAuthService: vi.fn(),
}));

const mockedGetAuthService = vi.mocked(getAuthService);

describe('auth API', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('registers and sets an HttpOnly auth cookie', async () => {
    mockedGetAuthService.mockReturnValue({
      register: vi.fn(async () => ({
        user: { id: 'user_1', email: 'shop@example.com', role: 'user' },
        sessionToken: 'session_token_1',
        expiresAt: new Date('2026-06-26T00:00:00.000Z'),
      })),
    } as unknown as ReturnType<typeof getAuthService>);

    const response = await register(new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'shop@example.com',
        password: 'password123',
        anonymousOwnerId: 'owner_browser_1',
      }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      user: { id: 'user_1', email: 'shop@example.com', role: 'user' },
    });
    expect(response.headers.get('set-cookie')).toContain(`${AUTH_COOKIE_NAME}=session_token_1`);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  });

  it('logs in and returns the current user', async () => {
    mockedGetAuthService.mockReturnValue({
      login: vi.fn(async () => ({
        user: { id: 'user_1', email: 'shop@example.com', role: 'user' },
        sessionToken: 'session_token_2',
        expiresAt: new Date('2026-06-26T00:00:00.000Z'),
      })),
      getUserBySessionToken: vi.fn(async () => ({ id: 'user_1', email: 'shop@example.com', role: 'user' })),
    } as unknown as ReturnType<typeof getAuthService>);

    const loginResponse = await login(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'shop@example.com', password: 'password123' }),
    }));
    expect(loginResponse.status).toBe(200);

    const meResponse = await me(new Request('http://localhost/api/auth/me', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=session_token_2` },
    }));
    await expect(meResponse.json()).resolves.toEqual({
      user: { id: 'user_1', email: 'shop@example.com', role: 'user' },
    });
  });

  it('logs out and clears the auth cookie', async () => {
    const logoutService = vi.fn(async () => undefined);
    mockedGetAuthService.mockReturnValue({
      logout: logoutService,
    } as unknown as ReturnType<typeof getAuthService>);

    const response = await logout(new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { cookie: `${AUTH_COOKIE_NAME}=session_token_3` },
    }));

    expect(logoutService).toHaveBeenCalledWith('session_token_3');
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.headers.get('set-cookie')).toContain(`${AUTH_COOKIE_NAME}=`);
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```powershell
npm.cmd test -- tests/auth-api.test.ts
```

Expected: FAIL because API routes and `request-auth.ts` do not exist.

- [ ] **Step 3: Create request auth helpers**

Create `apps/web/src/features/auth/server/request-auth.ts`:

```ts
import { NextResponse } from 'next/server';
import { getAuthService } from './auth-service';
import { readAuthCookie } from './cookies';
import { userOwnerId } from './owner';
import type { PublicUser } from './auth-types';

export type RequestOwner = {
  ownerId: string;
  user: PublicUser | null;
};

export async function getCurrentUser(request: Request) {
  return getAuthService().getUserBySessionToken(readAuthCookie(request));
}

export async function getRequestOwner(request: Request): Promise<RequestOwner> {
  const user = await getCurrentUser(request);
  if (user) return { ownerId: userOwnerId(user), user };
  return { ownerId: request.headers.get('x-owner-id') ?? 'anonymous', user: null };
}

export async function requireAdmin(request: Request): Promise<PublicUser | NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ message: '没有权限访问模板管理' }, { status: 403 });
  return user;
}
```

- [ ] **Step 4: Create auth routes**

Create `apps/web/src/app/api/auth/register/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getAuthService } from '@/features/auth/server/auth-service';
import { setAuthCookie } from '@/features/auth/server/cookies';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await getAuthService().register({
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
      anonymousOwnerId: typeof body.anonymousOwnerId === 'string' ? body.anonymousOwnerId : null,
    });
    const response = NextResponse.json({ user: result.user }, { status: 201 });
    setAuthCookie(response, result.sessionToken, result.expiresAt);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : '注册失败';
    const status = message === '该邮箱已注册' ? 409 : 400;
    return NextResponse.json({ message }, { status });
  }
}
```

Create `apps/web/src/app/api/auth/login/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getAuthService } from '@/features/auth/server/auth-service';
import { setAuthCookie } from '@/features/auth/server/cookies';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await getAuthService().login({
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
      anonymousOwnerId: typeof body.anonymousOwnerId === 'string' ? body.anonymousOwnerId : null,
    });
    const response = NextResponse.json({ user: result.user });
    setAuthCookie(response, result.sessionToken, result.expiresAt);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败';
    const status = message === '邮箱或密码不正确' ? 401 : 400;
    return NextResponse.json({ message }, { status });
  }
}
```

Create `apps/web/src/app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getAuthService } from '@/features/auth/server/auth-service';
import { clearAuthCookie, readAuthCookie } from '@/features/auth/server/cookies';

export async function POST(request: Request) {
  await getAuthService().logout(readAuthCookie(request));
  const response = NextResponse.json({ ok: true });
  clearAuthCookie(response);
  return response;
}
```

Create `apps/web/src/app/api/auth/me/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/server/request-auth';

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  return NextResponse.json({ user });
}
```

- [ ] **Step 5: Run auth API tests**

Run:

```powershell
npm.cmd test -- tests/auth-api.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/app/api/auth apps/web/src/features/auth/server/request-auth.ts apps/web/tests/auth-api.test.ts
git commit -m "feat: add auth api routes"
```

---

### Task 5: Replace Client-Supplied Owner In Create/List APIs

**Files:**

- Modify: `apps/web/src/app/api/generation-sessions/route.ts`
- Modify: `apps/web/src/app/api/generation-sessions/[id]/route.ts`
- Modify: `apps/web/src/app/api/generation-tasks/route.ts`
- Modify: `apps/web/src/app/api/templates/[id]/generation-tasks/route.ts`
- Test: `apps/web/tests/request-owner-api.test.ts`
- Test: update `apps/web/tests/generation-sessions-api.test.ts`
- Test: update `apps/web/tests/templates-api.test.ts`

- [ ] **Step 1: Write failing owner-source tests**

Create `apps/web/tests/request-owner-api.test.ts`:

```ts
import { POST as createTask } from '../src/app/api/generation-tasks/route';
import { POST as createTemplateTask } from '../src/app/api/templates/[id]/generation-tasks/route';
import { getRequestOwner } from '../src/features/auth/server/request-auth';
import { getGenerationService } from '../src/features/generation/server/runtime';
import { createTemplateRepository } from '../src/features/templates/server/template-repository';

vi.mock('../src/features/auth/server/request-auth', () => ({
  getRequestOwner: vi.fn(),
}));

vi.mock('../src/features/generation/server/runtime', () => ({
  getGenerationService: vi.fn(),
}));

vi.mock('../src/features/templates/server/template-repository', () => ({
  createTemplateRepository: vi.fn(),
}));

describe('server-side request owner', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('ignores body.ownerId when creating free generation tasks', async () => {
    vi.mocked(getRequestOwner).mockResolvedValue({
      ownerId: 'user:user_1',
      user: { id: 'user_1', email: 'shop@example.com', role: 'user' },
    });
    const createTaskMock = vi.fn(async ({ request }) => ({ id: 'task_1', status: 'succeeded', request, results: [] }));
    vi.mocked(getGenerationService).mockReturnValue({
      createTask: createTaskMock,
    } as unknown as ReturnType<typeof getGenerationService>);

    await createTask(new Request('http://localhost/api/generation-tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerId: 'owner_attacker',
        sessionId: 'session_1',
        request: {
          requestText: 'test',
          channels: ['wechat'],
          scene: 'new_product',
          style: 'young_trendy',
          campaignInfo: {},
        },
      }),
    }));

    expect(createTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 'user:user_1',
      sessionId: 'session_1',
    }));
  });

  it('ignores body.ownerId when creating template generation tasks', async () => {
    vi.mocked(getRequestOwner).mockResolvedValue({
      ownerId: 'user:user_1',
      user: { id: 'user_1', email: 'shop@example.com', role: 'user' },
    });
    vi.mocked(createTemplateRepository).mockReturnValue({
      getAdminTemplate: vi.fn(async () => ({
        id: 'tpl_1',
        type: 'image',
        title: '模板',
        description: '',
        coverImageDataUrl: 'data:image/png;base64,cover',
        prompt: 'internal prompt',
        published: true,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    } as unknown as ReturnType<typeof createTemplateRepository>);
    const createTaskMock = vi.fn(async ({ request }) => ({ id: 'task_1', status: 'succeeded', request, results: [] }));
    vi.mocked(getGenerationService).mockReturnValue({
      createTask: createTaskMock,
    } as unknown as ReturnType<typeof getGenerationService>);

    await createTemplateTask(new Request('http://localhost/api/templates/tpl_1/generation-tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerId: 'owner_attacker',
        sessionId: 'session_1',
        uploadedImageDataUrl: 'data:image/png;base64,input',
        campaignInfo: {},
      }),
    }), { params: Promise.resolve({ id: 'tpl_1' }) });

    expect(createTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 'user:user_1',
      sessionId: 'session_1',
    }));
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
npm.cmd test -- tests/request-owner-api.test.ts
```

Expected: FAIL because routes still read body/header owner directly.

- [ ] **Step 3: Modify session routes**

In both generation session route files, import:

```ts
import { getRequestOwner } from '@/features/auth/server/request-auth';
```

Replace local `getOwnerId(request)` calls with:

```ts
const { ownerId } = await getRequestOwner(request);
```

Remove the local `getOwnerId` helper from both files.

- [ ] **Step 4: Modify generation task creation route**

In `apps/web/src/app/api/generation-tasks/route.ts`, import `getRequestOwner` and replace owner resolution:

```ts
const { ownerId } = await getRequestOwner(request);
const task = await getGenerationService().createTask({
  ownerId,
  sessionId: body.sessionId ?? null,
  request: generationRequest,
});
```

Do not read `body.ownerId`.

- [ ] **Step 5: Modify template generation route**

In `apps/web/src/app/api/templates/[id]/generation-tasks/route.ts`, import `getRequestOwner` and replace owner resolution:

```ts
const { ownerId } = await getRequestOwner(request);
const task = await getGenerationService().createTask({
  ownerId,
  sessionId: body.sessionId ?? null,
  request: {
    requestText: `使用模板：${template.title}`,
    uploadedImageDataUrl: body.uploadedImageDataUrl,
    channels: ['wechat'],
    scene: 'custom',
    style: 'clean_premium',
    campaignInfo: body.campaignInfo ?? {},
    templateId: template.id,
    templateTitle: template.title,
  },
  templateInstruction: template.prompt,
});
```

- [ ] **Step 6: Update existing API tests**

Update `apps/web/tests/generation-sessions-api.test.ts` and `apps/web/tests/templates-api.test.ts` to mock `getRequestOwner`:

```ts
vi.mock('../src/features/auth/server/request-auth', () => ({
  getRequestOwner: vi.fn(async () => ({
    ownerId: 'owner_1',
    user: null,
  })),
}));
```

Keep existing expectations for owner as `owner_1`.

- [ ] **Step 7: Run focused tests**

Run:

```powershell
npm.cmd test -- tests/request-owner-api.test.ts tests/generation-sessions-api.test.ts tests/templates-api.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add apps/web/src/app/api/generation-sessions apps/web/src/app/api/generation-tasks apps/web/src/app/api/templates apps/web/tests/request-owner-api.test.ts apps/web/tests/generation-sessions-api.test.ts apps/web/tests/templates-api.test.ts
git commit -m "feat: resolve generation owner on server"
```

---

### Task 6: Prevent Cross-Owner Regenerate And Modify

**Files:**

- Modify: `apps/web/src/features/generation/server/generation-service.ts`
- Modify: `apps/web/src/features/generation/server/generation-store.ts`
- Modify: `apps/web/src/app/api/generation-tasks/[id]/regenerate/route.ts`
- Modify: `apps/web/src/app/api/generation-tasks/[id]/modify/route.ts`
- Test: extend `apps/web/tests/request-owner-api.test.ts`
- Test: update `apps/web/tests/generation-service.test.ts`

- [ ] **Step 1: Add failing cross-owner tests**

Append to `apps/web/tests/request-owner-api.test.ts`:

```ts
import { POST as regenerateTask } from '../src/app/api/generation-tasks/[id]/regenerate/route';
import { POST as modifyTask } from '../src/app/api/generation-tasks/[id]/modify/route';

it('returns 404 when regenerating a task owned by another user', async () => {
  vi.mocked(getRequestOwner).mockResolvedValue({
    ownerId: 'user:user_2',
    user: { id: 'user_2', email: 'other@example.com', role: 'user' },
  });
  vi.mocked(getGenerationService).mockReturnValue({
    getTaskForOwner: vi.fn(async () => null),
  } as unknown as ReturnType<typeof getGenerationService>);

  const response = await regenerateTask(new Request('http://localhost/api/generation-tasks/task_1/regenerate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session_1' }),
  }), { params: Promise.resolve({ id: 'task_1' }) });

  expect(response.status).toBe(404);
});

it('returns 404 when modifying a task owned by another user', async () => {
  vi.mocked(getRequestOwner).mockResolvedValue({
    ownerId: 'user:user_2',
    user: { id: 'user_2', email: 'other@example.com', role: 'user' },
  });
  vi.mocked(getGenerationService).mockReturnValue({
    getTaskForOwner: vi.fn(async () => null),
  } as unknown as ReturnType<typeof getGenerationService>);

  const response = await modifyTask(new Request('http://localhost/api/generation-tasks/task_1/modify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ selectedResultId: 'result_1', modificationText: '改成红色', sessionId: 'session_1' }),
  }), { params: Promise.resolve({ id: 'task_1' }) });

  expect(response.status).toBe(404);
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
npm.cmd test -- tests/request-owner-api.test.ts
```

Expected: FAIL because `getTaskForOwner` does not exist and routes use unscoped `getTask`.

- [ ] **Step 3: Add owner-scoped task fetch**

In `GenerationStore` type inside `generation-service.ts`, add:

```ts
getTaskForOwner?(ownerId: string, taskId: string): Promise<GenerationTask | null>;
```

Expose it from `createGenerationService`:

```ts
getTaskForOwner(ownerId: string, taskId: string) {
  return store.getTaskForOwner?.(ownerId, taskId) ?? Promise.resolve(null);
},
```

In `generation-store.ts`, implement Prisma owner-scoped fetch:

```ts
async getTaskForOwner(ownerId, taskId) {
  const task = await prisma.generationTask.findFirst({
    where: { id: taskId, ownerId },
    include: { results: true },
  });
  return task ? mapTask(task) : null;
},
```

In memory store, use `memoryTaskMeta`:

```ts
async getTaskForOwner(ownerId, taskId) {
  const meta = memoryTaskMeta.get(taskId);
  if (meta?.ownerId !== ownerId) return null;
  return memoryTasks.get(taskId) ?? null;
},
```

- [ ] **Step 4: Update regenerate and modify routes**

In both routes, import `getRequestOwner`, resolve owner, and replace:

```ts
const previous = await service.getTask(id);
```

with:

```ts
const { ownerId } = await getRequestOwner(request);
const previous = await service.getTaskForOwner(ownerId, id);
```

Then pass `ownerId` to `createTask`. Do not read `body.ownerId`.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm.cmd test -- tests/request-owner-api.test.ts tests/generation-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/features/generation/server/generation-service.ts apps/web/src/features/generation/server/generation-store.ts apps/web/src/app/api/generation-tasks/[id]/regenerate/route.ts apps/web/src/app/api/generation-tasks/[id]/modify/route.ts apps/web/tests/request-owner-api.test.ts apps/web/tests/generation-service.test.ts
git commit -m "fix: enforce task owner for edits"
```

---

### Task 7: Protect Admin Template APIs With Role Auth

**Files:**

- Modify: `apps/web/src/app/api/admin/templates/route.ts`
- Modify: `apps/web/src/app/api/admin/templates/[id]/route.ts`
- Test: update `apps/web/tests/templates-api.test.ts`

- [ ] **Step 1: Write failing admin authorization tests**

Append to `apps/web/tests/templates-api.test.ts`:

```ts
import { requireAdmin } from '../src/features/auth/server/request-auth';

vi.mock('../src/features/auth/server/request-auth', () => ({
  getRequestOwner: vi.fn(async () => ({ ownerId: 'owner_1', user: null })),
  requireAdmin: vi.fn(),
}));

it('rejects normal users from creating admin templates', async () => {
  vi.mocked(requireAdmin).mockResolvedValue(
    Response.json({ message: '没有权限访问模板管理' }, { status: 403 }) as never,
  );

  const response = await createAdminTemplate(new Request('http://localhost/api/admin/templates', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'image',
      title: 'Blocked',
      coverImageDataUrl: 'data:image/png;base64,cover',
      prompt: 'hidden',
    }),
  }));

  expect(response.status).toBe(403);
});

it('allows admins to create admin templates', async () => {
  vi.mocked(requireAdmin).mockResolvedValue({ id: 'user_admin', email: 'admin@example.com', role: 'admin' });
  const createTemplate = vi.fn(async (input) => ({
    id: 'tpl_admin_1',
    ...input,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  createRepository.mockReturnValue({
    createTemplate,
  } as unknown as ReturnType<typeof createTemplateRepository>);

  const response = await createAdminTemplate(new Request('http://localhost/api/admin/templates', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'image',
      title: 'Allowed',
      coverImageDataUrl: 'data:image/png;base64,cover',
      prompt: 'hidden',
      published: true,
    }),
  }));

  expect(response.status).toBe(201);
  expect(createTemplate).toHaveBeenCalled();
});
```

If the existing test named `creates admin templates without an admin secret for local personal use` remains, rename it to `allows admins to create admin templates`.

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
npm.cmd test -- tests/templates-api.test.ts
```

Expected: FAIL because admin routes do not call `requireAdmin`.

- [ ] **Step 3: Implement route guards**

In `apps/web/src/app/api/admin/templates/route.ts`, import:

```ts
import { requireAdmin } from '@/features/auth/server/request-auth';
```

At the start of `GET` and `POST`, add:

```ts
const admin = await requireAdmin(request);
if (admin instanceof Response) return admin;
```

Change `GET()` signature to `GET(request: Request)`.

In `apps/web/src/app/api/admin/templates/[id]/route.ts`, import `requireAdmin` and add the same guard at the start of `PATCH`.

- [ ] **Step 4: Run template API tests**

Run:

```powershell
npm.cmd test -- tests/templates-api.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/app/api/admin/templates apps/web/tests/templates-api.test.ts
git commit -m "feat: restrict template admin api"
```

---

### Task 8: Preserve Image Asset Fallback Compatibility

**Files:**

- Modify: `apps/web/src/app/api/image-assets/[id]/route.ts`
- Test: update `apps/web/tests/image-assets-api.test.ts`

This route is used by the legacy `APP_PUBLIC_BASE_URL` provider fallback so APIMart can fetch uploaded image bytes. APIMart cannot send app cookies or `x-owner-id`. Keep the route public for unguessable asset ids generated by `makeId('asset')`, but do not expose `imageAssetId` in user-facing task results.

- [ ] **Step 1: Add an explicit fallback safety test**

Update `apps/web/tests/image-assets-api.test.ts`:

```ts
it('does not require cookies because APP_PUBLIC_BASE_URL fallback is provider-facing', async () => {
  const store = createGenerationStore();
  const assetId = `asset_test_public_${Date.now()}`;
  await store.saveImageAsset({
    id: assetId,
    ownerId: 'user:user_1',
    kind: 'uploaded_image',
    mimeType: 'image/png',
    base64: Buffer.from('provider-input').toString('base64'),
  });

  const response = await GET(new Request(`http://localhost/api/image-assets/${assetId}`), {
    params: Promise.resolve({ id: assetId }),
  });

  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
  expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('provider-input');
});
```

- [ ] **Step 2: Run focused test**

Run:

```powershell
npm.cmd test -- tests/image-assets-api.test.ts
```

Expected: PASS with current behavior. This task documents the accepted fallback exception so future owner hardening does not silently break APIMart fallback.

- [ ] **Step 3: Add a short code comment**

In `apps/web/src/app/api/image-assets/[id]/route.ts`, add this comment above the response:

```ts
// Provider fallback endpoint: APIMart cannot send app cookies when APP_PUBLIC_BASE_URL is used.
// Asset ids are generated with random UUIDs and are not exposed in public task payloads.
```

- [ ] **Step 4: Re-run focused test**

Run:

```powershell
npm.cmd test -- tests/image-assets-api.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/app/api/image-assets/[id]/route.ts apps/web/tests/image-assets-api.test.ts
git commit -m "docs: document image asset fallback boundary"
```

---

### Task 9: Add Auth Client, Auth Page, And Menu State

**Files:**

- Create: `apps/web/src/features/auth/auth-client.ts`
- Create: `apps/web/src/app/auth/page.tsx`
- Modify: `apps/web/src/components/HomeMenuDrawer.tsx`
- Test: `apps/web/tests/auth-client.test.ts`

- [ ] **Step 1: Write failing auth client tests**

Create `apps/web/tests/auth-client.test.ts`:

```ts
import { getCurrentUser, login, logout, register } from '../src/features/auth/auth-client';

describe('auth client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers with the current anonymous owner id', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ user: { id: 'user_1', email: 'shop@example.com', role: 'user' } }),
    }));
    vi.stubGlobal('fetch', fetcher);

    const result = await register({
      email: 'shop@example.com',
      password: 'password123',
      anonymousOwnerId: 'owner_browser_1',
    });

    expect(result.user.email).toBe('shop@example.com');
    expect(fetcher).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        email: 'shop@example.com',
        password: 'password123',
        anonymousOwnerId: 'owner_browser_1',
      }),
    }));
  });

  it('supports login, logout, and current user fetch', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: { id: 'user_1', email: 'shop@example.com', role: 'user' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: { id: 'user_1', email: 'shop@example.com', role: 'user' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetcher);

    await login({ email: 'shop@example.com', password: 'password123', anonymousOwnerId: 'owner_browser_1' });
    await expect(getCurrentUser()).resolves.toEqual({ user: { id: 'user_1', email: 'shop@example.com', role: 'user' } });
    await expect(logout()).resolves.toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
npm.cmd test -- tests/auth-client.test.ts
```

Expected: FAIL because `auth-client.ts` does not exist.

- [ ] **Step 3: Implement auth client**

Create `apps/web/src/features/auth/auth-client.ts`:

```ts
import type { PublicUser } from './server/auth-types';

export type AuthUserResponse = {
  user: PublicUser | null;
};

export async function getCurrentUser(): Promise<AuthUserResponse> {
  const response = await fetch('/api/auth/me', { cache: 'no-store' });
  if (!response.ok) throw new Error(await readErrorMessage(response, '读取账号失败'));
  return response.json() as Promise<AuthUserResponse>;
}

export async function register(input: { email: string; password: string; anonymousOwnerId?: string | null }): Promise<{ user: PublicUser }> {
  return submitAuth('/api/auth/register', input, '注册失败');
}

export async function login(input: { email: string; password: string; anonymousOwnerId?: string | null }): Promise<{ user: PublicUser }> {
  return submitAuth('/api/auth/login', input, '登录失败');
}

export async function logout(): Promise<{ ok: true }> {
  const response = await fetch('/api/auth/logout', { method: 'POST' });
  if (!response.ok) throw new Error(await readErrorMessage(response, '退出登录失败'));
  return response.json() as Promise<{ ok: true }>;
}

async function submitAuth(path: string, input: { email: string; password: string; anonymousOwnerId?: string | null }, fallback: string) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, fallback));
  return response.json() as Promise<{ user: PublicUser }>;
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const body = await response.json();
    return typeof body.message === 'string' ? body.message : fallback;
  } catch {
    return fallback;
  }
}
```

- [ ] **Step 4: Create `/auth` page**

Create `apps/web/src/app/auth/page.tsx` as a client component with:

- email input
- password input
- segmented buttons or two buttons for login/register
- submit passes `getOwnerId()` as `anonymousOwnerId`
- on success redirects to `/`
- error message shows API message

Use this skeleton:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, LogIn, UserPlus } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { getOwnerId } from '@/features/generation/owner-id';
import { login, register } from '@/features/auth/auth-client';

type Mode = 'login' | 'register';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const payload = { email, password, anonymousOwnerId: getOwnerId() };
      if (mode === 'register') await register(payload);
      else await login(payload);
      router.push('/');
      router.refresh();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : '账号操作失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="flex min-h-dvh flex-col pb-6">
        <header className="flex items-center gap-3 pt-1">
          <Link href="/" className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface">
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <div>
            <h1 className="text-[22px] font-semibold leading-7 text-ink">账号</h1>
            <p className="mt-1 text-[13px] text-muted">登录后会自动绑定当前浏览器里的历史会话。</p>
          </div>
        </header>

        <section className="mt-5 rounded-lg border border-line bg-surface p-4">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode('login')} className={mode === 'login' ? 'h-10 rounded-lg bg-accent text-white' : 'h-10 rounded-lg border border-line text-ink'}>
              登录
            </button>
            <button type="button" onClick={() => setMode('register')} className={mode === 'register' ? 'h-10 rounded-lg bg-accent text-white' : 'h-10 rounded-lg border border-line text-ink'}>
              注册
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="邮箱" className="h-11 rounded-lg border border-line px-3 outline-none focus:border-accent" />
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="密码，至少 8 位" className="h-11 rounded-lg border border-line px-3 outline-none focus:border-accent" />
            {error ? <div className="rounded-lg border border-warm bg-white p-3 text-[14px] text-warm">{error}</div> : null}
            <button type="button" onClick={handleSubmit} disabled={loading} className="flex h-11 items-center justify-center gap-2 rounded-lg bg-accent text-[15px] font-semibold text-white disabled:bg-line disabled:text-muted">
              {mode === 'login' ? <LogIn size={16} aria-hidden="true" /> : <UserPlus size={16} aria-hidden="true" />}
              {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 5: Update home menu**

In `HomeMenuDrawer.tsx`:

- import `useEffect`, `getCurrentUser`, `logout`, and `Link`.
- load `/api/auth/me` when drawer opens or component mounts.
- show `/auth` link when `user` is null.
- show email and logout when logged in.
- render template management link only when `user?.role === 'admin'`.

Preserve the existing placeholder sections and visual style.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
npm.cmd test -- tests/auth-client.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/features/auth/auth-client.ts apps/web/src/app/auth/page.tsx apps/web/src/components/HomeMenuDrawer.tsx apps/web/tests/auth-client.test.ts
git commit -m "feat: add account UI entry"
```

---

### Task 10: Add Multi-User E2E Smoke Coverage

**Files:**

- Modify: `apps/web/e2e/mobile-image-flow.spec.ts`

- [ ] **Step 1: Add failing E2E test**

Append a test that:

1. Opens `/auth`.
2. Registers user A with a unique email.
3. Goes to `/image`.
4. Creates a mock generation.
5. Logs out from the menu.
6. Registers user B with a unique email.
7. Goes to `/image`.
8. Asserts user A's generated session title/content is not visible.

Use unique emails:

```ts
const suffix = Date.now();
const userA = `owner-a-${suffix}@example.test`;
const userB = `owner-b-${suffix}@example.test`;
```

Use the existing selectors and text expectations already present in `mobile-image-flow.spec.ts`. Do not call real providers; run with `GENERATION_PROVIDER=mock`.

- [ ] **Step 2: Run E2E to verify RED**

Run:

```powershell
$env:GENERATION_PROVIDER='mock'; $env:AUTH_ADMIN_EMAILS=''; npm.cmd run e2e -- e2e/mobile-image-flow.spec.ts -g "registered users do not share sessions"
```

Expected before all app changes are wired: FAIL because auth UI or account isolation is missing.

- [ ] **Step 3: Adjust the test after UI labels are final**

Keep the test behavior fixed. Only update selectors to match actual accessible names from `/auth`, homepage menu, and image page.

- [ ] **Step 4: Run E2E to verify GREEN**

Run:

```powershell
$env:GENERATION_PROVIDER='mock'; $env:AUTH_ADMIN_EMAILS=''; npm.cmd run e2e -- e2e/mobile-image-flow.spec.ts -g "registered users do not share sessions"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/e2e/mobile-image-flow.spec.ts
git commit -m "test: cover account session isolation"
```

---

### Task 11: Full Verification

**Files:**

- No code files unless verification reveals a bug.

- [ ] **Step 1: Run all unit/API tests**

Run from `apps/web`:

```powershell
npm.cmd test
```

Expected: all Vitest tests pass.

- [ ] **Step 2: Run production build**

Run:

```powershell
npm.cmd run build
```

Expected: Next.js build exits with code 0.

- [ ] **Step 3: Run mock E2E**

Run:

```powershell
$env:GENERATION_PROVIDER='mock'; $env:AUTH_ADMIN_EMAILS='admin@example.test'; npm.cmd run e2e
```

Expected: all Playwright tests pass.

- [ ] **Step 4: Check git diff**

Run:

```powershell
git status --short
git diff --stat
```

Expected: only account/auth implementation files, tests, schema, migrations, and planned UI files changed. Existing unrelated user changes remain untouched.

- [ ] **Step 5: Update current status docs if requested**

If the user wants docs updated after implementation, modify only the relevant root docs:

- `CURRENT_STATUS.md`
- `NEXT_TASKS.md`
- `ARCHITECTURE.md`
- `DECISIONS.md`

Do not update status docs before verified implementation.

---

## Self-Review

- Spec coverage: register/login/logout/session, anonymous binding, server-side owner resolution, admin role, multi-user isolation, and verification are covered by Tasks 1-11.
- Placeholder scan: no step depends on an undefined path or unnamed file. Every test file and production file has an exact path.
- Type consistency: public user shape is `{ id, email, role }`; account owner key is always `user:<id>`; anonymous owners remain `owner_*`.
- Scope check: image asset fallback remains public because it is provider-facing and uses random UUID ids; stronger signed provider URLs are outside this P0 account implementation.
