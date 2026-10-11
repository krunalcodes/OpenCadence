import { Skeleton } from "@workspace/ui/components/skeleton";

const rows = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

export function ContactsSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-[18px]">
      <div className="mb-1 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-2 h-4 w-[520px] max-w-full" />
        </div>
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-[13px]">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="ml-auto h-4 w-24" />
        </div>
        <div className="border-b border-border-subtle bg-muted/50 px-4 py-2">
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <div key={row} className="flex items-center gap-4 px-4 py-[11px]">
              <Skeleton className="size-4 rounded-[4px]" />
              <Skeleton className="h-4 w-[24%] min-w-32" />
              <Skeleton className="h-4 w-[14%]" />
              <Skeleton className="hidden h-4 w-[12%] @3xl:block" />
              <Skeleton className="hidden h-4 w-[14%] @3xl:block" />
              <div className="flex flex-1 gap-1.5">
                <Skeleton className="hidden h-[22px] w-16 rounded-[6px] @3xl:block" />
                <Skeleton className="hidden h-[22px] w-12 rounded-[6px] @3xl:block" />
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
