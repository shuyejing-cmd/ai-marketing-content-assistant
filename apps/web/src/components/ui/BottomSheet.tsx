'use client';

import { X } from 'lucide-react';
import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

export type BottomSheetProps = {
  children: ReactNode;
  footer?: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
};

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function BottomSheet({
  children,
  footer,
  onOpenChange,
  open,
  title,
}: BottomSheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onOpenChangeRef.current(false);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  function trapFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return (
    <div className="ui-sheet-layer">
      <button
        aria-label="关闭面板遮罩"
        className="ui-sheet-backdrop"
        onClick={() => onOpenChange(false)}
        type="button"
      />
      <section
        ref={panelRef}
        aria-label={title}
        aria-modal="true"
        className="ui-sheet"
        onKeyDown={trapFocus}
        role="dialog"
      >
        <div className="ui-sheet-handle" />
        <header className="ui-sheet-header">
          <h2>{title}</h2>
          <button
            ref={closeButtonRef}
            aria-label="关闭面板"
            className="ui-sheet-close"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>
        <div className="ui-sheet-content">{children}</div>
        {footer ? <footer className="ui-sheet-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
