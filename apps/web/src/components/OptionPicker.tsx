'use client';

import { SelectChip } from '@/components/ui/SelectChip';

type OptionPickerProps<T extends string> = {
  multiple?: boolean;
  value: T | T[];
  options: Array<{ value: T; label: string }>;
  onChange: (value: T | T[]) => void;
};

export function OptionPicker<T extends string>({ multiple, value, options, onChange }: OptionPickerProps<T>) {
  const selectedValues = Array.isArray(value) ? value : [value];

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = selectedValues.includes(option.value);
        return (
          <SelectChip
            key={option.value}
            selected={selected}
            onSelectedChange={() => {
              if (!multiple) {
                onChange(option.value);
                return;
              }
              const next = selected
                ? selectedValues.filter((item) => item !== option.value)
                : [...selectedValues, option.value];
              onChange(next);
            }}
          >
            {option.label}
          </SelectChip>
        );
      })}
    </div>
  );
}
