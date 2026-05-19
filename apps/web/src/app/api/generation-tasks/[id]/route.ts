import { NextResponse } from 'next/server';
import { mockTasks } from '@/features/generation/mock-task-store';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const task = mockTasks.get(id);
  if (!task) {
    return NextResponse.json({ message: 'Task not found' }, { status: 404 });
  }
  return NextResponse.json(task);
}
