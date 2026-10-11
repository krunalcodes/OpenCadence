"use client";

import { cn } from "@workspace/ui/lib/utils";
import { useId, useState } from "react";
import { copy } from "@/components/pickers/copy";
import { DatePicker } from "@/components/pickers/date-picker";
import { TimePicker } from "@/components/pickers/time-picker";
import { useHydrated } from "@/hooks/use-hydrated";
import { joinInstant, splitInstant, zoneId, zoneName } from "@/lib/date-time";

const text = copy.dateTime;

type Draft = { date: string | null; time: number | null };

export type DateTimePickerProps = {
  id?: string;
  value: string | null;
  min?: string;
  max?: string;
  step?: number;
  disabled?: boolean;
  invalid?: boolean;
  error?: string | null;
  label?: string;
  dateLabel?: string;
  timeLabel?: string;
  describedBy?: string;
  locale?: string;
  showZone?: boolean;
  className?: string;
  onChange: (value: string | null) => void;
};

export function DateTimePicker({
  id,
  value,
  min,
  max,
  step = 15,
  disabled,
  invalid,
  error,
  label = text.label,
  dateLabel = text.date,
  timeLabel = text.time,
  describedBy,
  locale,
  showZone = true,
  className,
  onChange,
}: DateTimePickerProps) {
  const generated = useId();
  const base = id ?? generated;
  const dateId = `${base}-date`;
  const timeId = `${base}-time`;
  const zoneTextId = `${base}-zone`;
  const errorId = `${base}-error`;
  const hydrated = useHydrated();
  const [draft, setDraft] = useState<Draft>(() => splitInstant(value));
  const [seen, setSeen] = useState(value);

  if (value !== seen) {
    setSeen(value);
    const current = joinInstant(draft.date, draft.time);
    const same =
      value !== null &&
      current !== null &&
      new Date(value).getTime() === new Date(current).getTime();
    if (!same && !(value === null && current === null)) {
      setDraft(splitInstant(value));
    }
  }

  const earliest = splitInstant(min);
  const latest = splitInstant(max);
  const complete = draft.date !== null && draft.time !== null;
  const skipped = complete && joinInstant(draft.date, draft.time) === null;
  const problem = error ?? (skipped ? text.skipped : null);
  const bad = invalid || problem !== null;
  const moment = value ? new Date(value) : new Date();
  const zone = hydrated ? zoneName(moment, locale) : "";
  const described =
    [
      describedBy,
      showZone && hydrated ? zoneTextId : null,
      problem ? errorId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  function update(next: Draft) {
    setDraft(next);
    const joined = joinInstant(next.date, next.time);
    if (joined !== value) {
      onChange(joined);
    }
  }

  return (
    <fieldset
      aria-label={label}
      disabled={disabled}
      className={cn("flex min-w-0 flex-col gap-1.5", className)}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={dateId} className="text-[13px] font-medium">
            {dateLabel}
          </label>
          <DatePicker
            id={dateId}
            value={draft.date}
            min={earliest.date ?? undefined}
            max={latest.date ?? undefined}
            disabled={disabled}
            invalid={bad}
            label={dateLabel}
            describedBy={described}
            locale={locale}
            onChange={(date) => update({ ...draft, date })}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={timeId} className="text-[13px] font-medium">
            {timeLabel}
          </label>
          <TimePicker
            id={timeId}
            value={draft.time}
            min={
              draft.date !== null && draft.date === earliest.date
                ? (earliest.time ?? undefined)
                : undefined
            }
            max={
              draft.date !== null && draft.date === latest.date
                ? (latest.time ?? undefined)
                : undefined
            }
            step={step}
            disabled={disabled}
            invalid={bad}
            label={timeLabel}
            describedBy={described}
            locale={locale}
            onChange={(time) => update({ ...draft, time })}
          />
        </div>
      </div>
      {showZone ? (
        <p
          id={zoneTextId}
          className="min-h-[19px] text-[12.5px] text-ink-tertiary"
        >
          {hydrated ? text.zone(zone, zoneId()) : null}
        </p>
      ) : null}
      {problem ? (
        <p id={errorId} role="alert" className="text-[12.5px] text-danger">
          {problem}
        </p>
      ) : null}
    </fieldset>
  );
}
