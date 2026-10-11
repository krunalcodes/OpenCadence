import { Skeleton } from "@workspace/ui/components/skeleton";

const rows = ["one", "two", "three", "four", "five", "six", "seven"];
const messages = ["first", "second"];

export const inboxFrameClass =
  "@container/inbox flex h-[calc(100dvh-118px)] min-h-[520px] min-w-0 flex-col text-[13px] leading-normal";

export const inboxPanesClass =
  "flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-xs";

export const listPaneClass =
  "min-h-0 w-full min-w-0 flex-col @3xl/inbox:flex @3xl/inbox:w-[360px] @3xl/inbox:shrink-0 @3xl/inbox:border-r @3xl/inbox:border-border-subtle";

export const threadPaneClass =
  "min-h-0 min-w-0 flex-1 flex-col @3xl/inbox:flex";

export function ThreadListSkeleton() {
  return (
    <div aria-hidden="true" className="divide-y divide-border-subtle">
      {rows.map((row) => (
        <div key={row} className="flex flex-col gap-1.5 py-3 pr-3.5 pl-7">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-8" />
          </div>
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-[18px] w-28 rounded-[6px]" />
        </div>
      ))}
    </div>
  );
}

export function ThreadSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-3">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-72 max-w-full" />
          <Skeleton className="mt-2 h-3 w-96 max-w-full" />
        </div>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="min-h-0 flex-1 divide-y divide-border-subtle overflow-hidden">
        <div className="px-5 py-2.5">
          <Skeleton className="h-3 w-52" />
        </div>
        {messages.map((message) => (
          <div key={message} className="flex flex-col gap-2 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 border-t border-border-subtle px-5 py-3">
        <Skeleton className="h-[72px] w-full" />
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-3 w-56 max-w-full" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
    </div>
  );
}

export function ListToolbarSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-2 border-b border-border-subtle px-3.5 py-3"
    >
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-5 w-24" />
      </div>
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

export function InboxSkeleton() {
  return (
    <div aria-hidden="true" className={inboxFrameClass}>
      <div className="mb-[22px] flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-8 w-44" />
      </div>
      <div className={inboxPanesClass}>
        <div className={`flex ${listPaneClass}`}>
          <ListToolbarSkeleton />
          <div className="min-h-0 flex-1 overflow-hidden">
            <ThreadListSkeleton />
          </div>
        </div>
        <div className={`hidden ${threadPaneClass}`}>
          <ThreadSkeleton />
        </div>
      </div>
    </div>
  );
}
