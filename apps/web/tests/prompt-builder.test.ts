import { buildPromptPackage } from '../src/features/generation/prompt-builder';
import type { GenerationTaskRequest } from '../src/features/generation/generation-types';

const baseRequest: GenerationTaskRequest = {
  requestText: '给新品柠檬茶做一张朋友圈宣传图，突出第二杯半价',
  channels: ['wechat'],
  scene: 'new_product',
  style: 'young_trendy',
  campaignInfo: {
    storeName: '小巷奶茶',
    productName: '柠檬茶',
    price: '19.9',
    campaignTime: '今天到周日',
    extraSellingPoints: '第二杯半价',
  },
};

describe('buildPromptPackage', () => {
  it('builds no-image prompts that clearly describe atmosphere marketing', () => {
    const prompt = buildPromptPackage({
      request: baseRequest,
      mode: 'text-to-image',
      outputIndex: 0,
    });

    expect(prompt.version).toBe('seedream-marketing-v1');
    expect(prompt.imagePrompt).toContain('无真实商品图');
    expect(prompt.imagePrompt).toContain('氛围型营销图');
    expect(prompt.imagePrompt).toContain('柠檬茶');
    expect(prompt.copyPrompt).toContain('朋友圈/微信群');
  });

  it('builds image-reference prompts with strict product consistency rules', () => {
    const prompt = buildPromptPackage({
      request: { ...baseRequest, uploadedImageDataUrl: 'data:image/png;base64,abc' },
      mode: 'image-to-image',
      outputIndex: 0,
      modificationText: '标题更促销一点',
    });

    expect(prompt.imagePrompt).toContain('保持商品主体一致');
    expect(prompt.imagePrompt).toContain('不得修改包装、Logo、颜色和关键细节');
    expect(prompt.imagePrompt).toContain('标题更促销一点');
  });

  it('builds a copy prompt for structured model output using the final image prompt', () => {
    const prompt = buildPromptPackage({
      request: baseRequest,
      mode: 'text-to-image',
      outputIndex: 0,
      modificationText: '发布文案更适合朋友圈',
    });

    expect(prompt.copyPrompt).toContain('最终图片提示词');
    expect(prompt.copyPrompt).toContain(prompt.imagePrompt);
    expect(prompt.copyPrompt).toContain('只输出 JSON');
    expect(prompt.copyPrompt).toContain('"title"');
    expect(prompt.copyPrompt).toContain('"publishingCopy"');
    expect(prompt.copyPrompt).toContain('"imageText"');
    expect(prompt.copyPrompt).toContain('发布文案更适合朋友圈');
  });

  it('uses server-side template instructions in template mode', () => {
    const prompt = buildPromptPackage({
      request: {
        ...baseRequest,
        requestText: '使用模板：节日商品图',
        templateId: 'tpl_1',
        templateTitle: '节日商品图',
        templateInstruction: '把上传商品放在画面中央，生成中秋节促销海报。',
      },
      mode: 'image-to-image',
      outputIndex: 0,
    });

    expect(prompt.imagePrompt).toContain('模板名称：节日商品图');
    expect(prompt.imagePrompt).toContain('模板内部指令：');
    expect(prompt.imagePrompt).toContain('把上传商品放在画面中央，生成中秋节促销海报。');
    expect(prompt.copyPrompt).toContain('模板名称：节日商品图');
  });
});
