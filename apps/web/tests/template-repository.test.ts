import { createTemplateRepository } from '../src/features/templates/server/template-repository';

describe('template repository', () => {
  it('creates templates and keeps internal prompts out of the public list', async () => {
    const templates = new Map<string, TemplateRow>();
    const repository = createTemplateRepository(createTemplateClient(templates));

    const imageTemplate = await repository.createTemplate({
      type: 'image',
      title: '商品节日海报',
      description: '上传商品图生成节日促销海报',
      coverImageDataUrl: 'data:image/png;base64,cover',
      prompt: '只使用这个内部模板提示词',
      published: true,
      sortOrder: 2,
    });
    await repository.createTemplate({
      type: 'video',
      title: '短视频占位',
      description: '即将开放',
      coverImageDataUrl: 'data:image/png;base64,video',
      prompt: '视频内部提示词',
      published: false,
      sortOrder: 1,
    });

    await expect(repository.listPublishedTemplates('image')).resolves.toEqual([
      expect.objectContaining({
        id: imageTemplate.id,
        title: '商品节日海报',
        coverImageDataUrl: 'data:image/png;base64,cover',
      }),
    ]);
    expect(await repository.listPublishedTemplates('video')).toEqual([]);
    expect(await repository.listAdminTemplates()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prompt: '只使用这个内部模板提示词',
        }),
      ]),
    );
    expect(await repository.getPublishedTemplate(imageTemplate.id)).not.toHaveProperty('prompt');
    expect(await repository.getAdminTemplate(imageTemplate.id)).toEqual(
      expect.objectContaining({
        prompt: '只使用这个内部模板提示词',
      }),
    );
  });
});

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

function createTemplateClient(templates: Map<string, TemplateRow>) {
  return {
    template: {
      create: vi.fn(async ({ data }) => {
        const now = new Date();
        const row = { ...data, createdAt: now, updatedAt: now };
        templates.set(row.id, row);
        return row;
      }),
      findMany: vi.fn(async ({ where, orderBy }) => {
        let rows = Array.from(templates.values());
        if (where?.type) rows = rows.filter((row) => row.type === where.type);
        if (where?.published !== undefined) rows = rows.filter((row) => row.published === where.published);
        if (orderBy) rows.sort((left, right) => left.sortOrder - right.sortOrder);
        return rows;
      }),
      findFirst: vi.fn(async ({ where }) => {
        return (
          Array.from(templates.values()).find((row) => {
            if (where.id && row.id !== where.id) return false;
            if (where.published !== undefined && row.published !== where.published) return false;
            return true;
          }) ?? null
        );
      }),
      update: vi.fn(async ({ where, data }) => {
        const row = templates.get(where.id);
        if (!row) throw new Error('not found');
        const next = { ...row, ...data, updatedAt: new Date() };
        templates.set(where.id, next);
        return next;
      }),
    },
  };
}
