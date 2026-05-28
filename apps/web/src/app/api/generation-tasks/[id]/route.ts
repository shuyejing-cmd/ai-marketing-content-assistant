import { NextResponse } from 'next/server';
import { getRequestOwner } from '@/features/auth/server/request-auth';
import { getGenerationService } from '@/features/generation/server/runtime';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { ownerId } = await getRequestOwner(request);
  const task = await getGenerationService().getTaskForOwner(ownerId, id);
  if (!task) {
    return NextResponse.json({ message: 'Task not found' }, { status: 404 });
  }
  return NextResponse.json(task);
}
