"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox";
import { cn } from "@workspace/ui/lib/utils";
import { type Option, sameOption } from "@/components/product/option";

type OptionComboboxProps = {
  id?: string;
  options: Option[];
  value: string | null;
  label: string;
  placeholder: string;
  empty: string;
  disabled?: boolean;
  clearable?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
  onChange: (value: string | null) => void;
};

export function OptionCombobox({
  id,
  options,
  value,
  label,
  placeholder,
  empty,
  disabled,
  clearable = true,
  invalid,
  describedBy,
  className,
  onChange,
}: OptionComboboxProps) {
  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <Combobox
      items={options}
      value={selected}
      disabled={disabled}
      isItemEqualToValue={sameOption}
      onValueChange={(next: Option | null) => {
        if (next || clearable) {
          onChange(next?.value ?? null);
        }
      }}
    >
      <ComboboxInput
        id={id}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder={placeholder}
        disabled={disabled}
        showClear={clearable && selected !== null}
        className={cn("h-8 bg-card text-[13px] shadow-xs", className)}
      />
      <ComboboxContent>
        <ComboboxEmpty className="px-3 text-[13px]">{empty}</ComboboxEmpty>
        <ComboboxList>
          {(item: Option) => (
            <ComboboxItem key={item.value} value={item} className="text-[13px]">
              <span className="truncate">{item.label}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
