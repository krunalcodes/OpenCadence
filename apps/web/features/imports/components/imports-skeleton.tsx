import { Skeleton } from "@workspace/ui/components/skeleton";

const steps = ["one", "two", "three", "four"];
const rows = ["one", "two", "three", "four", "five"];

export function ImportsSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-[18px]">
      <div className="mb-1">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-[520px] max-w-full" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border-subtle px-4 py-[13px]">
          {steps.map((step) => (
            <div key={step} className="flex items-center gap-2">
              <Skeleton className="size-5 rounded-[6px]" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
        <div className="flex max-w-[752px] flex-col gap-3.5 px-4 py-4">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-[136px] w-full rounded-lg" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex justify-end border-t border-border-subtle px-4 py-3">
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="border-b border-border-subtle px-4 py-[13px]">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-1.5 h-4 w-64 max-w-full" />
        </div>
        <div className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <div key={row} className="flex items-center gap-4 px-4 py-[11px]">
              <div className="flex-1">
                <Skeleton className="h-4 w-56 max-w-full" />
              </div>
              <Skeleton className="h-[22px] w-24 rounded-[6px]" />
              <Skeleton className="hidden h-4 w-28 @3xl:block" />
              <Skeleton className="hidden h-4 w-10 @3xl:block" />
              <Skeleton className="hidden h-4 w-10 @3xl:block" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
