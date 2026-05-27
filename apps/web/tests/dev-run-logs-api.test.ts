import { POST } from '../src/app/api/dev/run-logs/route';

describe('/api/dev/run-logs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('logs frontend debug events in development without printing base64', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    const response = await POST(
      new Request('http://localhost/api/dev/run-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'frontend.image.uploaded',
          sessionId: 'session_1',
          image: {
            mimeType: 'image/png',
            base64Length: 24,
            estimatedBytes: 18,
            hash: 'img_12345678',
            raw: 'data:image/png;base64,abcdef',
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0][0]);
    expect(line).toContain('[frontend]');
    expect(line).toContain('frontend.image.uploaded');
    expect(line).toContain('sessionId=session_1');
    expect(line).toContain('hash=img_12345678');
    expect(line).not.toContain('abcdef');
  });

  it('does not print logs in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    const response = await POST(
      new Request('http://localhost/api/dev/run-logs', {
        method: 'POST',
        body: JSON.stringify({ event: 'frontend.option.changed', field: 'style' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(info).not.toHaveBeenCalled();
  });
});
