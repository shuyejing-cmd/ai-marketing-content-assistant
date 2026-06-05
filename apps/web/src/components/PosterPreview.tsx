import type { GenerationResult } from '@/features/generation/generation-types';

export function PosterPreview({ result }: { result: GenerationResult }) {
  const [headline, benefit, footer] = result.imageText;
  const generatedImage = result.generatedImageDataUrl ?? (isMockImageUrl(result.imageUrl) ? undefined : result.imageUrl);
  const heroImage = generatedImage ?? result.uploadedImageDataUrl;

  if (generatedImage) {
    return (
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-black">
        <img src={generatedImage} alt="" className="h-full w-full object-contain" />
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-[#efe4d2] p-4">
      <div className="absolute inset-x-4 top-4 h-[46%] overflow-hidden rounded-lg bg-[#203b35]">
        {heroImage ? (
          <img src={heroImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center px-6 text-center text-[15px] font-semibold leading-6 text-white">
            通用营销主视觉
          </div>
        )}
      </div>

      <div className="absolute left-4 top-4 rounded-br-lg bg-black/55 px-2 py-1 text-[11px] text-white">
        {result.uploadedImageDataUrl ? '保留商品图' : '无图生成'}
      </div>

      <div className="absolute inset-x-4 bottom-4 rounded-lg bg-white/95 p-3 shadow-soft">
        <p className="text-[22px] font-bold leading-7 text-ink">{headline}</p>
        <p className="mt-2 text-[15px] font-semibold text-warm">{benefit}</p>
        <p className="mt-1 text-[12px] leading-5 text-muted">{footer}</p>
      </div>
    </div>
  );
}

function isMockImageUrl(value: string | undefined) {
  return !value || value.includes('/mock-generated/');
}
