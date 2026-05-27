import { NextResponse } from 'next/server';
import { getGenerationService } from '@/features/generation/server/runtime';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const task = await getGenerationService().getTask(id);
  if (!task) {
    return NextResponse.json({ message: 'Task not found' }, { status: 404 });
  }
  return NextResponse.json(task);
}
