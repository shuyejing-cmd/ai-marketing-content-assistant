export type Channel = 'wechat' | 'xiaohongshu' | 'douyin' | 'meituan_dianping';

export type MarketingScene =
  | 'new_product'
  | 'today_special'
  | 'group_buying'
  | 'festival'
  | 'opening'
  | 'best_seller'
  | 'custom';

export type StyleTemplate =
  | 'street_warmth'
  | 'clean_premium'
  | 'young_trendy'
  | 'real_local_shop'
  | 'strong_promotion'
  | 'festival';

export type CampaignInfo = {
  storeName?: string;
  productName?: string;
  price?: string;
  campaignTime?: string;
  address?: string;
  phone?: string;
  extraSellingPoints?: string;
};

export type GenerationTaskRequest = {
  requestText: string;
  uploadedImageDataUrl?: string;
  channels: Channel[];
  scene: MarketingScene;
  style: StyleTemplate;
  campaignInfo: CampaignInfo;
  templateId?: string;
  templateTitle?: string;
  templateInstruction?: string;
};

export type GenerationResult = {
  id: string;
  channel: Channel;
  style: StyleTemplate;
  title: string;
  publishingCopy: string;
  imageText: string[];
  imageUrl?: string;
  generatedImageDataUrl?: string;
  uploadedImageDataUrl?: string;
};

export type GenerationTask = {
  id: string;
  status: 'succeeded' | 'failed';
  errorMessage?: string;
  request: GenerationTaskRequest;
  results: GenerationResult[];
};
