import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export function Field({ className, error, hint, label, ...props }: FieldProps) {
  const id = props.id ?? toId(label);
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <label className="ui-field" htmlFor={id}>
      <span className="ui-field-label">{label}</span>
      <input
        aria-describedby={descriptionId}
        aria-invalid={Boolean(error)}
        className={className}
        id={id}
        {...props}
      />
      {error ? (
        <span className="ui-field-error" id={`${id}-error`}>
          <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
          {error}
        </span>
      ) : hint ? (
        <span className="ui-field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export function TextArea({
  className,
  error,
  hint,
  label,
  maxLength,
  ...props
}: TextAreaProps) {
  const id = props.id ?? toId(label);
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <label className="ui-field" htmlFor={id}>
      <span className="ui-field-label">{label}</span>
      <textarea
        aria-describedby={descriptionId}
        aria-invalid={Boolean(error)}
        className={className}
        id={id}
        maxLength={maxLength}
        {...props}
      />
      {error ? (
        <span className="ui-field-error" id={`${id}-error`}>
          <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
          {error}
        </span>
      ) : hint ? (
        <span className="ui-field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
      {maxLength ? <span className="ui-field-count">最多 {maxLength} 字</span> : null}
    </label>
  );
}

export function SurfaceCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('ui-surface-card', className)}>{children}</div>;
}

type FeedbackTone = 'success' | 'warning' | 'error' | 'info';

const feedbackIcons: Record<FeedbackTone, LucideIcon> = {
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
  info: Info,
};

export function Feedback({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone: FeedbackTone;
}) {
  const Icon = feedbackIcons[tone];
  return (
    <div
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={cn('ui-feedback', `ui-feedback-${tone}`, className)}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export type ConfigSummaryItem = {
  label: string;
  value: ReactNode;
};

export function ConfigSummary({
  editLabel = '编辑生成配置',
  items,
  onEdit,
  title = '当前生成配置',
}: {
  editLabel?: string;
  items: ConfigSummaryItem[];
  onEdit?: () => void;
  title?: string;
}) {
  return (
    <div className="ui-config-summary">
      <div className="ui-config-heading">
        <span>{title}</span>
        {onEdit ? (
          <button aria-label={editLabel} onClick={onEdit} type="button">
            编辑
          </button>
        ) : null}
      </div>
      <dl>
        {items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function toId(label: string) {
  return label.trim().replace(/\s+/g, '-').toLowerCase();
}
