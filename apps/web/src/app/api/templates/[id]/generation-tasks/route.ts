import { NextResponse } from 'next/server';
import { getGenerationService } from '@/features/generation/server/runtime';
import type { CampaignInfo } from '@/features/generation/generation-types';
import { createTemplateRepository } from '@/features/templates/server/template-repository';
import { getRequestOwner } from '@/features/auth/server/request-auth';
import { ImageProcessingError, imageErrorPayload } from '@/features/image-upload/image-errors';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const template = await createTemplateRepository().getAdminTemplate(id);
  if (!template || !template.published || template.type !== 'image') {
    return NextResponse.json({ message: '图片模板不存在或未发布' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string | null;
    uploadedImageDataUrl?: string;
    campaignInfo?: CampaignInfo;
  };
  if (!body.uploadedImageDataUrl) {
    return NextResponse.json({ message: '请先上传图片' }, { status: 400 });
  }

  try {
    const { ownerId } = await getRequestOwner(request);
    const task = await getGenerationService().createTask({
      ownerId,
      sessionId: body.sessionId ?? null,
      request: {
        requestText: `使用模板：${template.title}`,
        uploadedImageDataUrl: body.uploadedImageDataUrl,
        channels: ['wechat'],
        scene: 'custom',
        style: 'clean_premium',
        campaignInfo: body.campaignInfo ?? {},
        templateId: template.id,
        templateTitle: template.title,
      },
      templateInstruction: template.prompt,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      const payload = imageErrorPayload(error);
      return NextResponse.json(payload.body, { status: payload.status });
    }
    return NextResponse.json(
      { message: error instanceof Error ? error.message : '模板生成失败' },
      { status: 500 },
    );
  }
}
