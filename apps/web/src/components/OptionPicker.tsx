'use client';

type OptionPickerProps<T extends string> = {
  multiple?: boolean;
  value: T | T[];
  options: Array<{ value: T; label: string }>;
  onChange: (value: T | T[]) => void;
};

export function OptionPicker<T extends string>({ multiple, value, options, onChange }: OptionPickerProps<T>) {
  const selectedValues = Array.isArray(value) ? value : [value];

  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => {
        const selected = selectedValues.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              if (!multiple) {
                onChange(option.value);
                return;
              }
              const next = selected
                ? selectedValues.filter((item) => item !== option.value)
                : [...selectedValues, option.value];
              onChange(next);
            }}
            className={
              selected
                ? 'rounded-lg bg-accent px-3 py-3 text-sm text-white'
                : 'rounded-lg border border-line px-3 py-3 text-sm text-ink'
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
