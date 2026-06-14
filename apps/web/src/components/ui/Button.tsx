'use client';

import { LoaderCircle } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      disabled,
      fullWidth = false,
      loading = false,
      loadingLabel = '正在处理',
      size = 'md',
      type = 'button',
      variant = 'primary',
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      aria-busy={loading || undefined}
      className={cn(
        'ui-button',
        `ui-button-${variant}`,
        `ui-button-${size}`,
        fullWidth && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading ? (
        <>
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
          <span>{loadingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  ),
);

Button.displayName = 'Button';
