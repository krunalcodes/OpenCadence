"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { Braces } from "lucide-react";
import { type ReactNode, useRef } from "react";
import type { Option } from "@/components/product/option";
import { MergeTagPicker } from "@/features/templates/components/merge-tag-picker";
import { copy } from "@/features/templates/lib/copy";

type TagFieldProps = {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  maxLength: number;
  options: Option[];
  pickerLabel: string;
  extra?: ReactNode;
  onChange: (value: string) => void;
};

export function TagField({
  id,
  label,
  value,
  placeholder,
  maxLength,
  options,
  pickerLabel,
  extra,
  onChange,
}: TagFieldProps) {
  const input = useRef<HTMLInputElement | null>(null);
  const caret = useRef<{ start: number; end: number } | null>(null);

  function remember() {
    const element = input.current;
    if (element && element.selectionStart !== null) {
      caret.current = {
        start: element.selectionStart,
        end: element.selectionEnd ?? element.selectionStart,
      };
    }
  }

  function insert(tag: string) {
    const start = Math.min(caret.current?.start ?? value.length, value.length);
    const end = Math.min(caret.current?.end ?? value.length, value.length);
    const next = `${value.slice(0, start)}${tag}${value.slice(end)}`.slice(
      0,
      maxLength,
    );
    const position = Math.min(start + tag.length, next.length);
    caret.current = { start: position, end: position };
    onChange(next);
    window.requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(position, position);
    });
  }

  const near = maxLength - value.length <= Math.max(20, maxLength * 0.1);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[12.5px] font-medium">
          {label}
        </label>
        {near ? (
          <span className="text-[12px] text-ink-tertiary tabular-nums">
            {copy.editor.counter(value.length, maxLength)}
          </span>
        ) : null}
      </div>
      <InputGroup className="h-8 bg-card shadow-xs">
        <InputGroupInput
          ref={input}
          id={id}
          type="text"
          autoComplete="off"
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onSelect={remember}
          onBlur={remember}
          className="text-[13px] md:text-[13px]"
        />
        <InputGroupAddon
          align="inline-end"
          className="gap-0.5"
          onClick={(event) => {
            if (
              event.target instanceof Element &&
              event.currentTarget.contains(event.target) &&
              !event.target.closest("button")
            ) {
              input.current?.focus();
            }
          }}
        >
          {extra}
          <MergeTagPicker
            options={options}
            align="end"
            onInsert={insert}
            trigger={
              <InputGroupButton
                size="icon-xs"
                variant="ghost"
                aria-label={pickerLabel}
                title={pickerLabel}
              >
                <Braces aria-hidden strokeWidth={1.6} />
              </InputGroupButton>
            }
          />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
