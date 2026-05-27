import { DELETE } from '../src/app/api/generation-sessions/[id]/route';
import { GET, POST } from '../src/app/api/generation-sessions/route';
import { createSessionRepository } from '../src/features/generation/server/session-repository';

vi.mock('../src/features/generation/server/session-repository', () => ({
  createSessionRepository: vi.fn(),
}));

vi.mock('../src/features/generation/server/runtime', () => ({
  getGenerationService: vi.fn(() => ({
    getTask: vi.fn(),
    listTasksForSession: vi.fn(async () => []),
  })),
}));

const createRepository = vi.mocked(createSessionRepository);

const session = {
  id: 'session_1',
  title: 'Session 1',
  kind: 'free',
  templateId: null,
  currentTaskId: null,
  createdAt: new Date('2026-05-26T00:00:00.000Z'),
  updatedAt: new Date('2026-05-26T00:00:00.000Z'),
};

describe('/api/generation-sessions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists free sessions when kind=free is requested', async () => {
    const listSessions = vi.fn(async () => [session]);
    createRepository.mockReturnValue({
      listSessions,
    } as unknown as ReturnType<typeof createSessionRepository>);

    const response = await GET(
      new Request('http://localhost/api/generation-sessions?kind=free', {
        headers: { 'x-owner-id': 'owner_1' },
      }),
    );

    expect(listSessions).toHaveBeenCalledWith('owner_1', { kind: 'free' });
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({ id: 'session_1', kind: 'free', templateId: null }),
    ]);
  });

  it('lists template sessions by templateId', async () => {
    const listSessions = vi.fn(async () => [{ ...session, kind: 'template', templateId: 'tpl_1' }]);
    createRepository.mockReturnValue({
      listSessions,
    } as unknown as ReturnType<typeof createSessionRepository>);

    const response = await GET(
      new Request('http://localhost/api/generation-sessions?templateId=tpl_1', {
        headers: { 'x-owner-id': 'owner_1' },
      }),
    );

    expect(listSessions).toHaveBeenCalledWith('owner_1', { kind: 'template', templateId: 'tpl_1' });
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({ id: 'session_1', kind: 'template', templateId: 'tpl_1' }),
    ]);
  });

  it('creates a template session from the request body', async () => {
    const createSession = vi.fn(async () => ({ ...session, kind: 'template', templateId: 'tpl_1' }));
    createRepository.mockReturnValue({
      createSession,
    } as unknown as ReturnType<typeof createSessionRepository>);

    const response = await POST(
      new Request('http://localhost/api/generation-sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-owner-id': 'owner_1' },
        body: JSON.stringify({ kind: 'template', templateId: 'tpl_1' }),
      }),
    );

    expect(response.status).toBe(201);
    expect(createSession).toHaveBeenCalledWith('owner_1', { kind: 'template', templateId: 'tpl_1' });
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ kind: 'template', templateId: 'tpl_1' }));
  });
});

describe('/api/generation-sessions/[id]', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a session and returns a recoverable response', async () => {
    createRepository.mockReturnValue({
      deleteSession: vi.fn(async () => undefined),
    } as unknown as ReturnType<typeof createSessionRepository>);

    const response = await DELETE(
      new Request('http://localhost/api/generation-sessions/session_1', {
        headers: { 'x-owner-id': 'owner_1' },
      }),
      { params: Promise.resolve({ id: 'session_1' }) },
    );

    await expect(response.json()).resolves.toEqual({ ok: true, deleted: true });
  });

  it('treats an already-deleted session as recoverable', async () => {
    const error = new Error('Record not found') as Error & { code: string };
    error.code = 'P2025';
    createRepository.mockReturnValue({
      deleteSession: vi.fn(async () => {
        throw error;
      }),
    } as unknown as ReturnType<typeof createSessionRepository>);

    const response = await DELETE(
      new Request('http://localhost/api/generation-sessions/session_missing', {
        headers: { 'x-owner-id': 'owner_1' },
      }),
      { params: Promise.resolve({ id: 'session_missing' }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, deleted: false });
  });
});
