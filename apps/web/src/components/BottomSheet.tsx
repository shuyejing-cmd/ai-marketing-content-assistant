'use client';

import { Button } from '@/components/ui/Button';
import { BottomSheet as UiBottomSheet } from '@/components/ui/BottomSheet';

type BottomSheetProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export function BottomSheet({ title, open, onClose, children }: BottomSheetProps) {
  return (
    <UiBottomSheet
      footer={
        <Button fullWidth onClick={onClose}>
          完成
        </Button>
      }
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      open={open}
      title={title}
    >
      {children}
    </UiBottomSheet>
  );
}
