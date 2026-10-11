import { Skeleton } from "@workspace/ui/components/skeleton";

const rows = ["one", "two", "three", "four", "five"];

export function DomainsSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-[18px]">
      <div className="mb-1 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="mt-2 h-4 w-[640px] max-w-full" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex items-center gap-6 border-b border-border-subtle bg-muted/50 px-4 py-2">
          <div className="flex-1">
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28" />
          <span className="size-7" />
        </div>
        <div className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <div key={row} className="flex items-center gap-6 px-4 py-[11px]">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-44 max-w-full" />
                <Skeleton className="mt-1.5 h-3.5 w-64 max-w-full" />
              </div>
              <Skeleton className="h-[22px] w-24 rounded-[6px]" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="size-7" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const records = ["spf", "dkim", "dmarc", "mx"];

export function DomainSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-3.5">
      <Skeleton className="h-7 w-24" />
      <div className="mb-1 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-7 w-56 max-w-full" />
            <Skeleton className="h-[22px] w-24 rounded-[6px]" />
          </div>
          <Skeleton className="mt-2 h-4 w-[560px] max-w-full" />
        </div>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="size-8" />
      </div>
      <div className="grid min-w-0 gap-[18px] @5xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="border-b border-border-subtle px-4 py-[13px]">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="mt-1.5 h-3.5 w-96 max-w-full" />
          </div>
          <div className="divide-y divide-border-subtle">
            {records.map((record) => (
              <div key={record} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-[22px] w-24 rounded-[6px]" />
                </div>
                <Skeleton className="h-4 w-[520px] max-w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-[18px]">
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-3 h-8 w-full" />
            <Skeleton className="mt-3 h-8 w-32" />
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-3 h-4 w-48 max-w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
