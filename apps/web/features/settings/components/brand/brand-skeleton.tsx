import { Skeleton } from "@workspace/ui/components/skeleton";
import { SettingsSectionSkeleton } from "@/features/settings/components/settings-skeleton";
import { brandCopy } from "@/features/settings/lib/brand-copy";

const sectionClass =
  "grid gap-x-10 gap-y-4 border-border-subtle border-b py-7 first:pt-0 last:border-b-0 @4xl/settings:grid-cols-[minmax(0,300px)_minmax(0,1fr)]";

const cardClass =
  "min-w-0 self-start overflow-hidden rounded-[12px] border border-border bg-card shadow-xs";

const colorKeys = ["primary", "page", "email", "text"];

function SectionHeading() {
  return (
    <div className="flex min-w-0 flex-col gap-2 pt-1">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3.5 w-56 max-w-full" />
      <Skeleton className="h-3.5 w-40 max-w-full" />
    </div>
  );
}

function IdentitySkeleton() {
  return (
    <div className={sectionClass}>
      <SectionHeading />
      <div className={cardClass}>
        <div className="flex max-w-[460px] flex-col gap-4 p-5">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-3.5 w-64 max-w-full" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-12" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-16 w-40 rounded-lg" />
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function LookSkeleton() {
  return (
    <div className={sectionClass}>
      <SectionHeading />
      <div className={cardClass}>
        <div className="grid gap-6 p-5 @5xl/settings:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <div className="flex min-w-0 flex-col gap-5">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
              {colorKeys.map((key) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-8 rounded-lg" />
                    <Skeleton className="h-8 w-[104px] rounded-lg" />
                  </div>
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
            <div className="flex max-w-[420px] flex-col gap-2">
              <Skeleton className="h-3.5 w-12" />
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-3.5 w-72 max-w-full" />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-[300px] w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function BrandSettingsSkeleton() {
  return (
    <div role="status" aria-label={brandCopy.loading}>
      <div className="mb-[22px] flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="@container/settings flex flex-col">
        <IdentitySkeleton />
        <LookSkeleton />
        <SettingsSectionSkeleton rows={2} footer={false} />
        <SettingsSectionSkeleton rows={1} />
      </div>
    </div>
  );
}
