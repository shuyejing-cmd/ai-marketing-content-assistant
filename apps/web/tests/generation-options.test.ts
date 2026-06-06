import { getPlannedChannels } from '../src/features/generation/generation-options';

describe('getPlannedChannels', () => {
  it('uses wechat as default channel', () => {
    expect(getPlannedChannels([])).toEqual(['wechat']);
  });

  it('limits selected channels to three', () => {
    expect(getPlannedChannels(['wechat', 'xiaohongshu', 'douyin', 'meituan_dianping'])).toEqual([
      'wechat',
      'xiaohongshu',
      'douyin',
    ]);
  });
});
