const createGenerationService = vi.hoisted(() => vi.fn());
const createGenerationStore = vi.hoisted(() => vi.fn(() => ({ kind: 'store' })));

vi.mock('../src/features/generation/server/generation-service', () => ({
  createGenerationService,
}));

vi.mock('../src/features/generation/server/generation-store', () => ({
  createGenerationStore,
}));

describe('generation runtime', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    delete (globalThis as Record<string, unknown>).generationService;
    delete (globalThis as Record<string, unknown>).generationServiceConfigSignature;
    let counter = 0;
    createGenerationService.mockImplementation(() => ({ id: `service_${++counter}` }));
    createGenerationService.mockClear();
    createGenerationStore.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rebuilds the cached service when generation provider configuration changes', async () => {
    vi.stubEnv('GENERATION_PROVIDER', 'seedream');
    const { getGenerationService } = await import('../src/features/generation/server/runtime');

    const first = getGenerationService();
    vi.stubEnv('GENERATION_PROVIDER', 'apimart');
    const second = getGenerationService();

    expect(second).not.toBe(first);
    expect(createGenerationService).toHaveBeenCalledTimes(2);
    expect(createGenerationStore).toHaveBeenCalledTimes(2);
  });

  it('rebuilds the cached service when COS configuration changes', async () => {
    vi.stubEnv('GENERATION_PROVIDER', 'apimart');
    vi.stubEnv('TENCENT_COS_BUCKET', 'bucket-a-1250000000');
    const { getGenerationService } = await import('../src/features/generation/server/runtime');

    const first = getGenerationService();
    vi.stubEnv('TENCENT_COS_BUCKET', 'bucket-b-1250000000');
    const second = getGenerationService();

    expect(second).not.toBe(first);
    expect(createGenerationService).toHaveBeenCalledTimes(2);
  });
});
