import { channelOptions, sceneOptions, styleOptions } from './generation-options';
import type { GenerationTaskRequest } from './generation-types';

export type PromptMode = 'text-to-image' | 'image-to-image';

export type PromptPackage = {
  version: 'seedream-marketing-v1';
  imagePrompt: string;
  copyPrompt: string;
};

type BuildPromptInput = {
  request: GenerationTaskRequest;
  mode: PromptMode;
  outputIndex: number;
  modificationText?: string;
  templateInstruction?: string;
};

export function buildPromptPackage({
  request,
  mode,
  outputIndex,
  modificationText,
  templateInstruction,
}: BuildPromptInput): PromptPackage {
  const channelLabel = getOptionLabel(channelOptions, request.channels[0] ?? 'wechat');
  const sceneLabel = getOptionLabel(sceneOptions, request.scene);
  const styleLabel = getOptionLabel(styleOptions, request.style);
  const campaignLines = Object.entries(request.campaignInfo)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  const consistencyRule =
    mode === 'image-to-image'
      ? [
          '上传图是用户真实商品或门店素材，必须保持商品主体一致。',
          '不得修改包装、Logo、颜色和关键细节，不得凭空添加不存在的商品成分。',
          '可以优化背景、光影、构图、营销文字和海报氛围。',
        ].join('\n')
      : [
          '用户没有提供真实商品图，本次生成必须是无真实商品图的氛围型营销图。',
          '不要暗示画面中的商品就是用户真实商品，重点表现门店活动氛围和营销信息。',
        ].join('\n');
  const modificationRule = modificationText ? `\n二次修改要求：${modificationText}` : '';
  const effectiveTemplateInstruction = templateInstruction ?? request.templateInstruction;
  const templateLines = effectiveTemplateInstruction
    ? [
        `模板名称：${request.templateTitle ?? '图片模板'}`,
        '模板内部指令：',
        effectiveTemplateInstruction,
        '用户不能自由输入提示词，本次必须严格按模板内部指令、上传图和活动信息生成完整海报。',
      ].join('\n')
    : null;
  const imagePrompt = [
    '你是本地生活小商家的营销海报导演。',
    `生成第 ${outputIndex + 1} 套手机竖版图文营销海报，比例 4:5，适合中文社交平台发布。`,
    `用户需求：${request.requestText || '生成一张本地小店营销宣传图'}`,
    templateLines,
    `发布渠道：${channelLabel}`,
    `营销场景：${sceneLabel}`,
    `视觉风格：${styleLabel}`,
    campaignLines ? `活动信息：\n${campaignLines}` : '活动信息：用户未补充，使用常见小店营销表达。',
    consistencyRule,
    '画面中文字要少而清楚，突出一个主标题、一个核心优惠或卖点、一个行动提示。',
    '整体要像小商家今天能直接发布的营销图，不要做成抽象艺术或模型展示图。',
    modificationRule,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    version: 'seedream-marketing-v1',
    imagePrompt,
    copyPrompt: [
      '你是本地生活小商家的营销文案策划。',
      '为同一张营销海报生成配套结果文案。',
      request.templateTitle ? `模板名称：${request.templateTitle}` : null,
      `发布渠道：${channelLabel}`,
      `用户需求：${request.requestText || '本地门店活动宣传'}`,
      campaignLines ? `活动信息：\n${campaignLines}` : '活动信息：用户未补充。',
      `是否有上传图：${mode === 'image-to-image' ? '有，文案不得暗示商品细节被改变。' : '无，文案应避免暗示是真实商品图。'}`,
      `最终图片提示词：\n${imagePrompt}`,
      '输出要自然、能直接发、不过度夸张。',
      '只输出 JSON，不要输出 Markdown，不要输出解释文字。',
      'JSON 格式必须是：{"title":"结果卡标题","publishingCopy":"可直接复制发布的文案","imageText":["海报主标题","核心卖点或优惠","行动提示"]}。',
      'imageText 必须是 1 到 3 个中文短句。',
      modificationRule,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

function getOptionLabel<T extends string>(options: Array<{ value: T; label: string }>, value: T) {
  return options.find((option) => option.value === value)?.label ?? value;
}
