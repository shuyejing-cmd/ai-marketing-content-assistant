import COS from 'cos-nodejs-sdk-v5';

const DEFAULT_UPLOAD_PREFIX = 'apimart-inputs';
const DEFAULT_SIGNED_URL_TTL_SECONDS = 1800;

type CosCallback<T> = (error: Error | null, data: T) => void;

type CosClient = {
  putObject(params: Record<string, unknown>, callback: CosCallback<unknown>): void;
  getObjectUrl(params: Record<string, unknown>, callback: CosCallback<{ Url?: string }>): string | void;
};

export type PublishableImageAsset = {
  id: string;
  mimeType: string;
  base64: string;
};

export type TencentCosImagePublisherConfig = {
  secretId?: string;
  secretKey?: string;
  bucket?: string;
  region?: string;
  uploadPrefix?: string;
  signedUrlTtlSeconds?: number;
};

export type PublishedImageLog = {
  provider: 'tencent-cos';
  bucket: string;
  region: string;
  objectKey: string;
  expiresInSeconds: number;
  expiresAt: string;
};

export type PublishedImage = {
  url: string;
  log: PublishedImageLog;
};

export type ImageUrlPublisher = {
  publish(input: { asset: PublishableImageAsset; ownerId: string; taskId: string }): Promise<PublishedImage>;
};

export function createTencentCosImagePublisher(options: {
  config?: TencentCosImagePublisherConfig;
  client?: CosClient;
  now?: () => Date;
} = {}): ImageUrlPublisher {
  const config = normalizeConfig(options.config ?? readTencentCosConfig());
  const now = options.now ?? (() => new Date());
  let client = options.client;

  return {
    async publish(input) {
      assertCompleteConfig(config);
      const objectKey = buildObjectKey({
        uploadPrefix: config.uploadPrefix,
        now: now(),
        ownerId: input.ownerId,
        taskId: input.taskId,
        assetId: input.asset.id,
        mimeType: input.asset.mimeType,
      });
      const cosClient =
        client ??
        (new COS({
          SecretId: config.secretId,
          SecretKey: config.secretKey,
        }) as unknown as CosClient);
      client = cosClient;

      await putObject(cosClient, {
        Bucket: config.bucket,
        Region: config.region,
        Key: objectKey,
        Body: decodeBase64(input.asset.base64),
        ContentType: input.asset.mimeType,
      });

      const url = await getSignedObjectUrl(cosClient, {
        Bucket: config.bucket,
        Region: config.region,
        Key: objectKey,
        Sign: true,
        Method: 'GET',
        Expires: config.signedUrlTtlSeconds,
      });

      return {
        url,
        log: {
          provider: 'tencent-cos',
          bucket: config.bucket,
          region: config.region,
          objectKey,
          expiresInSeconds: config.signedUrlTtlSeconds,
          expiresAt: new Date(now().getTime() + config.signedUrlTtlSeconds * 1000).toISOString(),
        },
      };
    },
  };
}

export function readTencentCosConfig(env: NodeJS.ProcessEnv = process.env): TencentCosImagePublisherConfig {
  return {
    secretId: env.TENCENT_COS_SECRET_ID,
    secretKey: env.TENCENT_COS_SECRET_KEY,
    bucket: env.TENCENT_COS_BUCKET,
    region: env.TENCENT_COS_REGION,
    uploadPrefix: env.TENCENT_COS_UPLOAD_PREFIX,
    signedUrlTtlSeconds: readPositiveInteger(env.TENCENT_COS_SIGNED_URL_TTL_SECONDS, DEFAULT_SIGNED_URL_TTL_SECONDS),
  };
}

export function getTencentCosConfigStatus(env: NodeJS.ProcessEnv = process.env) {
  const config = normalizeConfig(readTencentCosConfig(env));
  const missing = getMissingConfigKeys(config);
  const hasAnyConfig = Boolean(
    config.secretId ||
      config.secretKey ||
      config.bucket ||
      config.region ||
      env.TENCENT_COS_UPLOAD_PREFIX ||
      env.TENCENT_COS_SIGNED_URL_TTL_SECONDS,
  );
  return {
    config,
    configured: missing.length === 0,
    hasAnyConfig,
    missing,
  };
}

function normalizeConfig(config: TencentCosImagePublisherConfig): Required<TencentCosImagePublisherConfig> {
  return {
    secretId: config.secretId?.trim() ?? '',
    secretKey: config.secretKey?.trim() ?? '',
    bucket: config.bucket?.trim() ?? '',
    region: config.region?.trim() ?? '',
    uploadPrefix: trimSlashes(config.uploadPrefix?.trim() || DEFAULT_UPLOAD_PREFIX),
    signedUrlTtlSeconds: config.signedUrlTtlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS,
  };
}

function assertCompleteConfig(config: Required<TencentCosImagePublisherConfig>) {
  const missing = getMissingConfigKeys(config);
  if (missing.length > 0) {
    throw new Error(`腾讯云 COS 配置不完整：缺少 ${missing.join(', ')}`);
  }
}

function getMissingConfigKeys(config: Required<TencentCosImagePublisherConfig>) {
  return [
    ['TENCENT_COS_SECRET_ID', config.secretId],
    ['TENCENT_COS_SECRET_KEY', config.secretKey],
    ['TENCENT_COS_BUCKET', config.bucket],
    ['TENCENT_COS_REGION', config.region],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

function buildObjectKey(input: {
  uploadPrefix: string;
  now: Date;
  ownerId: string;
  taskId: string;
  assetId: string;
  mimeType: string;
}) {
  const year = String(input.now.getUTCFullYear());
  const month = String(input.now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(input.now.getUTCDate()).padStart(2, '0');
  return [
    input.uploadPrefix,
    year,
    month,
    day,
    sanitizePathSegment(input.ownerId),
    sanitizePathSegment(input.taskId),
    `${sanitizePathSegment(input.assetId)}.${extensionForMimeType(input.mimeType)}`,
  ]
    .filter(Boolean)
    .join('/');
}

function decodeBase64(value: string) {
  const base64 = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  return Buffer.from(base64, 'base64');
}

function putObject(client: CosClient, params: Record<string, unknown>) {
  return new Promise<void>((resolve, reject) => {
    client.putObject(params, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function getSignedObjectUrl(client: CosClient, params: Record<string, unknown>) {
  return new Promise<string>((resolve, reject) => {
    const returnedUrl = client.getObjectUrl(params, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      if (!data?.Url) {
        reject(new Error('腾讯云 COS 未返回签名 URL'));
        return;
      }
      resolve(data.Url);
    });
    if (typeof returnedUrl === 'string' && returnedUrl) {
      resolve(returnedUrl);
    }
  });
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'bin';
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || 'unknown';
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

function readPositiveInteger(raw: string | undefined, fallback: number) {
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
