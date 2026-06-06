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
    const result = await getAuthService().register({
      email,
      password,
      anonymousOwnerId,
    });
    const response = NextResponse.json({ user: result.user }, { status: 201 });
    setAuthCookie(response, result.sessionToken, result.expiresAt);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : '注册失败';
    return NextResponse.json(
      { message },
      { status: message === '该邮箱已注册' ? 409 : 400 },
    );
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
