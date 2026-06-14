'use client';

import { useRef, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';

export type SegmentedTabItem = {
  label: string;
  value: string;
  disabled?: boolean;
};

export type SegmentedTabsProps = {
  value: string;
  items: SegmentedTabItem[];
  onValueChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
};

export function SegmentedTabs({
  ariaLabel = '分段选项',
  className,
  items,
  onValueChange,
  value,
}: SegmentedTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    event.preventDefault();
    const enabledIndexes = items
      .map((item, itemIndex) => (item.disabled ? -1 : itemIndex))
      .filter((itemIndex) => itemIndex >= 0);
    const currentPosition = enabledIndexes.indexOf(index);
    let nextIndex = index;

    if (event.key === 'Home') nextIndex = enabledIndexes[0];
    if (event.key === 'End') nextIndex = enabledIndexes[enabledIndexes.length - 1];
    if (event.key === 'ArrowRight') {
      nextIndex = enabledIndexes[(currentPosition + 1) % enabledIndexes.length];
    }
    if (event.key === 'ArrowLeft') {
      nextIndex =
        enabledIndexes[(currentPosition - 1 + enabledIndexes.length) % enabledIndexes.length];
    }

    onValueChange(items[nextIndex].value);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div
      aria-label={ariaLabel}
      className={cn('ui-segmented', className)}
      role="tablist"
    >
      {items.map((item, index) => (
        <button
          ref={(element) => {
            tabRefs.current[index] = element;
          }}
          aria-selected={value === item.value}
          className={cn(value === item.value && 'is-selected')}
          disabled={item.disabled}
          key={item.value}
          onClick={() => onValueChange(item.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          role="tab"
          tabIndex={value === item.value ? 0 : -1}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
