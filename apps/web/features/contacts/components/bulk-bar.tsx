"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { ListMinus, ListPlus, Tag, Tags, Trash2, X } from "lucide-react";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import type { BulkAction } from "@/features/contacts/lib/contacts";
import { copy } from "@/features/contacts/lib/copy";

const text = copy.bulk;

const actions = [
  { id: "add_to_lists", icon: ListPlus },
  { id: "remove_from_lists", icon: ListMinus },
  { id: "add_tags", icon: Tags },
  { id: "remove_tags", icon: Tag },
] as const;

const actionClass = cn(
  "h-7 gap-1.5 px-2 text-[12.5px] text-foreground hover:bg-muted",
  buttonFocusRing,
);

type BulkBarProps = {
  count: number;
  onAction: (action: BulkAction) => void;
  onClear: () => void;
};

export function BulkBar({ count, onAction, onClear }: BulkBarProps) {
  return (
    <div className="pointer-events-none sticky bottom-4 z-10 flex justify-center">
      <div
        role="toolbar"
        aria-label={text.label}
        className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-card py-1.5 pr-1.5 pl-3.5 shadow-lg"
      >
        <p
          aria-live="polite"
          className="mr-2 text-[13px] font-medium text-foreground tabular-nums"
        >
          {text.selected(count)}
        </p>
        {actions.map(({ id, icon: Icon }) => (
          <Button
            key={id}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onAction(id)}
            className={actionClass}
          >
            <Icon aria-hidden strokeWidth={1.6} />
            {text.actions[id]}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onAction("delete")}
          className={cn(
            actionClass,
            "text-danger hover:bg-danger-surface hover:text-danger",
          )}
        >
          <Trash2 aria-hidden strokeWidth={1.6} />
          {text.actions.delete}
        </Button>
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={text.clear}
          onClick={onClear}
          className={cn(
            "text-muted-foreground hover:bg-muted",
            buttonFocusRing,
          )}
        >
          <X aria-hidden strokeWidth={1.6} />
        </Button>
      </div>
    </div>
  );
}
