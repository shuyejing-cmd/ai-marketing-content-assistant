import { createGenerationService } from '../src/features/generation/server/generation-service';
import type { GenerationTaskRequest } from '../src/features/generation/generation-types';

const request: GenerationTaskRequest = {
  requestText: '给新品奶茶做一张朋友圈宣传图',
  channels: ['wechat'],
  scene: 'new_product',
  style: 'young_trendy',
  campaignInfo: { productName: '柠檬茶', price: '19.9' },
};

describe('generation service', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('creates one generated result and stores the prompt log', async () => {
    const provider = {
      generate: vi.fn(async () => ({
        imageUrl: 'https://example.test/poster.png',
        rawResponse: { data: [{ url: 'https://example.test/poster.png' }] },
      })),
    };
    const copyProvider = {
      generate: vi.fn(async () => ({
        copy: {
          title: 'AI 标题',
          publishingCopy: 'AI 发布文案',
          imageText: ['AI 主标题', 'AI 卖点', 'AI 行动'],
        },
        rawResponse: { choices: [{ message: { content: '{}' } }] },
      })),
    };
    const logger = createTestLogger();
    const store = createMemoryStore();
    const service = createGenerationService({
      provider,
      copyProvider,
      store,
      logger,
    });

    const task = await service.createTask({
      ownerId: 'owner_1',
      sessionId: 'session_1',
      request,
    });

    expect(task.status).toBe('succeeded');
    expect(task.results).toHaveLength(1);
    expect(task.results[0]).toEqual(
      expect.objectContaining({
        imageUrl: 'https://example.test/poster.png',
        title: 'AI 标题',
        publishingCopy: 'AI 发布文案',
        imageText: ['AI 主标题', 'AI 卖点', 'AI 行动'],
      }),
    );
    expect(copyProvider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('最终图片提示词'),
      }),
    );
    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'text-to-image',
        prompt: expect.stringContaining('无真实商品图'),
      }),
    );
    expect(service.getPromptLogs()).toHaveLength(1);
    expect(logger.stepNames()).toEqual([
      'generation.task.received',
      'generation.prompt.built',
      'generation.provider.request',
      'generation.provider.success',
      'generation.copy_provider.request',
      'generation.copy_provider.success',
      'generation.task.saved',
      'generation.prompt_log.saved',
      'generation.task.succeeded',
    ]);
    expect(logger.steps[0].meta).toEqual(
      expect.objectContaining({
        ownerId: 'owner_1',
        sessionId: 'session_1',
        mode: 'text-to-image',
        hasUploadedImage: false,
      }),
    );
    expect(logger.steps[1].meta).toEqual(
      expect.objectContaining({
        promptVersion: 'seedream-marketing-v1',
        imagePromptChars: expect.any(Number),
        copyPromptChars: expect.any(Number),
      }),
    );
    expect(logger.blockNames()).toEqual([
      'generation.final_image_prompt',
      'generation.final_copy_prompt',
    ]);
    expect(logger.blocks[0].content).toContain(request.requestText);
    expect(logger.blocks[1].meta).toEqual(
      expect.objectContaining({
        sentToCopyModel: true,
      }),
    );
    expect(store.promptLogs[0]).toEqual(
      expect.objectContaining({
        providerRequestJson: expect.objectContaining({
          image: expect.objectContaining({ mode: 'text-to-image' }),
          copy: expect.objectContaining({ sent: true }),
        }),
        providerResponseJson: expect.objectContaining({
          image: expect.anything(),
          copy: expect.anything(),
        }),
      }),
    );
  });

  it('keeps the generated image and falls back to mock copy when the copy model fails', async () => {
    const provider = {
      generate: vi.fn(async () => ({
        imageUrl: 'https://example.test/poster.png',
        rawResponse: { data: [{ url: 'https://example.test/poster.png' }] },
      })),
    };
    const copyProvider = {
      generate: vi.fn(async () => {
        throw new Error('copy model unavailable');
      }),
    };
    const store = createMemoryStore();
    const logger = createTestLogger();
    const service = createGenerationService({ provider, copyProvider, store, logger });

    const task = await service.createTask({
      ownerId: 'owner_1',
      sessionId: 'session_1',
      request,
    });

    expect(task.status).toBe('succeeded');
    expect(task.results[0]).toEqual(
      expect.objectContaining({
        imageUrl: 'https://example.test/poster.png',
        title: expect.stringContaining('柠檬茶'),
      }),
    );
    expect(logger.stepNames()).toContain('generation.copy_provider.failed');
    expect(store.promptLogs[0]).toEqual(
      expect.objectContaining({
        providerRequestJson: expect.objectContaining({
          copy: expect.objectContaining({ sent: true }),
        }),
        providerResponseJson: expect.objectContaining({
          copy: expect.objectContaining({ error: 'copy model unavailable' }),
        }),
      }),
    );
  });

  it('uses image-to-image mode when the request includes an uploaded image', async () => {
    const provider = {
      generate: vi.fn(async () => ({
        imageDataUrl: 'data:image/png;base64,generated',
        rawResponse: { data: [{ b64_json: 'generated' }] },
      })),
    };
    const store = createMemoryStore();
    const logger = createTestLogger();
    const service = createGenerationService({ provider, store, logger });

    await service.createTask({
      ownerId: 'owner_1',
      sessionId: 'session_1',
      request: { ...request, uploadedImageDataUrl: 'data:image/png;base64,input' },
    });

    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'image-to-image',
        inputImageDataUrl: 'data:image/png;base64,input',
      }),
    );
    expect(store.imageAssets).toHaveLength(2);
    expect(logger.steps.find((step) => step.name === 'generation.provider.request')?.meta).toEqual(
      expect.objectContaining({
        hasInputImage: true,
        size: '1024x1280',
        responseFormat: 'b64_json',
        inputImage: expect.objectContaining({
          mimeType: 'image/png',
          hash: expect.stringMatching(/^img_[a-f0-9]{8}$/),
        }),
      }),
    );
  });

  it('uses Seedream by default when Ark credentials are configured', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'generated' }] }),
    }));
    vi.stubGlobal('fetch', fetcher);
    vi.stubEnv('ARK_API_KEY', 'ark_test_key');
    vi.stubEnv('ARK_IMAGE_MODEL', 'seedream-test-model');
    vi.stubEnv('GENERATION_PROVIDER', '');

    const service = createGenerationService({
      store: createMemoryStore(),
      logger: createTestLogger(),
    });

    await service.createTask({
      ownerId: 'owner_1',
      sessionId: 'session_1',
      request,
    });

    expect(fetcher).toHaveBeenCalled();
  });

  it('uses APIMart when GENERATION_PROVIDER is apimart', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ task_id: 'task_apimart' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 'task_apimart',
            status: 'completed',
            result: { images: [{ url: ['https://cdn.example.test/apimart.png'] }] },
          },
        }),
      });
    vi.stubGlobal('fetch', fetcher);
    vi.stubEnv('GENERATION_PROVIDER', 'apimart');
    vi.stubEnv('APIMART_API_KEY', 'apimart_key');
    vi.stubEnv('APIMART_IMAGE_MODEL', 'gpt-image-2-official');
    vi.stubEnv('APIMART_BASE_URL', 'https://api.apimart.ai/v1');
    vi.stubEnv('APIMART_INITIAL_POLL_DELAY_MS', '0');
    vi.stubEnv('APIMART_POLL_INTERVAL_MS', '0');
    vi.stubEnv('APIMART_TIMEOUT_MS', '1');

    const service = createGenerationService({
      store: createMemoryStore(),
      logger: createTestLogger(),
    });

    const task = await service.createTask({
      ownerId: 'owner_1',
      sessionId: 'session_1',
      request,
    });

    expect(task.results[0].imageUrl).toBe('https://cdn.example.test/apimart.png');
    expect(fetcher.mock.calls[0][0]).toBe('https://api.apimart.ai/v1/images/generations');
    expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toEqual(
      expect.objectContaining({
        model: 'gpt-image-2-official',
        size: '4:5',
        resolution: '1k',
        quality: 'low',
      }),
    );
  });

  it('falls back to APP_PUBLIC_BASE_URL for APIMart image-to-image when COS is not configured', async () => {
    vi.stubEnv('GENERATION_PROVIDER', 'apimart');
    vi.stubEnv('APP_PUBLIC_BASE_URL', 'https://app.example.test/');
    const provider = {
      generate: vi.fn(async () => ({
        imageUrl: 'https://example.test/poster.png',
        rawResponse: { provider: 'custom' },
      })),
    };
    const store = createMemoryStore();
    const service = createGenerationService({ provider, store, logger: createTestLogger() });

    await service.createTask({
      ownerId: 'owner_1',
      sessionId: 'session_1',
      request: { ...request, uploadedImageDataUrl: 'data:image/png;base64,input' },
    });

    const uploadedAsset = store.imageAssets[0] as { id: string };
    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'image-to-image',
        inputImageDataUrl: 'data:image/png;base64,input',
        inputImageUrl: `https://app.example.test/api/image-assets/${uploadedAsset.id}`,
      }),
    );
  });

  it('uses a COS signed URL for APIMart image-to-image requests', async () => {
    vi.stubEnv('GENERATION_PROVIDER', 'apimart');
    const provider = {
      generate: vi.fn(async () => ({
        imageUrl: 'https://example.test/poster.png',
        rawResponse: { provider: 'custom' },
      })),
    };
    const imagePublisher = {
      publish: vi.fn(async () => ({
        url: 'https://poster-inputs.cos.ap-guangzhou.myqcloud.com/apimart-inputs/asset_1.jpg?q-signature=signed',
        log: {
          provider: 'tencent-cos',
          bucket: 'poster-inputs-1250000000',
          region: 'ap-guangzhou',
          objectKey: 'apimart-inputs/2026/05/27/owner_1/task_1/asset_1.jpg',
          expiresInSeconds: 1800,
          expiresAt: '2026-05-27T02:30:00.000Z',
        },
      })),
    };
    const store = createMemoryStore();
    const service = createGenerationService({
      provider,
      imagePublisher,
      store,
      logger: createTestLogger(),
    });

    await service.createTask({
      ownerId: 'owner_1',
      sessionId: 'session_1',
      request: { ...request, uploadedImageDataUrl: 'data:image/jpeg;base64,input' },
    });

    const uploadedAsset = store.imageAssets[0] as { id: string };
    expect(imagePublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: expect.objectContaining({ id: uploadedAsset.id, mimeType: 'image/jpeg' }),
        ownerId: 'owner_1',
        taskId: expect.stringMatching(/^task_/),
      }),
    );
    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'image-to-image',
        inputImageUrl:
          'https://poster-inputs.cos.ap-guangzhou.myqcloud.com/apimart-inputs/asset_1.jpg?q-signature=signed',
      }),
    );
    expect(JSON.stringify(store.promptLogs[0])).not.toContain('q-signature=signed');
    expect(store.promptLogs[0]).toEqual(
      expect.objectContaining({
        providerRequestJson: expect.objectContaining({
          image: expect.objectContaining({
            inputImageUrl: null,
            inputImageSource: expect.objectContaining({
              provider: 'tencent-cos',
              objectKey: 'apimart-inputs/2026/05/27/owner_1/task_1/asset_1.jpg',
            }),
          }),
        }),
      }),
    );
  });

  it('requires COS or APP_PUBLIC_BASE_URL for APIMart image-to-image requests', async () => {
    vi.stubEnv('GENERATION_PROVIDER', 'apimart');
    const provider = {
      generate: vi.fn(async () => ({
        imageUrl: 'https://example.test/poster.png',
        rawResponse: { provider: 'custom' },
      })),
    };
    const service = createGenerationService({
      provider,
      store: createMemoryStore(),
      logger: createTestLogger(),
    });

    await expect(
      service.createTask({
        ownerId: 'owner_1',
        sessionId: 'session_1',
        request: { ...request, uploadedImageDataUrl: 'data:image/png;base64,input' },
      }),
    ).rejects.toThrow('需要配置腾讯云 COS 或 APP_PUBLIC_BASE_URL');
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('keeps a successful generation when the browser session id is stale', async () => {
    const provider = {
      generate: vi.fn(async () => ({
        imageUrl: 'https://example.test/poster.png',
        rawResponse: { provider: 'custom' },
      })),
    };
    const copyProvider = {
      generate: vi.fn(async () => ({
        copy: {
          title: 'AI 标题',
          publishingCopy: 'AI 发布文案',
          imageText: ['AI 主标题'],
        },
        rawResponse: { provider: 'copy' },
      })),
    };
    const store = createMemoryStore();
    const originalSaveTask = store.saveTask;
    let firstSave = true;
    const saveTask = vi.fn(async (task: unknown, meta?: { sessionId?: string | null }) => {
      if (firstSave && meta?.sessionId) {
        firstSave = false;
        throw new Error(
          'Invalid `prisma.generationTask.create()` invocation: Foreign key constraint violated: `(not available)`',
        );
      }
      await originalSaveTask(task, meta);
    });
    store.saveTask = saveTask;
    const logger = createTestLogger();
    const service = createGenerationService({
      provider,
      copyProvider,
      store,
      logger,
    });

    const task = await service.createTask({
      ownerId: 'owner_1',
      sessionId: 'session_deleted_in_db',
      request,
    });

    expect(task.status).toBe('succeeded');
    expect(saveTask).toHaveBeenCalledTimes(2);
    expect(saveTask.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        sessionId: null,
      }),
    );
    expect(logger.stepNames()).toContain('generation.session.stale');
    expect(logger.stepNames()).not.toContain('generation.provider.failed');
  });

  it('logs failed generation steps with the provider error', async () => {
    const provider = {
      generate: vi.fn(async () => {
        throw new Error('seedream rejected the request');
      }),
    };
    const logger = createTestLogger();
    const service = createGenerationService({
      provider,
      store: createMemoryStore(),
      logger,
    });

    await expect(
      service.createTask({
        ownerId: 'owner_1',
        sessionId: 'session_1',
        request,
      }),
    ).rejects.toThrow('seedream rejected the request');

    expect(logger.stepNames()).toEqual([
      'generation.task.received',
      'generation.prompt.built',
      'generation.provider.request',
      'generation.provider.failed',
      'generation.task.saved',
      'generation.prompt_log.saved',
      'generation.task.failed',
    ]);
    expect(logger.errors.at(-1)?.meta).toEqual(
      expect.objectContaining({
        message: 'seedream rejected the request',
      }),
    );
  });
});

function createMemoryStore() {
  const tasks: unknown[] = [];
  const promptLogs: unknown[] = [];
  const imageAssets: unknown[] = [];

  return {
    tasks,
    promptLogs,
    imageAssets,
    async saveTask(task: unknown, meta?: unknown) {
      tasks.push(task);
    },
    async savePromptLog(log: unknown) {
      promptLogs.push(log);
    },
    async saveImageAsset(asset: unknown) {
      imageAssets.push(asset);
    },
    async getImageAsset(id: string) {
      return (
        (imageAssets as Array<{ id: string }>).find((asset) => asset.id === id) ?? null
      );
    },
    async getTask() {
      return tasks[0] ?? null;
    },
  };
}

function createTestLogger() {
  const steps: Array<{ name: string; meta?: Record<string, unknown> }> = [];
  const errors: Array<{ name: string; meta?: Record<string, unknown> }> = [];
  const blocks: Array<{ name: string; content: string; meta?: Record<string, unknown> }> = [];
  return {
    steps,
    errors,
    blocks,
    step(name: string, meta?: Record<string, unknown>) {
      steps.push({ name, meta });
    },
    error(name: string, meta?: Record<string, unknown>) {
      errors.push({ name, meta });
      steps.push({ name, meta });
    },
    block(name: string, content: string, meta?: Record<string, unknown>) {
      blocks.push({ name, content, meta });
    },
    stepNames() {
      return steps.map((step) => step.name);
    },
    blockNames() {
      return blocks.map((block) => block.name);
    },
  };
}
