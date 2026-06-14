import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  selected?: boolean;
  tone?: 'default' | 'danger';
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      children,
      className,
      label,
      selected,
      tone = 'default',
      type = 'button',
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        'ui-icon-button',
        selected && 'is-selected',
        tone === 'danger' && 'is-danger',
        className,
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  ),
);

IconButton.displayName = 'IconButton';
