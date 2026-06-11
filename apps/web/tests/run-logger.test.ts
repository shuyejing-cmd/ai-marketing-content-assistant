import { createBackendRunLogger } from '../src/features/generation/server/run-logger';

describe('backend run logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints structured terminal logs and redacts sensitive values', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = createBackendRunLogger('generation', {
      runId: 'run_1',
      taskId: 'task_1',
      apiKey: 'secret-key',
      inputImageDataUrl: 'data:image/png;base64,abcdef',
    });

    logger.step('generation.provider.request', {
      prompt: 'x'.repeat(180),
      count: 1,
    });

    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0][0]);
    expect(line).toContain('[generation]');
    expect(line).toContain('generation.provider.request');
    expect(line).toContain('runId=run_1');
    expect(line).toContain('taskId=task_1');
    expect(line).toContain('apiKey=[redacted]');
    expect(line).not.toContain('inputImageDataUrl');
    expect(line).not.toContain('data:image/');
    expect(line).toContain('prompt=');
    expect(line.length).toBeLessThan(520);
  });

  it('removes image payloads and metadata from nested structured values', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = createBackendRunLogger('generation');
    const base64 = 'c2Vuc2l0aXZlLWltYWdlLWJ5dGVz';

    logger.step('generation.provider.request', {
      inputImage: {
        dataUrl: `data:image/png;base64,${base64}`,
        imageDataUrl: 'not-even-a-data-url',
        base64,
        mimeType: 'image/png',
        bytes: 21,
        width: 1200,
        height: 800,
        processing: 'client-resized',
        hash: 'img_deadbeef',
        metadata: {
          GPS: {
            latitude: 23.1291,
            longitude: 113.2644,
          },
          GPSLatitude: 23.1291,
          gpsLongitude: 113.2644,
        },
        alternatives: [
          {
            base64: 'nested-image-body',
            mimeType: 'image/jpeg',
            bytes: 10,
          },
        ],
      },
    });

    const line = String(info.mock.calls[0][0]);
    expect(line).not.toContain('data:image/');
    expect(line).not.toContain(base64);
    expect(line).not.toContain('not-even-a-data-url');
    expect(line).not.toContain('nested-image-body');
    expect(line).not.toContain('"base64"');
    expect(line).not.toContain('"dataUrl"');
    expect(line).not.toContain('"imageDataUrl"');
    expect(line).not.toContain('GPS');
    expect(line).not.toContain('gpsLongitude');
    expect(line).toContain('"mimeType":"image/png"');
    expect(line).toContain('"bytes":21');
    expect(line).toContain('"width":1200');
    expect(line).toContain('"height":800');
    expect(line).toContain('"processing":"client-resized"');
    expect(line).toContain('"hash":"img_deadbeef"');
  });

  it('prints full prompt blocks without truncating the content', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = createBackendRunLogger('generation', { runId: 'run_1' });
    const prompt = `第一行\n${'很长的提示词'.repeat(80)}\n最后一行`;

    logger.block('generation.final_image_prompt', prompt, {
      chars: prompt.length,
    });

    expect(info).toHaveBeenCalledTimes(3);
    expect(String(info.mock.calls[0][0])).toContain('generation.final_image_prompt.begin');
    expect(info.mock.calls[1][0]).toBe(prompt);
    expect(String(info.mock.calls[2][0])).toContain('generation.final_image_prompt.end');
  });
});
