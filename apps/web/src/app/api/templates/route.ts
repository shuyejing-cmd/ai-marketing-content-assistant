import { NextResponse } from 'next/server';
import { createTemplateRepository } from '@/features/templates/server/template-repository';
import type { TemplateType } from '@/features/templates/template-types';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = normalizeType(url.searchParams.get('type'));
  const templates = await createTemplateRepository().listPublishedTemplates(type);
  return NextResponse.json(templates, { headers: { 'Cache-Control': 'no-store' } });
}

function normalizeType(value: string | null): TemplateType | undefined {
  if (value === 'image' || value === 'video') return value;
  return undefined;
}
