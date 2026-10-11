"use client";

import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import {
  Archive,
  Copy,
  Ellipsis,
  GitBranch,
  Pencil,
  Plus,
  Search,
  Sparkles,
  SquarePen,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  buttonFocusRing,
  focusRing,
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
  segmentedGroupClass,
  segmentedItemClass,
  tableCellClass,
  tableHeadClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { StatusBadge } from "@/components/status-badge";
import { DeleteSequenceDialog } from "@/features/sequences/components/delete-sequence-dialog";
import { GenerateSheet } from "@/features/sequences/components/generate-sheet";
import { NameDialog } from "@/features/sequences/components/name-dialog";
import { copy, describeError, statusTone } from "@/features/sequences/lib/copy";
import {
  filtersSearch,
  maxSearchLength,
  replyRate,
  type Sequence,
  type SequenceFilters,
  type SequenceStatus,
  type SequenceSummary,
  type SequencesResult,
  sequencePath,
  sequenceStatuses,
  toStatusFilter,
} from "@/features/sequences/lib/sequences";
import {
  changeSequenceStatus,
  duplicateSequence,
  fetchSequences,
} from "@/features/sequences/queries/client";
import { useLoadMore } from "@/hooks/use-load-more";
import { appHref } from "@/lib/navigation";

const searchDelay = 300;
const allValue = "all";

const noSequences: SequenceSummary[] = [];
const noneDeleted: string[] = [];

const numberCellClass = cn(tableCellClass, "text-right tabular-nums");
const numberHeadClass = cn(tableHeadClass, "w-24 text-right");

type SequencesScreenProps = {
  result: SequencesResult;
  filters: SequenceFilters;
  aiConfigured: boolean;
};

export function SequencesScreen({
  result,
  filters,
  aiConfigured,
}: SequencesScreenProps) {
  const router = useRouter();
  const ready = result.state === "ready";
  const list = useLoadMore(result, {
    items: ready ? result.sequences : noSequences,
    nextCursor: ready ? result.nextCursor : null,
  });
  const [draft, setDraft] = useState<SequenceFilters | null>(null);
  const [text, setText] = useState(filters.search);
  const [deleted, setDeleted] = useState(noneDeleted);
  const [target, setTarget] = useState<SequenceSummary | null>(null);
  const [naming, setNaming] = useState<SequenceSummary | null>(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [nameKey, setNameKey] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [navigating, startNavigation] = useTransition();
  const [retrying, startRetry] = useTransition();
  const requested = useRef(filters.search);

  const shown = navigating && draft ? draft : filters;
  const sequences = list.items.filter((item) => !deleted.includes(item.id));
  const filtered = shown.status !== null || shown.search !== "";
  const blank = ready && sequences.length === 0 && !filtered && text === "";

  function navigate(next: SequenceFilters) {
    const search = filtersSearch(next);
    const base = appHref("sequences");
    requested.current = next.search;
    setDraft(next);
    startNavigation(() => {
      router.replace(search ? `${base}?${search}` : base);
    });
  }

  const activeStatus = shown.status;

  useEffect(() => {
    const next = text.trim();
    if (next === requested.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      const wanted = { status: activeStatus, search: next };
      const search = filtersSearch(wanted);
      const base = appHref("sequences");
      requested.current = next;
      setDraft(wanted);
      startNavigation(() => {
        router.replace(search ? `${base}?${search}` : base);
      });
    }, searchDelay);
    return () => window.clearTimeout(timer);
  }, [text, activeStatus, router]);

  function clearSearch() {
    setText("");
    navigate({ ...shown, search: "" });
  }

  function clearAll() {
    setText("");
    navigate({ status: null, search: "" });
  }

  const chips: FilterChip[] = [];
  if (shown.search !== "") {
    chips.push({
      id: "search",
      label: copy.searchChip(shown.search),
      remove: clearSearch,
    });
  }
  if (shown.status) {
    chips.push({
      id: "status",
      label: copy.statuses[shown.status],
      remove: () => navigate({ ...shown, status: null }),
    });
  }

  function loadMore() {
    void list.loadMore(async (cursor) => {
      const response = await fetchSequences(filters, cursor);
      if (!response.ok) {
        toast.error(copy.loadMoreFailed, {
          description: describeError(response.error),
        });
        return null;
      }
      return {
        items: response.data.sequences,
        nextCursor: response.data.nextCursor,
      };
    });
  }

  function openName(sequence: SequenceSummary | null) {
    setNaming(sequence);
    setNameKey((current) => current + 1);
    setNameOpen(true);
  }

  function handleNamed(sequence: Sequence, created: boolean) {
    if (created) {
      router.push(appHref(sequencePath(sequence.id)));
      return;
    }
    setNameOpen(false);
    toast.success(copy.toasts.renamed(sequence.name));
    router.refresh();
  }

  async function duplicate(sequence: SequenceSummary) {
    if (busy) {
      return;
    }
    setBusy(sequence.id);
    const response = await duplicateSequence(sequence.id);
    setBusy(null);
    if (!response.ok) {
      toast.error(copy.toasts.duplicateFailed(sequence.name), {
        description: describeError(response.error),
      });
      return;
    }
    toast.success(copy.toasts.duplicated(response.data.name));
    router.refresh();
  }

  async function archive(sequence: SequenceSummary) {
    if (busy) {
      return;
    }
    setBusy(sequence.id);
    const response = await changeSequenceStatus(sequence.id, "archive");
    setBusy(null);
    if (!response.ok) {
      toast.error(copy.toasts.archiveFailed(sequence.name), {
        description: describeError(response.error),
      });
      return;
    }
    toast.success(copy.toasts.archived(sequence.name));
    router.refresh();
  }

  function handleDeleted(sequence: SequenceSummary) {
    setDeleted((current) => [...current, sequence.id]);
    router.refresh();
  }

  function pickStatus(values: string[]) {
    const picked = values[0];
    if (picked === undefined) {
      return;
    }
    const status: SequenceStatus | null =
      picked === allValue ? null : toStatusFilter(picked);
    if (status !== shown.status) {
      navigate({ ...shown, status });
    }
  }

  return (
    <div className="@container flex min-w-0 flex-col gap-[18px] text-[13px] leading-normal">
      <PageHeader
        title={copy.title}
        description={<p className="max-w-[720px]">{copy.description}</p>}
        actions={
          ready ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setGenerating(true)}
                className={secondaryButtonClass}
              >
                <Sparkles aria-hidden strokeWidth={1.6} />
                {copy.ai.open}
              </Button>
              <Button
                type="button"
                onClick={() => openName(null)}
                className={primaryButtonClass}
              >
                <Plus aria-hidden strokeWidth={1.8} />
                {copy.add}
              </Button>
            </>
          ) : null
        }
      />

      <section
        aria-label={copy.title}
        aria-busy={navigating || undefined}
        className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs"
      >
        {blank || !ready ? null : (
          <div className="flex flex-col gap-2.5 border-b border-border-subtle px-4 py-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                aria-label={copy.statusFilterLabel}
                value={[shown.status ?? allValue]}
                onValueChange={pickStatus}
                className={segmentedGroupClass}
              >
                <ToggleGroupItem
                  value={allValue}
                  className={segmentedItemClass}
                >
                  {copy.allStatuses}
                </ToggleGroupItem>
                {sequenceStatuses.map((status) => (
                  <ToggleGroupItem
                    key={status}
                    value={status}
                    className={segmentedItemClass}
                  >
                    {copy.statuses[status]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <InputGroup className="h-8 w-64 max-w-full bg-card shadow-xs">
                <InputGroupAddon>
                  <Search aria-hidden strokeWidth={1.6} />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
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
              {navigating ? (
                <Spinner className="size-3.5 text-ink-tertiary" />
              ) : null}
              <p
                aria-live="polite"
                className="ml-auto text-[12.5px] text-ink-tertiary tabular-nums"
              >
                {copy.count(sequences.length, list.cursor !== null)}
              </p>
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
                <GitBranch strokeWidth={1.6} aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-sm font-semibold text-foreground">
                {copy.emptyTitle}
              </EmptyTitle>
              <EmptyDescription className="text-[13px]">
                {copy.emptyBody}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row flex-wrap justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => openName(null)}
                className={secondaryButtonClass}
              >
                <Plus aria-hidden strokeWidth={1.8} />
                {copy.add}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setGenerating(true)}
                className={secondaryButtonClass}
              >
                <Sparkles aria-hidden strokeWidth={1.6} />
                {copy.ai.open}
              </Button>
            </EmptyContent>
          </Empty>
        ) : sequences.length === 0 ? (
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
                "min-w-[820px] table-fixed text-[13px] transition-opacity",
                navigating && "opacity-60",
              )}
            >
              <TableHeader className="[&_tr]:border-border-subtle">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={tableHeadClass}>
                    {copy.columns.name}
                  </TableHead>
                  <TableHead className={cn(tableHeadClass, "w-32")}>
                    {copy.columns.status}
                  </TableHead>
                  <TableHead className={cn(numberHeadClass, "w-20")}>
                    {copy.columns.steps}
                  </TableHead>
                  <TableHead className={numberHeadClass}>
                    {copy.columns.active}
                  </TableHead>
                  <TableHead className={cn(numberHeadClass, "w-44")}>
                    {copy.columns.replied}
                  </TableHead>
                  <TableHead className={numberHeadClass}>
                    {copy.columns.sent}
                  </TableHead>
                  <TableHead className={cn(tableHeadClass, "w-14")}>
                    <span className="sr-only">{copy.columns.actions}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sequences.map((sequence) => {
                  const href = appHref(sequencePath(sequence.id));
                  const rate = replyRate(sequence.stats);
                  return (
                    <TableRow
                      key={sequence.id}
                      className="border-border-subtle hover:bg-muted/50"
                    >
                      <TableCell className={tableCellClass}>
                        <Link
                          href={href}
                          title={sequence.name}
                          className={cn(
                            "block truncate rounded-[4px] font-medium text-foreground hover:underline",
                            focusRing,
                          )}
                        >
                          {sequence.name}
                        </Link>
                      </TableCell>
                      <TableCell className={tableCellClass}>
                        <StatusBadge
                          tone={statusTone(
                            sequence.status,
                            sequence.stats.active > 0,
                          )}
                        >
                          {copy.statuses[sequence.status]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className={numberCellClass}>
                        {copy.number(sequence.stepCount)}
                      </TableCell>
                      <TableCell className={numberCellClass}>
                        {copy.number(sequence.stats.active)}
                      </TableCell>
                      <TableCell className={numberCellClass}>
                        <span className="text-foreground">
                          {copy.number(sequence.stats.replied)}
                        </span>
                        {rate === null ? null : (
                          <span className="ml-2 text-ink-tertiary">
                            {copy.replyRate(rate)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={numberCellClass}>
                        {copy.number(sequence.stats.sent)}
                      </TableCell>
                      <TableCell className={cn(tableCellClass, "text-right")}>
                        {busy === sequence.id ? (
                          <span className="inline-grid size-7 place-items-center">
                            <Spinner className="size-3.5 text-ink-tertiary" />
                          </span>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              aria-label={copy.actionsFor(sequence.name)}
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
                              className="w-48 p-1 text-[13px]"
                            >
                              <DropdownMenuItem
                                className={menuItemClass}
                                render={<Link href={href} />}
                              >
                                <SquarePen aria-hidden strokeWidth={1.6} />
                                {copy.menu.open}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className={menuItemClass}
                                onClick={() => openName(sequence)}
                              >
                                <Pencil aria-hidden strokeWidth={1.6} />
                                {copy.menu.rename}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className={menuItemClass}
                                onClick={() => void duplicate(sequence)}
                              >
                                <Copy aria-hidden strokeWidth={1.6} />
                                {copy.menu.duplicate}
                              </DropdownMenuItem>
                              {sequence.status === "archived" ? null : (
                                <DropdownMenuItem
                                  className={menuItemClass}
                                  onClick={() => void archive(sequence)}
                                >
                                  <Archive aria-hidden strokeWidth={1.6} />
                                  {copy.menu.archive}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                className={menuItemClass}
                                onClick={() => setTarget(sequence)}
                              >
                                <Trash2 aria-hidden strokeWidth={1.6} />
                                {copy.menu.remove}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
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

      <NameDialog
        open={nameOpen}
        formKey={nameKey}
        sequence={naming}
        onOpenChange={setNameOpen}
        onSaved={handleNamed}
      />
      <GenerateSheet
        open={generating}
        configured={aiConfigured}
        onOpenChange={setGenerating}
      />
      <DeleteSequenceDialog
        sequence={target}
        onClose={() => setTarget(null)}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
