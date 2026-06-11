import type { GenerationResult, GenerationTask, GenerationTaskRequest } from '../generation-types';
import { summarizeImageDataUrl } from '../image-summary';
import { buildPromptPackage, type PromptMode } from '../prompt-builder';
import { createMockGenerationTask } from '../mock-generation';
import { validateGenerationImageDataUrl } from '../../image-upload/server/validate-generation-image';
import { makeId } from './ids';
import { APIMartImageProvider } from './apimart-provider';
import { VolcengineSeedreamProvider, type SeedreamGenerateInput, type SeedreamGenerateOutput } from './seedream-provider';
import {
  VolcengineTextProvider,
  type StructuredMarketingCopy,
  type TextGenerateInput,
  type TextGenerateOutput,
} from './text-provider';
import { createBackendRunLogger, type BackendRunLogger } from './run-logger';
import {
  createTencentCosImagePublisher,
  getTencentCosConfigStatus,
  type ImageUrlPublisher,
  type PublishedImageLog,
} from './tencent-cos-image-publisher';

export type GenerationStore = {
  saveTask(task: GenerationTask, meta?: SaveTaskMeta): Promise<void>;
  savePromptLog(log: PromptLogRecord): Promise<void>;
  saveImageAsset(asset: ImageAssetRecord): Promise<void>;
  getImageAsset(id: string): Promise<ImageAssetRecord | null>;
  getTask(taskId: string): Promise<GenerationTask | null>;
  getTaskForOwner(ownerId: string, taskId: string): Promise<GenerationTask | null>;
  listTasksForSession?(ownerId: string, sessionId: string): Promise<GenerationTask[]>;
};

type SaveTaskMeta = {
  ownerId: string;
  sessionId?: string | null;
  errorMessage?: string | null;
};

export type PromptLogRecord = {
  id: string;
  taskId: string;
  promptVersion: string;
  imagePrompt: string;
  copyPrompt: string;
  providerRequestJson?: unknown;
  providerResponseJson?: unknown;
  errorMessage?: string | null;
};

export type ImageAssetRecord = {
  id: string;
  ownerId: string;
  kind: 'uploaded_image' | 'generated_image';
  mimeType: string;
  base64: string;
};

type Provider = {
  generate(input: SeedreamGenerateInput): Promise<SeedreamGenerateOutput>;
};

type CopyProvider = {
  generate(input: TextGenerateInput): Promise<TextGenerateOutput>;
};

type CreateServiceOptions = {
  provider?: Provider;
  copyProvider?: CopyProvider;
  store?: GenerationStore;
  logger?: BackendRunLogger;
  imagePublisher?: ImageUrlPublisher;
};

type CreateTaskInput = {
  ownerId: string;
  sessionId?: string | null;
  request: GenerationTaskRequest;
  modificationText?: string;
  templateInstruction?: string;
};

type PublicInputImageLog = {
  provider: 'app-public-base-url';
  url: string;
};

type InputImageSourceLog = PublishedImageLog | PublicInputImageLog;

export function createGenerationService(options: CreateServiceOptions = {}) {
  const provider = options.provider ?? createDefaultProvider();
  const copyProvider = options.copyProvider ?? createDefaultCopyProvider();
  const store = options.store ?? createMemoryGenerationStore();
  const imagePublisher = options.imagePublisher ?? createDefaultImagePublisher();
  const promptLogs: PromptLogRecord[] = [];

  return {
    async createTask(input: CreateTaskInput): Promise<GenerationTask> {
      const taskId = makeId('task');
      const mode: PromptMode = input.request.uploadedImageDataUrl ? 'image-to-image' : 'text-to-image';
      const logger =
        options.logger ??
        createBackendRunLogger('generation', {
          runId: taskId,
          taskId,
          ownerId: input.ownerId,
          sessionId: input.sessionId ?? null,
        });
      logger.step('generation.task.received', {
        ownerId: input.ownerId,
        sessionId: input.sessionId ?? null,
        mode,
        hasUploadedImage: Boolean(input.request.uploadedImageDataUrl),
        channel: input.request.channels[0] ?? 'wechat',
        scene: input.request.scene,
        style: input.request.style,
        requestText: input.request.requestText,
        modificationText: input.modificationText,
      });
      const promptPackage = buildPromptPackage({
        request: input.request,
        mode,
        outputIndex: 0,
        modificationText: input.modificationText,
        templateInstruction: input.templateInstruction,
      });
      logger.step('generation.prompt.built', {
        promptVersion: promptPackage.version,
        imagePromptChars: promptPackage.imagePrompt.length,
        copyPromptChars: promptPackage.copyPrompt.length,
      });
      logger.block('generation.final_image_prompt', promptPackage.imagePrompt, {
        promptVersion: promptPackage.version,
        mode,
        sentToImageModel: true,
      });
      logger.block('generation.final_copy_prompt', promptPackage.copyPrompt, {
        promptVersion: promptPackage.version,
        sentToImageModel: false,
        sentToCopyModel: true,
      });

      let uploadedImageAsset: ImageAssetRecord | null = null;
      let inputImageSummary:
        | {
            mimeType: string;
            bytes: number;
            width: number;
            height: number;
            hash: string;
          }
        | undefined;
      if (input.request.uploadedImageDataUrl) {
        const validated = await validateGenerationImageDataUrl(input.request.uploadedImageDataUrl);
        const dataUrlSummary = summarizeImageDataUrl(input.request.uploadedImageDataUrl);
        inputImageSummary = {
          mimeType: validated.mimeType,
          bytes: validated.buffer.byteLength,
          width: validated.width,
          height: validated.height,
          hash: dataUrlSummary.hash,
        };
        uploadedImageAsset = {
          id: makeId('asset'),
          ownerId: input.ownerId,
          kind: 'uploaded_image',
          mimeType: validated.mimeType,
          base64: validated.buffer.toString('base64'),
        };
        await store.saveImageAsset(uploadedImageAsset);
        logger.step('generation.uploaded_image.saved', {
          image: inputImageSummary,
        });
      }
      let inputImageUrl: string | undefined;
      let inputImageSource: InputImageSourceLog | null = null;

      try {
        const inputImagePublication = uploadedImageAsset
          ? await publishInputImage({
              asset: uploadedImageAsset,
              ownerId: input.ownerId,
              taskId,
              imagePublisher,
            })
          : null;
        inputImageUrl = inputImagePublication?.url;
        inputImageSource = inputImagePublication?.log ?? null;
        logger.step('generation.provider.request', {
          provider: provider.constructor?.name || 'custom-provider',
          model: getImageModelName(),
          mode,
          size: getImageSizeLabel(),
          responseFormat: getImageResponseFormatLabel(),
          hasInputImage: Boolean(input.request.uploadedImageDataUrl),
          inputImageUrl: inputImageSource?.provider === 'tencent-cos' ? null : inputImageUrl,
          inputImageSource,
          inputImage: inputImageSummary,
        });
        const providerResult = await provider.generate({
          prompt: promptPackage.imagePrompt,
          mode,
          inputImageDataUrl: input.request.uploadedImageDataUrl,
          inputImageUrl,
        });
        logger.step('generation.provider.success', {
          hasImageUrl: Boolean(providerResult.imageUrl),
          hasImageDataUrl: Boolean(providerResult.imageDataUrl),
        });
        let result = buildResult(input.request, providerResult);
        let copyProviderResponse: unknown = null;
        let copyProviderError: string | null = null;

        logger.step('generation.copy_provider.request', {
          provider: copyProvider.constructor?.name || 'custom-copy-provider',
          model: process.env.ARK_TEXT_MODEL,
          promptChars: promptPackage.copyPrompt.length,
        });
        try {
          const copyResult = await copyProvider.generate({
            prompt: promptPackage.copyPrompt,
          });
          result = applyCopyResult(result, copyResult.copy);
          copyProviderResponse = copyResult.rawResponse;
          logger.step('generation.copy_provider.success', {
            titleChars: copyResult.copy.title.length,
            publishingCopyChars: copyResult.copy.publishingCopy.length,
            imageTextLines: copyResult.copy.imageText.length,
          });
        } catch (copyError) {
          copyProviderError = copyError instanceof Error ? copyError.message : '文案生成失败';
          copyProviderResponse = { error: copyProviderError };
          logger.error('generation.copy_provider.failed', {
            message: copyProviderError,
          });
        }

        if (providerResult.imageDataUrl) {
          await store.saveImageAsset(toGeneratedImageAsset(input.ownerId, providerResult.imageDataUrl));
          logger.step('generation.generated_image.saved', {
            image: summarizeImageDataUrl(providerResult.imageDataUrl),
          });
        }

        const task: GenerationTask = {
          id: taskId,
          status: 'succeeded',
          request: input.request,
          results: [result],
        };
        await saveTaskWithSessionFallback(store, logger, task, { ownerId: input.ownerId, sessionId: input.sessionId });
        logger.step('generation.task.saved', {
          status: task.status,
          resultCount: task.results.length,
        });
        await savePromptLog({
          id: makeId('prompt'),
          taskId,
          promptVersion: promptPackage.version,
          imagePrompt: promptPackage.imagePrompt,
          copyPrompt: promptPackage.copyPrompt,
          providerRequestJson: {
            image: {
              mode,
              hasInputImage: Boolean(input.request.uploadedImageDataUrl),
              inputImageUrl: inputImageSource?.provider === 'tencent-cos' ? null : inputImageUrl ?? null,
              inputImageSource,
            },
            copy: {
              sent: true,
              model: process.env.ARK_TEXT_MODEL ?? null,
            },
          },
          providerResponseJson: {
            image: providerResult.rawResponse,
            copy: copyProviderResponse,
          },
          errorMessage: copyProviderError,
        });
        logger.step('generation.prompt_log.saved', {
          promptVersion: promptPackage.version,
        });
        logger.step('generation.task.succeeded', {
          status: task.status,
          resultCount: task.results.length,
        });
        return task;
      } catch (error) {
        const message = error instanceof Error ? error.message : '生成失败';
        logger.error('generation.provider.failed', {
          message,
          mode,
        });
        const fallbackTask = createMockGenerationTask(input.request);
        const failedTask: GenerationTask = {
          ...fallbackTask,
          id: taskId,
          status: 'failed',
          errorMessage: message,
          results: [],
        };
        await saveTaskWithSessionFallback(store, logger, failedTask, {
          ownerId: input.ownerId,
          sessionId: input.sessionId,
          errorMessage: message,
        });
        logger.step('generation.task.saved', {
          status: failedTask.status,
          resultCount: failedTask.results.length,
        });
        await savePromptLog({
          id: makeId('prompt'),
          taskId,
          promptVersion: promptPackage.version,
          imagePrompt: promptPackage.imagePrompt,
          copyPrompt: promptPackage.copyPrompt,
          providerRequestJson: {
            image: {
              mode,
              hasInputImage: Boolean(input.request.uploadedImageDataUrl),
              inputImageUrl: inputImageSource?.provider === 'tencent-cos' ? null : inputImageUrl ?? null,
              inputImageSource,
            },
            copy: { sent: false, model: process.env.ARK_TEXT_MODEL ?? null },
          },
          providerResponseJson: {
            image: { error: message },
            copy: null,
          },
          errorMessage: message,
        });
        logger.step('generation.prompt_log.saved', {
          promptVersion: promptPackage.version,
          error: true,
        });
        logger.error('generation.task.failed', {
          message,
          mode,
        });
        throw error;
      }
    },

    getPromptLogs() {
      return promptLogs;
    },

    getTask(taskId: string) {
      return store.getTask(taskId);
    },

    getTaskForOwner(ownerId: string, taskId: string) {
      return store.getTaskForOwner(ownerId, taskId);
    },

    listTasksForSession(ownerId: string, sessionId: string) {
      return store.listTasksForSession?.(ownerId, sessionId) ?? Promise.resolve([]);
    },
  };

  async function savePromptLog(log: PromptLogRecord) {
    promptLogs.push(log);
    await store.savePromptLog(log);
  }
}

async function saveTaskWithSessionFallback(
  store: GenerationStore,
  logger: BackendRunLogger,
  task: GenerationTask,
  meta: SaveTaskMeta,
) {
  try {
    await store.saveTask(task, meta);
  } catch (error) {
    if (!meta.sessionId || !isForeignKeyConstraintError(error)) {
      throw error;
    }
    logger.step('generation.session.stale', {
      sessionId: meta.sessionId,
      fallbackSessionId: null,
    });
    await store.saveTask(task, { ...meta, sessionId: null });
  }
}

function isForeignKeyConstraintError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Foreign key constraint') || message.includes('P2003');
}

function createDefaultProvider(): Provider {
  const provider = process.env.GENERATION_PROVIDER?.trim().toLowerCase();
  if (provider === 'apimart') {
    return new APIMartImageProvider();
  }
  const hasArkCredentials = Boolean(process.env.ARK_API_KEY && process.env.ARK_IMAGE_MODEL);
  if (provider !== 'mock' && hasArkCredentials) {
    return new VolcengineSeedreamProvider();
  }
  return {
    async generate() {
      return {
        imageUrl: '/mock-generated/poster-placeholder.svg',
        rawResponse: { provider: 'mock' },
      };
    },
  };
}

function createDefaultImagePublisher() {
  const status = getTencentCosConfigStatus();
  return status.configured ? createTencentCosImagePublisher({ config: status.config }) : undefined;
}

async function publishInputImage(input: {
  asset: ImageAssetRecord;
  ownerId: string;
  taskId: string;
  imagePublisher?: ImageUrlPublisher;
}): Promise<{ url: string; log: InputImageSourceLog } | null> {
  if (process.env.GENERATION_PROVIDER?.trim().toLowerCase() === 'apimart' && input.imagePublisher) {
    return input.imagePublisher.publish({
      asset: input.asset,
      ownerId: input.ownerId,
      taskId: input.taskId,
    });
  }

  const baseUrl = process.env.APP_PUBLIC_BASE_URL?.trim();
  if (baseUrl) {
    const url = `${baseUrl.replace(/\/+$/, '')}/api/image-assets/${encodeURIComponent(input.asset.id)}`;
    return {
      url,
      log: {
        provider: 'app-public-base-url',
        url,
      },
    };
  }

  if (process.env.GENERATION_PROVIDER?.trim().toLowerCase() === 'apimart') {
    const cosStatus = getTencentCosConfigStatus();
    if (cosStatus.hasAnyConfig && cosStatus.missing.length > 0) {
      throw new Error(`腾讯云 COS 配置不完整：缺少 ${cosStatus.missing.join(', ')}；或配置 APP_PUBLIC_BASE_URL`);
    }
    throw new Error('需要配置腾讯云 COS 或 APP_PUBLIC_BASE_URL，才能让 APIMart 访问上传图片');
  }
  return null;
}

function getImageModelName() {
  return process.env.GENERATION_PROVIDER?.trim().toLowerCase() === 'apimart'
    ? process.env.APIMART_IMAGE_MODEL
    : process.env.ARK_IMAGE_MODEL;
}

function getImageSizeLabel() {
  return process.env.GENERATION_PROVIDER?.trim().toLowerCase() === 'apimart'
    ? process.env.APIMART_IMAGE_SIZE ?? '4:5'
    : '1024x1280';
}

function getImageResponseFormatLabel() {
  return process.env.GENERATION_PROVIDER?.trim().toLowerCase() === 'apimart' ? 'url' : 'b64_json';
}

function createDefaultCopyProvider(): CopyProvider {
  const provider = process.env.GENERATION_PROVIDER?.trim().toLowerCase();
  const hasArkCredentials = Boolean(process.env.ARK_API_KEY && process.env.ARK_TEXT_MODEL);
  if (provider !== 'mock' && hasArkCredentials) {
    return new VolcengineTextProvider();
  }
  return {
    async generate() {
      throw new Error('火山方舟文案模型未配置');
    },
  };
}

function buildResult(request: GenerationTaskRequest, providerResult: SeedreamGenerateOutput): GenerationResult {
  const mock = createMockGenerationTask(request).results[0];
  return {
    ...mock,
    id: makeId('result'),
    imageUrl: providerResult.imageUrl ?? mock.imageUrl,
    generatedImageDataUrl: providerResult.imageDataUrl,
  };
}

function applyCopyResult(result: GenerationResult, copy: StructuredMarketingCopy): GenerationResult {
  return {
    ...result,
    title: copy.title,
    publishingCopy: copy.publishingCopy,
    imageText: copy.imageText,
  };
}

function toGeneratedImageAsset(ownerId: string, dataUrl: string): ImageAssetRecord {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  return {
    id: makeId('asset'),
    ownerId,
    kind: 'generated_image',
    mimeType: match?.[1] ?? 'image/png',
    base64: match?.[2] ?? dataUrl,
  };
}

function createMemoryGenerationStore(): GenerationStore {
  const tasks = new Map<string, GenerationTask>();
  const taskMeta = new Map<string, { ownerId: string; sessionId: string | null }>();
  const imageAssets = new Map<string, ImageAssetRecord>();
  return {
    async saveTask(task, meta) {
      tasks.set(task.id, task);
      taskMeta.set(task.id, {
        ownerId: meta?.ownerId ?? 'anonymous',
        sessionId: meta?.sessionId ?? null,
      });
    },
    async savePromptLog() {},
    async saveImageAsset(asset) {
      imageAssets.set(asset.id, asset);
    },
    async getImageAsset(id) {
      return imageAssets.get(id) ?? null;
    },
    async getTask(taskId) {
      return tasks.get(taskId) ?? null;
    },
    async getTaskForOwner(ownerId, taskId) {
      const meta = taskMeta.get(taskId);
      if (meta?.ownerId !== ownerId) return null;
      return tasks.get(taskId) ?? null;
    },
  };
}
