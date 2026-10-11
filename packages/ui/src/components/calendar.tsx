"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "cn";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import * as React from "react";
import {
  type DayButton,
  DayPicker,
  getDefaultClassNames,
  type Locale,
} from "react-day-picker";

const navButtonClass =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors select-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover aria-disabled:pointer-events-none aria-disabled:opacity-40";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  locale,
  weekStartsOn,
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();
  const code = locale?.code;
  const firstDay = weekStartsOn ?? locale?.options?.weekStartsOn ?? 1;

  const intlFormatters = React.useMemo(() => {
    const caption = new Intl.DateTimeFormat(code, {
      month: "long",
      year: "numeric",
    });
    const month = new Intl.DateTimeFormat(code, { month: "short" });
    const year = new Intl.DateTimeFormat(code, { year: "numeric" });
    const weekday = new Intl.DateTimeFormat(code, { weekday: "short" });
    const day = new Intl.DateTimeFormat(code, { day: "numeric" });
    return {
      formatCaption: (date: Date) => caption.format(date),
      formatMonthDropdown: (date: Date) => month.format(date),
      formatYearDropdown: (date: Date) => year.format(date),
      formatWeekdayName: (date: Date) => weekday.format(date),
      formatDay: (date: Date) => day.format(date),
    };
  }, [code]);

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "group/calendar bg-popover p-1 text-[13px] text-popover-foreground [--cell-radius:var(--radius-md)] [--cell-size:--spacing(8.5)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className,
      )}
      captionLayout={captionLayout}
      locale={locale}
      weekStartsOn={firstDay}
      formatters={{ ...intlFormatters, ...formatters }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months,
        ),
        month: cn("flex w-full flex-col gap-2", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex h-8 w-full items-center justify-between gap-1",
          defaultClassNames.nav,
        ),
        button_previous: cn(navButtonClass, defaultClassNames.button_previous),
        button_next: cn(navButtonClass, defaultClassNames.button_next),
        month_caption: cn(
          "flex h-8 w-full items-center justify-center px-8",
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          "z-10 flex h-8 items-center justify-center gap-1 text-[13px] font-semibold",
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          "relative rounded-md transition-colors hover:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-popover",
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn(
          "absolute inset-0 cursor-pointer bg-popover opacity-0",
          defaultClassNames.dropdown,
        ),
        caption_label: cn(
          "text-[13px] font-semibold tracking-[-0.005em] select-none",
          captionLayout === "label"
            ? ""
            : "flex h-7 items-center gap-1 rounded-md pr-1 pl-2 [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
          defaultClassNames.caption_label,
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "flex h-7 w-(--cell-size) flex-1 items-center justify-center text-xs font-medium text-ink-tertiary select-none",
          defaultClassNames.weekday,
        ),
        week: cn("mt-0.5 flex w-full", defaultClassNames.week),
        week_number_header: cn(
          "w-(--cell-size) select-none",
          defaultClassNames.week_number_header,
        ),
        week_number: cn(
          "text-xs text-ink-tertiary tabular-nums select-none",
          defaultClassNames.week_number,
        ),
        day: cn(
          "group/day relative size-(--cell-size) flex-1 p-0 text-center select-none",
          defaultClassNames.day,
        ),
        range_start: cn(
          "rounded-l-(--cell-radius) bg-accent",
          defaultClassNames.range_start,
        ),
        range_middle: cn("bg-accent", defaultClassNames.range_middle),
        range_end: cn(
          "rounded-r-(--cell-radius) bg-accent",
          defaultClassNames.range_end,
        ),
        today: cn(defaultClassNames.today),
        outside: cn(defaultClassNames.outside),
        disabled: cn(defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          );
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            );
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4", className)}
                {...props}
              />
            );
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          );
        },
        DayButton: ({ ...props }) => (
          <CalendarDayButton locale={locale} {...props} />
        ),
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  ...props
}: React.ComponentProps<typeof DayButton> & { locale?: Partial<Locale> }) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  const edge = Boolean(modifiers.range_start || modifiers.range_end);
  const middle = Boolean(modifiers.range_middle);
  const filled = edge || Boolean(modifiers.selected && !middle);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected={filled || undefined}
      data-today={modifiers.today || undefined}
      className={cn(
        "relative size-(--cell-size) rounded-(--cell-radius) border-0 text-[13px] leading-none font-normal text-foreground tabular-nums transition-colors hover:bg-accent focus-visible:z-10 focus-visible:border-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
        modifiers.outside && "text-ink-tertiary",
        modifiers.today &&
          "font-semibold after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-current",
        modifiers.today && !filled && "text-primary",
        middle && "rounded-none hover:bg-transparent",
        filled &&
          "bg-primary font-medium text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
        modifiers.disabled && "pointer-events-none opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
