"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { Info, TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import { Spinner } from "@/components/spinner";
import {
  dangerButton,
  dangerOutlineButton,
  dialogActions,
  dialogContent,
  dialogTitle,
  primaryButton,
  secondaryButton,
} from "@/features/settings/components/settings-parts";
import type { WorkspaceRole } from "@/lib/session";

export const headClass =
  "h-auto bg-muted/50 px-5 py-2 text-xs font-medium text-ink-tertiary first:rounded-tl-[12px] last:rounded-tr-[12px]";

export const cellClass = "px-5 py-[11px] text-[13px]";

export const rowClass = "border-border-subtle hover:bg-muted/50";

export const inputClass = cn("bg-card text-[13px] shadow-xs", buttonFocusRing);

export const labelClass = "text-[13px]";

export const errorClass = "text-[13px] text-danger";

export const hintClass = "text-[13px]";

export const primaryButtonClass = primaryButton;

export const secondaryButtonClass = secondaryButton;

export const dangerButtonClass = dangerButton;

export const dangerOutlineButtonClass = dangerOutlineButton;

export const roleLabels: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export const roleSummaries: Record<WorkspaceRole, string> = {
  owner: "Full control, including deleting the workspace.",
  admin: "Manages settings, members and invitations.",
  member: "Works in the workspace without managing it.",
};

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isPast(value: string | null) {
  const date = parseDate(value);
  return date !== null && date.getTime() <= Date.now();
}

type DateTextProps = {
  value: string | null;
  fallback: string;
  className?: string;
};

export function DateText({ value, fallback, className }: DateTextProps) {
  const date = parseDate(value);
  if (!date) {
    return (
      <span className={cn("text-ink-tertiary", className)}>{fallback}</span>
    );
  }
  return (
    <time
      dateTime={date.toISOString()}
      suppressHydrationWarning
      className={cn("tabular-nums", className)}
    >
      {dateFormat.format(date)}
    </time>
  );
}

type PillTone = "success" | "warning" | "danger" | "neutral";

const pillTones: Record<PillTone, string> = {
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  neutral: "bg-border-subtle text-muted-foreground",
};

export function Pill({
  tone,
  children,
}: {
  tone: PillTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2 font-medium text-xs",
        pillTones[tone],
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  );
}

type NoticeProps = {
  tone?: "info" | "warning";
  title: string;
  children?: ReactNode;
  className?: string;
};

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: NoticeProps) {
  const Icon = tone === "info" ? Info : TriangleAlert;
  return (
    <div
      className={cn(
        "flex gap-2 rounded-lg px-3 py-2.5 text-[13px] leading-normal",
        tone === "info" ? "bg-info-surface" : "bg-warning-surface",
        className,
      )}
    >
      <Icon
        aria-hidden
        strokeWidth={1.6}
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "info" ? "text-info" : "text-warning",
        )}
      />
      <p className="min-w-0 text-foreground">
        <span
          className={cn(
            "font-medium",
            tone === "info" ? "text-info" : "text-warning",
          )}
        >
          {title}
        </span>
        {children ? <> {children}</> : null}
      </p>
    </div>
  );
}

type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type SegmentedControlProps<T extends string> = {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onValueChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
};

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onValueChange,
  disabled,
  className,
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      disabled={disabled}
      onValueChange={(next) => {
        const picked = options.find((option) => option.value === next[0]);
        if (picked) {
          onValueChange(picked.value);
        }
      }}
      className={cn(
        "h-8 gap-0 rounded-lg border border-border bg-muted p-0.5",
        className,
      )}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className="h-[26px] min-w-0 rounded-[6px] px-2.5 font-medium text-[12.5px] text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:ring-0 aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
  children?: ReactNode;
  confirmDisabled?: boolean;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
  children,
  confirmDisabled,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className={dialogContent}>
        <DialogHeader>
          <DialogTitle className={dialogTitle}>{title}</DialogTitle>
          <DialogDescription className="text-[13px]">
            {description}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending && !confirmDisabled) {
              onConfirm();
            }
          }}
        >
          {children}
          <div className={dialogActions}>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
              className={secondaryButtonClass}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || confirmDisabled}
              aria-busy={pending || undefined}
              className={dangerButtonClass}
            >
              {pending ? <Spinner /> : null}
              {confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type TableSkeletonProps = {
  columns: string[];
  rows?: number;
};

const skeletonWidths = ["w-36", "w-44", "w-16", "w-20", "w-24", "w-14"];

export function TableSkeleton({ columns, rows = 3 }: TableSkeletonProps) {
  return (
    <Table aria-hidden className="text-[13px]">
      <TableHeader className="[&_tr]:border-border-subtle">
        <TableRow className="hover:bg-transparent">
          {columns.map((column) => (
            <TableHead key={column} className={headClass}>
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }, (_, row) => `row-${row}`).map((row) => (
          <TableRow
            key={row}
            className="border-border-subtle hover:bg-transparent"
          >
            {columns.map((column, index) => (
              <TableCell key={column} className={cellClass}>
                <Skeleton
                  className={cn(
                    "h-[18px]",
                    skeletonWidths[index % skeletonWidths.length],
                  )}
                />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function LoadFailed({
  title,
  onRetry,
  pending,
}: {
  title: string;
  onRetry: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 text-[13px] text-muted-foreground">
        <span className="font-medium text-foreground">{title}</span> The server
        did not answer. Check that the API is running, then try again.
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={onRetry}
        className={secondaryButtonClass}
      >
        {pending ? <Spinner /> : null}
        Try again
      </Button>
    </div>
  );
}

export function useCopy() {
  const [copied, setCopied] = useState(false);

  async function copy(text: string, failure: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      toast.error(failure, {
        description:
          "Your browser blocked access to the clipboard. Select the text and copy it by hand.",
      });
      return false;
    }
  }

  return { copied, copy };
}
