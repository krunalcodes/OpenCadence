import { cn } from "@workspace/ui/lib/utils";
import { X } from "lucide-react";
import { focusRing } from "@/components/app-shell/page-header";

export type FilterChip = { id: string; label: string; remove: () => void };

type FilterChipsProps = {
  chips: FilterChip[];
  label: string;
  clearLabel: string;
  removeLabel: (label: string) => string;
  onClear: () => void;
};

export function FilterChips({
  chips,
  label,
  clearLabel,
  removeLabel,
  onClear,
}: FilterChipsProps) {
  if (chips.length === 0) {
    return null;
  }
  return (
    <ul aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <li
          key={chip.id}
          className="inline-flex h-[22px] max-w-64 items-center gap-0.5 rounded-[6px] bg-border-subtle pr-0.5 pl-2 text-xs font-medium text-foreground"
        >
          <span className="truncate">{chip.label}</span>
          <button
            type="button"
            aria-label={removeLabel(chip.label)}
            onClick={chip.remove}
            className={cn(
              "grid size-[18px] shrink-0 place-items-center rounded-[4px] text-muted-foreground hover:bg-accent hover:text-foreground",
              focusRing,
            )}
          >
            <X aria-hidden className="size-3" strokeWidth={1.8} />
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={onClear}
          className={cn(
            "rounded-[6px] px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground",
            focusRing,
          )}
        >
          {clearLabel}
        </button>
      </li>
    </ul>
  );
}
