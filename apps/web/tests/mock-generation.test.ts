import { createMockGenerationTask } from '../src/features/generation/mock-generation';

describe('createMockGenerationTask', () => {
  it('creates three options for one channel', () => {
    const task = createMockGenerationTask({
      requestText: '给新品奶茶做一张朋友圈宣传图',
      channels: ['wechat'],
      scene: 'new_product',
      style: 'young_trendy',
      campaignInfo: { productName: '柠檬茶', price: '19.9' },
    });

    expect(task.results).toHaveLength(3);
    expect(task.results[0].title).toContain('柠檬茶');
  });

  it('creates one option per channel when multiple channels are selected', () => {
    const task = createMockGenerationTask({
      requestText: '给新品奶茶做宣传图',
      channels: ['wechat', 'xiaohongshu'],
      scene: 'new_product',
      style: 'clean_premium',
      campaignInfo: { productName: '柠檬茶' },
    });

    expect(task.results).toHaveLength(2);
    expect(task.results.map((result) => result.channel)).toEqual(['wechat', 'xiaohongshu']);
  });
});
