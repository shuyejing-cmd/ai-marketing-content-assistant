import { GET } from '../src/app/api/download-image/route';

describe('/api/download-image', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('proxies a remote image as an attachment', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('image-bytes', { status: 200, headers: { 'Content-Type': 'image/png' } })),
    );

    const response = await GET(
      new Request(
        'http://localhost/api/download-image?url=https%3A%2F%2Fcdn.example.test%2Fgenerated.png&filename=result.png',
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="result.png"');
    expect(await response.text()).toBe('image-bytes');
    expect(fetch).toHaveBeenCalledWith('https://cdn.example.test/generated.png');
  });

  it('rejects non-http image URLs', async () => {
    const response = await GET(new Request('http://localhost/api/download-image?url=file%3A%2F%2Fsecret.png'));

    expect(response.status).toBe(400);
  });
});
