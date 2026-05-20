'use client';

type ImageUploaderProps = {
  imageDataUrl?: string;
  onChange: (dataUrl?: string) => void;
};

export function ImageUploader({ imageDataUrl, onChange }: ImageUploaderProps) {
  return (
    <div className="grid gap-3">
      {imageDataUrl ? (
        <>
          <div className="rounded-lg border border-accent bg-white p-2 text-[13px] font-medium text-accent">
            上传成功
          </div>
          <img src={imageDataUrl} alt="已上传图片预览" className="aspect-[4/3] w-full rounded-lg object-cover" />
        </>
      ) : (
        <div className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed border-line bg-canvas px-4 text-center text-sm leading-6 text-muted">
          商品图可选，上传后会优先保持商品一致性
        </div>
      )}

      <input
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => onChange(String(reader.result));
          reader.readAsDataURL(file);
        }}
      />

      {imageDataUrl ? (
        <button type="button" onClick={() => onChange(undefined)} className="rounded-lg border border-line py-2 text-sm">
          移除图片
        </button>
      ) : null}
    </div>
  );
}
