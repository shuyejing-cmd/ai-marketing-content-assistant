import { VolcengineTextProvider } from '../src/features/generation/server/text-provider';

describe('VolcengineTextProvider', () => {
  it('calls Ark chat completions and parses structured marketing copy', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: '国庆焕新温暖相伴',
                publishingCopy: '国庆出游带上这只保温杯，保温更久，拍照也好看。',
                imageText: ['国庆焕新', '304 不锈钢长效保温', '限时 7 折'],
              }),
            },
          },
        ],
      }),
    });
    const provider = new VolcengineTextProvider({
      apiKey: 'ark_test_key',
      baseUrl: 'https://ark.example.test/api/v3',
      model: 'doubao-test',
      fetcher,
    });

    const result = await provider.generate({
      prompt: '生成一套朋友圈海报文案',
    });

    expect(result.copy).toEqual({
      title: '国庆焕新温暖相伴',
      publishingCopy: '国庆出游带上这只保温杯，保温更久，拍照也好看。',
      imageText: ['国庆焕新', '304 不锈钢长效保温', '限时 7 折'],
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://ark.example.test/api/v3/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer ark_test_key' }),
      }),
    );
    const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(body).toEqual(
      expect.objectContaining({
        model: 'doubao-test',
      }),
    );
    expect(body.response_format).toBeUndefined();
    expect(body.messages.at(-1)).toEqual(
      expect.objectContaining({
        role: 'user',
        content: '生成一套朋友圈海报文案',
      }),
    );
  });

  it('rejects malformed model JSON', async () => {
    const provider = new VolcengineTextProvider({
      apiKey: 'ark_test_key',
      baseUrl: 'https://ark.example.test/api/v3',
      model: 'doubao-test',
      fetcher: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"title":"缺字段"}' } }],
        }),
      }),
    });

    await expect(provider.generate({ prompt: '生成文案' })).rejects.toThrow('文案模型返回格式无效');
  });

  it('includes provider error text when Ark rejects the request', async () => {
    const provider = new VolcengineTextProvider({
      apiKey: 'ark_test_key',
      baseUrl: 'https://ark.example.test/api/v3',
      model: 'doubao-test',
      fetcher: vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'bad request: invalid model endpoint' }),
      }),
    });

    await expect(provider.generate({ prompt: '生成文案' })).rejects.toThrow('bad request: invalid model endpoint');
  });

  it('falls back to response text when Ark returns a non-JSON error body', async () => {
    const provider = new VolcengineTextProvider({
      apiKey: 'ark_test_key',
      baseUrl: 'https://ark.example.test/api/v3',
      model: 'doubao-test',
      fetcher: vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => {
          throw new Error('not json');
        },
        text: async () => 'invalid request path',
      }),
    });

    await expect(provider.generate({ prompt: '生成文案' })).rejects.toThrow('invalid request path');
  });
});
