"use client";

import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import {
  errorClass,
  inputClass,
  labelClass,
} from "@/features/settings/components/workspace-parts";
import { brandCopy } from "@/features/settings/lib/brand-copy";
import { normalizeHex } from "@/features/settings/lib/brand-form";

type ColorFieldProps = {
  id: string;
  label: string;
  hint: string;
  value: string;
  fallback: string;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
};

export function ColorField({
  id,
  label,
  hint,
  value,
  fallback,
  error,
  disabled,
  onChange,
  onBlur,
}: ColorFieldProps) {
  const text = brandCopy.look;
  const resolved = normalizeHex(value) ?? fallback;

  return (
    <Field data-invalid={error ? true : undefined} className="gap-1.5">
      <FieldLabel htmlFor={id} className={labelClass}>
        {label}
      </FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={text.picker(label)}
          value={resolved}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "size-8 shrink-0 cursor-pointer appearance-none overflow-hidden rounded-lg border border-border bg-card p-0 shadow-xs disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0",
            buttonFocusRing,
          )}
        />
        <Input
          id={id}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={7}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-label={text.hex(label)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          className={cn(inputClass, "w-[104px] font-mono md:text-[13px]")}
        />
      </div>
      {error ? (
        <FieldError id={`${id}-error`} className={errorClass}>
          {error}
        </FieldError>
      ) : (
        <p id={`${id}-hint`} className="text-ink-tertiary text-xs">
          {hint}
        </p>
      )}
    </Field>
  );
}
