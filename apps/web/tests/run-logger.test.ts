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
    expect(line).toContain('inputImageDataUrl=data:image/png;base64,[redacted');
    expect(line).toContain('prompt=');
    expect(line.length).toBeLessThan(520);
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
