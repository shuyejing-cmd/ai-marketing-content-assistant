import type { SeedreamGenerateInput, SeedreamGenerateOutput } from './seedream-provider';
import { fetch as undiciFetch, ProxyAgent } from 'undici';

type Fetcher = typeof fetch;
type Sleeper = (ms: number) => Promise<void>;

type ProviderOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  size?: string;
  resolution?: string;
  quality?: string;
  proxyUrl?: string;
  fetcher?: Fetcher;
  sleeper?: Sleeper;
  initialPollDelayMs?: number;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

const DEFAULT_BASE_URL = 'https://api.apimart.ai/v1';
const DEFAULT_MODEL = 'gpt-image-2-official';
const DEFAULT_SIZE = '4:5';
const DEFAULT_RESOLUTION = '1k';
const DEFAULT_QUALITY = 'low';
const DEFAULT_INITIAL_POLL_DELAY_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_TIMEOUT_MS = 180_000;

export class APIMartImageProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly size: string;
  private readonly resolution: string;
  private readonly quality: string;
  private readonly fetcher: Fetcher;
  private readonly sleeper: Sleeper;
  private readonly initialPollDelayMs: number;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(options: ProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.APIMART_API_KEY ?? '';
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.APIMART_BASE_URL ?? DEFAULT_BASE_URL);
    this.model = options.model ?? process.env.APIMART_IMAGE_MODEL ?? DEFAULT_MODEL;
    this.size = options.size ?? process.env.APIMART_IMAGE_SIZE ?? DEFAULT_SIZE;
    this.resolution = options.resolution ?? process.env.APIMART_IMAGE_RESOLUTION ?? DEFAULT_RESOLUTION;
    this.quality = options.quality ?? process.env.APIMART_IMAGE_QUALITY ?? DEFAULT_QUALITY;
    this.fetcher = createFetchWithProxy(options.fetcher, options.proxyUrl);
    this.sleeper = options.sleeper ?? sleep;
    this.initialPollDelayMs =
      options.initialPollDelayMs ?? readNumberEnv('APIMART_INITIAL_POLL_DELAY_MS', DEFAULT_INITIAL_POLL_DELAY_MS);
    this.pollIntervalMs = options.pollIntervalMs ?? readNumberEnv('APIMART_POLL_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS);
    this.timeoutMs = options.timeoutMs ?? readNumberEnv('APIMART_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  }

  async generate(input: SeedreamGenerateInput): Promise<SeedreamGenerateOutput> {
    if (!this.apiKey) {
      throw new Error('APIMart API Key 未配置');
    }
    if (!this.model) {
      throw new Error('APIMart 图片模型未配置');
    }
    if (input.mode === 'image-to-image' && !input.inputImageUrl) {
      throw new Error('APIMart 图生图需要公网可访问的图片 URL，请配置 APP_PUBLIC_BASE_URL');
    }

    const submitResponse = await this.fetcher(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(this.buildSubmitBody(input)),
    });
    const submitJson = await submitResponse.json().catch(() => ({}));
    if (!submitResponse.ok) {
      throw new Error(extractProviderError(submitJson) ?? `APIMart 生图提交失败：${submitResponse.status}`);
    }

    const taskId = extractTaskId(submitJson);
    if (!taskId) {
      throw new Error('APIMart 未返回 task_id');
    }

    await this.sleeper(this.initialPollDelayMs);
    const maxPollAttempts = Math.max(1, Math.ceil(this.timeoutMs / Math.max(this.pollIntervalMs, 1)) + 1);
    for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
      const taskResponse = await this.fetcher(`${this.baseUrl}/tasks/${encodeURIComponent(taskId)}`, {
        method: 'GET',
        headers: this.headers(),
      });
      const taskJson = await taskResponse.json().catch(() => ({}));
      if (!taskResponse.ok) {
        throw new Error(extractProviderError(taskJson) ?? `APIMart 任务查询失败：${taskResponse.status}`);
      }

      const task = extractTask(taskJson);
      if (!task) {
        throw new Error('APIMart 任务查询返回格式无效');
      }
      const status = typeof task?.status === 'string' ? task.status : '';
      if (status === 'completed') {
        const imageUrl = extractCompletedImageUrl(task);
        if (!imageUrl) {
          throw new Error('APIMart 任务完成但未返回图片 URL');
        }
        return { imageUrl, rawResponse: { submit: submitJson, task: taskJson } };
      }
      if (status === 'failed') {
        throw new Error(extractProviderError(task) ?? 'APIMart 生图任务失败');
      }

      if (attempt < maxPollAttempts - 1) {
        await this.sleeper(this.pollIntervalMs);
      }
    }

    throw new Error('APIMart 生图任务超时');
  }

  private buildSubmitBody(input: SeedreamGenerateInput) {
    return {
      model: this.model,
      prompt: input.prompt,
      size: this.size,
      resolution: this.resolution,
      quality: this.quality,
      n: 1,
      ...(input.inputImageUrl ? { image_urls: [input.inputImageUrl] } : {}),
    };
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }
}

function createFetchWithProxy(fetcher?: Fetcher, proxyUrl = readProxyUrl()): Fetcher {
  if (!proxyUrl) return fetcher ?? fetch;

  const dispatcher = new ProxyAgent(proxyUrl);
  const baseFetcher = fetcher ?? (undiciFetch as unknown as Fetcher);
  return ((url, init) => baseFetcher(url, { ...init, dispatcher } as RequestInit & { dispatcher: unknown })) as Fetcher;
}

function readProxyUrl() {
  return (
    process.env.APIMART_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    ''
  ).trim();
}

function extractTaskId(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const data = 'data' in value && Array.isArray(value.data) ? value.data : [];
  const first = data[0];
  if (first && typeof first === 'object' && 'task_id' in first && typeof first.task_id === 'string') {
    return first.task_id;
  }
  return null;
}

function extractTask(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || !('data' in value)) return null;
  return value.data && typeof value.data === 'object' && !Array.isArray(value.data)
    ? (value.data as Record<string, unknown>)
    : null;
}

function extractCompletedImageUrl(task: Record<string, unknown>) {
  const result = 'result' in task && task.result && typeof task.result === 'object' ? task.result : null;
  const images = result && 'images' in result && Array.isArray(result.images) ? result.images : [];
  const first = images[0];
  if (!first || typeof first !== 'object' || !('url' in first) || !Array.isArray(first.url)) return null;
  const imageUrl = first.url[0];
  return typeof imageUrl === 'string' && imageUrl ? imageUrl : null;
}

function extractProviderError(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  if ('error' in value) {
    const error = value.error;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      return error.message;
    }
  }
  if ('message' in value && typeof value.message === 'string') return value.message;
  return null;
}

function normalizeBaseUrl(value: string) {
  return trimTrailingSlash(value.trim()).replace(/\/images\/generations$/i, '');
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function readNumberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
