export type StructuredMarketingCopy = {
  title: string;
  publishingCopy: string;
  imageText: string[];
};

export type TextGenerateInput = {
  prompt: string;
};

export type TextGenerateOutput = {
  copy: StructuredMarketingCopy;
  rawResponse: unknown;
};

type Fetcher = typeof fetch;

type ProviderOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetcher?: Fetcher;
};

export class VolcengineTextProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetcher: Fetcher;

  constructor(options: ProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ARK_API_KEY ?? '';
    this.baseUrl = trimTrailingSlash(
      options.baseUrl ?? process.env.ARK_BASE_URL ?? 'https://ark.cn-beijing.volces.com/api/v3',
    );
    this.model = options.model ?? process.env.ARK_TEXT_MODEL ?? '';
    this.fetcher = options.fetcher ?? fetch;
  }

  async generate(input: TextGenerateInput): Promise<TextGenerateOutput> {
    if (!this.apiKey) {
      throw new Error('火山方舟 API Key 未配置');
    }
    if (!this.model) {
      throw new Error('火山方舟文案模型未配置');
    }

    const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: '你只输出严格 JSON，不输出 Markdown 或解释文字。',
          },
          {
            role: 'user',
            content: input.prompt,
          },
        ],
        temperature: 0.4,
      }),
    });
    const responseBody = await readResponseBody(response);

    if (!response.ok) {
      throw new Error(
        extractProviderError(responseBody.json) ??
          normalizeErrorText(responseBody.text) ??
          `火山方舟文案生成失败：${response.status}`,
      );
    }

    return {
      copy: parseStructuredCopy(extractMessageContent(responseBody.json)),
      rawResponse: responseBody.json ?? responseBody.text ?? null,
    };
  }
}

async function readResponseBody(response: Response): Promise<{ json?: unknown; text?: string }> {
  const jsonResponse = typeof response.clone === 'function' ? response.clone() : response;
  try {
    return { json: await jsonResponse.json() };
  } catch {
    // Try the raw body below so provider errors are not reduced to a bare status code.
  }

  try {
    return { text: await response.text() };
  } catch {
    return {};
  }
}

function parseStructuredCopy(content: string): StructuredMarketingCopy {
  const parsed = parseJsonObject(content);
  const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  const publishingCopy =
    typeof parsed.publishingCopy === 'string' ? parsed.publishingCopy.trim() : '';
  const imageText = Array.isArray(parsed.imageText)
    ? parsed.imageText.filter((line): line is string => typeof line === 'string').map((line) => line.trim()).filter(Boolean)
    : [];

  if (!title || !publishingCopy || imageText.length === 0) {
    throw new Error('文案模型返回格式无效');
  }

  return {
    title,
    publishingCopy,
    imageText: imageText.slice(0, 3),
  };
}

function parseJsonObject(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(stripCodeFence(content));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to the normalized provider error below
  }
  throw new Error('文案模型返回格式无效');
}

function extractMessageContent(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('文案模型返回格式无效');
  const choices = 'choices' in value && Array.isArray(value.choices) ? value.choices : [];
  const first = choices[0];
  if (!first || typeof first !== 'object') throw new Error('文案模型返回格式无效');
  const message = 'message' in first && first.message && typeof first.message === 'object' ? first.message : null;
  if (!message || !('content' in message) || typeof message.content !== 'string') {
    throw new Error('文案模型返回格式无效');
  }
  return message.content;
}

function stripCodeFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function extractProviderError(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  if ('error' in value && typeof value.error === 'string') return value.error;
  if ('error' in value && typeof value.error === 'object' && value.error && 'message' in value.error) {
    return String(value.error.message);
  }
  if ('message' in value) return String(value.message);
  return null;
}

function normalizeErrorText(value: string | undefined) {
  const text = value?.trim();
  return text || null;
}
