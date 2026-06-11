'use client';

import { X } from 'lucide-react';

type BottomSheetProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export function BottomSheet({ title, open, onClose, children }: BottomSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 px-3">
      <section className="flex max-h-[92dvh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-xl bg-surface p-4 shadow-soft">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full border border-line"
            aria-label="关闭"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto pb-4">{children}</div>

        <div className="-mx-4 -mb-4 shrink-0 border-t border-line bg-surface p-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 w-full rounded-lg bg-accent text-[15px] font-semibold text-white"
          >
            完成
          </button>
        </div>
      </section>
    </div>
  );
}
