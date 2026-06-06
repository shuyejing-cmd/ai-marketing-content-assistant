import { createTencentCosImagePublisher } from '../src/features/generation/server/tencent-cos-image-publisher';
import type { ImageAssetRecord } from '../src/features/generation/server/generation-service';

const imageAsset: ImageAssetRecord = {
  id: 'asset_1',
  ownerId: 'owner_1',
  kind: 'uploaded_image',
  mimeType: 'image/jpeg',
  base64: Buffer.from('jpeg-bytes').toString('base64'),
};

describe('Tencent COS image publisher', () => {
  it('uploads uploaded image bytes and returns a private signed URL', async () => {
    const client = {
      putObject: vi.fn((params, callback) => callback(null, { statusCode: 200 })),
      getObjectUrl: vi.fn((params, callback) =>
        callback(null, {
          Url: `https://${params.Bucket}.cos.${params.Region}.myqcloud.com/${params.Key}?q-signature=signed`,
        }),
      ),
    };
    const publisher = createTencentCosImagePublisher({
      client,
      now: () => new Date('2026-05-27T02:00:00.000Z'),
      config: {
        secretId: 'secret_id',
        secretKey: 'secret_key',
        bucket: 'poster-inputs-1250000000',
        region: 'ap-guangzhou',
        uploadPrefix: 'apimart-inputs',
        signedUrlTtlSeconds: 1800,
      },
    });

    const published = await publisher.publish({
      asset: imageAsset,
      ownerId: 'owner_1',
      taskId: 'task_1',
    });

    expect(client.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'poster-inputs-1250000000',
        Region: 'ap-guangzhou',
        Key: 'apimart-inputs/2026/05/27/owner_1/task_1/asset_1.jpg',
        Body: Buffer.from('jpeg-bytes'),
        ContentType: 'image/jpeg',
      }),
      expect.any(Function),
    );
    expect(client.getObjectUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'poster-inputs-1250000000',
        Region: 'ap-guangzhou',
        Key: 'apimart-inputs/2026/05/27/owner_1/task_1/asset_1.jpg',
        Sign: true,
        Expires: 1800,
      }),
      expect.any(Function),
    );
    expect(published.url).toContain('q-signature=signed');
    expect(published.log).toEqual({
      provider: 'tencent-cos',
      bucket: 'poster-inputs-1250000000',
      region: 'ap-guangzhou',
      objectKey: 'apimart-inputs/2026/05/27/owner_1/task_1/asset_1.jpg',
      expiresInSeconds: 1800,
      expiresAt: '2026-05-27T02:30:00.000Z',
    });
  });

  it('fails clearly when required COS configuration is missing', async () => {
    const publisher = createTencentCosImagePublisher({
      client: {
        putObject: vi.fn(),
        getObjectUrl: vi.fn(),
      },
      config: {
        secretId: '',
        secretKey: '',
        bucket: 'poster-inputs-1250000000',
        region: '',
      },
    });

    await expect(
      publisher.publish({
        asset: imageAsset,
        ownerId: 'owner_1',
        taskId: 'task_1',
      }),
    ).rejects.toThrow('腾讯云 COS 配置不完整');
  });
});
