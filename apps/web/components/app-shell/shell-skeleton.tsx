import { Skeleton } from "@workspace/ui/components/skeleton";

const railTiles = ["a", "b", "c", "d", "e", "f"];
const panelRows = ["w-24", "w-32", "w-20", "w-28", "w-[104px]"];
const statTiles = ["a", "b", "c", "d"];
const tableRows = ["a", "b", "c", "d", "e"];

export function ContentSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading page"
      className="flex min-w-0 flex-col gap-[18px]"
    >
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="hidden h-8 w-40 rounded-lg sm:block" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statTiles.map((tile) => (
          <div
            key={tile}
            className="flex flex-col gap-2.5 rounded-[12px] border border-border bg-card p-4 shadow-xs"
          >
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-[12px] border border-border bg-card shadow-xs">
        <div className="flex flex-col gap-2 border-border-subtle border-b px-4 py-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3.5 w-64 max-w-full" />
        </div>
        <div className="flex flex-col">
          {tableRows.map((row) => (
            <div
              key={row}
              className="flex h-11 items-center gap-4 border-border-subtle border-b px-4 last:border-b-0"
            >
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="ml-auto h-[22px] w-16 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className="flex h-dvh overflow-hidden bg-background text-[13px]">
      <div
        aria-hidden
        className="hidden w-[60px] shrink-0 flex-col items-center gap-3 bg-rail py-3 md:flex"
      >
        <div className="size-8 rounded-lg bg-rail-active" />
        <div className="h-px w-6 bg-rail-border" />
        <div className="flex flex-col items-center gap-1">
          {railTiles.map((tile) => (
            <div key={tile} className="grid size-10 place-items-center">
              <div className="size-[18px] animate-pulse rounded-[5px] bg-rail-active motion-reduce:animate-none" />
            </div>
          ))}
        </div>
        <div className="mt-auto flex flex-col items-center gap-2 pt-3">
          <div className="grid size-10 place-items-center">
            <div className="size-[18px] animate-pulse rounded-[5px] bg-rail-active motion-reduce:animate-none" />
          </div>
          <div className="size-8 animate-pulse rounded-full bg-rail-active motion-reduce:animate-none" />
        </div>
      </div>

      <div
        aria-hidden
        className="hidden w-[232px] shrink-0 flex-col gap-3.5 border-border border-r bg-sidebar p-2.5 md:flex"
      >
        <div className="flex h-11 shrink-0 items-center gap-2.5 rounded-[10px] border border-border bg-card pr-2 pl-[7px] shadow-xs">
          <Skeleton className="size-7 rounded-lg" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
        <div className="flex h-8 shrink-0 items-center pl-2">
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-full shrink-0 rounded-lg" />
        <div className="flex flex-col gap-px">
          {panelRows.map((width) => (
            <div key={width} className="flex h-8 items-center gap-[9px] px-2">
              <Skeleton className="size-4" />
              <Skeleton className={`h-3.5 ${width}`} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          aria-hidden
          className="flex h-[52px] shrink-0 items-center gap-2.5 border-border border-b px-4 md:px-7"
        >
          <Skeleton className="size-8 rounded-lg md:hidden" />
          <div className="flex flex-1 items-center gap-2">
            <Skeleton className="hidden h-3.5 w-28 sm:block" />
            <Skeleton className="h-3.5 w-20" />
          </div>
          <Skeleton className="h-8 w-8 rounded-lg sm:w-[136px]" />
          <Skeleton className="h-8 w-[124px] rounded-lg" />
        </div>
        <div className="flex w-full flex-1 flex-col px-4 pt-[26px] pb-10 md:px-7">
          <ContentSkeleton />
        </div>
      </div>
    </div>
  );
}
