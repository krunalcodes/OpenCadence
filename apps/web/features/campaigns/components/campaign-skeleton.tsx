import { Skeleton } from "@workspace/ui/components/skeleton";

const sections = ["audience", "content", "sender"];

export function CampaignSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-[22px] w-16" />
        <Skeleton className="ml-auto h-4 w-28" />
      </div>
      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          {sections.map((section) => (
            <div
              key={section}
              className="overflow-hidden rounded-xl border border-border bg-card shadow-xs"
            >
              <div className="flex flex-col gap-1.5 border-b border-border-subtle px-4 py-[13px]">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3.5 w-56 max-w-full" />
              </div>
              <div className="flex flex-col gap-3 p-4">
                <Skeleton className="h-8 w-64 max-w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-4 w-72 max-w-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="flex flex-col gap-2 px-4 pt-4 pb-3.5">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3.5 w-40" />
          </div>
          <div className="flex flex-col gap-2 border-t border-border-subtle px-4 py-3.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="flex flex-col gap-2 border-t border-border-subtle px-4 py-3.5">
            <Skeleton className="h-8 w-full" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
