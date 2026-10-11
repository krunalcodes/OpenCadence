"use client";

import { Button } from "@workspace/ui/components/button";
import { Calendar } from "@workspace/ui/components/calendar";
import { Input } from "@workspace/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import { cn } from "@workspace/ui/lib/utils";
import { CalendarDays, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import { copy } from "@/components/pickers/copy";
import { inputClass, secondaryButtonClass } from "@/components/product/styles";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  firstWeekday,
  formatIsoDate,
  numericDate,
  parseIsoDate,
  parseTypedDate,
  toIsoDate,
} from "@/lib/date-time";

const text = copy.date;
const earliestYear = 1900;
const yearsAhead = 10;

export type DatePickerProps = {
  id?: string;
  value: string | null;
  min?: string;
  max?: string;
  disabled?: boolean;
  clearable?: boolean;
  invalid?: boolean;
  error?: string | null;
  label?: string;
  placeholder?: string;
  describedBy?: string;
  locale?: string;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  captionLayout?: "label" | "dropdown";
  showToday?: boolean;
  className?: string;
  onChange: (value: string | null) => void;
};

function monthOf(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function DatePicker({
  id,
  value,
  min,
  max,
  disabled,
  clearable = false,
  invalid,
  error,
  label = text.label,
  placeholder = text.placeholder,
  describedBy,
  locale,
  weekStartsOn,
  captionLayout = "label",
  showToday = true,
  className,
  onChange,
}: DatePickerProps) {
  const base = useId();
  const errorId = `${base}-error`;
  const problemId = `${base}-problem`;
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [month, setMonth] = useState(() => monthOf(new Date()));
  const [today, setToday] = useState(() => new Date());

  const selected = parseIsoDate(value);
  const earliest = parseIsoDate(min);
  const latest = parseIsoDate(max);
  const todayIso = toIsoDate(today);
  const shown =
    value === null
      ? null
      : hydrated && selected
        ? formatIsoDate(value, locale)
        : value;
  const example = `${today.getFullYear()}-12-31`;

  const calendarLocale = useMemo(
    () => (locale ? { code: locale } : undefined),
    [locale],
  );

  const labels = useMemo(() => {
    const full = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
    const caption = new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
    });
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" });
    return {
      labelNav: () => text.calendar.navigation,
      labelPrevious: () => text.calendar.previous,
      labelNext: () => text.calendar.next,
      labelMonthDropdown: () => text.calendar.month,
      labelYearDropdown: () => text.calendar.year,
      labelGrid: (date: Date) => caption.format(date),
      labelWeekday: (date: Date) => weekday.format(date),
      labelDayButton: (
        date: Date,
        modifiers: { today?: boolean; selected?: boolean },
      ) =>
        text.calendar.day(
          full.format(date),
          Boolean(modifiers.today),
          Boolean(modifiers.selected),
        ),
    };
  }, [locale]);

  function rangeProblem(iso: string) {
    if (min && earliest && iso < min) {
      return text.tooEarly(formatIsoDate(min, locale));
    }
    if (max && latest && iso > max) {
      return text.tooLate(formatIsoDate(max, locale));
    }
    return null;
  }

  function handleOpen(next: boolean) {
    if (next) {
      const now = new Date();
      setToday(now);
      setTyped("");
      setProblem(null);
      setMonth(monthOf(selected ?? earliest ?? now));
    }
    setOpen(next);
  }

  function commit(next: string | null) {
    onChange(next);
    setOpen(false);
  }

  function handleTyped(next: string) {
    setTyped(next);
    setProblem(null);
    const parsed = parseTypedDate(next, locale, today);
    const date = parsed && !rangeProblem(parsed) ? parseIsoDate(parsed) : null;
    if (date) {
      setMonth(monthOf(date));
    }
  }

  function submitTyped() {
    if (typed.trim() === "") {
      return;
    }
    const parsed = parseTypedDate(typed, locale, today);
    if (!parsed) {
      setProblem(text.unreadable(numericDate(example, locale)));
      return;
    }
    const outside = rangeProblem(parsed);
    if (outside) {
      setProblem(outside);
      return;
    }
    commit(parsed);
  }

  const preview =
    typed.trim() === "" ? null : parseTypedDate(typed, locale, today);
  const previewDate =
    preview && !rangeProblem(preview) ? parseIsoDate(preview) : null;
  const startMonth =
    earliest ??
    (captionLayout === "dropdown" ? new Date(earliestYear, 0, 1) : undefined);
  const endMonth =
    latest ??
    (captionLayout === "dropdown"
      ? new Date(today.getFullYear() + yearsAhead, 11, 31)
      : undefined);
  const blocked = [
    ...(earliest ? [{ before: earliest }] : []),
    ...(latest ? [{ after: latest }] : []),
  ];
  const canClear = clearable && value !== null && !disabled;
  const describedByIds =
    [describedBy, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="relative">
        <Popover open={open} onOpenChange={handleOpen}>
          <PopoverTrigger
            id={id}
            disabled={disabled}
            aria-label={shown ? text.value(label, shown) : label}
            aria-invalid={invalid || error ? true : undefined}
            aria-describedby={describedByIds}
            className={cn(
              "flex h-8 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-card px-2.5 text-left text-[13px] shadow-xs outline-none transition-colors disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive",
              buttonFocusRing,
              canClear && "pr-8",
            )}
          >
            <CalendarDays
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span
              className={cn(
                "truncate tabular-nums",
                shown ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {shown ?? placeholder}
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto gap-2 p-2">
            <Input
              type="text"
              autoComplete="off"
              spellCheck={false}
              aria-label={text.typeLabel}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? problemId : undefined}
              placeholder={text.typePlaceholder(numericDate(example, locale))}
              value={typed}
              onChange={(event) => handleTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitTyped();
                }
              }}
              className={cn(inputClass, "tabular-nums md:text-[13px]")}
            />
            {problem ? (
              <p
                id={problemId}
                role="alert"
                className="max-w-[254px] text-[12.5px] text-danger"
              >
                {problem}
              </p>
            ) : null}
            <Calendar
              mode="single"
              selected={previewDate ?? selected ?? undefined}
              month={month}
              onMonthChange={setMonth}
              onSelect={(next: Date | undefined) => {
                if (next) {
                  commit(toIsoDate(next));
                } else if (previewDate) {
                  commit(toIsoDate(previewDate));
                } else if (clearable) {
                  commit(null);
                } else {
                  setOpen(false);
                }
              }}
              today={today}
              disabled={blocked}
              startMonth={startMonth}
              endMonth={endMonth}
              captionLayout={captionLayout}
              locale={calendarLocale}
              weekStartsOn={
                weekStartsOn ?? (locale ? firstWeekday(locale) : undefined)
              }
              labels={labels}
            />
            {showToday || canClear ? (
              <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
                {showToday ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={rangeProblem(todayIso) !== null}
                    onClick={() => commit(todayIso)}
                    className={cn(
                      secondaryButtonClass,
                      "h-7 px-2.5 text-[12.5px]",
                    )}
                  >
                    {text.today}
                  </Button>
                ) : (
                  <span />
                )}
                {canClear ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => commit(null)}
                    className={cn(
                      "h-7 px-2.5 text-[12.5px] text-muted-foreground",
                      buttonFocusRing,
                    )}
                  >
                    {text.clear}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </PopoverContent>
        </Popover>
        {canClear ? (
          <button
            type="button"
            aria-label={text.clearLabel(label)}
            onClick={() => onChange(null)}
            className={cn(
              "absolute top-1 right-1 flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              buttonFocusRing,
            )}
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
