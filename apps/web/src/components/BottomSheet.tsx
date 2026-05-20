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
      <section className="max-h-[82dvh] w-full max-w-[430px] overflow-auto rounded-t-xl bg-surface p-4 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full border border-line"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
