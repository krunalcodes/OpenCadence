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
import { Plus } from "lucide-react";
import { useState } from "react";
import { type Option, sameOption } from "@/components/product/option";
import { Spinner } from "@/components/spinner";

const createPrefix = "create:";

type OptionMultiSelectProps = {
  id: string;
  options: Option[];
  value: Option[];
  label: string;
  placeholder: string;
  empty: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  maxCreateLength?: number;
  creating?: boolean;
  createLabel?: (name: string) => string;
  onCreate?: (name: string) => void;
  onChange: (value: Option[]) => void;
};

export function OptionMultiSelect({
  id,
  options,
  value,
  label,
  placeholder,
  empty,
  disabled,
  invalid,
  describedBy,
  maxCreateLength,
  creating,
  createLabel,
  onCreate,
  onChange,
}: OptionMultiSelectProps) {
  const anchor = useComboboxAnchor();
  const [query, setQuery] = useState("");

  const name = query.trim().replace(/\s+/g, " ");
  const known = [...options, ...value].some(
    (option) => option.label.toLowerCase() === name.toLowerCase(),
  );
  const canCreate =
    onCreate !== undefined &&
    name !== "" &&
    !known &&
    (maxCreateLength === undefined || name.length <= maxCreateLength);
  const items = canCreate
    ? [...options, { value: `${createPrefix}${name}`, label: name }]
    : options;

  return (
    <Combobox
      multiple
      autoHighlight
      items={items}
      value={value}
      inputValue={query}
      disabled={disabled}
      isItemEqualToValue={sameOption}
      onInputValueChange={(next: string) => setQuery(next)}
      onValueChange={(next: Option[]) => {
        const created = next.find((option) =>
          option.value.startsWith(createPrefix),
        );
        if (created) {
          setQuery("");
          onCreate?.(created.label);
          return;
        }
        onChange(next);
      }}
    >
      <ComboboxChips
        ref={anchor}
        className="min-h-8 bg-card py-[3px] text-[13px] shadow-xs focus-within:border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background data-disabled:opacity-50"
      >
        <ComboboxValue>
          {(selected: Option[]) => (
            <>
              {selected.map((option) => (
                <ComboboxChip
                  key={option.value}
                  aria-label={option.label}
                  className="h-[22px] max-w-full rounded-[6px] bg-border-subtle pl-2 text-xs"
                >
                  <span className="truncate">{option.label}</span>
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                id={id}
                aria-label={label}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                disabled={disabled}
                placeholder={selected.length === 0 ? placeholder : undefined}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && query.trim() !== "") {
                    event.preventDefault();
                  }
                }}
                className="h-[22px] min-w-24 px-1 text-[13px] placeholder:text-muted-foreground"
              />
              {creating ? (
                <Spinner className="mr-1 size-3.5 text-ink-tertiary" />
              ) : null}
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty className="px-3 text-[13px]">{empty}</ComboboxEmpty>
        <ComboboxList>
          {(item: Option) => (
            <ComboboxItem key={item.value} value={item} className="text-[13px]">
              {item.value.startsWith(createPrefix) ? (
                <>
                  <Plus aria-hidden strokeWidth={1.6} />
                  <span className="truncate">
                    {createLabel ? createLabel(item.label) : item.label}
                  </span>
                </>
              ) : (
                <span className="truncate">{item.label}</span>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
