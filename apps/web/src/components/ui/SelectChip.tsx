'use client';

import { Check } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type SelectChipProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange'
> & {
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
};

export function SelectChip({
  children,
  className,
  disabled,
  onSelectedChange,
  selected,
  type = 'button',
  ...props
}: SelectChipProps) {
  return (
    <button
      aria-pressed={selected}
      className={cn('ui-chip', selected && 'is-selected', className)}
      disabled={disabled}
      onClick={() => onSelectedChange(!selected)}
      type={type}
      {...props}
    >
      {selected && <Check aria-hidden="true" className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}
