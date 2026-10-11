import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";

const rowWidths = ["w-40", "w-32", "w-36", "w-28"];

type SettingsRowsSkeletonProps = {
  rows?: number;
  label?: string;
  className?: string;
};

export function SettingsRowsSkeleton({
  rows = 2,
  label = "Loading",
  className,
}: SettingsRowsSkeletonProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn("flex flex-col", className)}
    >
      {rowWidths.slice(0, rows).map((width) => (
        <div
          key={width}
          className="flex min-h-[60px] items-center gap-3 border-border-subtle border-b px-5 py-3 last:border-b-0"
        >
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className={cn("h-3.5", width)} />
            <Skeleton className="h-3 w-52 max-w-full" />
          </div>
          <Skeleton className="h-7 w-20 shrink-0 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

type SettingsSectionSkeletonProps = {
  variant?: "form" | "rows";
  rows?: number;
  footer?: boolean;
};

export function SettingsSectionSkeleton({
  variant = "form",
  rows = 2,
  footer = variant === "form",
}: SettingsSectionSkeletonProps) {
  return (
    <div className="grid gap-x-10 gap-y-4 border-border-subtle border-b py-7 first:pt-0 last:border-b-0 @4xl/settings:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-2 pt-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3.5 w-56 max-w-full" />
        <Skeleton className="h-3.5 w-40 max-w-full" />
      </div>
      <div className="min-w-0 self-start overflow-hidden rounded-[12px] border border-border bg-card shadow-xs">
        {variant === "rows" ? (
          <SettingsRowsSkeleton rows={rows} />
        ) : (
          <div className="flex flex-col gap-4 p-5">
            {rowWidths.slice(0, rows).map((width) => (
              <div key={width} className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-8 w-full max-w-[420px] rounded-lg" />
              </div>
            ))}
          </div>
        )}
        {footer ? (
          <div className="flex items-center justify-between gap-3 border-border-subtle border-t bg-muted/40 px-5 py-3">
            <Skeleton className="h-3.5 w-48 max-w-[50%]" />
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SettingsPageSkeleton() {
  return (
    <div role="status" aria-label="Loading settings" className="flex flex-col">
      <div className="mb-[22px] flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="@container/settings flex flex-col">
        <SettingsSectionSkeleton rows={1} />
        <SettingsSectionSkeleton rows={2} />
        <SettingsSectionSkeleton variant="rows" rows={3} />
      </div>
    </div>
  );
}
