import { Skeleton } from "@workspace/ui/components/skeleton";

const stats = ["sent", "opens", "replies", "bounces"];
const lanes = ["campaigns", "sequences", "transactional", "warm-up"];
const sends = ["one", "two", "three", "four", "five"];
const mailboxes = ["one", "two", "three", "four"];

export function OverviewSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="@container flex min-w-0 flex-col gap-[18px]"
    >
      <div className="mb-1 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-[30px] w-60 max-w-full rounded-lg" />
      </div>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border-subtle shadow-xs @md:grid-cols-2 @4xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat} className="bg-card px-[18px] py-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2.5 h-7 w-28" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center gap-4 border-b border-border-subtle px-4 py-[13px]">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-1.5 h-3 w-80 max-w-full" />
          </div>
          <Skeleton className="h-4 w-48 max-w-full" />
        </div>
        <div className="px-4 pt-9 pb-4">
          {lanes.map((lane, index) => (
            <div
              key={lane}
              className="grid h-[46px] grid-cols-[92px_minmax(0,1fr)] items-center border-t border-border-subtle"
            >
              <Skeleton className="h-4 w-16" />
              <Skeleton
                className="h-7 rounded-[7px]"
                style={{
                  marginLeft: `${12 + index * 9}%`,
                  width: `${34 - index * 5}%`,
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-[18px] @5xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] @[87.5rem]:grid-cols-[minmax(0,1fr)_400px]">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center gap-4 border-b border-border-subtle px-4 py-[13px]">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-1.5 h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-7 w-16 rounded-lg" />
          </div>
          <div className="divide-y divide-border-subtle">
            {sends.map((row) => (
              <div key={row} className="flex items-center gap-4 px-4 py-[11px]">
                <div className="flex w-[30%] flex-col gap-1.5">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-3 w-48 max-w-full" />
                </div>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-[22px] w-20 rounded-[6px]" />
                <Skeleton className="h-3 min-w-0 flex-1" />
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-10" />
              </div>
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center gap-4 border-b border-border-subtle px-4 py-[13px]">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-44 max-w-full" />
              <Skeleton className="mt-1.5 h-3 w-20" />
            </div>
            <Skeleton className="h-7 w-16 rounded-lg" />
          </div>
          <div className="divide-y divide-border-subtle">
            {mailboxes.map((row) => (
              <div
                key={row}
                className="flex items-center gap-2.5 px-4 py-[11px]"
              >
                <Skeleton className="size-7 rounded-[7px]" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-36 max-w-full" />
                  <Skeleton className="mt-1.5 h-3 w-24" />
                </div>
                <Skeleton className="h-[18px] w-20" />
                <Skeleton className="h-[22px] w-16 rounded-[6px]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
