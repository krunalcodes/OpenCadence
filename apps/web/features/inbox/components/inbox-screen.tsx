"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { Switch } from "@workspace/ui/components/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { Inbox, MessagesSquare, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell/page-header";
import { LoadFailed } from "@/components/product/load-failed";
import { OptionCombobox } from "@/components/product/option-combobox";
import {
  linkButtonClass,
  secondaryButtonClass,
  segmentedGroupClass,
  segmentedItemClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import {
  inboxFrameClass,
  inboxPanesClass,
  listPaneClass,
  ThreadListSkeleton,
  ThreadSkeleton,
  threadPaneClass,
} from "@/features/inbox/components/inbox-skeleton";
import { ShortcutsPopover } from "@/features/inbox/components/shortcuts-popover";
import { ThreadList } from "@/features/inbox/components/thread-list";
import { ThreadView } from "@/features/inbox/components/thread-view";
import { useInbox } from "@/features/inbox/hooks/use-inbox";
import { copy, statusFilterLabels } from "@/features/inbox/lib/copy";
import {
  defaultFilters,
  type InboxFilters,
  inboxSearch,
  isFiltered,
  maxSearchLength,
  refreshEveryMs,
  statusFilters,
  type Thread,
  type ThreadResult,
  type ThreadsResult,
  toFilters,
} from "@/features/inbox/lib/inbox";
import { useHydrated } from "@/hooks/use-hydrated";
import { createEventClock } from "@/lib/event-clock";
import { appHref } from "@/lib/navigation";
import { type SourceChoice, sourceLabel } from "@/lib/sources";

const searchDelay = 300;

const typingRoles =
  '[role="dialog"],[role="listbox"],[role="menu"],[role="combobox"]';

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.closest(typingRoles) !== null
  );
}

type InboxScreenProps = {
  initial: ThreadsResult;
  initialThreadId: string | null;
  initialThread: ThreadResult | null;
  sources: SourceChoice[];
};

export function InboxScreen({
  initial,
  initialThreadId,
  initialThread,
  sources,
}: InboxScreenProps) {
  const pathname = usePathname();
  const params = useSearchParams();
  const hydrated = useHydrated();
  const unreadId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const pushed = useRef(false);
  const focusRow = useRef(false);

  const selectedId = params.get("thread") || null;
  const status = params.get("status");
  const unread = params.get("unread");
  const source = params.get("source");
  const query = params.get("q");
  const filters = toFilters({ status, unread, source, q: query });

  const inbox = useInbox({
    initial,
    filters,
    selectedId,
    initialThreadId,
    initialThread,
  });
  const { list, detail } = inbox;

  const [search, setSearch] = useState({
    applied: filters.search,
    text: filters.search,
  });
  const [now, setNow] = useState<number | null>(null);

  if (search.applied !== filters.search) {
    setSearch({
      applied: filters.search,
      text:
        search.text.trim() === filters.search ? search.text : filters.search,
    });
  }

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), refreshEveryMs);
    return () => window.clearInterval(timer);
  }, []);

  const clock = createEventClock(
    hydrated ? "local" : "stable",
    new Date(),
    copy.days,
  );

  function hrefFor(next: InboxFilters, threadId: string | null) {
    const found = inboxSearch(next, threadId);
    return found ? `${pathname}?${found}` : pathname;
  }

  function applyFilters(next: InboxFilters) {
    window.history.replaceState(null, "", hrefFor(next, selectedId));
  }

  function select(id: string) {
    if (id === selectedId) {
      return;
    }
    if (selectedId) {
      window.history.replaceState(null, "", hrefFor(filters, id));
    } else {
      pushed.current = true;
      window.history.pushState(null, "", hrefFor(filters, id));
    }
  }

  function back() {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", hrefFor(filters, null));
    }
  }

  const latest = useRef({ filters, hrefFor });
  useEffect(() => {
    latest.current = { filters, hrefFor };
  });

  const typed = search.text.trim().slice(0, maxSearchLength);
  const pendingSearch = typed !== filters.search;

  useEffect(() => {
    if (!pendingSearch) {
      return;
    }
    const timer = window.setTimeout(() => {
      const current = latest.current;
      const thread = new URLSearchParams(window.location.search).get("thread");
      window.history.replaceState(
        null,
        "",
        current.hrefFor({ ...current.filters, search: typed }, thread || null),
      );
    }, searchDelay);
    return () => window.clearTimeout(timer);
  }, [typed, pendingSearch]);

  function clearFilters() {
    setSearch({ applied: filters.search, text: "" });
    applyFilters(defaultFilters);
  }

  function move(step: 1 | -1, focus: boolean) {
    const items = list.items;
    if (items.length === 0) {
      return;
    }
    const index = items.findIndex((item) => item.id === selectedId);
    const next =
      index === -1
        ? step === 1
          ? items[0]
          : items.at(-1)
        : items[Math.min(items.length - 1, Math.max(0, index + step))];
    if (!next || next.id === selectedId) {
      return;
    }
    focusRow.current = focus;
    select(next.id);
  }

  function neighbourOf(id: string) {
    const index = list.items.findIndex((item) => item.id === id);
    if (index === -1) {
      return null;
    }
    return list.items[index + 1]?.id ?? list.items[index - 1]?.id ?? null;
  }

  async function closeThread(thread: Thread) {
    const leaves = filters.status === "open";
    const next = leaves ? neighbourOf(thread.id) : thread.id;
    const done = inbox.close(thread);
    if (leaves && selectedId === thread.id) {
      if (next) {
        window.history.replaceState(null, "", hrefFor(filters, next));
      } else {
        back();
      }
    }
    if (await done) {
      toast(copy.toasts.closed, {
        action: {
          label: copy.toasts.undo,
          onClick: () => void inbox.reopen({ ...thread, status: "closed" }),
        },
      });
    }
  }

  async function markUnread(thread: Thread) {
    if (await inbox.markUnread(thread)) {
      toast(copy.toasts.markedUnread);
    }
  }

  const openThread = detail?.status === "ready" ? detail.thread : null;

  const keys = useRef((_event: KeyboardEvent) => {});
  useEffect(() => {
    keys.current = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTyping(event.target)
      ) {
        return;
      }
      const inList = listRef.current?.contains(document.activeElement) ?? false;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === "j" || (key === "ArrowDown" && inList)) {
        event.preventDefault();
        move(1, inList);
        return;
      }
      if (key === "k" || (key === "ArrowUp" && inList)) {
        event.preventDefault();
        move(-1, inList);
        return;
      }
      if (!openThread || event.repeat || inbox.acting !== null) {
        return;
      }
      if (key === "e" && openThread.status === "open") {
        event.preventDefault();
        void closeThread(openThread);
      } else if (key === "u" && !openThread.unread) {
        event.preventDefault();
        void markUnread(openThread);
      } else if (key === "r") {
        event.preventDefault();
        replyRef.current?.focus();
      }
    };
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      keys.current(event);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-thread-row="${CSS.escape(selectedId)}"]`,
    );
    if (!row) {
      return;
    }
    row.closest("li")?.scrollIntoView({ block: "nearest" });
    if (focusRow.current) {
      focusRow.current = false;
      row.focus({ preventScroll: true });
    }
  }, [selectedId]);

  const sourceOptions = sources.map((item) => ({
    value: item.id,
    label: sourceLabel(item),
  }));
  const sourceStatus =
    sources.find((item) => item.id === openThread?.source.id)?.status ?? null;
  const filtered = isFiltered(filters) || search.text.trim() !== "";
  const loadingList = list.status === "loading";
  const showSourceFilter = sources.length > 1 || filters.sourceId !== null;
  const unreadCount = inbox.unreadCount ?? 0;

  return (
    <div className={inboxFrameClass}>
      <PageHeader
        title={copy.title}
        description={
          <p aria-live="polite" className="tabular-nums">
            {unreadCount > 0
              ? copy.unreadSummary(unreadCount)
              : copy.description}
          </p>
        }
        actions={<ShortcutsPopover />}
      />

      <div className={inboxPanesClass}>
        <section
          aria-label={copy.listLabel}
          aria-busy={loadingList || undefined}
          className={cn(selectedId ? "hidden" : "flex", listPaneClass)}
        >
          <div className="flex shrink-0 flex-col gap-2 border-b border-border-subtle px-3.5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <ToggleGroup
                aria-label={copy.statusLabel}
                value={[filters.status]}
                onValueChange={(next) => {
                  const picked = statusFilters.find((item) => item === next[0]);
                  if (picked) {
                    applyFilters({ ...filters, status: picked });
                  }
                }}
                className={segmentedGroupClass}
              >
                {statusFilters.map((item) => (
                  <ToggleGroupItem
                    key={item}
                    value={item}
                    className={segmentedItemClass}
                  >
                    {statusFilterLabels[item]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="flex items-center gap-2">
                {loadingList || pendingSearch ? (
                  <Spinner className="size-3.5 text-ink-tertiary" />
                ) : null}
                <label
                  htmlFor={unreadId}
                  className="text-[12.5px] font-medium text-muted-foreground"
                >
                  {copy.unreadOnly}
                </label>
                <Switch
                  id={unreadId}
                  size="sm"
                  checked={filters.unread}
                  onCheckedChange={(checked) =>
                    applyFilters({ ...filters, unread: checked })
                  }
                />
              </div>
            </div>
            <InputGroup className="h-8 w-full bg-card shadow-xs">
              <InputGroupAddon>
                <Search aria-hidden strokeWidth={1.6} />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                autoComplete="off"
                spellCheck={false}
                maxLength={maxSearchLength}
                value={search.text}
                onChange={(event) =>
                  setSearch({
                    applied: search.applied,
                    text: event.target.value,
                  })
                }
                aria-label={copy.searchLabel}
                placeholder={copy.searchPlaceholder}
                className="text-[13px]"
              />
            </InputGroup>
            {showSourceFilter ? (
              <OptionCombobox
                options={sourceOptions}
                value={filters.sourceId}
                label={copy.sourceLabel}
                placeholder={copy.sourcePlaceholder}
                empty={copy.sourceEmpty}
                className="w-full"
                onChange={(next) =>
                  applyFilters({ ...filters, sourceId: next })
                }
              />
            ) : null}
          </div>

          <div
            ref={listRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            {list.status === "failed" ? (
              <LoadFailed
                title={copy.listFailed.title}
                body={copy.listFailed.body}
                retryLabel={copy.listFailed.retry}
                pending={inbox.retrying}
                onRetry={() => void inbox.retryList()}
              />
            ) : list.items.length > 0 ? (
              <>
                <ThreadList
                  threads={list.items}
                  selectedId={selectedId}
                  now={now}
                  clock={clock}
                  dimmed={loadingList}
                  hrefFor={(id) => hrefFor(filters, id)}
                  onSelect={select}
                />
                {list.cursor ? (
                  <div className="flex justify-center border-t border-border-subtle px-4 py-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={inbox.loadingMore || loadingList}
                      aria-busy={inbox.loadingMore || undefined}
                      onClick={() => void inbox.loadMore()}
                      className={secondaryButtonClass}
                    >
                      {inbox.loadingMore ? <Spinner /> : null}
                      {copy.loadMore}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : loadingList ? (
              <ThreadListSkeleton />
            ) : filtered ? (
              <Empty className="px-6 py-10">
                <EmptyHeader>
                  <EmptyTitle className="text-sm font-semibold text-foreground">
                    {copy.noMatch.title}
                  </EmptyTitle>
                  <EmptyDescription className="text-[13px]">
                    {copy.noMatch.body}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearFilters}
                    className={secondaryButtonClass}
                  >
                    {copy.clearAll}
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <Empty className="px-6 py-10">
                <EmptyHeader>
                  <EmptyMedia
                    variant="icon"
                    className="size-9 border border-border bg-card text-primary shadow-xs"
                  >
                    <Inbox strokeWidth={1.6} aria-hidden />
                  </EmptyMedia>
                  <EmptyTitle className="text-sm font-semibold text-foreground">
                    {copy.empty.title}
                  </EmptyTitle>
                  <EmptyDescription className="text-[13px]">
                    {copy.empty.body}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Link
                    href={appHref("integrations")}
                    className={cn(
                      linkButtonClass,
                      "border-border bg-card px-3 text-foreground shadow-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    )}
                  >
                    {copy.empty.sources}
                  </Link>
                </EmptyContent>
              </Empty>
            )}
          </div>
        </section>

        <section
          aria-label={copy.threadLabel}
          aria-busy={detail?.status === "loading" || undefined}
          className={cn(selectedId ? "flex" : "hidden", threadPaneClass)}
        >
          {!detail ? (
            <Empty className="px-6 py-10">
              <EmptyHeader>
                <EmptyMedia
                  variant="icon"
                  className="size-9 border border-border bg-card text-muted-foreground shadow-xs"
                >
                  <MessagesSquare strokeWidth={1.6} aria-hidden />
                </EmptyMedia>
                <EmptyTitle className="text-sm font-semibold text-foreground">
                  {copy.placeholder.title}
                </EmptyTitle>
                <EmptyDescription className="text-[13px]">
                  {copy.placeholder.body}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : detail.status === "loading" ? (
            <ThreadSkeleton />
          ) : detail.status === "missing" ? (
            <Empty className="px-6 py-10">
              <EmptyHeader>
                <EmptyTitle className="text-sm font-semibold text-foreground">
                  {copy.missing.title}
                </EmptyTitle>
                <EmptyDescription className="text-[13px]">
                  {copy.missing.body}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="button"
                  variant="outline"
                  onClick={back}
                  className={secondaryButtonClass}
                >
                  {copy.missing.back}
                </Button>
              </EmptyContent>
            </Empty>
          ) : !openThread ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <LoadFailed
                title={copy.threadFailed.title}
                body={copy.threadFailed.body}
                retryLabel={copy.threadFailed.retry}
                pending={inbox.retrying}
                onRetry={() => void inbox.retryThread()}
              />
              <div className="px-4 @3xl/inbox:hidden">
                <Button
                  type="button"
                  variant="outline"
                  onClick={back}
                  className={secondaryButtonClass}
                >
                  {copy.missing.back}
                </Button>
              </div>
            </div>
          ) : (
            <ThreadView
              key={openThread.id}
              thread={openThread}
              clock={clock}
              sourceStatus={sourceStatus}
              acting={inbox.acting}
              replyRef={replyRef}
              onBack={back}
              onClose={() => void closeThread(openThread)}
              onReopen={() => void inbox.reopen(openThread)}
              onMarkUnread={() => void markUnread(openThread)}
              onReplySent={(message) => inbox.replySent(openThread, message)}
            />
          )}
        </section>
      </div>
    </div>
  );
}
