import { describe, expect, it, vi, afterEach } from 'vitest';

import { GET as getTask } from '../src/app/api/generation-tasks/[id]/route';
import { POST as createTask } from '../src/app/api/generation-tasks/route';
import { POST as modifyTask } from '../src/app/api/generation-tasks/[id]/modify/route';
import { POST as regenerateTask } from '../src/app/api/generation-tasks/[id]/regenerate/route';
import { DELETE, PATCH } from '../src/app/api/generation-sessions/[id]/route';
import { GET as listSessions, POST as createSession } from '../src/app/api/generation-sessions/route';
import { POST as createTemplateTask } from '../src/app/api/templates/[id]/generation-tasks/route';
import { getRequestOwner } from '../src/features/auth/server/request-auth';
import { getGenerationService } from '../src/features/generation/server/runtime';
import { createSessionRepository } from '../src/features/generation/server/session-repository';
import { ImageProcessingError } from '../src/features/image-upload/image-errors';
import { createTemplateRepository } from '../src/features/templates/server/template-repository';

vi.mock('../src/features/auth/server/request-auth', () => ({
  getRequestOwner: vi.fn(async () => ({
    ownerId: 'user:auth_user',
    user: { id: 'auth_user', email: 'auth@example.com', role: 'user' },
  })),
}));

vi.mock('../src/features/generation/server/runtime', () => ({
  getGenerationService: vi.fn(),
}));

vi.mock('../src/features/generation/server/session-repository', () => ({
  createSessionRepository: vi.fn(),
}));

vi.mock('../src/features/templates/server/template-repository', () => ({
  createTemplateRepository: vi.fn(),
}));

const getOwner = vi.mocked(getRequestOwner);
const getService = vi.mocked(getGenerationService);
const createSessions = vi.mocked(createSessionRepository);
const createTemplates = vi.mocked(createTemplateRepository);

const session = {
  id: 'session_1',
  title: 'Session 1',
  kind: 'free',
  templateId: null,
  currentTaskId: null,
  createdAt: new Date('2026-05-26T00:00:00.000Z'),
  updatedAt: new Date('2026-05-26T00:00:00.000Z'),
};

const generationRequest = {
  requestText: 'Make a poster',
  channels: ['wechat'] as const,
  scene: 'custom' as const,
  style: 'clean_premium' as const,
  campaignInfo: {},
};

const generationTask = {
  id: 'task_1',
  status: 'succeeded' as const,
  request: generationRequest,
  results: [],
};

const MAX_GENERATION_REQUEST_BYTES = 16 * 1024 * 1024;

function jsonRequest(path: string, body: unknown, headers?: HeadersInit) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function oversizedStreamingJsonRequest(path: string, body: Record<string, unknown>) {
  const prefix = Buffer.from(
    `${JSON.stringify(body).slice(0, -1)},"padding":"`,
  );
  const chunks = [
    Buffer.concat([
      prefix,
      Buffer.alloc(MAX_GENERATION_REQUEST_BYTES, 'a'),
    ]),
    Buffer.from('"}'),
  ];
  let pulls = 0;
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      const chunk = chunks.shift();
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel,
  });

  const request = new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });

  return { request, cancel, pulls: () => pulls };
}

describe('request owner API routing', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('free generation task ignores body.ownerId and uses getRequestOwner ownerId', async () => {
    const createTaskForOwner = vi.fn(async (input) => ({
      id: 'task_1',
      status: 'succeeded',
      request: input.request,
      results: [],
    }));
    getService.mockReturnValue({
      createTask: createTaskForOwner,
    } as unknown as ReturnType<typeof getGenerationService>);

    const response = await createTask(
      jsonRequest('/api/generation-tasks', {
        ownerId: 'user:victim',
        sessionId: 'session_1',
        request: generationRequest,
      }, { 'x-owner-id': 'owner_spoofed' }),
    );

    expect(response.status).toBe(201);
    expect(getOwner).toHaveBeenCalled();
    expect(createTaskForOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'user:auth_user',
        sessionId: 'session_1',
      }),
    );
  });

  it('flat free generation task does not forward body.ownerId inside the generation request', async () => {
    const createTaskForOwner = vi.fn(async (input) => ({
      id: 'task_1',
      status: 'succeeded',
      request: input.request,
      results: [],
    }));
    getService.mockReturnValue({
      createTask: createTaskForOwner,
    } as unknown as ReturnType<typeof getGenerationService>);

    const response = await createTask(
      jsonRequest('/api/generation-tasks', {
        ...generationRequest,
        ownerId: 'user:victim',
        sessionId: 'session_1',
      }, { 'x-owner-id': 'owner_spoofed' }),
    );

    expect(response.status).toBe(201);
    expect(createTaskForOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'user:auth_user',
        request: expect.not.objectContaining({ ownerId: 'user:victim' }),
      }),
    );
  });

  it('free generation returns the stable image error payload and status', async () => {
    getService.mockReturnValue({
      createTask: vi.fn(async () => {
        throw new ImageProcessingError('IMAGE_OUTPUT_TOO_LARGE', 413);
      }),
    } as unknown as ReturnType<typeof getGenerationService>);

    const response = await createTask(
      jsonRequest('/api/generation-tasks', {
        sessionId: 'session_1',
        request: generationRequest,
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      code: 'IMAGE_OUTPUT_TOO_LARGE',
      message: new ImageProcessingError('IMAGE_OUTPUT_TOO_LARGE', 413).message,
    });
  });

  it('free generation keeps unknown errors as a generic 500 response', async () => {
    getService.mockReturnValue({
      createTask: vi.fn(async () => {
        throw new Error('provider unavailable');
      }),
    } as unknown as ReturnType<typeof getGenerationService>);

    const response = await createTask(
      jsonRequest('/api/generation-tasks', {
        sessionId: 'session_1',
        request: generationRequest,
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'provider unavailable',
    });
  });

  it('free generation rejects an oversized Content-Length before owner or service lookup', async () => {
    const createTaskForOwner = vi.fn();
    getService.mockReturnValue({
      createTask: createTaskForOwner,
    } as unknown as ReturnType<typeof getGenerationService>);

    const response = await createTask(
      jsonRequest(
        '/api/generation-tasks',
        {
          sessionId: 'session_1',
          request: generationRequest,
        },
        { 'content-length': String(MAX_GENERATION_REQUEST_BYTES + 1) },
      ),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      code: 'IMAGE_INPUT_TOO_LARGE',
      message: new ImageProcessingError('IMAGE_INPUT_TOO_LARGE', 413).message,
    });
    expect(getOwner).not.toHaveBeenCalled();
    expect(getService).not.toHaveBeenCalled();
    expect(createTaskForOwner).not.toHaveBeenCalled();
  });

  it('free generation cancels an oversized stream without Content-Length before owner or service lookup', async () => {
    const createTaskForOwner = vi.fn();
    getService.mockReturnValue({
      createTask: createTaskForOwner,
    } as unknown as ReturnType<typeof getGenerationService>);
    const source = oversizedStreamingJsonRequest('/api/generation-tasks', {
      sessionId: 'session_1',
      request: generationRequest,
    });

    const response = await createTask(source.request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      code: 'IMAGE_INPUT_TOO_LARGE',
      message: new ImageProcessingError('IMAGE_INPUT_TOO_LARGE', 413).message,
    });
    expect(source.cancel).toHaveBeenCalledOnce();
    expect(source.pulls()).toBeLessThanOrEqual(2);
    expect(getOwner).not.toHaveBeenCalled();
    expect(getService).not.toHaveBeenCalled();
    expect(createTaskForOwner).not.toHaveBeenCalled();
  });

  it('template generation task ignores body.ownerId and uses getRequestOwner ownerId', async () => {
    createTemplates.mockReturnValue({
      getAdminTemplate: vi.fn(async () => ({
        id: 'tpl_1',
        type: 'image',
        title: 'Template',
        description: 'Template description',
        coverImageDataUrl: 'data:image/png;base64,cover',
        prompt: 'Server prompt',
        published: true,
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    } as unknown as ReturnType<typeof createTemplateRepository>);
    const createTaskForOwner = vi.fn(async (input) => ({
      id: 'task_1',
      status: 'succeeded',
      request: input.request,
      results: [],
    }));
    getService.mockReturnValue({
      createTask: createTaskForOwner,
    } as unknown as ReturnType<typeof getGenerationService>);

    const response = await createTemplateTask(
      jsonRequest('/api/templates/tpl_1/generation-tasks', {
        ownerId: 'user:victim',
        sessionId: 'session_1',
        uploadedImageDataUrl: 'data:image/png;base64,input',
      }, { 'x-owner-id': 'owner_spoofed' }),
      { params: Promise.resolve({ id: 'tpl_1' }) },
    );

    expect(response.status).toBe(201);
    expect(getOwner).toHaveBeenCalled();
    expect(createTaskForOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'user:auth_user',
        sessionId: 'session_1',
      }),
    );
  });

  it('generation task detail returns 404 when the task does not belong to the authenticated owner', async () => {
    getService.mockReturnValue({
      getTask: vi.fn(async () => generationTask),
      getTaskForOwner: vi.fn(async () => null),
    } as unknown as ReturnType<typeof getGenerationService>);

    const response = await getTask(
      new Request('http://localhost/api/generation-tasks/task_1', {
        headers: { 'x-owner-id': 'owner_spoofed' },
      }),
      { params: Promise.resolve({ id: 'task_1' }) },
    );

    expect(response.status).toBe(404);
    expect(getOwner).toHaveBeenCalled();
    expect(getService().getTaskForOwner).toHaveBeenCalledWith('user:auth_user', 'task_1');
  });

  it('generation task detail uses authenticated ownerId when x-owner-id is spoofed', async () => {
    getService.mockReturnValue({
      getTask: vi.fn(async () => null),
      getTaskForOwner: vi.fn(async () => generationTask),
    } as unknown as ReturnType<typeof getGenerationService>);

    const response = await getTask(
      new Request('http://localhost/api/generation-tasks/task_1', {
        headers: { 'x-owner-id': 'owner_spoofed' },
      }),
      { params: Promise.resolve({ id: 'task_1' }) },
    );

    await expect(response.json()).resolves.toEqual(generationTask);
    expect(response.status).toBe(200);
    expect(getOwner).toHaveBeenCalled();
    expect(getService().getTaskForOwner).toHaveBeenCalledWith('user:auth_user', 'task_1');
  });

  it('regenerate returns 404 when the task does not belong to the authenticated owner', async () => {
    const createTaskForOwner = vi.fn(async () => generationTask);
    getService.mockReturnValue({
      getTask: vi.fn(async () => generationTask),
      getTaskForOwner: vi.fn(async () => null),
      createTask: createTaskForOwner,
    } as unknown as ReturnType<typeof getGenerationService>);

    const response = await regenerateTask(
      jsonRequest(
        '/api/generation-tasks/task_1/regenerate',
        { ownerId: 'user:victim', sessionId: 'session_1' },
        { 'x-owner-id': 'owner_spoofed' },
      ),
      { params: Promise.resolve({ id: 'task_1' }) },
    );

    expect(response.status).toBe(404);
    expect(getOwner).toHaveBeenCalled();
    expect(getService().getTaskForOwner).toHaveBeenCalledWith('user:auth_user', 'task_1');
    expect(createTaskForOwner).not.toHaveBeenCalled();
  });

  it('modify returns 404 when the task does not belong to the authenticated owner', async () => {
    const createTaskForOwner = vi.fn(async () => generationTask);
    getService.mockReturnValue({
      getTask: vi.fn(async () => generationTask),
      getTaskForOwner: vi.fn(async () => null),
      createTask: createTaskForOwner,
    } as unknown as ReturnType<typeof getGenerationService>);

    const response = await modifyTask(
      jsonRequest(
        '/api/generation-tasks/task_1/modify',
        {
          selectedResultId: 'result_1',
          modificationText: 'Make it warmer',
          ownerId: 'user:victim',
          sessionId: 'session_1',
        },
        { 'x-owner-id': 'owner_spoofed' },
      ),
      { params: Promise.resolve({ id: 'task_1' }) },
    );

    expect(response.status).toBe(404);
    expect(getOwner).toHaveBeenCalled();
    expect(getService().getTaskForOwner).toHaveBeenCalledWith('user:auth_user', 'task_1');
    expect(createTaskForOwner).not.toHaveBeenCalled();
  });

  it('regenerate uses authenticated ownerId when spoofed owner values are present', async () => {
    const createTaskForOwner = vi.fn(async (input) => ({
      id: 'task_2',
      status: 'succeeded',
      request: input.request,
      results: [],
    }));
    getService.mockReturnValue({
      getTask: vi.fn(),
      getTaskForOwner: vi.fn(async () => generationTask),
      createTask: createTaskForOwner,
    } as unknown as ReturnType<typeof getGenerationService>);

    const response = await regenerateTask(
      jsonRequest(
        '/api/generation-tasks/task_1/regenerate',
        { ownerId: 'user:victim', sessionId: 'session_1' },
        { 'x-owner-id': 'owner_spoofed' },
      ),
      { params: Promise.resolve({ id: 'task_1' }) },
    );

    expect(response.status).toBe(201);
    expect(createTaskForOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'user:auth_user',
        sessionId: 'session_1',
        request: generationRequest,
      }),
    );
  });

  it('modify uses authenticated ownerId when spoofed owner values are present', async () => {
    const createTaskForOwner = vi.fn(async (input) => ({
      id: 'task_2',
      status: 'succeeded',
      request: input.request,
      results: [],
    }));
    getService.mockReturnValue({
      getTask: vi.fn(),
      getTaskForOwner: vi.fn(async () => generationTask),
      createTask: createTaskForOwner,
    } as unknown as ReturnType<typeof getGenerationService>);

    const response = await modifyTask(
      jsonRequest(
        '/api/generation-tasks/task_1/modify',
        {
          selectedResultId: 'result_1',
          modificationText: 'Make it warmer',
          ownerId: 'user:victim',
          sessionId: 'session_1',
        },
        { 'x-owner-id': 'owner_spoofed' },
      ),
      { params: Promise.resolve({ id: 'task_1' }) },
    );

    expect(response.status).toBe(201);
    expect(createTaskForOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'user:auth_user',
        sessionId: 'session_1',
        request: generationRequest,
        modificationText: 'Make it warmer',
      }),
    );
  });

  it('generation sessions list uses authenticated getRequestOwner ownerId even when x-owner-id is spoofed', async () => {
    const listSessionsForOwner = vi.fn(async () => [session]);
    createSessions.mockReturnValue({
      listSessions: listSessionsForOwner,
    } as unknown as ReturnType<typeof createSessionRepository>);
    getService.mockReturnValue({
      getTask: vi.fn(),
      getTaskForOwner: vi.fn(async () => null),
      listTasksForSession: vi.fn(async () => []),
    } as unknown as ReturnType<typeof getGenerationService>);

    const response = await listSessions(
      new Request('http://localhost/api/generation-sessions', {
        headers: { 'x-owner-id': 'owner_spoofed' },
      }),
    );

    expect(response.status).toBe(200);
    expect(getOwner).toHaveBeenCalled();
    expect(listSessionsForOwner).toHaveBeenCalledWith('user:auth_user', { kind: 'free' });
  });

  it('generation sessions list does not hydrate a stale currentTaskId from another owner', async () => {
    const staleSession = { ...session, currentTaskId: 'task_1' };
    createSessions.mockReturnValue({
      listSessions: vi.fn(async () => [staleSession]),
    } as unknown as ReturnType<typeof createSessionRepository>);
    getService.mockReturnValue({
      getTask: vi.fn(async () => generationTask),
      getTaskForOwner: vi.fn(async () => null),
      listTasksForSession: vi.fn(async () => []),
    } as unknown as ReturnType<typeof getGenerationService>);

    const response = await listSessions(
      new Request('http://localhost/api/generation-sessions', {
        headers: { 'x-owner-id': 'owner_spoofed' },
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body[0].activeTaskId).toBeNull();
    expect(getService().getTaskForOwner).toHaveBeenCalledWith('user:auth_user', 'task_1');
  });

  it('generation sessions create uses authenticated getRequestOwner ownerId even when x-owner-id is spoofed', async () => {
    const createSessionForOwner = vi.fn(async () => session);
    createSessions.mockReturnValue({
      createSession: createSessionForOwner,
    } as unknown as ReturnType<typeof createSessionRepository>);
    getService.mockReturnValue({
      getTask: vi.fn(),
      getTaskForOwner: vi.fn(async () => null),
      listTasksForSession: vi.fn(async () => []),
    } as unknown as ReturnType<typeof getGenerationService>);

    const response = await createSession(
      jsonRequest(
        '/api/generation-sessions',
        { kind: 'free', ownerId: 'user:victim' },
        { 'x-owner-id': 'owner_spoofed' },
      ),
    );

    expect(response.status).toBe(201);
    expect(getOwner).toHaveBeenCalled();
    expect(createSessionForOwner).toHaveBeenCalledWith('user:auth_user', { kind: 'free' });
  });

  it('session rename uses authenticated getRequestOwner ownerId even when x-owner-id is spoofed', async () => {
    const renameSession = vi.fn(async () => ({ ...session, title: 'Renamed' }));
    createSessions.mockReturnValue({
      renameSession,
    } as unknown as ReturnType<typeof createSessionRepository>);
    getService.mockReturnValue({
      getTask: vi.fn(),
      getTaskForOwner: vi.fn(async () => null),
      listTasksForSession: vi.fn(async () => []),
    } as unknown as ReturnType<typeof getGenerationService>);

    const response = await PATCH(
      jsonRequest(
        '/api/generation-sessions/session_1',
        { title: 'Renamed', ownerId: 'user:victim' },
        { 'x-owner-id': 'owner_spoofed' },
      ),
      { params: Promise.resolve({ id: 'session_1' }) },
    );

    expect(response.status).toBe(200);
    expect(getOwner).toHaveBeenCalled();
    expect(renameSession).toHaveBeenCalledWith('user:auth_user', 'session_1', 'Renamed');
  });

  it('session delete uses authenticated getRequestOwner ownerId even when x-owner-id is spoofed', async () => {
    const deleteSession = vi.fn(async () => undefined);
    createSessions.mockReturnValue({
      deleteSession,
    } as unknown as ReturnType<typeof createSessionRepository>);

    const response = await DELETE(
      new Request('http://localhost/api/generation-sessions/session_1', {
        headers: { 'x-owner-id': 'owner_spoofed' },
      }),
      { params: Promise.resolve({ id: 'session_1' }) },
    );

    expect(response.status).toBe(200);
    expect(getOwner).toHaveBeenCalled();
    expect(deleteSession).toHaveBeenCalledWith('user:auth_user', 'session_1');
  });
});
