import { NextRequest, NextResponse } from 'next/server';
import { modifyMockGenerationTask } from '@/features/generation/mock-generation';
import { mockTasks } from '@/features/generation/mock-task-store';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const previous = mockTasks.get(id);
  if (!previous) {
    return NextResponse.json({ message: 'Task not found' }, { status: 404 });
  }

  const body = (await request.json()) as {
    selectedResultId: string;
    modificationText: string;
  };
  const task = modifyMockGenerationTask(previous, body.selectedResultId, body.modificationText);
  mockTasks.set(task.id, task);
  return NextResponse.json(task, { status: 201 });
}
