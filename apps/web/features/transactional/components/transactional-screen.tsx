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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import { BookOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { toast } from "sonner";
import { focusRing, PageHeader } from "@/components/app-shell/page-header";
import {
  type FilterChip,
  FilterChips,
} from "@/components/product/filter-chips";
import { LoadFailed } from "@/components/product/load-failed";
import { SourceMark } from "@/components/product/source-mark";
import {
  linkButtonClass,
  secondaryButtonClass,
  tableCellClass,
  tableHeadClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { StatusBadge } from "@/components/status-badge";
import { EmailDetailSheet } from "@/features/transactional/components/email-detail-sheet";
import { SendExample } from "@/features/transactional/components/send-example";
import {
  copy,
  describeError,
  statusLabels,
  statusTones,
} from "@/features/transactional/lib/copy";
import {
  type Email,
  type EmailFilters,
  type EmailStatus,
  type EmailsResult,
  emailStatuses,
  filtersSearch,
  type SourceOption,
} from "@/features/transactional/lib/emails";
import { fetchEmails } from "@/features/transactional/queries/client";
import { useHydrated } from "@/hooks/use-hydrated";
import { useLoadMore } from "@/hooks/use-load-more";
import { createEventClock } from "@/lib/event-clock";
import { appHref } from "@/lib/navigation";

type StatusOption = { value: EmailStatus; label: string };

const statusOptions: StatusOption[] = emailStatuses.map((status) => ({
  value: status,
  label: statusLabels[status],
}));

const noEmails: Email[] = [];

type TransactionalScreenProps = {
  result: EmailsResult;
  filters: EmailFilters;
  sources: SourceOption[];
  docsUrl: string | null;
};

export function TransactionalScreen({
  result,
  filters,
  sources,
  docsUrl,
}: TransactionalScreenProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const ready = result.state === "ready";
  const list = useLoadMore(result, {
    items: ready ? result.emails : noEmails,
    nextCursor: ready ? result.nextCursor : null,
  });
  const [draft, setDraft] = useState<EmailFilters | null>(null);
  const [selected, setSelected] = useState<Email | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const [retrying, startRetry] = useTransition();

  const shown = navigating && draft ? draft : filters;
  const emails = list.items;
  const clock = createEventClock(
    hydrated ? "local" : "stable",
    new Date(),
    copy.days,
  );

  const statusOption =
    statusOptions.find((option) => option.value === shown.status) ?? null;
  const sourceOption = shown.sourceId
    ? (sources.find((option) => option.value === shown.sourceId) ?? {
        value: shown.sourceId,
        label:
          emails.find((email) => email.sourceId === shown.sourceId)
            ?.sourceName || copy.removedSource,
        integrationType: "",
      })
    : null;
  const filtered = shown.status !== null || shown.sourceId !== null;

  function navigate(next: EmailFilters) {
    const search = filtersSearch(next);
    const base = appHref("transactional");
    setDraft(next);
    startNavigation(() => {
      router.replace(search ? `${base}?${search}` : base);
    });
  }

  function clearAll() {
    navigate({ status: null, sourceId: null });
  }

  const chips: FilterChip[] = [];
  if (statusOption) {
    chips.push({
      id: "status",
      label: statusOption.label,
      remove: () => navigate({ ...shown, status: null }),
    });
  }
  if (sourceOption) {
    chips.push({
      id: "source",
      label: sourceOption.label,
      remove: () => navigate({ ...shown, sourceId: null }),
    });
  }

  function loadMore() {
    void list.loadMore(async (cursor) => {
      const response = await fetchEmails(filters, cursor);
      if (!response.ok) {
        toast.error(copy.loadMoreFailed, {
          description: describeError(response.error),
        });
        return null;
      }
      return {
        items: response.data.emails,
        nextCursor: response.data.nextCursor,
      };
    });
  }

  function open(email: Email) {
    setSelected(email);
    setSheetOpen(true);
  }

  const teaching = ready && emails.length === 0 && !filtered;

  return (
    <div className="@container flex min-w-0 flex-col gap-[18px] text-[13px] leading-normal">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          docsUrl ? (
            <a
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(
                linkButtonClass,
                "gap-1.5 border-border",
                secondaryButtonClass,
              )}
            >
              <BookOpen aria-hidden className="size-4" strokeWidth={1.6} />
              {copy.apiDocs}
            </a>
          ) : null
        }
      />

      <section
        aria-label={copy.title}
        aria-busy={navigating || undefined}
        className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs"
      >
        {teaching ? null : (
          <div className="flex flex-col gap-2.5 border-b border-border-subtle px-4 py-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <Combobox
                items={statusOptions}
                value={statusOption}
                onValueChange={(next: StatusOption | null) =>
                  navigate({ ...shown, status: next?.value ?? null })
                }
              >
                <ComboboxInput
                  aria-label={copy.statusLabel}
                  placeholder={copy.statusPlaceholder}
                  showClear={statusOption !== null}
                  className="h-8 w-48 bg-card text-[13px] shadow-xs"
                />
                <ComboboxContent>
                  <ComboboxEmpty>{copy.statusEmpty}</ComboboxEmpty>
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
              <Combobox
                items={sources}
                value={sourceOption}
                onValueChange={(next: SourceOption | null) =>
                  navigate({ ...shown, sourceId: next?.value ?? null })
                }
              >
                <ComboboxInput
                  aria-label={copy.sourceLabel}
                  placeholder={copy.sourcePlaceholder}
                  showClear={sourceOption !== null}
                  className="h-8 w-60 bg-card text-[13px] shadow-xs"
                />
                <ComboboxContent>
                  <ComboboxEmpty>{copy.sourceEmpty}</ComboboxEmpty>
                  <ComboboxList>
                    {(item: SourceOption) => (
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
              {navigating ? (
                <Spinner className="size-3.5 text-ink-tertiary" />
              ) : null}
              {ready ? (
                <p
                  aria-live="polite"
                  className="ml-auto text-[12.5px] text-ink-tertiary tabular-nums"
                >
                  {copy.count(emails.length, list.cursor !== null)}
                </p>
              ) : null}
            </div>
            <FilterChips
              chips={chips}
              label={copy.activeFilters}
              clearLabel={copy.clearAll}
              removeLabel={copy.removeFilter}
              onClear={clearAll}
            />
          </div>
        )}

        {!ready ? (
          <LoadFailed
            title={copy.loadFailed.title}
            body={copy.loadFailed.body}
            retryLabel={copy.loadFailed.retry}
            pending={retrying}
            onRetry={() => startRetry(() => router.refresh())}
          />
        ) : teaching ? (
          <SendExample />
        ) : emails.length === 0 ? (
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyTitle className="text-sm font-semibold text-foreground">
                {copy.noMatchTitle}
              </EmptyTitle>
              <EmptyDescription className="text-[13px]">
                {copy.noMatchBody}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                type="button"
                variant="outline"
                onClick={clearAll}
                className={secondaryButtonClass}
              >
                {copy.clearAll}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <Table
              className={cn(
                "min-w-[860px] text-[13px] transition-opacity",
                navigating && "opacity-60",
              )}
            >
              <TableHeader className="[&_tr]:border-border-subtle">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(tableHeadClass, "w-[92px]")}>
                    {copy.columns.time}
                  </TableHead>
                  <TableHead className={tableHeadClass}>
                    {copy.columns.to}
                  </TableHead>
                  <TableHead className={tableHeadClass}>
                    {copy.columns.subject}
                  </TableHead>
                  <TableHead className={tableHeadClass}>
                    {copy.columns.source}
                  </TableHead>
                  <TableHead className={tableHeadClass}>
                    {copy.columns.status}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((email, index) => {
                  const moment = clock(email.createdAt);
                  const previous = emails[index - 1];
                  const newDay =
                    !previous ||
                    clock(previous.createdAt)?.dayKey !== moment?.dayKey;
                  const recipient = email.to[0] ?? copy.noRecipient;
                  const others = Math.max(email.to.length - 1, 0);
                  const subject = email.subject || copy.noSubject;
                  const sourceName = email.sourceName || copy.removedSource;
                  return (
                    <Fragment key={email.id}>
                      {newDay && moment ? (
                        <TableRow className="border-border-subtle hover:bg-transparent">
                          <TableCell
                            colSpan={5}
                            suppressHydrationWarning
                            className="bg-muted/30 px-4 py-1.5 text-xs font-medium text-muted-foreground"
                          >
                            {moment.day}
                          </TableCell>
                        </TableRow>
                      ) : null}
                      <TableRow
                        onClick={() => open(email)}
                        className="cursor-pointer border-border-subtle hover:bg-muted/50"
                      >
                        <TableCell
                          className={cn(
                            tableCellClass,
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
                        <TableCell className={cn(tableCellClass, "max-w-72")}>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              aria-label={copy.open(recipient, subject)}
                              onClick={(click) => {
                                click.stopPropagation();
                                open(email);
                              }}
                              className={cn(
                                "block min-w-0 truncate rounded-[4px] text-left font-medium text-foreground hover:text-primary",
                                focusRing,
                              )}
                            >
                              {recipient}
                            </button>
                            {others > 0 ? (
                              <span className="shrink-0 text-xs text-ink-tertiary tabular-nums">
                                <span aria-hidden="true">
                                  {copy.more(others)}
                                </span>
                                <span className="sr-only">
                                  {copy.moreRecipients(others)}
                                </span>
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell
                          className={cn(tableCellClass, "max-w-[420px]")}
                        >
                          <div className="truncate text-muted-foreground">
                            {subject}
                          </div>
                        </TableCell>
                        <TableCell className={cn(tableCellClass, "max-w-64")}>
                          <div className="flex items-center gap-2.5">
                            {email.integrationType ? (
                              <SourceMark
                                integration={{
                                  id: email.integrationType,
                                  mark: null,
                                }}
                                className="bg-card"
                              />
                            ) : null}
                            <span className="truncate text-muted-foreground">
                              {sourceName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className={tableCellClass}>
                          <StatusBadge tone={statusTones[email.status]}>
                            {statusLabels[email.status]}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            {list.cursor ? (
              <div className="flex justify-center border-t border-border-subtle px-4 py-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={list.loading || navigating}
                  aria-busy={list.loading || undefined}
                  onClick={loadMore}
                  className={secondaryButtonClass}
                >
                  {list.loading ? <Spinner /> : null}
                  {copy.loadMore}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <EmailDetailSheet
        email={selected}
        clock={clock}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
