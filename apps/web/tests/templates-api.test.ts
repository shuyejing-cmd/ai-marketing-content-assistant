import { GET as listTemplates } from '../src/app/api/templates/route';
import { GET as listAdminTemplates, POST as createAdminTemplate } from '../src/app/api/admin/templates/route';
import { PATCH as updateAdminTemplate } from '../src/app/api/admin/templates/[id]/route';
import { POST as createTemplateTask } from '../src/app/api/templates/[id]/generation-tasks/route';
import { createTemplateRepository } from '../src/features/templates/server/template-repository';
import { getGenerationService } from '../src/features/generation/server/runtime';
import { requireAdmin } from '../src/features/auth/server/request-auth';

vi.mock('../src/features/templates/server/template-repository', () => ({
  createTemplateRepository: vi.fn(),
}));

vi.mock('../src/features/generation/server/runtime', () => ({
  getGenerationService: vi.fn(),
}));

vi.mock('../src/features/auth/server/request-auth', () => ({
  getRequestOwner: vi.fn(async () => ({ ownerId: 'owner_1', user: null })),
  requireAdmin: vi.fn(async () => ({ id: 'user_admin', email: 'admin@example.com', role: 'admin' })),
}));

const createRepository = vi.mocked(createTemplateRepository);
const getService = vi.mocked(getGenerationService);
const requireAdminMock = vi.mocked(requireAdmin);

const adminUser = { id: 'user_admin', email: 'admin@example.com', role: 'admin' as const };

function adminDenied(status = 403, message = '没有权限访问模板管理') {
  return Response.json({ message }, { status });
}

function adminTemplateRequest(body: unknown) {
  return new Request('http://localhost/api/admin/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function templatePatchRequest(id: string, body: unknown) {
  return new Request(`http://localhost/api/admin/templates/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

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

  it('blocks non-admin users from creating admin templates and does not create a template', async () => {
    const createTemplate = vi.fn(async () => ({
      id: 'tpl_admin_1',
      type: 'image',
      title: 'Local template',
      description: 'Personal template',
      coverImageDataUrl: 'data:image/png;base64,cover',
      prompt: 'Internal template prompt',
      published: true,
      sortOrder: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    requireAdminMock.mockResolvedValueOnce(adminDenied());
    createRepository.mockReturnValue({
      createTemplate,
    } as unknown as ReturnType<typeof createTemplateRepository>);

    const response = await createAdminTemplate(
      adminTemplateRequest({
        type: 'image',
        title: 'Local template',
        description: 'Personal template',
        coverImageDataUrl: 'data:image/png;base64,cover',
        prompt: 'Internal template prompt',
        published: true,
        sortOrder: 3,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ message: '没有权限访问模板管理' });
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it('allows admin users to create admin templates and calls the repository', async () => {
    const createTemplate = vi.fn(async (input) => ({
      id: 'tpl_admin_1',
      ...input,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    requireAdminMock.mockResolvedValueOnce(adminUser);
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

  it('blocks unauthenticated users from listing admin templates', async () => {
    const listAdminTemplatesRepository = vi.fn(async () => []);
    requireAdminMock.mockResolvedValueOnce(adminDenied(401, '请先登录'));
    createRepository.mockReturnValue({
      listAdminTemplates: listAdminTemplatesRepository,
    } as unknown as ReturnType<typeof createTemplateRepository>);

    const response = await listAdminTemplates(new Request('http://localhost/api/admin/templates'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ message: '请先登录' });
    expect(listAdminTemplatesRepository).not.toHaveBeenCalled();
  });

  it('allows admin users to list admin templates', async () => {
    const listAdminTemplatesRepository = vi.fn(async () => [
      {
        id: 'tpl_admin_1',
        type: 'image',
        title: 'Admin template',
        description: 'Internal template',
        coverImageDataUrl: 'data:image/png;base64,cover',
        prompt: 'Internal template prompt',
        published: true,
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    requireAdminMock.mockResolvedValueOnce(adminUser);
    createRepository.mockReturnValue({
      listAdminTemplates: listAdminTemplatesRepository,
    } as unknown as ReturnType<typeof createTemplateRepository>);

    const response = await listAdminTemplates(new Request('http://localhost/api/admin/templates'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(listAdminTemplatesRepository).toHaveBeenCalledOnce();
  });

  it('blocks non-admin users from patching admin templates and does not update', async () => {
    const updateTemplate = vi.fn(async (id, input) => ({
      id,
      type: 'image',
      title: input.title,
      description: 'Internal template',
      coverImageDataUrl: 'data:image/png;base64,cover',
      prompt: 'Internal template prompt',
      published: true,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    requireAdminMock.mockResolvedValueOnce(adminDenied());
    createRepository.mockReturnValue({
      updateTemplate,
    } as unknown as ReturnType<typeof createTemplateRepository>);

    const response = await updateAdminTemplate(templatePatchRequest('tpl_admin_1', { title: 'Updated' }), {
      params: Promise.resolve({ id: 'tpl_admin_1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ message: '没有权限访问模板管理' });
    expect(updateTemplate).not.toHaveBeenCalled();
  });

  it('allows admin users to patch admin templates', async () => {
    const updateTemplate = vi.fn(async (id, input) => ({
      id,
      type: 'image',
      title: input.title,
      description: 'Internal template',
      coverImageDataUrl: 'data:image/png;base64,cover',
      prompt: 'Internal template prompt',
      published: true,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    requireAdminMock.mockResolvedValueOnce(adminUser);
    createRepository.mockReturnValue({
      updateTemplate,
    } as unknown as ReturnType<typeof createTemplateRepository>);

    const response = await updateAdminTemplate(templatePatchRequest('tpl_admin_1', { title: 'Updated' }), {
      params: Promise.resolve({ id: 'tpl_admin_1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.title).toBe('Updated');
    expect(updateTemplate).toHaveBeenCalledWith('tpl_admin_1', { title: 'Updated' });
  });

  it('preserves missing-template 404 for admin patch requests', async () => {
    const updateTemplate = vi.fn(async () => {
      throw new Error('missing template');
    });
    requireAdminMock.mockResolvedValueOnce(adminUser);
    createRepository.mockReturnValue({
      updateTemplate,
    } as unknown as ReturnType<typeof createTemplateRepository>);

    const response = await updateAdminTemplate(templatePatchRequest('tpl_missing', { title: 'Updated' }), {
      params: Promise.resolve({ id: 'tpl_missing' }),
    });

    expect(response.status).toBe(404);
    expect(updateTemplate).toHaveBeenCalledWith('tpl_missing', { title: 'Updated' });
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
