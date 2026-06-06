import type { PromptMode } from '../prompt-builder';

export type SeedreamGenerateInput = {
  prompt: string;
  mode: PromptMode;
  inputImageDataUrl?: string;
  inputImageUrl?: string;
};

export type SeedreamGenerateOutput = {
  imageUrl?: string;
  imageDataUrl?: string;
  rawResponse: unknown;
};

type Fetcher = typeof fetch;

type ProviderOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetcher?: Fetcher;
};

export class VolcengineSeedreamProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetcher: Fetcher;

  constructor(options: ProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ARK_API_KEY ?? '';
    this.baseUrl = trimTrailingSlash(
      options.baseUrl ?? process.env.ARK_BASE_URL ?? 'https://ark.cn-beijing.volces.com/api/v3',
    );
    this.model = options.model ?? process.env.ARK_IMAGE_MODEL ?? '';
    this.fetcher = options.fetcher ?? fetch;
  }

  async generate(input: SeedreamGenerateInput): Promise<SeedreamGenerateOutput> {
    if (!this.apiKey) {
      throw new Error('火山方舟 API Key 未配置');
    }
    if (!this.model) {
      throw new Error('火山方舟图片模型未配置');
    }

    const body: Record<string, unknown> = {
      model: this.model,
      prompt: input.prompt,
      n: 1,
      size: '1024x1280',
      response_format: 'b64_json',
    };

    if (input.mode === 'image-to-image') {
      body.image = input.inputImageDataUrl;
    }

    const response = await this.fetcher(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(extractProviderError(json) ?? `火山方舟生图失败：${response.status}`);
    }

    const firstImage = Array.isArray(json.data) ? json.data[0] : undefined;
    if (firstImage?.url) {
      return { imageUrl: firstImage.url, rawResponse: json };
    }
    if (firstImage?.b64_json) {
      return { imageDataUrl: `data:image/png;base64,${firstImage.b64_json}`, rawResponse: json };
    }

    throw new Error('火山方舟未返回图片');
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function extractProviderError(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  if ('error' in value && typeof value.error === 'object' && value.error && 'message' in value.error) {
    return String(value.error.message);
  }
  if ('message' in value) return String(value.message);
  return null;
}
