import { APIMartImageProvider } from '../src/features/generation/server/apimart-provider';

function okJson(value: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => value,
  };
}

function errorJson(status: number, value: unknown) {
  return {
    ok: false,
    status,
    json: async () => value,
  };
}

describe('APIMartImageProvider', () => {
  it('submits a GPT-Image-2 task, polls it, and returns the generated image URL', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(okJson({ code: 200, data: [{ status: 'submitted', task_id: 'task_1' }] }))
      .mockResolvedValueOnce(
        okJson({
          code: 200,
          data: {
            id: 'task_1',
            status: 'completed',
            result: { images: [{ url: ['https://cdn.example.test/generated.png'] }] },
          },
        }),
      );
    const provider = new APIMartImageProvider({
      apiKey: 'apimart_key',
      baseUrl: 'https://api.apimart.ai/v1',
      model: 'gpt-image-2-official',
      fetcher,
      initialPollDelayMs: 0,
      pollIntervalMs: 0,
      timeoutMs: 1,
      sleeper: async () => undefined,
    });

    const result = await provider.generate({
      prompt: '生成一张奶茶海报',
      mode: 'text-to-image',
    });

    expect(result.imageUrl).toBe('https://cdn.example.test/generated.png');
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'https://api.apimart.ai/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer apimart_key' }),
      }),
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toEqual({
      model: 'gpt-image-2-official',
      prompt: '生成一张奶茶海报',
      size: '4:5',
      resolution: '1k',
      quality: 'low',
      n: 1,
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://api.apimart.ai/v1/tasks/task_1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer apimart_key' }),
      }),
    );
  });

  it('accepts an APIMart base URL that already includes the image generation path', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(okJson({ data: [{ task_id: 'task_normalized' }] }))
      .mockResolvedValueOnce(
        okJson({
          data: {
            id: 'task_normalized',
            status: 'completed',
            result: { images: [{ url: ['https://cdn.example.test/normalized.png'] }] },
          },
        }),
      );
    const provider = new APIMartImageProvider({
      apiKey: 'apimart_key',
      baseUrl: 'https://api.apimart.ai/v1/images/generations',
      fetcher,
      initialPollDelayMs: 0,
      pollIntervalMs: 0,
      timeoutMs: 1,
      sleeper: async () => undefined,
    });

    await provider.generate({
      prompt: '生成一张新品海报',
      mode: 'text-to-image',
    });

    expect(fetcher.mock.calls[0][0]).toBe('https://api.apimart.ai/v1/images/generations');
    expect(fetcher.mock.calls[1][0]).toBe('https://api.apimart.ai/v1/tasks/task_normalized');
  });

  it('passes the uploaded image public URL through image_urls', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(okJson({ code: 200, data: [{ task_id: 'task_2' }] }))
      .mockResolvedValueOnce(
        okJson({
          code: 200,
          data: {
            id: 'task_2',
            status: 'completed',
            result: { images: [{ url: ['https://cdn.example.test/with-input.png'] }] },
          },
        }),
      );
    const provider = new APIMartImageProvider({
      apiKey: 'apimart_key',
      model: 'gpt-image-2-official',
      fetcher,
      initialPollDelayMs: 0,
      pollIntervalMs: 0,
      timeoutMs: 1,
      sleeper: async () => undefined,
    });

    await provider.generate({
      prompt: '保留商品主体',
      mode: 'image-to-image',
      inputImageUrl: 'https://app.example.test/api/image-assets/asset_1',
    });

    expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toEqual(
      expect.objectContaining({
        image_urls: ['https://app.example.test/api/image-assets/asset_1'],
      }),
    );
  });

  it('fails clearly when image-to-image has no public input image URL', async () => {
    const provider = new APIMartImageProvider({
      apiKey: 'apimart_key',
      model: 'gpt-image-2-official',
      fetcher: vi.fn(),
    });

    await expect(
      provider.generate({
        prompt: '保留商品主体',
        mode: 'image-to-image',
      }),
    ).rejects.toThrow('APIMart 图生图需要公网可访问的图片 URL');
  });

  it('normalizes provider errors and failed tasks', async () => {
    const authFailure = new APIMartImageProvider({
      apiKey: 'apimart_key',
      model: 'gpt-image-2-official',
      fetcher: vi.fn().mockResolvedValue(errorJson(429, { error: { message: '请求过于频繁' } })),
    });

    await expect(
      authFailure.generate({ prompt: '生成海报', mode: 'text-to-image' }),
    ).rejects.toThrow('请求过于频繁');

    const taskFailure = new APIMartImageProvider({
      apiKey: 'apimart_key',
      model: 'gpt-image-2-official',
      fetcher: vi
        .fn()
        .mockResolvedValueOnce(okJson({ data: [{ task_id: 'task_failed' }] }))
        .mockResolvedValueOnce(okJson({ data: { id: 'task_failed', status: 'failed', error: '审核未通过' } })),
      initialPollDelayMs: 0,
      pollIntervalMs: 0,
      timeoutMs: 1,
      sleeper: async () => undefined,
    });

    await expect(
      taskFailure.generate({ prompt: '生成海报', mode: 'text-to-image' }),
    ).rejects.toThrow('审核未通过');
  });
});
