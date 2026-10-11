import { Skeleton } from "@workspace/ui/components/skeleton";

const sections = ["audience", "fields", "texts"];

export function FormSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-[22px] w-16" />
        <Skeleton className="ml-auto h-4 w-28" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="size-8" />
      </div>
      <Skeleton className="h-8 w-64" />
      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          {sections.map((section) => (
            <div
              key={section}
              className="overflow-hidden rounded-xl border border-border bg-card shadow-xs"
            >
              <div className="flex flex-col gap-1.5 border-b border-border-subtle px-4 py-[13px]">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3.5 w-56 max-w-full" />
              </div>
              <div className="flex flex-col gap-3 p-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-4 w-80 max-w-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-[13px]">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3.5 w-48 max-w-full" />
            </div>
            <Skeleton className="h-8 w-40" />
          </div>
          <div className="bg-muted/50 px-4 py-8">
            <div className="mx-auto flex max-w-[28rem] flex-col gap-3 rounded-2xl border border-border bg-card p-6">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="mt-2 h-7 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="mt-3 h-4 w-16" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
