import { NextResponse } from 'next/server';

import type { PublicUser } from './auth-types';
import { getAuthService } from './auth-service';
import { readAuthCookie } from './cookies';
import { isAnonymousOwnerId, userOwnerId } from './owner';

export type RequestOwner = {
  ownerId: string;
  user: PublicUser | null;
};

export async function getCurrentUser(request: Request) {
  const sessionToken = readAuthCookie(request);
  if (!sessionToken) return null;

  return getAuthService().getUserBySessionToken(sessionToken);
}

export async function getRequestOwner(request: Request): Promise<RequestOwner> {
  const user = await getCurrentUser(request);
  if (user) {
    return { ownerId: userOwnerId(user), user };
  }

  const anonymousOwnerId = request.headers.get('x-owner-id');
  return { ownerId: isAnonymousOwnerId(anonymousOwnerId) ? anonymousOwnerId : 'anonymous', user: null };
}

export async function requireUser(request: Request): Promise<PublicUser | NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }

  return user;
}

export async function requireAdmin(request: Request): Promise<PublicUser | NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }

  if (user.role !== 'admin') {
    return NextResponse.json({ message: '没有权限访问模板管理' }, { status: 403 });
  }

  return user;
}
