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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import { Ban, Ellipsis, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  buttonFocusRing,
  PageHeader,
} from "@/components/app-shell/page-header";
import {
  type FilterChip,
  FilterChips,
} from "@/components/product/filter-chips";
import { LoadFailed } from "@/components/product/load-failed";
import {
  menuItemClass,
  primaryButtonClass,
  secondaryButtonClass,
  tableCellClass,
  tableHeadClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { StatusBadge } from "@/components/status-badge";
import { AddAddressesSheet } from "@/features/suppression/components/add-addresses-sheet";
import { RemoveDialog } from "@/features/suppression/components/remove-dialog";
import {
  copy,
  describeError,
  originLabels,
  reasonLabels,
  reasonTones,
} from "@/features/suppression/lib/copy";
import {
  type AddResult,
  filtersSearch,
  maxSearchLength,
  type Suppression,
  type SuppressionFilters,
  type SuppressionReason,
  type SuppressionsResult,
  suppressionReasons,
} from "@/features/suppression/lib/suppressions";
import { fetchSuppressions } from "@/features/suppression/queries/mutations";
import { useHydrated } from "@/hooks/use-hydrated";
import { useLoadMore } from "@/hooks/use-load-more";
import { createEventClock } from "@/lib/event-clock";
import { appHref } from "@/lib/navigation";

type ReasonOption = { value: SuppressionReason; label: string };

const reasonOptions: ReasonOption[] = suppressionReasons.map((reason) => ({
  value: reason,
  label: reasonLabels[reason],
}));

const searchDelay = 300;

const noSuppressions: Suppression[] = [];
const noneRemoved: string[] = [];

type SuppressionScreenProps = {
  result: SuppressionsResult;
  filters: SuppressionFilters;
};

export function SuppressionScreen({ result, filters }: SuppressionScreenProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const ready = result.state === "ready";
  const list = useLoadMore(result, {
    items: ready ? result.suppressions : noSuppressions,
    nextCursor: ready ? result.nextCursor : null,
  });
  const [draft, setDraft] = useState<SuppressionFilters | null>(null);
  const [text, setText] = useState(filters.search);
  const [removed, setRemoved] = useState(noneRemoved);
  const [target, setTarget] = useState<Suppression | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [navigating, startNavigation] = useTransition();
  const [retrying, startRetry] = useTransition();
  const requested = useRef(filters.search);

  const shown = navigating && draft ? draft : filters;
  const suppressions = list.items.filter((item) => !removed.includes(item.id));
  const clock = createEventClock(
    hydrated ? "local" : "stable",
    new Date(),
    copy.days,
  );
  const reasonOption =
    reasonOptions.find((option) => option.value === shown.reason) ?? null;
  const filtered = shown.reason !== null || shown.search !== "";
  const blank = ready && suppressions.length === 0 && !filtered && text === "";

  function navigate(next: SuppressionFilters) {
    const search = filtersSearch(next);
    const base = appHref("suppressions");
    requested.current = next.search;
    setDraft(next);
    startNavigation(() => {
      router.replace(search ? `${base}?${search}` : base);
    });
  }

  const activeReason = shown.reason;

  useEffect(() => {
    const next = text.trim();
    if (next === requested.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      const wanted = { reason: activeReason, search: next };
      const search = filtersSearch(wanted);
      const base = appHref("suppressions");
      requested.current = next;
      setDraft(wanted);
      startNavigation(() => {
        router.replace(search ? `${base}?${search}` : base);
      });
    }, searchDelay);
    return () => window.clearTimeout(timer);
  }, [text, activeReason, router]);

  function clearSearch() {
    setText("");
    navigate({ ...shown, search: "" });
  }

  function clearAll() {
    setText("");
    navigate({ reason: null, search: "" });
  }

  const chips: FilterChip[] = [];
  if (shown.search !== "") {
    chips.push({
      id: "search",
      label: copy.searchChip(shown.search),
      remove: clearSearch,
    });
  }
  if (reasonOption) {
    chips.push({
      id: "reason",
      label: reasonOption.label,
      remove: () => navigate({ ...shown, reason: null }),
    });
  }

  function loadMore() {
    void list.loadMore(async (cursor) => {
      const response = await fetchSuppressions(filters, cursor);
      if (!response.ok) {
        toast.error(copy.loadMoreFailed, {
          description: describeError(response.error),
        });
        return null;
      }
      return {
        items: response.data.suppressions,
        nextCursor: response.data.nextCursor,
      };
    });
  }

  function openAdd() {
    setAddKey((current) => current + 1);
    setAddOpen(true);
  }

  function handleAdded(added: AddResult) {
    setAddOpen(false);
    toast.success(copy.toasts.added(added.added, added.existing));
    router.refresh();
  }

  function handleRemoved(suppression: Suppression) {
    setRemoved((current) => [...current, suppression.id]);
    router.refresh();
  }

  return (
    <div className="@container flex min-w-0 flex-col gap-[18px] text-[13px] leading-normal">
      <PageHeader
        title={copy.title}
        description={<p className="max-w-[720px]">{copy.description}</p>}
        actions={
          ready ? (
            <Button
              type="button"
              onClick={openAdd}
              className={primaryButtonClass}
            >
              <Plus aria-hidden strokeWidth={1.8} />
              {copy.add}
            </Button>
          ) : null
        }
      />

      <section
        aria-label={copy.title}
        aria-busy={navigating || undefined}
        className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs"
      >
        {blank ? null : (
          <div className="flex flex-col gap-2.5 border-b border-border-subtle px-4 py-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <InputGroup className="h-8 w-60 bg-card shadow-xs">
                <InputGroupAddon>
                  <Search aria-hidden strokeWidth={1.6} />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  inputMode="email"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={maxSearchLength}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  aria-label={copy.searchLabel}
                  placeholder={copy.searchPlaceholder}
                  className="text-[13px]"
                />
              </InputGroup>
              <Combobox
                items={reasonOptions}
                value={reasonOption}
                onValueChange={(next: ReasonOption | null) =>
                  navigate({ ...shown, reason: next?.value ?? null })
                }
              >
                <ComboboxInput
                  aria-label={copy.reasonLabel}
                  placeholder={copy.reasonPlaceholder}
                  showClear={reasonOption !== null}
                  className="h-8 w-48 bg-card text-[13px] shadow-xs"
                />
                <ComboboxContent>
                  <ComboboxEmpty>{copy.reasonEmpty}</ComboboxEmpty>
                  <ComboboxList>
                    {(item: ReasonOption) => (
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
                  {copy.count(suppressions.length, list.cursor !== null)}
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
        ) : blank ? (
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyMedia
                variant="icon"
                className="size-9 border border-border bg-card text-primary shadow-xs"
              >
                <Ban strokeWidth={1.6} aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-sm font-semibold text-foreground">
                {copy.emptyTitle}
              </EmptyTitle>
              <EmptyDescription className="text-[13px]">
                {copy.emptyBody}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : suppressions.length === 0 ? (
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
                  <TableHead className={tableHeadClass}>
                    {copy.columns.email}
                  </TableHead>
                  <TableHead className={tableHeadClass}>
                    {copy.columns.reason}
                  </TableHead>
                  <TableHead className={tableHeadClass}>
                    {copy.columns.origin}
                  </TableHead>
                  <TableHead className={tableHeadClass}>
                    {copy.columns.note}
                  </TableHead>
                  <TableHead className={tableHeadClass}>
                    {copy.columns.added}
                  </TableHead>
                  <TableHead className={tableHeadClass}>
                    <span className="sr-only">{copy.columns.actions}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppressions.map((suppression) => {
                  const moment = clock(suppression.createdAt);
                  return (
                    <TableRow
                      key={suppression.id}
                      className="border-border-subtle hover:bg-muted/50"
                    >
                      <TableCell className={cn(tableCellClass, "max-w-80")}>
                        <div className="truncate font-medium text-foreground">
                          {suppression.email}
                        </div>
                      </TableCell>
                      <TableCell className={tableCellClass}>
                        <StatusBadge tone={reasonTones[suppression.reason]}>
                          {reasonLabels[suppression.reason]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          tableCellClass,
                          "whitespace-nowrap text-muted-foreground",
                        )}
                      >
                        {originLabels[suppression.origin]}
                      </TableCell>
                      <TableCell className={cn(tableCellClass, "max-w-72")}>
                        {suppression.note ? (
                          <div
                            title={suppression.note}
                            className="truncate text-ink-tertiary"
                          >
                            {suppression.note}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell
                        className={cn(
                          tableCellClass,
                          "whitespace-nowrap text-muted-foreground tabular-nums",
                        )}
                      >
                        {moment ? (
                          <time dateTime={moment.iso} suppressHydrationWarning>
                            {moment.day}
                          </time>
                        ) : null}
                      </TableCell>
                      <TableCell className={cn(tableCellClass, "text-right")}>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={copy.actionsFor(suppression.email)}
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className={cn(
                                  "-mr-1.5 text-muted-foreground hover:bg-accent",
                                  buttonFocusRing,
                                )}
                              />
                            }
                          >
                            <Ellipsis aria-hidden strokeWidth={1.6} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-40 p-1 text-[13px]"
                          >
                            <DropdownMenuItem
                              variant="destructive"
                              className={menuItemClass}
                              onClick={() => setTarget(suppression)}
                            >
                              <Trash2 aria-hidden strokeWidth={1.6} />
                              {copy.remove}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
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

      <AddAddressesSheet
        open={addOpen}
        formKey={addKey}
        onOpenChange={setAddOpen}
        onAdded={handleAdded}
      />
      <RemoveDialog
        suppression={target}
        onClose={() => setTarget(null)}
        onRemoved={handleRemoved}
      />
    </div>
  );
}
