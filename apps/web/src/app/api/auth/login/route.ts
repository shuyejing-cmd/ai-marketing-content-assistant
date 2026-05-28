import { NextResponse } from 'next/server';

import { getAuthService } from '../../../../features/auth/server/auth-service';
import { setAuthCookie } from '../../../../features/auth/server/cookies';
import { isAnonymousOwnerId } from '../../../../features/auth/server/owner';

export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => ({}));
  const body = isObjectRecord(rawBody) ? rawBody : {};
  const email = typeof body.email === 'string' ? body.email : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const anonymousOwnerId = isAnonymousOwnerId(body.anonymousOwnerId) ? body.anonymousOwnerId : undefined;

  try {
    const result = await getAuthService().login({
      email,
      password,
      anonymousOwnerId,
    });
    const response = NextResponse.json({ user: result.user });
    setAuthCookie(response, result.sessionToken, result.expiresAt);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败';
    return NextResponse.json(
      { message },
      { status: message === '邮箱或密码不正确' ? 401 : 400 },
    );
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
