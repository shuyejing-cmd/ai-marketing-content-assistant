import { NextResponse } from 'next/server';
import { createGenerationStore } from '@/features/generation/server/generation-store';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const asset = await createGenerationStore().getImageAsset(id);
  if (!asset) {
    return NextResponse.json({ message: '图片不存在' }, { status: 404 });
  }

  // Provider fallback endpoint: APIMart cannot send app cookies when APP_PUBLIC_BASE_URL is used.
  // Asset ids are generated with random UUIDs and are not exposed in public task payloads.
  return new Response(Buffer.from(asset.base64, 'base64'), {
    headers: {
      'Content-Type': asset.mimeType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
