import { cn } from "@workspace/ui/lib/utils";
import { Check } from "lucide-react";
import { copy } from "@/features/imports/lib/copy";

const text = copy.steps;

export function StepHeader({ current }: { current: number }) {
  return (
    <ol
      aria-label={text.label}
      className="flex flex-wrap items-center gap-x-2.5 gap-y-2"
    >
      {text.titles.map((title, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;
        return (
          <li
            key={title}
            aria-current={active ? "step" : undefined}
            className="flex items-center gap-2.5"
          >
            {index > 0 ? (
              <span aria-hidden="true" className="h-px w-5 bg-border" />
            ) : null}
            <span className="flex items-center gap-2">
              <span
                aria-hidden={done || undefined}
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-[6px] text-xs font-medium tabular-nums",
                  active && "bg-primary text-primary-foreground",
                  done && "bg-success-surface text-success",
                  !active && !done && "bg-border-subtle text-ink-tertiary",
                )}
              >
                {done ? (
                  <Check aria-hidden className="size-3" strokeWidth={2.2} />
                ) : (
                  number
                )}
              </span>
              <span
                className={cn(
                  "text-[13px] font-medium whitespace-nowrap",
                  active
                    ? "text-foreground"
                    : done
                      ? "text-muted-foreground"
                      : "text-ink-tertiary",
                )}
              >
                {title}
                {done ? <span className="sr-only">, {text.done}</span> : null}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
