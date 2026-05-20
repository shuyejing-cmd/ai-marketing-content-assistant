'use client';

import { CalendarDays, ImagePlus, Megaphone, Palette, SendToBack } from 'lucide-react';

type QuickActionBarProps = {
  onOpen: (key: 'upload' | 'channel' | 'scene' | 'style' | 'info') => void;
};

const actions = [
  { key: 'upload', label: '上传图片', icon: ImagePlus },
  { key: 'channel', label: '发布渠道', icon: SendToBack },
  { key: 'scene', label: '营销场景', icon: Megaphone },
  { key: 'style', label: '风格模板', icon: Palette },
  { key: 'info', label: '活动信息', icon: CalendarDays },
] as const;

export function QuickActionBar({ onOpen }: QuickActionBarProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.key}
            type="button"
            onClick={() => onOpen(action.key)}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] text-ink"
          >
            <Icon size={15} aria-hidden="true" />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
