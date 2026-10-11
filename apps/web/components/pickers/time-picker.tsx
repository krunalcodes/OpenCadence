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
import { useId, useMemo, useState } from "react";
import { copy } from "@/components/pickers/copy";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  formatMinutes,
  type HourCycle,
  localeHourCycle,
  minutesPerDay,
  minutesToTime,
  parseTypedTime,
} from "@/lib/date-time";

const text = copy.time;
const lastMinute = minutesPerDay - 1;

type TimeOption = { value: number; label: string };

export type TimePickerProps = {
  id?: string;
  value: number | null;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  clearable?: boolean;
  invalid?: boolean;
  error?: string | null;
  label?: string;
  placeholder?: string;
  describedBy?: string;
  locale?: string;
  hourCycle?: HourCycle;
  className?: string;
  onChange: (value: number | null) => void;
};

function sameTime(a: TimeOption, b: TimeOption) {
  return a.value === b.value;
}

function timeLabel(option: TimeOption) {
  return option.label;
}

function squash(value: string) {
  return value.toLowerCase().replace(/[\s.]/g, "");
}

export function TimePicker({
  id,
  value,
  min = 0,
  max = lastMinute,
  step = 15,
  disabled,
  clearable = false,
  invalid,
  error,
  label = text.label,
  placeholder = text.placeholder,
  describedBy,
  locale,
  hourCycle,
  className,
  onChange,
}: TimePickerProps) {
  const base = useId();
  const errorId = `${base}-error`;
  const hydrated = useHydrated();
  const [query, setQuery] = useState("");

  const cycle = hydrated ? (hourCycle ?? localeHourCycle(locale)) : "h23";
  const first = Math.max(0, min);
  const last = Math.min(minutesPerDay, max);
  const stride = Math.max(1, Math.floor(step));

  const { options, selected, items, outOfRange } = useMemo(() => {
    const labelOf = (minutes: number) => {
      if (!hydrated) {
        return minutesToTime(minutes);
      }
      if (minutes >= minutesPerDay && cycle === "h12") {
        return text.endOfDay;
      }
      return formatMinutes(minutes, cycle, locale);
    };
    const option = (minutes: number): TimeOption => ({
      value: minutes,
      label: labelOf(minutes),
    });

    const values = new Set<number>();
    for (
      let minutes = Math.ceil(first / stride) * stride;
      minutes <= last;
      minutes += stride
    ) {
      values.add(minutes);
    }
    if (value !== null) {
      values.add(value);
    }
    const all = [...values].sort((a, b) => a - b).map(option);
    const chosen = value === null ? null : option(value);

    const needle = squash(query);
    if (needle === "") {
      return { options: all, selected: chosen, items: all, outOfRange: false };
    }
    const parsed = parseTypedTime(query, cycle, locale);
    const typed = parsed.filter(
      (minutes) => minutes >= first && minutes <= last,
    );
    const matched = all.filter(
      (item) =>
        !typed.includes(item.value) &&
        (squash(item.label).includes(needle) ||
          minutesToTime(item.value).includes(needle)),
    );
    return {
      options: all,
      selected: chosen,
      items: [...typed.map(option), ...matched],
      outOfRange: parsed.length > 0 && typed.length === 0,
    };
  }, [first, last, stride, value, query, cycle, locale, hydrated]);

  const typedTimes =
    query === ""
      ? []
      : parseTypedTime(query, cycle, locale).filter(
          (minutes) => minutes >= first && minutes <= last,
        );
  const earliest = options[0]?.label ?? "";
  const latest = options[options.length - 1]?.label ?? "";

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Combobox
        items={items}
        value={selected}
        disabled={disabled}
        filter={null}
        autoHighlight
        itemToStringLabel={timeLabel}
        isItemEqualToValue={sameTime}
        onInputValueChange={(next: string, details: { reason: string }) => {
          if (details.reason === "input-change") {
            setQuery(next);
          } else if (query !== "") {
            setQuery("");
          }
        }}
        onValueChange={(next: TimeOption | null) => {
          if (next || clearable) {
            onChange(next?.value ?? null);
          }
        }}
      >
        <ComboboxInput
          id={id}
          aria-label={label}
          aria-invalid={invalid || error ? true : undefined}
          aria-describedby={
            [describedBy, error ? errorId : null].filter(Boolean).join(" ") ||
            undefined
          }
          autoComplete="off"
          placeholder={placeholder}
          disabled={disabled}
          showClear={clearable && selected !== null}
          onBlur={() => {
            const [only, other] = typedTimes;
            if (only !== undefined && other === undefined && only !== value) {
              onChange(only);
            }
          }}
          className="h-8 w-full bg-card text-[13px] tabular-nums shadow-xs"
        />
        <ComboboxContent>
          <ComboboxEmpty className="px-3 text-left text-[13px]">
            {outOfRange ? text.outOfRange(earliest, latest) : text.noMatch}
          </ComboboxEmpty>
          <ComboboxList>
            {(item: TimeOption) => (
              <ComboboxItem
                key={item.value}
                value={item}
                className="text-[13px] tabular-nums"
              >
                <span className="truncate">{item.label}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {error ? (
        <p id={errorId} role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
