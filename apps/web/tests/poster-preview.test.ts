import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GenerationResult } from '../src/features/generation/generation-types';
import { PosterPreview } from '../src/components/PosterPreview';

const result: GenerationResult = {
  id: 'result_1',
  channel: 'wechat',
  style: 'young_trendy',
  title: '标题',
  publishingCopy: '文案',
  imageText: ['标题', '卖点', '行动'],
  generatedImageDataUrl: 'data:image/png;base64,generated',
};

describe('PosterPreview', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the full generated image directly instead of wrapping it in the local poster template', () => {
    const html = renderToStaticMarkup(createElement(PosterPreview, { result }));

    expect(html).toContain('data:image/png;base64,generated');
    expect(html).toContain('object-contain');
    expect(html).not.toContain('保留商品图');
    expect(html).not.toContain('无图生成');
    expect(html).not.toContain('标题');
  });
});
