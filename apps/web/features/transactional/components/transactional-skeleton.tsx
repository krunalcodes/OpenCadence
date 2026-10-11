import { Skeleton } from "@workspace/ui/components/skeleton";

const rows = ["one", "two", "three", "four", "five", "six", "seven", "eight"];

export function TransactionalSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-[18px]">
      <div className="mb-1">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-[13px]">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-60" />
        </div>
        <div className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <div key={row} className="flex items-center gap-4 px-4 py-[11px]">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-48 max-w-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-72 max-w-full" />
              </div>
              <Skeleton className="size-7 rounded-[7px]" />
              <Skeleton className="hidden h-4 w-32 @3xl:block" />
              <Skeleton className="h-[22px] w-20 rounded-[6px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
