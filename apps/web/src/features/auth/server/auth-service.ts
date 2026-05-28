import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { makeId } from '../../generation/server/ids';
import { getPrismaClient } from '../../generation/server/prisma';
import { hashPassword, verifyPassword } from './password';
import type { AuthResult, PublicUser, UserRecord, UserRole } from './auth-types';
import { getRoleForEmail, isAnonymousOwnerId, normalizeEmail, userOwnerId } from './owner';

const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

type AuthSessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  user?: DbUserRecord;
};

type DbUserRecord = Omit<UserRecord, 'role'> & {
  role: string;
};

type AuthServicePrisma = {
  $transaction?(operations: Array<Promise<unknown>>): Promise<unknown>;
  user: {
    create(args: { data: UserRecord }): Promise<DbUserRecord>;
    findUnique(args: { where: { email?: string; id?: string } }): Promise<DbUserRecord | null>;
    update(args: { where: { id: string }; data: Partial<Pick<UserRecord, 'role'>> }): Promise<DbUserRecord>;
  };
  authSession: {
    create(args: {
      data: {
        id: string;
        userId: string;
        tokenHash: string;
        expiresAt: Date;
      };
      include?: { user?: boolean };
    }): Promise<AuthSessionRecord>;
    findUnique(args: { where: { tokenHash: string }; include: { user: true } }): Promise<AuthSessionRecord | null>;
    deleteMany(args: { where: { tokenHash?: string; expiresAt?: { lt: Date } } }): Promise<{ count: number }>;
  };
  session: {
    updateMany(args: { where: { ownerId: string }; data: { ownerId: string } }): Promise<{ count: number }>;
  };
  generationTask: {
    updateMany(args: { where: { ownerId: string }; data: { ownerId: string } }): Promise<{ count: number }>;
  };
  imageAsset: {
    updateMany(args: { where: { ownerId: string }; data: { ownerId: string } }): Promise<{ count: number }>;
  };
};

export function getAuthService() {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('DATABASE_URL is required for account features');
  }

  return createAuthService(prisma);
}

export function createAuthService(prisma: AuthServicePrisma) {
  return {
    async register({
      email,
      password,
      anonymousOwnerId,
    }: {
      email: string;
      password: string;
      anonymousOwnerId?: string;
    }): Promise<AuthResult> {
      const normalizedEmail = normalizeEmail(email);
      validateRegistrationInput(normalizedEmail, password);

      const user: UserRecord = {
        id: makeId('user'),
        email: normalizedEmail,
        passwordHash: await hashPassword(password),
        role: getRoleForEmail(normalizedEmail),
      };

      let createdUser: DbUserRecord;
      try {
        createdUser = await prisma.user.create({ data: user });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new Error('该邮箱已注册');
        }
        throw error;
      }

      await bindAnonymousOwner(prisma, anonymousOwnerId, userOwnerId(createdUser));
      return createLoginSession(prisma, createdUser);
    },

    async login({
      email,
      password,
      anonymousOwnerId,
    }: {
      email: string;
      password: string;
      anonymousOwnerId?: string;
    }): Promise<AuthResult> {
      const normalizedEmail = normalizeEmail(email);
      const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        throw new Error('邮箱或密码不正确');
      }

      let currentUser = user;
      const currentRole = getRoleForEmail(currentUser.email);
      if (currentUser.role !== currentRole) {
        currentUser = await prisma.user.update({
          where: { id: currentUser.id },
          data: { role: currentRole },
        });
      }

      await bindAnonymousOwner(prisma, anonymousOwnerId, userOwnerId(currentUser));
      return createLoginSession(prisma, currentUser);
    },

    async getUserBySessionToken(token: string | null | undefined): Promise<PublicUser | null> {
      if (!isSessionToken(token)) return null;

      const session = await prisma.authSession.findUnique({
        where: { tokenHash: hashSessionToken(token) },
        include: { user: true },
      });

      if (!session?.user || session.expiresAt <= new Date()) {
        return null;
      }

      return toPublicUser(session.user);
    },

    async logout(token: string | null | undefined) {
      if (!isSessionToken(token)) return;

      await prisma.authSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
    },

    async cleanupExpiredSessions(now = new Date()) {
      return prisma.authSession.deleteMany({ where: { expiresAt: { lt: now } } });
    },
  };
}

function validateRegistrationInput(email: string, password: string) {
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('邮箱格式不正确');
  }

  if (password.length < 8) {
    throw new Error('密码至少需要 8 个字符');
  }
}

async function bindAnonymousOwner(prisma: AuthServicePrisma, anonymousOwnerId: string | undefined, accountOwnerId: string) {
  if (!isAnonymousOwnerId(anonymousOwnerId)) return;

  const operations = [
    prisma.session.updateMany({ where: { ownerId: anonymousOwnerId }, data: { ownerId: accountOwnerId } }),
    prisma.generationTask.updateMany({ where: { ownerId: anonymousOwnerId }, data: { ownerId: accountOwnerId } }),
    prisma.imageAsset.updateMany({ where: { ownerId: anonymousOwnerId }, data: { ownerId: accountOwnerId } }),
  ];

  if (prisma.$transaction) {
    await prisma.$transaction(operations);
    return;
  }

  await Promise.all(operations);
}

async function createLoginSession(prisma: AuthServicePrisma, user: DbUserRecord): Promise<AuthResult> {
  const sessionToken = makeSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_MS);

  await prisma.authSession.create({
    data: {
      id: makeId('auth_session'),
      userId: user.id,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt,
    },
  });

  return {
    user: toPublicUser(user),
    sessionToken,
    expiresAt,
  };
}

function makeSessionToken() {
  return `session_${randomBytes(32).toString('base64url')}`;
}

function isSessionToken(token: string | null | undefined): token is string {
  return typeof token === 'string' && token.startsWith('session_');
}

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function toPublicUser(user: DbUserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: coerceRole(user.role),
  };
}

function coerceRole(role: string): UserRole {
  return role === 'admin' ? 'admin' : 'user';
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
