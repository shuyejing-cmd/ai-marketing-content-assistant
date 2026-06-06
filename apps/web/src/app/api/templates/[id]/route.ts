import { NextResponse } from 'next/server';
import { createTemplateRepository } from '@/features/templates/server/template-repository';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const template = await createTemplateRepository().getPublishedTemplate(id);
  if (!template) {
    return NextResponse.json({ message: '模板不存在或未发布' }, { status: 404 });
  }
  return NextResponse.json(template);
}
