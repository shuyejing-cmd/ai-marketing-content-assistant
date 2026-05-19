import { NextRequest, NextResponse } from 'next/server';
import { createMockGenerationTask } from '@/features/generation/mock-generation';
import type { GenerationTaskRequest } from '@/features/generation/generation-types';
import { mockTasks } from '@/features/generation/mock-task-store';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as GenerationTaskRequest;
  const task = createMockGenerationTask(body);
  mockTasks.set(task.id, task);
  return NextResponse.json(task, { status: 201 });
}
