import { createGenerationService } from './generation-service';
import { createGenerationStore } from './generation-store';

const globalRuntime = globalThis as unknown as {
  generationService?: ReturnType<typeof createGenerationService>;
  generationServiceConfigSignature?: string;
};

export function getGenerationService() {
  const signature = getGenerationRuntimeSignature();
  if (!globalRuntime.generationService || globalRuntime.generationServiceConfigSignature !== signature) {
    globalRuntime.generationService = createGenerationService({
      store: createGenerationStore(),
    });
    globalRuntime.generationServiceConfigSignature = signature;
  }
  return globalRuntime.generationService;
}

function getGenerationRuntimeSignature() {
  return JSON.stringify({
    generationProvider: process.env.GENERATION_PROVIDER ?? '',
    apimartApiKey: fingerprintEnv('APIMART_API_KEY'),
    apimartBaseUrl: process.env.APIMART_BASE_URL ?? '',
    apimartImageModel: process.env.APIMART_IMAGE_MODEL ?? '',
    apimartImageSize: process.env.APIMART_IMAGE_SIZE ?? '',
    apimartImageResolution: process.env.APIMART_IMAGE_RESOLUTION ?? '',
    apimartImageQuality: process.env.APIMART_IMAGE_QUALITY ?? '',
    apimartProxyUrl: process.env.APIMART_PROXY_URL ?? '',
    appPublicBaseUrl: process.env.APP_PUBLIC_BASE_URL ?? '',
    tencentCosSecretId: fingerprintEnv('TENCENT_COS_SECRET_ID'),
    tencentCosSecretKey: fingerprintEnv('TENCENT_COS_SECRET_KEY'),
    tencentCosBucket: process.env.TENCENT_COS_BUCKET ?? '',
    tencentCosRegion: process.env.TENCENT_COS_REGION ?? '',
    tencentCosUploadPrefix: process.env.TENCENT_COS_UPLOAD_PREFIX ?? '',
    tencentCosSignedUrlTtlSeconds: process.env.TENCENT_COS_SIGNED_URL_TTL_SECONDS ?? '',
    arkApiKey: fingerprintEnv('ARK_API_KEY'),
    arkBaseUrl: process.env.ARK_BASE_URL ?? '',
    arkImageModel: process.env.ARK_IMAGE_MODEL ?? '',
    arkTextModel: process.env.ARK_TEXT_MODEL ?? '',
  });
}

function fingerprintEnv(name: string) {
  const value = process.env[name] ?? '';
  if (!value) return '';
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return `${value.length}:${hash.toString(36)}`;
}
