import { VolcengineSeedreamProvider } from '../src/features/generation/server/seedream-provider';

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

describe('VolcengineSeedreamProvider', () => {
  it('calls Ark image generation with a text prompt', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ url: 'https://example.test/generated.png' }],
      }),
    });
    const provider = new VolcengineSeedreamProvider({
      apiKey: 'ark_test_key',
      baseUrl: 'https://ark.example.test/api/v3',
      model: 'seedream-test',
      fetcher,
    });

    const result = await provider.generate({
      prompt: '做一张柠檬茶朋友圈海报',
      mode: 'text-to-image',
    });

    expect(result.imageUrl).toBe('https://example.test/generated.png');
    expect(fetcher).toHaveBeenCalledWith(
      'https://ark.example.test/api/v3/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer ark_test_key' }),
      }),
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toEqual(
      expect.objectContaining({
        model: 'seedream-test',
        prompt: '做一张柠檬茶朋友圈海报',
        n: 1,
      }),
    );
  });

  it('includes the uploaded image when using image-to-image mode', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'generated_base64' }] }),
    });
    const provider = new VolcengineSeedreamProvider({
      apiKey: 'ark_test_key',
      baseUrl: 'https://ark.example.test/api/v3',
      model: 'seedream-test',
      fetcher,
    });

    const result = await provider.generate({
      prompt: '保留商品主体做海报',
      mode: 'image-to-image',
      inputImageDataUrl: tinyPng,
    });

    expect(result.imageDataUrl).toBe('data:image/png;base64,generated_base64');
    expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toEqual(
      expect.objectContaining({
        image: tinyPng,
      }),
    );
  });

  it('returns a configuration error when Ark credentials are missing', async () => {
    const provider = new VolcengineSeedreamProvider({
      apiKey: '',
      baseUrl: 'https://ark.example.test/api/v3',
      model: 'seedream-test',
      fetcher: vi.fn(),
    });

    await expect(
      provider.generate({
        prompt: '做一张海报',
        mode: 'text-to-image',
      }),
    ).rejects.toThrow('火山方舟 API Key 未配置');
  });
});
