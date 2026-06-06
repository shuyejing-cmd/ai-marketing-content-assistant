import { NextResponse } from 'next/server';

import { getAuthService } from '../../../../features/auth/server/auth-service';
import { clearAuthCookie, readAuthCookie } from '../../../../features/auth/server/cookies';

export async function POST(request: Request) {
  const token = readAuthCookie(request);
  await getAuthService().logout(token);

  const response = NextResponse.json({ ok: true });
  clearAuthCookie(response);
  return response;
}
