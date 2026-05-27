import { GET } from '../src/app/api/image-assets/[id]/route';
import { createGenerationStore } from '../src/features/generation/server/generation-store';

describe('image asset API', () => {
  it('returns stored image bytes with the stored content type', async () => {
    const store = createGenerationStore();
    const assetId = `asset_test_png_${Date.now()}`;
    await store.saveImageAsset({
      id: assetId,
      ownerId: 'owner_1',
      kind: 'uploaded_image',
      mimeType: 'image/png',
      base64: Buffer.from('image-bytes').toString('base64'),
    });

    const response = await GET(new Request(`http://localhost/api/image-assets/${assetId}`), {
      params: Promise.resolve({ id: assetId }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('image-bytes');
  });

  it('returns 404 when the image asset does not exist', async () => {
    const response = await GET(new Request('http://localhost/api/image-assets/missing'), {
      params: Promise.resolve({ id: 'missing' }),
    });

    expect(response.status).toBe(404);
  });
});
