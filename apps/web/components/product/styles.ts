import { cn } from "@workspace/ui/lib/utils";
import { buttonFocusRing } from "@/components/app-shell/page-header";

export const primaryButtonClass = cn(
  "px-3 text-[13px] hover:bg-brand-hover",
  buttonFocusRing,
);

export const secondaryButtonClass = cn(
  "bg-card px-3 text-[13px] shadow-xs hover:bg-muted",
  buttonFocusRing,
);

export const dangerButtonClass = cn(
  "bg-danger px-3 text-[13px] text-white hover:bg-danger/90",
  buttonFocusRing,
);

export const inputClass = cn("bg-card text-[13px] shadow-xs", buttonFocusRing);

export const segmentedGroupClass =
  "h-8 w-fit gap-0 rounded-lg border border-border bg-muted p-0.5";

export const segmentedItemClass =
  "h-[26px] min-w-0 rounded-[6px] px-2.5 text-[12.5px] font-medium text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs";

export const dialogContentClass = "gap-5 p-5 text-[13px] sm:max-w-[420px]";

export const dialogTitleClass = "text-[15px] font-semibold tracking-[-0.01em]";

export const dialogActionsClass =
  "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";

export const linkButtonClass =
  "inline-flex h-8 items-center justify-center rounded-lg border text-[13px] font-medium whitespace-nowrap transition-colors";

export const tableHeadClass =
  "h-auto bg-muted/50 px-4 py-2 text-xs font-medium text-ink-tertiary";

export const tableCellClass = "px-4 py-[11px] text-[13px]";

export const menuItemClass = "rounded-lg px-2 py-1.5 text-[13px]";
