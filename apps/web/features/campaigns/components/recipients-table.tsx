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
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type FilterChip,
  FilterChips,
} from "@/components/product/filter-chips";
import { LoadFailed } from "@/components/product/load-failed";
import { SectionCard } from "@/components/product/section-card";
import {
  secondaryButtonClass,
  tableCellClass,
  tableHeadClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { StatusBadge } from "@/components/status-badge";
import {
  type CampaignRecipient,
  type CampaignStatus,
  type RecipientStatus,
  type RecipientsPage,
  recipientStatuses,
} from "@/features/campaigns/lib/campaigns";
import {
  copy,
  describeError,
  recipientLabels,
  recipientTones,
} from "@/features/campaigns/lib/copy";
import { fetchRecipients } from "@/features/campaigns/queries/client";
import { useHydrated } from "@/hooks/use-hydrated";
import { createEventClock, type EventClock } from "@/lib/event-clock";

const text = copy.results.recipients;

type StatusOption = { value: RecipientStatus; label: string };

const statusOptions: StatusOption[] = recipientStatuses.map((status) => ({
  value: status,
  label: recipientLabels[status],
}));

const skeletonRows = ["one", "two", "three", "four", "five"];

type View = {
  filter: RecipientStatus | null;
  state: "ready" | "failed";
  items: CampaignRecipient[];
  cursor: string | null;
  pages: number;
};

type RecipientsTableProps = {
  campaignId: string;
  campaignStatus: CampaignStatus;
  initial: RecipientsPage | null;
  refreshKey: number;
};

function Moment({ value, clock }: { value: string | null; clock: EventClock }) {
  const moment = value ? clock(value) : null;
  if (!moment) {
    return <span className="text-ink-tertiary">{copy.none}</span>;
  }
  return (
    <time dateTime={moment.iso} suppressHydrationWarning>
      {moment.day}, {moment.time}
    </time>
  );
}

export function RecipientsTable({
  campaignId,
  campaignStatus,
  initial,
  refreshKey,
}: RecipientsTableProps) {
  const hydrated = useHydrated();
  const [filter, setFilter] = useState<RecipientStatus | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View | null>(() =>
    initial
      ? {
          filter: null,
          state: "ready",
          items: initial.recipients,
          cursor: initial.nextCursor,
          pages: 1,
        }
      : null,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const request = useRef(0);
  const busy = useRef(false);
  const first = useRef(initial !== null);
  const viewRef = useRef(view);
  const seenRefresh = useRef(refreshKey);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    void attempt;
    if (first.current) {
      first.current = false;
      return;
    }
    const token = request.current + 1;
    request.current = token;
    busy.current = true;
    fetchRecipients(campaignId, filter, null).then((result) => {
      if (request.current !== token) {
        return;
      }
      busy.current = false;
      setView({
        filter,
        state: result.ok ? "ready" : "failed",
        items: result.ok ? result.data.recipients : [],
        cursor: result.ok ? result.data.nextCursor : null,
        pages: 1,
      });
    });
  }, [campaignId, filter, attempt]);

  useEffect(() => {
    if (seenRefresh.current === refreshKey) {
      return;
    }
    seenRefresh.current = refreshKey;
    const current = viewRef.current;
    if (
      busy.current ||
      !current ||
      current.state !== "ready" ||
      current.pages > 1
    ) {
      return;
    }
    const token = request.current + 1;
    request.current = token;
    busy.current = true;
    fetchRecipients(campaignId, current.filter, null).then((result) => {
      if (request.current !== token) {
        return;
      }
      busy.current = false;
      if (result.ok) {
        setView({
          filter: current.filter,
          state: "ready",
          items: result.data.recipients,
          cursor: result.data.nextCursor,
          pages: 1,
        });
      }
    });
  }, [campaignId, refreshKey]);

  const clock = createEventClock(
    hydrated ? "local" : "stable",
    new Date(),
    copy.days,
  );
  const loading = view === null || view.filter !== filter;
  const statusOption =
    statusOptions.find((option) => option.value === filter) ?? null;
  const items = view?.items ?? [];

  const chips: FilterChip[] = statusOption
    ? [
        {
          id: "status",
          label: statusOption.label,
          remove: () => setFilter(null),
        },
      ]
    : [];

  async function loadMore() {
    if (!view?.cursor || loadingMore || busy.current) {
      return;
    }
    const token = request.current + 1;
    request.current = token;
    busy.current = true;
    setLoadingMore(true);
    const result = await fetchRecipients(campaignId, view.filter, view.cursor);
    setLoadingMore(false);
    if (request.current !== token) {
      return;
    }
    busy.current = false;
    if (!result.ok) {
      toast.error(text.loadMoreFailed, {
        description: describeError(result.error),
      });
      return;
    }
    setView((current) => {
      if (!current || current.filter !== view.filter) {
        return current;
      }
      const known = new Set(current.items.map((item) => item.id));
      return {
        ...current,
        items: [
          ...current.items,
          ...result.data.recipients.filter((item) => !known.has(item.id)),
        ],
        cursor: result.data.nextCursor,
        pages: current.pages + 1,
      };
    });
  }

  return (
    <SectionCard
      id="campaign-recipients-title"
      title={text.title}
      description={text.description}
      action={
        <>
          {!loading && view?.state === "ready" ? (
            <p
              aria-live="polite"
              className="text-[12.5px] text-ink-tertiary tabular-nums"
            >
              {text.count(items.length, view.cursor !== null)}
            </p>
          ) : null}
          <Combobox
            items={statusOptions}
            value={statusOption}
            onValueChange={(next: StatusOption | null) =>
              setFilter(next?.value ?? null)
            }
          >
            <ComboboxInput
              aria-label={text.statusLabel}
              placeholder={text.statusPlaceholder}
              showClear={statusOption !== null}
              className="h-8 w-44 bg-card text-[13px] shadow-xs"
            />
            <ComboboxContent>
              <ComboboxEmpty>{text.statusEmpty}</ComboboxEmpty>
              <ComboboxList>
                {(item: StatusOption) => (
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
        </>
      }
    >
      {chips.length > 0 ? (
        <div className="border-b border-border-subtle px-4 py-2.5">
          <FilterChips
            chips={chips}
            label={copy.activeFilters}
            clearLabel={copy.clearAll}
            removeLabel={copy.removeFilter}
            onClear={() => setFilter(null)}
          />
        </div>
      ) : null}
      {loading ? (
        <div aria-busy="true" className="divide-y divide-border-subtle">
          <span className="sr-only">{text.loading}</span>
          {skeletonRows.map((row) => (
            <div
              key={row}
              aria-hidden="true"
              className="flex items-center gap-4 px-4 py-[11px]"
            >
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-56 max-w-full" />
              </div>
              <Skeleton className="h-[22px] w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      ) : view.state === "failed" ? (
        <LoadFailed
          title={text.loadFailed.title}
          body={text.loadFailed.body}
          retryLabel={text.loadFailed.retry}
          pending={false}
          onRetry={() => {
            setView(null);
            setAttempt((current) => current + 1);
          }}
        />
      ) : items.length === 0 ? (
        <Empty className="px-6 py-10">
          <EmptyHeader>
            <EmptyTitle className="text-sm font-semibold text-foreground">
              {filter ? text.noMatchTitle : text.emptyTitle}
            </EmptyTitle>
            <EmptyDescription className="text-[13px]">
              {filter
                ? text.noMatchBody
                : campaignStatus === "scheduled"
                  ? text.emptyScheduled
                  : text.emptyBody}
            </EmptyDescription>
          </EmptyHeader>
          {filter ? (
            <EmptyContent>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFilter(null)}
                className={secondaryButtonClass}
              >
                {copy.clearAll}
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <>
          <Table className="min-w-[760px] table-fixed text-[13px]">
            <TableHeader className="[&_tr]:border-border-subtle">
              <TableRow className="hover:bg-transparent">
                <TableHead className={tableHeadClass}>
                  {text.columns.email}
                </TableHead>
                <TableHead className={cn(tableHeadClass, "w-[210px]")}>
                  {text.columns.status}
                </TableHead>
                <TableHead className={cn(tableHeadClass, "w-[150px]")}>
                  {text.columns.opened}
                </TableHead>
                <TableHead className={cn(tableHeadClass, "w-[150px]")}>
                  {text.columns.clicked}
                </TableHead>
                <TableHead className={cn(tableHeadClass, "w-[150px]")}>
                  {text.columns.sent}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((recipient) => (
                <TableRow
                  key={recipient.id}
                  className="border-border-subtle hover:bg-muted/50"
                >
                  <TableCell className={tableCellClass}>
                    <div
                      title={recipient.email}
                      className="truncate font-medium text-foreground"
                    >
                      {recipient.email}
                    </div>
                    {recipient.error?.message ? (
                      <div
                        title={recipient.error.message}
                        className="truncate text-[12.5px] text-ink-tertiary"
                      >
                        {recipient.error.message}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className={tableCellClass}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge tone={recipientTones[recipient.status]}>
                        {recipientLabels[recipient.status]}
                      </StatusBadge>
                      {recipient.unsubscribedAt ? (
                        <StatusBadge tone="warning">
                          {text.unsubscribed}
                        </StatusBadge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell
                    className={cn(
                      tableCellClass,
                      "whitespace-nowrap text-muted-foreground tabular-nums",
                    )}
                  >
                    <Moment value={recipient.openedAt} clock={clock} />
                  </TableCell>
                  <TableCell
                    className={cn(
                      tableCellClass,
                      "whitespace-nowrap text-muted-foreground tabular-nums",
                    )}
                  >
                    <Moment value={recipient.clickedAt} clock={clock} />
                  </TableCell>
                  <TableCell
                    className={cn(
                      tableCellClass,
                      "whitespace-nowrap text-muted-foreground tabular-nums",
                    )}
                  >
                    <Moment value={recipient.sentAt} clock={clock} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {view.cursor ? (
            <div className="flex justify-center border-t border-border-subtle px-4 py-3">
              <Button
                type="button"
                variant="outline"
                disabled={loadingMore}
                aria-busy={loadingMore || undefined}
                onClick={() => void loadMore()}
                className={secondaryButtonClass}
              >
                {loadingMore ? <Spinner /> : null}
                {text.loadMore}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}
