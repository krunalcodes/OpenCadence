import { Skeleton } from "@workspace/ui/components/skeleton";

const rows = ["one", "two", "three", "four", "five", "six"];

export function WarmupSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-[18px]">
      <div className="mb-1">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="mt-2 h-4 w-[720px] max-w-full" />
        <Skeleton className="mt-1.5 h-4 w-80 max-w-full" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-[13px]">
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <div key={row} className="flex items-center gap-4 px-4 py-[11px]">
              <Skeleton className="size-7 rounded-[7px]" />
              <div className="flex-1">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="mt-1.5 h-3 w-36" />
              </div>
              <Skeleton className="h-[18px] w-8 rounded-full" />
              <Skeleton className="h-[22px] w-36 rounded-[6px]" />
              <Skeleton className="hidden h-4 w-32 @3xl:block" />
              <Skeleton className="hidden h-4 w-24 @3xl:block" />
              <Skeleton className="hidden h-[18px] w-20 @3xl:block" />
              <Skeleton className="size-7" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
