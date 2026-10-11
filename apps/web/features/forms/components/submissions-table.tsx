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
  copy,
  describeError,
  fieldNames,
  submissionLabels,
  submissionTones,
} from "@/features/forms/lib/copy";
import {
  customFieldPrefix,
  type FormField,
  type Submission,
  type SubmissionStatus,
  submissionStatuses,
} from "@/features/forms/lib/forms";
import { fetchSubmissions } from "@/features/forms/queries/client";
import { useHydrated } from "@/hooks/use-hydrated";
import { createEventClock, type EventClock } from "@/lib/event-clock";

const text = copy.submissions;

type StatusOption = { value: SubmissionStatus; label: string };

const statusOptions: StatusOption[] = submissionStatuses.map((status) => ({
  value: status,
  label: submissionLabels[status],
}));

const skeletonRows = ["one", "two", "three", "four", "five"];

type View = {
  filter: SubmissionStatus | null;
  state: "ready" | "failed";
  items: Submission[];
  cursor: string | null;
};

type SubmissionsTableProps = {
  formId: string;
  fields: FormField[];
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

function answersOf(submission: Submission, fields: FormField[]) {
  const labels = new Map(fields.map((field) => [field.key, field.label]));
  return Object.entries(submission.data)
    .filter(([key]) => key !== "email")
    .map(([key, value]) =>
      text.answer(
        labels.get(key) ||
          fieldNames[key] ||
          key.replace(customFieldPrefix, ""),
        value,
      ),
    );
}

export function SubmissionsTable({ formId, fields }: SubmissionsTableProps) {
  const hydrated = useHydrated();
  const [filter, setFilter] = useState<SubmissionStatus | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    void attempt;
    const token = request.current + 1;
    request.current = token;
    fetchSubmissions(formId, filter, null).then((result) => {
      if (request.current !== token) {
        return;
      }
      setView({
        filter,
        state: result.ok ? "ready" : "failed",
        items: result.ok ? result.data.items : [],
        cursor: result.ok ? result.data.nextCursor : null,
      });
    });
  }, [formId, filter, attempt]);

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
    if (!view?.cursor || loadingMore || loading) {
      return;
    }
    const token = request.current + 1;
    request.current = token;
    setLoadingMore(true);
    const result = await fetchSubmissions(formId, view.filter, view.cursor);
    setLoadingMore(false);
    if (request.current !== token) {
      return;
    }
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
          ...result.data.items.filter((item) => !known.has(item.id)),
        ],
        cursor: result.data.nextCursor,
      };
    });
  }

  return (
    <SectionCard
      id="form-submissions-title"
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
              className="h-8 w-52 bg-card text-[13px] shadow-xs"
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
            label={text.activeFilters}
            clearLabel={text.clearAll}
            removeLabel={text.removeFilter}
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
              <div className="w-[28%]">
                <Skeleton className="h-4 w-56 max-w-full" />
              </div>
              <Skeleton className="h-[22px] w-36" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
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
              {filter ? text.noMatchBody : text.emptyBody}
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
                {text.clearAll}
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <>
          <Table className="min-w-[860px] table-fixed text-[13px]">
            <TableHeader className="[&_tr]:border-border-subtle">
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(tableHeadClass, "w-[28%]")}>
                  {text.columns.email}
                </TableHead>
                <TableHead className={cn(tableHeadClass, "w-[200px]")}>
                  {text.columns.status}
                </TableHead>
                <TableHead className={tableHeadClass}>
                  {text.columns.answers}
                </TableHead>
                <TableHead className={cn(tableHeadClass, "w-[150px]")}>
                  {text.columns.submitted}
                </TableHead>
                <TableHead className={cn(tableHeadClass, "w-[150px]")}>
                  {text.columns.confirmed}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((submission) => {
                const answers = text.answers(answersOf(submission, fields));
                return (
                  <TableRow
                    key={submission.id}
                    className="border-border-subtle hover:bg-muted/50"
                  >
                    <TableCell className={tableCellClass}>
                      <div
                        title={submission.email}
                        className="truncate font-medium text-foreground"
                      >
                        {submission.email}
                      </div>
                    </TableCell>
                    <TableCell className={tableCellClass}>
                      <StatusBadge tone={submissionTones[submission.status]}>
                        {submissionLabels[submission.status]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className={tableCellClass}>
                      {answers ? (
                        <div
                          title={answers}
                          className="truncate text-muted-foreground"
                        >
                          {answers}
                        </div>
                      ) : (
                        <span className="text-ink-tertiary">{copy.none}</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        tableCellClass,
                        "whitespace-nowrap text-muted-foreground tabular-nums",
                      )}
                    >
                      <Moment value={submission.createdAt} clock={clock} />
                    </TableCell>
                    <TableCell
                      className={cn(
                        tableCellClass,
                        "whitespace-nowrap text-muted-foreground tabular-nums",
                      )}
                    >
                      <Moment value={submission.confirmedAt} clock={clock} />
                    </TableCell>
                  </TableRow>
                );
              })}
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
