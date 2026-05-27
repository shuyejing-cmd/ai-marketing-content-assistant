import { NextResponse } from 'next/server';
import { createTemplateRepository } from '@/features/templates/server/template-repository';
import type { TemplateUpdateInput } from '@/features/templates/template-types';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as TemplateUpdateInput;
  try {
    const template = await createTemplateRepository().updateTemplate(id, body);
    return NextResponse.json(template);
  } catch {
    return NextResponse.json({ message: '模板不存在' }, { status: 404 });
  }
}
