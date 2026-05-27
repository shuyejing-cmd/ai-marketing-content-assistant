import type { GenerationResult } from '../src/features/generation/generation-types';
import { getDirectDownloadImageUrl } from '../src/lib/download';

const result: GenerationResult = {
  id: 'result_1',
  channel: 'wechat',
  style: 'young_trendy',
  title: '标题',
  publishingCopy: '文案',
  imageText: ['标题', '卖点', '行动'],
  imageUrl: '/mock-generated/poster-placeholder.svg',
};

describe('download helpers', () => {
  it('uses generated model output as the direct download image when available', () => {
    expect(
      getDirectDownloadImageUrl({
        ...result,
        generatedImageDataUrl: 'data:image/png;base64,generated',
      }),
    ).toBe('data:image/png;base64,generated');
  });

  it('uses remote model image URLs as direct download images', () => {
    expect(
      getDirectDownloadImageUrl({
        ...result,
        imageUrl: 'https://cdn.example.test/generated.png',
      }),
    ).toBe('https://cdn.example.test/generated.png');
  });

  it('falls back to canvas rendering for mock or missing model output', () => {
    expect(getDirectDownloadImageUrl(result)).toBeNull();
  });
});
