import { Skeleton } from "@workspace/ui/components/skeleton";

export const editorHeightClass = "h-[calc(100dvh-118px)] min-h-[600px]";

export function EditorCanvasSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-border bg-card shadow-xs lg:grid-cols-[minmax(0,1fr)_288px]"
    >
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-7 w-20" />
        <Skeleton className="ml-auto h-7 w-28" />
        <Skeleton className="h-7 w-20" />
      </div>
      <div className="row-span-2 hidden flex-col gap-4 border-l border-border-subtle p-4 lg:flex">
        <Skeleton className="h-4 w-20" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
      </div>
      <div className="flex min-h-0 justify-center overflow-hidden bg-muted px-4 py-8">
        <div className="flex h-fit w-full max-w-[600px] flex-col gap-4 rounded-lg bg-card p-8">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-2 h-9 w-32" />
          <Skeleton className="mt-4 h-3.5 w-40" />
          <Skeleton className="h-3.5 w-52" />
        </div>
      </div>
    </div>
  );
}

export function EditorSkeleton() {
  return (
    <div
      aria-hidden="true"
      className={`flex min-w-0 flex-col gap-3.5 ${editorHeightClass}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
      <EditorCanvasSkeleton />
    </div>
  );
}
