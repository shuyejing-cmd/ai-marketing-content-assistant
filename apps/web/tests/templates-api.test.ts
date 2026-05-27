import { GET as listTemplates } from '../src/app/api/templates/route';
import { POST as createAdminTemplate } from '../src/app/api/admin/templates/route';
import { POST as createTemplateTask } from '../src/app/api/templates/[id]/generation-tasks/route';
import { createTemplateRepository } from '../src/features/templates/server/template-repository';
import { getGenerationService } from '../src/features/generation/server/runtime';

vi.mock('../src/features/templates/server/template-repository', () => ({
  createTemplateRepository: vi.fn(),
}));

vi.mock('../src/features/generation/server/runtime', () => ({
  getGenerationService: vi.fn(),
}));

const createRepository = vi.mocked(createTemplateRepository);
const getService = vi.mocked(getGenerationService);

describe('template API', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('lists only public template fields', async () => {
    createRepository.mockReturnValue({
      listPublishedTemplates: vi.fn(async () => [
        {
          id: 'tpl_1',
          type: 'image',
          title: '节日商品图',
          description: '上传商品图生成节日海报',
          coverImageDataUrl: 'data:image/png;base64,cover',
          published: true,
          sortOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
    } as unknown as ReturnType<typeof createTemplateRepository>);

    const response = await listTemplates(new Request('http://localhost/api/templates?type=image'));
    const body = await response.json();

    expect(body).toHaveLength(1);
    expect(body[0]).not.toHaveProperty('prompt');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(createRepository().listPublishedTemplates).toHaveBeenCalledWith('image');
  });

  it('creates admin templates without an admin secret for local personal use', async () => {
    const createTemplate = vi.fn(async (input) => ({
      id: 'tpl_admin_1',
      ...input,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    createRepository.mockReturnValue({
      createTemplate,
    } as unknown as ReturnType<typeof createTemplateRepository>);

    const response = await createAdminTemplate(
      new Request('http://localhost/api/admin/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'image',
          title: 'Local template',
          description: 'Personal template',
          coverImageDataUrl: 'data:image/png;base64,cover',
          prompt: 'Internal template prompt',
          published: true,
          sortOrder: 3,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'image',
        title: 'Local template',
        coverImageDataUrl: 'data:image/png;base64,cover',
        prompt: 'Internal template prompt',
        published: true,
        sortOrder: 3,
      }),
    );
  });

  it('creates generation tasks with server-side template prompts only', async () => {
    createRepository.mockReturnValue({
      getAdminTemplate: vi.fn(async () => ({
        id: 'tpl_1',
        type: 'image',
        title: '节日商品图',
        description: '上传商品图生成节日海报',
        coverImageDataUrl: 'data:image/png;base64,cover',
        prompt: '服务端内部模板提示词',
        published: true,
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    } as unknown as ReturnType<typeof createTemplateRepository>);
    const createTask = vi.fn(async ({ request }) => ({
      id: 'task_1',
      status: 'succeeded',
      request,
      results: [],
    }));
    getService.mockReturnValue({
      createTask,
    } as unknown as ReturnType<typeof getGenerationService>);

    const response = await createTemplateTask(
      new Request('http://localhost/api/templates/tpl_1/generation-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-owner-id': 'owner_1',
        },
        body: JSON.stringify({
          sessionId: 'session_1',
          uploadedImageDataUrl: 'data:image/png;base64,input',
          campaignInfo: { productName: '保温杯' },
          templateInstruction: '前端伪造提示词',
        }),
      }),
      { params: Promise.resolve({ id: 'tpl_1' }) },
    );

    expect(response.status).toBe(201);
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'owner_1',
        sessionId: 'session_1',
        request: expect.objectContaining({
          templateId: 'tpl_1',
          templateTitle: '节日商品图',
          requestText: '使用模板：节日商品图',
        }),
        templateInstruction: '服务端内部模板提示词',
      }),
    );
  });
});
