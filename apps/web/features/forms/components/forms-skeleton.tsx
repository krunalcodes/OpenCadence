import { Skeleton } from "@workspace/ui/components/skeleton";

const rows = ["one", "two", "three", "four", "five"];

export function FormsSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-[18px]">
      <div className="mb-1 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="mt-2 h-4 w-[620px] max-w-full" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex items-center gap-4 border-b border-border-subtle bg-muted/50 px-4 py-2">
          <div className="w-[28%]">
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-4 w-14" />
          <div className="flex-1">
            <Skeleton className="h-4 w-10" />
          </div>
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-10" />
          <span className="size-7" />
        </div>
        <div className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <div key={row} className="flex items-center gap-4 px-4 py-[11px]">
              <div className="w-[28%]">
                <Skeleton className="h-4 w-44 max-w-full" />
              </div>
              <Skeleton className="h-[22px] w-20" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-56 max-w-full" />
              </div>
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="size-7" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
