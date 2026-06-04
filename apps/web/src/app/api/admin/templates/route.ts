import { NextResponse } from 'next/server';
import { requireAdmin } from '@/features/auth/server/request-auth';
import { createTemplateRepository } from '@/features/templates/server/template-repository';
import type { TemplateInput } from '@/features/templates/template-types';

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  return NextResponse.json(await createTemplateRepository().listAdminTemplates());
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const body = (await request.json().catch(() => ({}))) as Partial<TemplateInput>;
  if (!body.title || !body.coverImageDataUrl || !body.prompt) {
    return NextResponse.json({ message: '请填写模板标题、封面和内部提示词' }, { status: 400 });
  }

  const template = await createTemplateRepository().createTemplate({
    type: body.type === 'video' ? 'video' : 'image',
    title: body.title,
    description: body.description ?? '',
    coverImageDataUrl: body.coverImageDataUrl,
    prompt: body.prompt,
    published: Boolean(body.published),
    sortOrder: body.sortOrder ?? 0,
  });
  return NextResponse.json(template, { status: 201 });
}
