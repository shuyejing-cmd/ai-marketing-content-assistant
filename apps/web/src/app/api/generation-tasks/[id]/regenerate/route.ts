import { NextResponse } from 'next/server';
import { createMockGenerationTask } from '@/features/generation/mock-generation';
import { mockTasks } from '@/features/generation/mock-task-store';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const previous = mockTasks.get(id);
  if (!previous) {
    return NextResponse.json({ message: 'Task not found' }, { status: 404 });
  }

  const task = createMockGenerationTask(previous.request);
  mockTasks.set(task.id, task);
  return NextResponse.json(task, { status: 201 });
}
