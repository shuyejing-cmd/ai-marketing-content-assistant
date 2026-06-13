import { NextResponse } from 'next/server';
import { getGenerationService } from '@/features/generation/server/runtime';
import type { CampaignInfo } from '@/features/generation/generation-types';
import { createTemplateRepository } from '@/features/templates/server/template-repository';
import { getRequestOwner } from '@/features/auth/server/request-auth';
import { ImageProcessingError, imageErrorPayload } from '@/features/image-upload/image-errors';
import { readBoundedJson } from '@/features/image-upload/server/read-bounded-json';

type RouteContext = {
  params: Promise<{ id: string }>;
};

type TemplateGenerationBody = {
  sessionId?: string | null;
  uploadedImageDataUrl?: string;
  campaignInfo?: CampaignInfo;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const template = await createTemplateRepository().getAdminTemplate(id);
  if (!template || !template.published || template.type !== 'image') {
    return NextResponse.json({ message: '图片模板不存在或未发布' }, { status: 404 });
  }

  try {
    const body = await readTemplateGenerationBody(request);
    if (!body.uploadedImageDataUrl) {
      return NextResponse.json({ message: '请先上传图片' }, { status: 400 });
    }

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

async function readTemplateGenerationBody(
  request: Request,
): Promise<TemplateGenerationBody> {
  try {
    return await readBoundedJson<TemplateGenerationBody>(request);
  } catch (error) {
    if (error instanceof ImageProcessingError) throw error;
    return {};
  }
}
