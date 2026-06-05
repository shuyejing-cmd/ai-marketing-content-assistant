import { GET as listTemplates } from '../src/app/api/templates/route';
import { GET as listAdminTemplates, POST as createAdminTemplate } from '../src/app/api/admin/templates/route';
import { PATCH as updateAdminTemplate } from '../src/app/api/admin/templates/[id]/route';
import { POST as createTemplateTask } from '../src/app/api/templates/[id]/generation-tasks/route';
import { createTemplateRepository } from '../src/features/templates/server/template-repository';
import { getGenerationService } from '../src/features/generation/server/runtime';
import { requireUser } from '../src/features/auth/server/request-auth';

vi.mock('../src/features/templates/server/template-repository', () => ({
  createTemplateRepository: vi.fn(),
}));

vi.mock('../src/features/generation/server/runtime', () => ({
  getGenerationService: vi.fn(),
}));

vi.mock('../src/features/auth/server/request-auth', () => ({
  getRequestOwner: vi.fn(async () => ({ ownerId: 'owner_1', user: null })),
  requireUser: vi.fn(async () => ({ id: 'user_1', email: 'person@example.com', role: 'user' })),
}));

const createRepository = vi.mocked(createTemplateRepository);
const getService = vi.mocked(getGenerationService);
const requireUserMock = vi.mocked(requireUser);

const signedInUser = { id: 'user_1', email: 'person@example.com', role: 'user' as const };

function authDenied(status = 401, message = '请先登录') {
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

  it('blocks signed-out users from creating templates and does not create a template', async () => {
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
    requireUserMock.mockResolvedValueOnce(authDenied());
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

    expect(response.status).toBe(401);
    expect(body).toEqual({ message: '请先登录' });
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it('allows signed-in users to create templates and calls the repository', async () => {
    const createTemplate = vi.fn(async (input) => ({
      id: 'tpl_admin_1',
      ...input,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    requireUserMock.mockResolvedValueOnce(signedInUser);
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

  it('blocks signed-out users from listing templates for management', async () => {
    const listAdminTemplatesRepository = vi.fn(async () => []);
    requireUserMock.mockResolvedValueOnce(authDenied());
    createRepository.mockReturnValue({
      listAdminTemplates: listAdminTemplatesRepository,
    } as unknown as ReturnType<typeof createTemplateRepository>);

    const response = await listAdminTemplates(new Request('http://localhost/api/admin/templates'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ message: '请先登录' });
    expect(listAdminTemplatesRepository).not.toHaveBeenCalled();
  });

  it('allows signed-in users to list templates for management', async () => {
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
    requireUserMock.mockResolvedValueOnce(signedInUser);
    createRepository.mockReturnValue({
      listAdminTemplates: listAdminTemplatesRepository,
    } as unknown as ReturnType<typeof createTemplateRepository>);

    const response = await listAdminTemplates(new Request('http://localhost/api/admin/templates'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(listAdminTemplatesRepository).toHaveBeenCalledOnce();
  });

  it('blocks signed-out users from patching templates and does not update', async () => {
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
    requireUserMock.mockResolvedValueOnce(authDenied());
    createRepository.mockReturnValue({
      updateTemplate,
    } as unknown as ReturnType<typeof createTemplateRepository>);

    const response = await updateAdminTemplate(templatePatchRequest('tpl_admin_1', { title: 'Updated' }), {
      params: Promise.resolve({ id: 'tpl_admin_1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ message: '请先登录' });
    expect(updateTemplate).not.toHaveBeenCalled();
  });

  it('allows signed-in users to patch templates', async () => {
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
    requireUserMock.mockResolvedValueOnce(signedInUser);
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
    requireUserMock.mockResolvedValueOnce(signedInUser);
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
