import { NextResponse } from 'next/server';

import { getCurrentUser } from '../../../../features/auth/server/request-auth';

export async function GET(request: Request) {
  return NextResponse.json({ user: await getCurrentUser(request) });
}
