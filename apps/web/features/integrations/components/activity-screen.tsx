"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { ScrollText, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { toast } from "sonner";
import { focusRing, PageHeader } from "@/components/app-shell/page-header";
import { LoadFailed } from "@/components/product/load-failed";
import { SourceMark } from "@/components/product/source-mark";
import {
  secondaryButtonClass,
  segmentedGroupClass,
  segmentedItemClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { StatusBadge } from "@/components/status-badge";
import { ActivityDetailSheet } from "@/features/integrations/components/activity-detail-sheet";
import {
  activityCopy,
  createEventClock,
  eventText,
  severityLabels,
  severityTones,
} from "@/features/integrations/lib/activity";
import {
  integrationMark,
  type Option,
} from "@/features/integrations/lib/catalog";
import { describeError } from "@/features/integrations/lib/copy";
import type {
  EventFilters,
  EventsResult,
  SeverityFilter,
  SourceEvent,
} from "@/features/integrations/lib/sources";
import { fetchEvents } from "@/features/integrations/queries/mutations";
import { useHydrated } from "@/hooks/use-hydrated";
import { appHref } from "@/lib/navigation";

const levelIds: SeverityFilter[] = ["all", "warning", "error"];

const headClass =
  "h-auto bg-muted/50 px-4 py-2 text-xs font-medium text-ink-tertiary";
const cellClass = "px-4 py-[11px] text-[13px]";

type ActivityScreenProps = {
  result: EventsResult;
  filters: EventFilters;
  sources: Option[];
};

type Loaded = {
  base: EventsResult;
  extra: SourceEvent[];
  cursor: string | null;
};

function startOf(result: EventsResult): Loaded {
  return {
    base: result,
    extra: [],
    cursor: result.state === "ready" ? result.nextCursor : null,
  };
}

const noEvents: SourceEvent[] = [];

export function ActivityScreen({
  result,
  filters,
  sources,
}: ActivityScreenProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [loaded, setLoaded] = useState(() => startOf(result));
  const [draft, setDraft] = useState<EventFilters | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<SourceEvent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const [retrying, startRetry] = useTransition();

  if (loaded.base !== result) {
    setLoaded(startOf(result));
  }

  const shown = navigating && draft ? draft : filters;
  const ready = result.state === "ready";
  const events =
    loaded.base === result && result.state === "ready"
      ? [...result.events, ...loaded.extra]
      : result.state === "ready"
        ? result.events
        : noEvents;
  const cursor = loaded.base === result ? loaded.cursor : null;
  const clock = createEventClock(hydrated ? "local" : "stable", new Date());

  const sourceOption = shown.sourceId
    ? (sources.find((option) => option.value === shown.sourceId) ?? {
        value: shown.sourceId,
        label:
          events.find((event) => event.sourceId === shown.sourceId)
            ?.sourceName || activityCopy.removedSource,
      })
    : null;
  const filtered = shown.sourceId !== null || shown.severity !== "all";

  function navigate(next: EventFilters) {
    const params = new URLSearchParams();
    if (next.sourceId) {
      params.set("sourceId", next.sourceId);
    }
    if (next.severity !== "all") {
      params.set("severity", next.severity);
    }
    const search = params.toString();
    const base = appHref("integrations/activity");
    setDraft(next);
    startNavigation(() => {
      router.replace(search ? `${base}?${search}` : base);
    });
  }

  function clearAll() {
    navigate({ sourceId: null, severity: "all" });
  }

  const chips: { id: string; label: string; remove: () => void }[] = [];
  if (sourceOption) {
    chips.push({
      id: "source",
      label: sourceOption.label,
      remove: () => navigate({ ...shown, sourceId: null }),
    });
  }
  if (shown.severity !== "all") {
    chips.push({
      id: "level",
      label: activityCopy.levels[shown.severity],
      remove: () => navigate({ ...shown, severity: "all" }),
    });
  }

  async function loadMore() {
    if (loadingMore || !cursor) {
      return;
    }
    setLoadingMore(true);
    const response = await fetchEvents(filters, cursor);
    setLoadingMore(false);
    if (!response.ok) {
      toast.error(activityCopy.loadMoreFailed, {
        description: describeError(response.error),
      });
      return;
    }
    const page = response.data;
    setLoaded((current) => {
      if (current.base !== result) {
        return current;
      }
      const known = new Set(
        [
          ...(result.state === "ready" ? result.events : noEvents),
          ...current.extra,
        ].map((event) => event.id),
      );
      return {
        base: current.base,
        extra: [
          ...current.extra,
          ...page.events.filter((event) => !known.has(event.id)),
        ],
        cursor: page.nextCursor,
      };
    });
  }

  function open(event: SourceEvent) {
    setSelected(event);
    setSheetOpen(true);
  }

  return (
    <div className="@container flex min-w-0 flex-col gap-[18px] text-[13px] leading-normal">
      <PageHeader
        title={activityCopy.title}
        description={activityCopy.description}
      />

      <section
        aria-label={activityCopy.title}
        aria-busy={navigating || undefined}
        className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs"
      >
        <div className="flex flex-col gap-2.5 border-b border-border-subtle px-4 py-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <Combobox
              items={sources}
              value={sourceOption}
              onValueChange={(next: Option | null) =>
                navigate({ ...shown, sourceId: next?.value ?? null })
              }
            >
              <ComboboxInput
                aria-label={activityCopy.sourceLabel}
                placeholder={activityCopy.sourcePlaceholder}
                showClear={sourceOption !== null}
                className="h-8 w-60 bg-card text-[13px] shadow-xs"
              />
              <ComboboxContent>
                <ComboboxEmpty>{activityCopy.sourceEmpty}</ComboboxEmpty>
                <ComboboxList>
                  {(item: Option) => (
                    <ComboboxItem
                      key={item.value}
                      value={item}
                      className="text-[13px]"
                    >
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <ToggleGroup
              aria-label={activityCopy.levelLabel}
              value={[shown.severity]}
              onValueChange={(next) => {
                const id = levelIds.find((item) => item === next[0]);
                if (id && id !== shown.severity) {
                  navigate({ ...shown, severity: id });
                }
              }}
              className={segmentedGroupClass}
            >
              {levelIds.map((id) => (
                <ToggleGroupItem
                  key={id}
                  value={id}
                  className={segmentedItemClass}
                >
                  {activityCopy.levels[id]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {navigating ? (
              <Spinner className="size-3.5 text-ink-tertiary" />
            ) : null}
            {ready ? (
              <p
                aria-live="polite"
                className="ml-auto text-[12.5px] text-ink-tertiary tabular-nums"
              >
                {activityCopy.count(events.length, cursor !== null)}
              </p>
            ) : null}
          </div>
          {chips.length > 0 ? (
            <ul
              aria-label={activityCopy.activeFilters}
              className="flex flex-wrap items-center gap-1.5"
            >
              {chips.map((chip) => (
                <li
                  key={chip.id}
                  className="inline-flex h-[22px] max-w-64 items-center gap-0.5 rounded-[6px] bg-border-subtle pr-0.5 pl-2 text-xs font-medium text-foreground"
                >
                  <span className="truncate">{chip.label}</span>
                  <button
                    type="button"
                    aria-label={activityCopy.removeFilter(chip.label)}
                    onClick={chip.remove}
                    className={cn(
                      "grid size-[18px] shrink-0 place-items-center rounded-[4px] text-muted-foreground hover:bg-accent hover:text-foreground",
                      focusRing,
                    )}
                  >
                    <X aria-hidden className="size-3" strokeWidth={1.8} />
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={clearAll}
                  className={cn(
                    "rounded-[6px] px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground",
                    focusRing,
                  )}
                >
                  {activityCopy.clearAll}
                </button>
              </li>
            </ul>
          ) : null}
        </div>

        {!ready ? (
          <LoadFailed
            title={activityCopy.loadFailed.title}
            body={activityCopy.loadFailed.body}
            retryLabel={activityCopy.loadFailed.retry}
            pending={retrying}
            onRetry={() => startRetry(() => router.refresh())}
          />
        ) : events.length === 0 && filtered ? (
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyTitle className="text-sm font-semibold text-foreground">
                {activityCopy.noMatchTitle}
              </EmptyTitle>
              <EmptyDescription className="text-[13px]">
                {activityCopy.noMatchBody}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                type="button"
                variant="outline"
                onClick={clearAll}
                className={secondaryButtonClass}
              >
                {activityCopy.clearAll}
              </Button>
            </EmptyContent>
          </Empty>
        ) : events.length === 0 ? (
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyMedia
                variant="icon"
                className="size-9 border border-border bg-card text-primary shadow-xs"
              >
                <ScrollText strokeWidth={1.6} aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-sm font-semibold text-foreground">
                {activityCopy.emptyTitle}
              </EmptyTitle>
              <EmptyDescription className="text-[13px]">
                {activityCopy.emptyBody}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <Table
              className={cn(
                "min-w-[820px] text-[13px] transition-opacity",
                navigating && "opacity-60",
              )}
            >
              <TableHeader className="[&_tr]:border-border-subtle">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(headClass, "w-[92px]")}>
                    {activityCopy.columns.time}
                  </TableHead>
                  <TableHead className={headClass}>
                    {activityCopy.columns.source}
                  </TableHead>
                  <TableHead className={headClass}>
                    {activityCopy.columns.event}
                  </TableHead>
                  <TableHead className={headClass}>
                    {activityCopy.columns.result}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event, index) => {
                  const moment = clock(event.createdAt);
                  const previous = events[index - 1];
                  const newDay =
                    !previous ||
                    clock(previous.createdAt)?.dayKey !== moment?.dayKey;
                  const text = eventText(event);
                  const sourceName =
                    event.sourceName || activityCopy.removedSource;
                  return (
                    <Fragment key={event.id}>
                      {newDay && moment ? (
                        <TableRow className="border-border-subtle hover:bg-transparent">
                          <TableCell
                            colSpan={4}
                            suppressHydrationWarning
                            className="bg-muted/30 px-4 py-1.5 text-xs font-medium text-muted-foreground"
                          >
                            {moment.day}
                          </TableCell>
                        </TableRow>
                      ) : null}
                      <TableRow
                        onClick={() => open(event)}
                        className="cursor-pointer border-border-subtle hover:bg-muted/50"
                      >
                        <TableCell
                          className={cn(
                            cellClass,
                            "font-mono text-[12.5px] text-muted-foreground tabular-nums",
                          )}
                        >
                          {moment ? (
                            <time
                              dateTime={moment.iso}
                              suppressHydrationWarning
                            >
                              {moment.time}
                            </time>
                          ) : null}
                        </TableCell>
                        <TableCell className={cn(cellClass, "max-w-64")}>
                          <div className="flex items-center gap-2.5">
                            {event.integrationType ? (
                              <SourceMark
                                integration={integrationMark(
                                  event.integrationType,
                                )}
                                className="bg-card"
                              />
                            ) : null}
                            <span className="truncate text-muted-foreground">
                              {sourceName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className={cn(cellClass, "max-w-[520px]")}>
                          <button
                            type="button"
                            aria-label={activityCopy.open(
                              text.title,
                              sourceName,
                            )}
                            onClick={(click) => {
                              click.stopPropagation();
                              open(event);
                            }}
                            className={cn(
                              "block max-w-full truncate rounded-[4px] text-left font-medium text-foreground hover:text-primary",
                              focusRing,
                            )}
                          >
                            {text.title}
                          </button>
                          <div className="truncate text-xs text-ink-tertiary tabular-nums">
                            {text.detail}
                          </div>
                        </TableCell>
                        <TableCell className={cellClass}>
                          <StatusBadge tone={severityTones[event.severity]}>
                            {severityLabels[event.severity]}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            {cursor ? (
              <div className="flex justify-center border-t border-border-subtle px-4 py-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loadingMore || navigating}
                  aria-busy={loadingMore || undefined}
                  onClick={loadMore}
                  className={secondaryButtonClass}
                >
                  {loadingMore ? <Spinner /> : null}
                  {activityCopy.loadMore}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <ActivityDetailSheet
        event={selected}
        clock={clock}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
