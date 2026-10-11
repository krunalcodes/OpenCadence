"use client";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field";
import type { Option } from "@/components/product/option";
import { OptionMultiSelect } from "@/components/product/option-multi-select";

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
        <OptionMultiSelect
          id={id}
          options={options}
          value={value}
          label={label}
          placeholder={placeholder}
          empty={emptyText}
          disabled={disabled}
          invalid={Boolean(error)}
          describedBy={describedBy}
          onChange={onChange}
        />
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
