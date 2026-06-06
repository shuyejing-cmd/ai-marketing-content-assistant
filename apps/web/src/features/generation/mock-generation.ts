import { getPlannedChannels } from './generation-options';
import type { GenerationResult, GenerationTask, GenerationTaskRequest } from './generation-types';

const channelCopy: Record<string, string> = {
  wechat: '适合发朋友圈和微信群，语气自然，熟客看了马上懂。',
  xiaohongshu: '适合小红书种草，标题更抓人，画面更精致。',
  douyin: '适合抖音图文封面，短句大字，点击感更强。',
  meituan_dianping: '适合门店平台展示，信息清楚，价格权益明确。',
};

export function createMockGenerationTask(request: GenerationTaskRequest): GenerationTask {
  const plannedChannels = getPlannedChannels(request.channels);
  const optionCount = plannedChannels.length === 1 ? 3 : plannedChannels.length;
  const productName = request.campaignInfo.productName || extractProductName(request.requestText);

  const results: GenerationResult[] = Array.from({ length: optionCount }, (_, index) => {
    const channel = plannedChannels.length === 1 ? plannedChannels[0] : plannedChannels[index];
    const title = buildTitle(productName, request.campaignInfo.price, index);

    return {
      id: `result_${Date.now()}_${index}`,
      channel,
      style: request.style,
      title,
      publishingCopy: buildPublishingCopy(title, request, channel),
      imageText: buildImageText(title, request),
      imageUrl: '/mock-generated/poster-placeholder.svg',
      uploadedImageDataUrl: request.uploadedImageDataUrl,
    };
  });

  return {
    id: `task_${Date.now()}`,
    status: 'succeeded',
    request,
    results,
  };
}

export function modifyMockGenerationTask(
  previous: GenerationTask,
  selectedResultId: string,
  modificationText: string,
): GenerationTask {
  const results = previous.results.map((result) =>
    result.id === selectedResultId
      ? {
          ...result,
          id: `result_${Date.now()}_modified`,
          title: `${result.title}｜已调整`,
          publishingCopy: `${result.publishingCopy}\n\n修改要求：${modificationText}`,
          imageText: [...result.imageText.slice(0, 2), '已按要求调整'],
        }
      : result,
  );

  return {
    ...previous,
    id: `task_${Date.now()}_modify`,
    results,
  };
}

function extractProductName(requestText: string) {
  return requestText.slice(0, 8) || '门店活动';
}

function buildTitle(productName: string, price: string | undefined, index: number) {
  const suffixes = ['今日推荐', '限时上新', '到店必点'];
  return price ? `${productName} ${price} 元起` : `${productName} ${suffixes[index]}`;
}

function buildPublishingCopy(title: string, request: GenerationTaskRequest, channel: string) {
  const store = request.campaignInfo.storeName ? `${request.campaignInfo.storeName}：` : '';
  const extra = request.campaignInfo.extraSellingPoints ? ` ${request.campaignInfo.extraSellingPoints}` : '';
  return `${store}${title}。${channelCopy[channel]}${extra}`;
}

function buildImageText(title: string, request: GenerationTaskRequest) {
  return [
    title,
    request.campaignInfo.extraSellingPoints || '限时活动',
    request.campaignInfo.campaignTime || '今日可用',
  ];
}
