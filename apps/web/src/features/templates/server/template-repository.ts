import { makeId } from '@/features/generation/server/ids';
import { getPrismaClient } from '@/features/generation/server/prisma';
import type { AdminTemplate, PublicTemplate, TemplateInput, TemplateType, TemplateUpdateInput } from '../template-types';

type TemplateRow = {
  id: string;
  type: string;
  title: string;
  description: string;
  coverMimeType: string;
  coverBase64: string;
  prompt: string;
  published: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

type TemplateClient = {
  template: {
    create(args: { data: TemplateRow }): Promise<TemplateRow>;
    findMany(args?: { where?: { type?: string; published?: boolean }; orderBy?: Array<Record<string, string>> | Record<string, string> }): Promise<TemplateRow[]>;
    findFirst(args: { where: { id?: string; published?: boolean } }): Promise<TemplateRow | null>;
    update(args: { where: { id: string }; data: Partial<TemplateRow> }): Promise<TemplateRow>;
  };
};

const globalTemplates = globalThis as unknown as {
  templateMemoryRows?: Map<string, TemplateRow>;
};

const memoryRows = (globalTemplates.templateMemoryRows ??= new Map<string, TemplateRow>());

export function createTemplateRepository(client: TemplateClient | null = getPrismaClient() as unknown as TemplateClient | null) {
  const templateClient = client ?? createMemoryTemplateClient();
  return {
    async createTemplate(input: TemplateInput): Promise<AdminTemplate> {
      const cover = parseCoverImage(input.coverImageDataUrl);
      const now = new Date();
      const row = await templateClient.template.create({
        data: {
          id: makeId('tpl'),
          type: normalizeType(input.type),
          title: input.title.trim() || '未命名模板',
          description: input.description.trim(),
          coverMimeType: cover.mimeType,
          coverBase64: cover.base64,
          prompt: input.prompt.trim(),
          published: Boolean(input.published),
          sortOrder: input.sortOrder ?? 0,
          createdAt: now,
          updatedAt: now,
        },
      });
      return toAdminTemplate(row);
    },

    async updateTemplate(id: string, input: TemplateUpdateInput): Promise<AdminTemplate> {
      const data: Partial<TemplateRow> = {};
      if (input.type) data.type = normalizeType(input.type);
      if (input.title !== undefined) data.title = input.title.trim() || '未命名模板';
      if (input.description !== undefined) data.description = input.description.trim();
      if (input.prompt !== undefined) data.prompt = input.prompt.trim();
      if (input.published !== undefined) data.published = Boolean(input.published);
      if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
      if (input.coverImageDataUrl !== undefined) {
        const cover = parseCoverImage(input.coverImageDataUrl);
        data.coverMimeType = cover.mimeType;
        data.coverBase64 = cover.base64;
      }
      return toAdminTemplate(await templateClient.template.update({ where: { id }, data }));
    },

    async listPublishedTemplates(type?: TemplateType): Promise<PublicTemplate[]> {
      const rows = await templateClient.template.findMany({
        where: {
          ...(type ? { type } : {}),
          published: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      });
      return rows.map(toPublicTemplate);
    },

    async listAdminTemplates(): Promise<AdminTemplate[]> {
      const rows = await templateClient.template.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      });
      return rows.map(toAdminTemplate);
    },

    async getPublishedTemplate(id: string): Promise<PublicTemplate | null> {
      const row = await templateClient.template.findFirst({ where: { id, published: true } });
      return row ? toPublicTemplate(row) : null;
    },

    async getAdminTemplate(id: string): Promise<AdminTemplate | null> {
      const row = await templateClient.template.findFirst({ where: { id } });
      return row ? toAdminTemplate(row) : null;
    },
  };
}

function createMemoryTemplateClient(): TemplateClient {
  return {
    template: {
      async create({ data }) {
        memoryRows.set(data.id, data);
        return data;
      },
      async findMany({ where } = {}) {
        return Array.from(memoryRows.values())
          .filter((row) => (where?.type ? row.type === where.type : true))
          .filter((row) => (where?.published !== undefined ? row.published === where.published : true))
          .sort((left, right) => left.sortOrder - right.sortOrder || right.createdAt.getTime() - left.createdAt.getTime());
      },
      async findFirst({ where }) {
        return (
          Array.from(memoryRows.values()).find((row) => {
            if (where.id && row.id !== where.id) return false;
            if (where.published !== undefined && row.published !== where.published) return false;
            return true;
          }) ?? null
        );
      },
      async update({ where, data }) {
        const row = memoryRows.get(where.id);
        if (!row) throw new Error('Template not found');
        const next = { ...row, ...data, updatedAt: new Date() };
        memoryRows.set(where.id, next);
        return next;
      },
    },
  };
}

function toPublicTemplate(row: TemplateRow): PublicTemplate {
  return {
    id: row.id,
    type: normalizeType(row.type),
    title: row.title,
    description: row.description,
    coverImageDataUrl: `data:${row.coverMimeType};base64,${row.coverBase64}`,
    published: row.published,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAdminTemplate(row: TemplateRow): AdminTemplate {
  return {
    ...toPublicTemplate(row),
    prompt: row.prompt,
  };
}

function parseCoverImage(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { mimeType: 'image/png', base64: dataUrl };
  return { mimeType: match[1], base64: match[2] };
}

function normalizeType(value: string): TemplateType {
  return value === 'video' ? 'video' : 'image';
}
