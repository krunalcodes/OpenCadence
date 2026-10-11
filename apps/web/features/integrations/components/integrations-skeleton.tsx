import { Skeleton } from "@workspace/ui/components/skeleton";

const rows = ["one", "two", "three", "four", "five", "six"];
const catalogRows = ["one", "two", "three"];

export function IntegrationsSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-[18px]">
      <div className="mb-1 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex items-center gap-4 border-b border-border-subtle px-4 py-[13px]">
          <div className="flex-1">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="mt-1.5 h-3.5 w-44" />
          </div>
          <Skeleton className="h-8 w-56" />
        </div>
        <div className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <div key={row} className="flex items-center gap-4 px-4 py-[11px]">
              <Skeleton className="size-7 rounded-[7px]" />
              <div className="flex-1">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="mt-1.5 h-3 w-20" />
              </div>
              <Skeleton className="hidden h-4 w-36 @3xl:block" />
              <Skeleton className="hidden h-[18px] w-20 @3xl:block" />
              <Skeleton className="h-[22px] w-20 rounded-[6px]" />
            </div>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="border-b border-border-subtle px-4 py-[13px]">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-1.5 h-3.5 w-72 max-w-full" />
        </div>
        <div className="divide-y divide-border-subtle">
          {catalogRows.map((row) => (
            <div key={row} className="flex items-center gap-2.5 px-4 py-[11px]">
              <Skeleton className="size-7 rounded-[7px]" />
              <div className="flex-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-1.5 h-3 w-64 max-w-full" />
              </div>
              <Skeleton className="h-7 w-[70px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const activityRows = ["one", "two", "three", "four", "five", "six", "seven"];

export function ActivitySkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-[18px]">
      <div className="mb-1">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-[13px]">
          <Skeleton className="h-8 w-60" />
          <Skeleton className="h-8 w-52" />
        </div>
        <div className="divide-y divide-border-subtle">
          {activityRows.map((row) => (
            <div key={row} className="flex items-center gap-4 px-4 py-[11px]">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="size-7 rounded-[7px]" />
              <Skeleton className="h-4 w-44 max-w-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-52 max-w-full" />
                <Skeleton className="mt-1.5 h-3 w-80 max-w-full" />
              </div>
              <Skeleton className="h-[22px] w-16 rounded-[6px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
