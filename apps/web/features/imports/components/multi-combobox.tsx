"use client";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@workspace/ui/components/combobox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field";
import type { Option } from "@/features/imports/lib/imports";

type MultiComboboxProps = {
  id: string;
  label: string;
  optional: string;
  hint: string;
  placeholder: string;
  emptyText: string;
  noOptions: string;
  options: Option[];
  value: Option[];
  error?: string;
  disabled: boolean;
  onChange: (value: Option[]) => void;
};

export function MultiCombobox({
  id,
  label,
  optional,
  hint,
  placeholder,
  emptyText,
  noOptions,
  options,
  value,
  error,
  disabled,
  onChange,
}: MultiComboboxProps) {
  const anchor = useComboboxAnchor();
  const describedBy = error ? `${id}-error` : `${id}-hint`;

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id} className="text-[13px]">
        {label}
        <span className="font-normal text-ink-tertiary">{optional}</span>
      </FieldLabel>
      {options.length === 0 ? (
        <p className="text-[13px] text-ink-tertiary">{noOptions}</p>
      ) : (
        <Combobox
          multiple
          items={options}
          value={value}
          disabled={disabled}
          onValueChange={(next: Option[]) => onChange(next)}
        >
          <ComboboxChips
            ref={anchor}
            className="bg-card text-[13px] shadow-xs focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
          >
            <ComboboxValue>
              {(selected: Option[]) => (
                <>
                  {selected.map((item) => (
                    <ComboboxChip
                      key={item.value}
                      className="rounded-[6px] bg-border-subtle"
                    >
                      {item.label}
                    </ComboboxChip>
                  ))}
                  <ComboboxChipsInput
                    id={id}
                    placeholder={selected.length === 0 ? placeholder : ""}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    className="text-[13px]"
                  />
                </>
              )}
            </ComboboxValue>
          </ComboboxChips>
          <ComboboxContent anchor={anchor}>
            <ComboboxEmpty>{emptyText}</ComboboxEmpty>
            <ComboboxList>
              {(item: Option) => (
                <ComboboxItem
                  key={item.value}
                  value={item}
                  className="text-[13px]"
                >
                  {item.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      )}
      {error ? (
        <FieldError id={`${id}-error`} className="text-[13px] text-danger">
          {error}
        </FieldError>
      ) : (
        <FieldDescription id={`${id}-hint`} className="text-[13px]">
          {hint}
        </FieldDescription>
      )}
    </Field>
  );
}
