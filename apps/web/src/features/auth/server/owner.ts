import type { PublicUser, UserRole } from './auth-types';

export function userOwnerId(user: Pick<PublicUser, 'id'>) {
  return `user:${user.id}`;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isAnonymousOwnerId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('owner_');
}

export function getRoleForEmail(email: string, adminEmails = process.env.AUTH_ADMIN_EMAILS ?? ''): UserRole {
  const normalizedEmail = normalizeEmail(email);
  const admins = adminEmails
    .split(',')
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);

  return admins.includes(normalizedEmail) ? 'admin' : 'user';
}
