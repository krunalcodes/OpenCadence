import { Skeleton } from "@workspace/ui/components/skeleton";
import { aiCopy } from "@/features/settings/lib/ai-copy";

const fieldKeys = ["base-url", "model", "api-key"];

export function AiSettingsSkeleton() {
  return (
    <div role="status" aria-label={aiCopy.loading}>
      <div className="mb-[22px] flex flex-col gap-2">
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="@container/settings flex flex-col">
        <div className="grid gap-x-10 gap-y-4 border-border-subtle border-b py-7 first:pt-0 last:border-b-0 @4xl/settings:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-2 pt-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3.5 w-64 max-w-full" />
            <Skeleton className="h-3.5 w-60 max-w-full" />
            <Skeleton className="h-3.5 w-56 max-w-full" />
            <Skeleton className="h-3.5 w-40 max-w-full" />
          </div>
          <div className="min-w-0 self-start overflow-hidden rounded-[12px] border border-border bg-card shadow-xs">
            <div className="flex flex-col gap-4 p-5">
              {fieldKeys.map((key) => (
                <div key={key} className="flex flex-col gap-2">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-8 w-full max-w-[420px] rounded-lg" />
                  <Skeleton className="h-3.5 w-72 max-w-full" />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-border-subtle border-t bg-muted/40 px-5 py-3">
              <Skeleton className="h-3.5 w-64 max-w-[45%]" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-32 rounded-lg" />
                <Skeleton className="h-8 w-16 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
