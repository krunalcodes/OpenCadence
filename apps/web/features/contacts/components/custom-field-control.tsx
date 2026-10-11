"use client";

import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Switch } from "@workspace/ui/components/switch";
import { cn } from "@workspace/ui/lib/utils";
import { inputClass } from "@/components/product/styles";
import { OptionCombobox } from "@/features/contacts/components/option-combobox";
import {
  type ContactField,
  maxCustomTextLength,
} from "@/features/contacts/lib/contacts";
import { copy } from "@/features/contacts/lib/copy";
import type { CustomDraft } from "@/features/contacts/lib/form";

const text = copy.sheet;

const labelClass = "text-[13px]";
const errorClass = "text-[13px] text-danger";

type CustomFieldControlProps = {
  field: ContactField;
  value: CustomDraft;
  error?: string;
  disabled: boolean;
  onChange: (value: CustomDraft) => void;
};

export function customFieldId(key: string) {
  return `contact-custom-${key}`;
}

export function CustomFieldControl({
  field,
  value,
  error,
  disabled,
  onChange,
}: CustomFieldControlProps) {
  const id = customFieldId(field.key);
  const errorId = `${id}-error`;

  if (field.type === "boolean") {
    const checked = value === true;
    return (
      <Field
        orientation="horizontal"
        className="items-center justify-between gap-3"
      >
        <FieldLabel htmlFor={id} className={labelClass}>
          {field.label}
        </FieldLabel>
        <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span aria-hidden="true">
            {checked ? text.booleanOn : text.booleanOff}
          </span>
          <Switch
            id={id}
            checked={checked}
            disabled={disabled}
            onCheckedChange={(next) => onChange(next)}
          />
        </span>
      </Field>
    );
  }

  const textValue = typeof value === "string" ? value : "";

  if (field.type === "select") {
    const names = new Set(field.options ?? []);
    if (textValue !== "") {
      names.add(textValue);
    }
    return (
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={id} className={labelClass}>
          {field.label}
        </FieldLabel>
        <OptionCombobox
          id={id}
          options={[...names].map((name) => ({ value: name, label: name }))}
          value={textValue === "" ? null : textValue}
          label={field.label}
          placeholder={text.selectPlaceholder}
          empty={text.selectEmpty}
          disabled={disabled}
          invalid={error !== undefined}
          describedBy={error ? errorId : undefined}
          className="w-full"
          onChange={(next) => onChange(next ?? "")}
        />
        {error ? (
          <FieldError id={errorId} className={errorClass}>
            {error}
          </FieldError>
        ) : null}
      </Field>
    );
  }

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id} className={labelClass}>
        {field.label}
      </FieldLabel>
      <Input
        id={id}
        type={field.type === "date" ? "date" : "text"}
        inputMode={field.type === "number" ? "decimal" : undefined}
        autoComplete="off"
        maxLength={field.type === "text" ? maxCustomTextLength : undefined}
        disabled={disabled}
        value={textValue}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          inputClass,
          "md:text-[13px]",
          field.type !== "text" && "tabular-nums",
        )}
      />
      {error ? (
        <FieldError id={errorId} className={errorClass}>
          {error}
        </FieldError>
      ) : null}
    </Field>
  );
}
