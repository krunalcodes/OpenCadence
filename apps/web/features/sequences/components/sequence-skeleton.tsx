import { Skeleton } from "@workspace/ui/components/skeleton";

export const builderHeightClass = "h-[calc(100dvh-214px)] min-h-[540px]";

const flow = ["first", "second", "third"];

export function BuilderSkeleton({ label }: { label?: string }) {
  return (
    <div
      aria-busy="true"
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs ${builderHeightClass}`}
    >
      {label ? <span className="sr-only">{label}</span> : null}
      <div className="flex h-10 items-center gap-4 border-b border-border-subtle px-4">
        <Skeleton className="h-3.5 w-80 max-w-[60%]" />
        <Skeleton className="ml-auto h-3.5 w-28" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center gap-0 overflow-hidden bg-background pt-10">
        <Skeleton className="h-10 w-52 rounded-full" />
        {flow.map((item) => (
          <div key={item} className="flex flex-col items-center">
            <span className="h-8 w-px bg-border" />
            <Skeleton className="h-[26px] w-28 rounded-full" />
            <span className="h-8 w-px bg-border" />
            <div className="flex h-[132px] w-[304px] flex-col gap-2.5 rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <Skeleton className="size-5 rounded-[6px]" />
                <Skeleton className="h-3.5 w-12" />
                <Skeleton className="ml-auto h-3.5 w-24" />
              </div>
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3.5 w-56" />
              <Skeleton className="mt-auto h-3.5 w-40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SequenceSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-6 w-64 max-w-[40%]" />
        <Skeleton className="h-[22px] w-16 rounded-[6px]" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="size-8" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="ml-auto h-4 w-40" />
      </div>
      <BuilderSkeleton />
    </div>
  );
}

const rows = ["one", "two", "three", "four", "five", "six"];

export function SequencesSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-[18px]">
      <div className="mb-1 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-2 h-4 w-[620px] max-w-full" />
        </div>
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-[13px]">
          <Skeleton className="h-8 w-[300px] max-w-[45%] rounded-lg" />
          <Skeleton className="h-8 w-64 max-w-[35%]" />
          <Skeleton className="ml-auto h-4 w-24" />
        </div>
        <div className="flex items-center gap-4 border-b border-border-subtle bg-muted/50 px-4 py-2">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-16" />
          <span className="size-7" />
        </div>
        <div className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <div key={row} className="flex items-center gap-4 px-4 py-[11px]">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-56 max-w-full" />
              </div>
              <Skeleton className="h-[22px] w-24 rounded-[6px]" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="size-7" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
