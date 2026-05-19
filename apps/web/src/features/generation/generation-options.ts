import type { Channel, MarketingScene, StyleTemplate } from './generation-types';

export const channelOptions: Array<{ value: Channel; label: string }> = [
  { value: 'wechat', label: '朋友圈/微信群' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'douyin', label: '抖音图文/封面' },
  { value: 'meituan_dianping', label: '美团/大众点评' },
];

export const sceneOptions: Array<{ value: MarketingScene; label: string }> = [
  { value: 'new_product', label: '新品推广' },
  { value: 'today_special', label: '今日特价' },
  { value: 'group_buying', label: '团购套餐' },
  { value: 'festival', label: '节日活动' },
  { value: 'opening', label: '开业宣传' },
  { value: 'best_seller', label: '爆款推荐' },
  { value: 'custom', label: '自定义' },
];

export const styleOptions: Array<{ value: StyleTemplate; label: string }> = [
  { value: 'street_warmth', label: '烟火气' },
  { value: 'clean_premium', label: '高级干净' },
  { value: 'young_trendy', label: '年轻潮流' },
  { value: 'real_local_shop', label: '真实小店' },
  { value: 'strong_promotion', label: '促销感强' },
  { value: 'festival', label: '节日氛围' },
];

export function getPlannedChannels(channels: Channel[]): Channel[] {
  const normalized: Channel[] = channels.length > 0 ? channels : ['wechat'];
  return normalized.slice(0, 3);
}
