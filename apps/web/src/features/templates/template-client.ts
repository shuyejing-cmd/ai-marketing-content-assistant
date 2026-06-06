import type { CampaignInfo, GenerationTask } from '@/features/generation/generation-types';
import type { GenerationClientMeta } from '@/features/generation/generation-client';
import type {
  AdminTemplate,
  PublicTemplate,
  TemplateInput,
  TemplateType,
  TemplateUpdateInput,
} from './template-types';

export async function listTemplates(type?: TemplateType): Promise<PublicTemplate[]> {
  const query = type ? `?type=${type}` : '';
  const response = await fetch(`/api/templates${query}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(await readErrorMessage(response, '读取模板失败'));
  return response.json() as Promise<PublicTemplate[]>;
}

export async function getTemplate(id: string): Promise<PublicTemplate> {
  const response = await fetch(`/api/templates/${id}`);
  if (!response.ok) throw new Error(await readErrorMessage(response, '模板不存在或未发布'));
  return response.json() as Promise<PublicTemplate>;
}

export async function listAdminTemplates(): Promise<AdminTemplate[]> {
  const response = await fetch('/api/admin/templates', { cache: 'no-store' });
  if (!response.ok) throw new Error(await readErrorMessage(response, '读取管理模板失败'));
  return response.json() as Promise<AdminTemplate[]>;
}

export async function createAdminTemplate(
  input: TemplateInput,
): Promise<AdminTemplate> {
  const response = await fetch('/api/admin/templates', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, '创建模板失败'));
  return response.json() as Promise<AdminTemplate>;
}

export async function updateAdminTemplate(
  id: string,
  input: TemplateUpdateInput,
): Promise<AdminTemplate> {
  const response = await fetch(`/api/admin/templates/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, '更新模板失败'));
  return response.json() as Promise<AdminTemplate>;
}

export async function createTemplateGenerationTask(
  templateId: string,
  payload: { uploadedImageDataUrl: string; campaignInfo: CampaignInfo },
  meta: GenerationClientMeta = {},
): Promise<GenerationTask> {
  const response = await fetch(`/api/templates/${templateId}/generation-tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(meta.ownerId ? { 'x-owner-id': meta.ownerId } : {}),
    },
    body: JSON.stringify({ ...payload, ...meta }),
  });

  if (!response.ok) throw new Error(await readErrorMessage(response, '模板生成失败'));
  return response.json() as Promise<GenerationTask>;
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const body = await response.json();
    return typeof body.message === 'string' ? body.message : fallback;
  } catch {
    return fallback;
  }
}
