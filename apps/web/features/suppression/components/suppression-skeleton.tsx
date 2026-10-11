import { Skeleton } from "@workspace/ui/components/skeleton";

const rows = ["one", "two", "three", "four", "five", "six", "seven", "eight"];

export function SuppressionSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-[18px]">
      <div className="mb-1 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="mt-2 h-4 w-[560px] max-w-full" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-[13px]">
          <Skeleton className="h-8 w-60" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <div key={row} className="flex items-center gap-4 px-4 py-[11px]">
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-[22px] w-24 rounded-[6px]" />
              <Skeleton className="hidden h-4 w-36 @3xl:block" />
              <div className="flex-1">
                <Skeleton className="hidden h-4 w-48 max-w-full @3xl:block" />
              </div>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="size-7" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
