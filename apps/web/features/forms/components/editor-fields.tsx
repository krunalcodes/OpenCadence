"use client";

import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import { inputClass } from "@/components/product/styles";

type FieldBlockProps = {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
};

export function noteId(id: string) {
  return `${id}-note`;
}

export function FieldBlock({
  id,
  label,
  hint,
  error,
  className,
  children,
}: FieldBlockProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-foreground">
        {label}
      </label>
      {children}
      {error || hint ? (
        <p
          id={noteId(id)}
          role={error ? "alert" : undefined}
          className={cn(
            "text-[12.5px]",
            error ? "text-danger" : "text-ink-tertiary",
          )}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  maxLength: number;
  type?: "text" | "email" | "url";
  rows?: number;
  disabled?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  onChange: (value: string) => void;
};

export function TextField({
  id,
  label,
  value,
  placeholder,
  maxLength,
  type = "text",
  rows,
  disabled,
  error,
  hint,
  className,
  onChange,
}: TextFieldProps) {
  const describedBy = error || hint ? noteId(id) : undefined;
  return (
    <FieldBlock
      id={id}
      label={label}
      hint={hint}
      error={error}
      className={className}
    >
      {rows ? (
        <Textarea
          id={id}
          rows={rows}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(inputClass, "min-h-[64px] md:text-[13px]")}
        />
      ) : (
        <Input
          id={id}
          type={type}
          inputMode={type === "text" ? undefined : type}
          autoComplete="off"
          spellCheck={type === "text" ? undefined : false}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(inputClass, "md:text-[13px]")}
        />
      )}
    </FieldBlock>
  );
}
