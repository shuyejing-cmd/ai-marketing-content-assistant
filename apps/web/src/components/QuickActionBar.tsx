'use client';

import { CalendarDays, ImagePlus, Megaphone, Palette, SendToBack } from 'lucide-react';

type ActionKey = 'upload' | 'channel' | 'scene' | 'style' | 'info';

type QuickActionBarProps = {
  onOpen: (key: ActionKey) => void;
  uploadedImageDataUrl?: string;
};

const actions: Array<{ key: ActionKey; label: string; icon: typeof ImagePlus }> = [
  { key: 'upload', label: '上传图片', icon: ImagePlus },
  { key: 'channel', label: '发布渠道', icon: SendToBack },
  { key: 'scene', label: '营销场景', icon: Megaphone },
  { key: 'style', label: '风格模板', icon: Palette },
  { key: 'info', label: '活动信息', icon: CalendarDays },
];

export function QuickActionBar({ onOpen, uploadedImageDataUrl }: QuickActionBarProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {actions.map((action) => {
        const Icon = action.icon;
        const hasUploadedImage = action.key === 'upload' && uploadedImageDataUrl;

        return (
          <button
            key={action.key}
            type="button"
            onClick={() => onOpen(action.key)}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] text-ink"
          >
            {hasUploadedImage ? (
              <img
                src={uploadedImageDataUrl}
                alt="已上传商品图缩略图"
                className="h-5 w-5 rounded-full object-cover"
              />
            ) : (
              <Icon size={15} aria-hidden="true" />
            )}
            {hasUploadedImage ? '已上传商品图' : action.label}
          </button>
        );
      })}
    </div>
  );
}
