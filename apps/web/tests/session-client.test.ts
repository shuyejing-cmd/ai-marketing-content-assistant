import { createSession, listSessions } from '../src/features/generation/session-client';

describe('session client', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists sessions with a free scope query', async () => {
    await listSessions('owner_1', { kind: 'free' });

    expect(fetch).toHaveBeenCalledWith('/api/generation-sessions?kind=free', {
      headers: { 'x-owner-id': 'owner_1' },
    });
  });

  it('lists and creates template scoped sessions', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    await listSessions('owner_1', { kind: 'template', templateId: 'tpl_1' });

    expect(fetch).toHaveBeenCalledWith('/api/generation-sessions?templateId=tpl_1', {
      headers: { 'x-owner-id': 'owner_1' },
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'session_1', tasks: [] }), { status: 201 }),
    );
    await createSession('owner_1', { kind: 'template', templateId: 'tpl_1' });

    expect(fetch).toHaveBeenCalledWith('/api/generation-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-owner-id': 'owner_1' },
      body: JSON.stringify({ kind: 'template', templateId: 'tpl_1' }),
    });
  });
});
