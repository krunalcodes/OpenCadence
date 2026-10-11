"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
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
import {
  Ellipsis,
  Mails,
  Pause,
  Play,
  Search,
  UserRoundMinus,
  UserRoundPlus,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { buttonFocusRing, focusRing } from "@/components/app-shell/page-header";
import {
  type FilterChip,
  FilterChips,
} from "@/components/product/filter-chips";
import { LoadFailed } from "@/components/product/load-failed";
import { OptionCombobox } from "@/components/product/option-combobox";
import {
  dangerButtonClass,
  dialogActionsClass,
  dialogContentClass,
  dialogTitleClass,
  menuItemClass,
  primaryButtonClass,
  secondaryButtonClass,
  tableCellClass,
  tableHeadClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { StatusBadge } from "@/components/status-badge";
import { EnrollDialog } from "@/features/sequences/components/enroll-dialog";
import { EnrollmentSheet } from "@/features/sequences/components/enrollment-sheet";
import {
  copy,
  describeError,
  enrollmentLabels,
  enrollmentTones,
} from "@/features/sequences/lib/copy";
import {
  canPause,
  canRemove,
  canResume,
  contactName,
  type Enrollment,
  type EnrollmentAction,
  type EnrollmentFilters,
  type EnrollmentStatus,
  type EnrollResult,
  enrollmentStatuses,
} from "@/features/sequences/lib/enrollments";
import {
  maxSearchLength,
  type Sequence,
} from "@/features/sequences/lib/sequences";
import {
  changeEnrollment,
  fetchEnrollments,
} from "@/features/sequences/queries/client";
import { useHydrated } from "@/hooks/use-hydrated";
import type { AudienceList, AudienceSegment } from "@/lib/audience";
import { createEventClock, type EventClock } from "@/lib/event-clock";

const text = copy.contacts;
const searchDelay = 300;
const skeletonRows = ["one", "two", "three", "four", "five"];

const statusOptions = enrollmentStatuses.map((status) => ({
  value: status,
  label: enrollmentLabels[status],
}));

type Loaded = {
  filterKey: string;
  failed: boolean;
  items: Enrollment[];
  cursor: string | null;
  extended: boolean;
};

type ContactsTabProps = {
  sequence: Sequence;
  lists: AudienceList[];
  segments: AudienceSegment[];
  refreshNonce: number;
  onChanged: () => void;
};

function Moment({ clock, value }: { clock: EventClock; value: string | null }) {
  const moment = value ? clock(value) : null;
  return moment ? (
    <time dateTime={moment.iso} suppressHydrationWarning>
      {moment.day}, {moment.time}
    </time>
  ) : null;
}

export function ContactsTab({
  sequence,
  lists,
  segments,
  refreshNonce,
  onChanged,
}: ContactsTabProps) {
  const hydrated = useHydrated();
  const [filters, setFilters] = useState<EnrollmentFilters>({
    status: null,
    search: "",
  });
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reload, setReload] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Enrollment | null>(null);
  const [viewing, setViewing] = useState<Enrollment | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollKey, setEnrollKey] = useState(0);
  const extended = useRef(false);
  const seenRefresh = useRef(refreshNonce);

  const sequenceId = sequence.id;
  const filterKey = `${filters.status ?? ""}|${filters.search}`;
  const requestKey = `${reload}|${filterKey}`;
  const clock = createEventClock(
    hydrated ? "local" : "stable",
    new Date(),
    copy.days,
  );

  useEffect(() => {
    if (refreshNonce === seenRefresh.current) {
      return;
    }
    seenRefresh.current = refreshNonce;
    if (!extended.current) {
      setReload((value) => value + 1);
    }
  }, [refreshNonce]);

  useEffect(() => {
    let current = true;
    const [, status, search] = requestKey.split("|");
    const key = `${status}|${search}`;
    fetchEnrollments(sequenceId, {
      status: enrollmentStatuses.find((item) => item === status) ?? null,
      search: search ?? "",
    }).then((result) => {
      if (!current) {
        return;
      }
      extended.current = false;
      setLoaded(
        result.ok
          ? {
              filterKey: key,
              failed: false,
              items: result.data.enrollments,
              cursor: result.data.nextCursor,
              extended: false,
            }
          : {
              filterKey: key,
              failed: true,
              items: [],
              cursor: null,
              extended: false,
            },
      );
    });
    return () => {
      current = false;
    };
  }, [sequenceId, requestKey]);

  useEffect(() => {
    const next = query.trim().replace(/\|/g, " ");
    const timer = window.setTimeout(() => {
      setFilters((current) =>
        current.search === next ? current : { ...current, search: next },
      );
    }, searchDelay);
    return () => window.clearTimeout(timer);
  }, [query]);

  const stale = loaded !== null && loaded.filterKey !== filterKey;
  const filtered = filters.status !== null || filters.search !== "";
  const items = loaded?.items ?? [];
  const blank =
    loaded !== null &&
    !loaded.failed &&
    !stale &&
    items.length === 0 &&
    !filtered &&
    query === "";

  function refresh() {
    setReload((value) => value + 1);
    onChanged();
  }

  function clearAll() {
    setQuery("");
    setFilters({ status: null, search: "" });
  }

  const chips: FilterChip[] = [];
  if (filters.search !== "") {
    chips.push({
      id: "search",
      label: copy.searchChip(filters.search),
      remove: () => {
        setQuery("");
        setFilters((current) => ({ ...current, search: "" }));
      },
    });
  }
  if (filters.status) {
    chips.push({
      id: "status",
      label: enrollmentLabels[filters.status],
      remove: () => setFilters((current) => ({ ...current, status: null })),
    });
  }

  async function loadMore() {
    if (!loaded?.cursor || loadingMore) {
      return;
    }
    setLoadingMore(true);
    const key = loaded.filterKey;
    const result = await fetchEnrollments(sequenceId, filters, loaded.cursor);
    setLoadingMore(false);
    if (!result.ok) {
      toast.error(text.loadMoreFailed, {
        description: describeError(result.error),
      });
      return;
    }
    extended.current = true;
    setLoaded((current) => {
      if (!current || current.filterKey !== key) {
        return current;
      }
      const known = new Set(current.items.map((item) => item.id));
      return {
        ...current,
        items: [
          ...current.items,
          ...result.data.enrollments.filter((item) => !known.has(item.id)),
        ],
        cursor: result.data.nextCursor,
        extended: true,
      };
    });
  }

  function replace(enrollment: Enrollment) {
    setLoaded((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === enrollment.id ? enrollment : item,
            ),
          }
        : current,
    );
  }

  async function act(enrollment: Enrollment, action: EnrollmentAction) {
    if (busy) {
      return false;
    }
    setBusy(enrollment.id);
    const result = await changeEnrollment(sequenceId, enrollment.id, action);
    setBusy(null);
    const email = enrollment.contact.email;
    if (!result.ok) {
      toast.error(text.actionFailed(email), {
        description: describeError(result.error),
      });
      if (result.error.code === "invalid_state") {
        refresh();
      }
      return false;
    }
    replace(result.data);
    toast.success(
      action === "pause"
        ? text.paused(email)
        : action === "resume"
          ? text.resumed(email)
          : text.removed(email),
    );
    onChanged();
    return true;
  }

  function handleEnrolled(result: EnrollResult) {
    setEnrollOpen(false);
    if (result.queued) {
      toast.success(copy.enroll.queued, {
        description: copy.enroll.queuedBody,
      });
    } else {
      toast.success(copy.enroll.done(result.enrolled), {
        description: copy.enroll.doneBody(
          result.alreadyEnrolled,
          result.suppressed,
        ),
      });
    }
    refresh();
  }

  function openEnroll() {
    setEnrollKey((value) => value + 1);
    setEnrollOpen(true);
  }

  const archived = sequence.status === "archived";

  return (
    <>
      <section
        aria-label={text.sectionLabel}
        aria-busy={stale || undefined}
        className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs"
      >
        <div className="flex flex-col gap-2.5 border-b border-border-subtle px-4 py-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            {blank ? null : (
              <>
                <InputGroup className="h-8 w-64 max-w-full bg-card shadow-xs">
                  <InputGroupAddon>
                    <Search aria-hidden strokeWidth={1.6} />
                  </InputGroupAddon>
                  <InputGroupInput
                    type="search"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={maxSearchLength}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label={text.searchLabel}
                    placeholder={text.searchPlaceholder}
                    className="text-[13px]"
                  />
                </InputGroup>
                <OptionCombobox
                  options={statusOptions}
                  value={filters.status}
                  label={text.statusLabel}
                  placeholder={text.statusPlaceholder}
                  empty={text.statusEmpty}
                  className="w-44"
                  onChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      status:
                        enrollmentStatuses.find(
                          (status): status is EnrollmentStatus =>
                            status === value,
                        ) ?? null,
                    }))
                  }
                />
                {stale ? (
                  <Spinner className="size-3.5 text-ink-tertiary" />
                ) : null}
              </>
            )}
            <div className="ml-auto flex items-center gap-3">
              {loaded && !loaded.failed && !blank ? (
                <p
                  aria-live="polite"
                  className="text-[12.5px] text-ink-tertiary tabular-nums"
                >
                  {text.count(items.length, loaded.cursor !== null)}
                </p>
              ) : null}
              <Button
                type="button"
                disabled={archived}
                onClick={openEnroll}
                className={primaryButtonClass}
              >
                <UserRoundPlus aria-hidden strokeWidth={1.8} />
                {text.enroll}
              </Button>
            </div>
          </div>
          <FilterChips
            chips={chips}
            label={copy.activeFilters}
            clearLabel={copy.clearAll}
            removeLabel={copy.removeFilter}
            onClear={clearAll}
          />
        </div>

        {loaded === null ? (
          <div aria-hidden className="divide-y divide-border-subtle">
            {skeletonRows.map((row) => (
              <div key={row} className="flex items-center gap-4 px-4 py-[11px]">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="mt-1.5 h-3.5 w-52 max-w-full" />
                </div>
                <Skeleton className="h-[22px] w-20 rounded-[6px]" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="size-7" />
              </div>
            ))}
          </div>
        ) : loaded.failed ? (
          <LoadFailed
            title={text.loadFailedTitle}
            body={text.loadFailedBody}
            retryLabel={copy.loadFailed.retry}
            pending={false}
            onRetry={() => {
              setLoaded(null);
              setReload((value) => value + 1);
            }}
          />
        ) : blank ? (
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyMedia
                variant="icon"
                className="size-9 border border-border bg-card text-primary shadow-xs"
              >
                <Users strokeWidth={1.6} aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-sm font-semibold text-foreground">
                {text.emptyTitle}
              </EmptyTitle>
              <EmptyDescription className="text-[13px]">
                {text.emptyBody}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : items.length === 0 ? (
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyTitle className="text-sm font-semibold text-foreground">
                {text.noMatchTitle}
              </EmptyTitle>
              <EmptyDescription className="text-[13px]">
                {text.noMatchBody}
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
                "min-w-[860px] table-fixed text-[13px] transition-opacity",
                stale && "opacity-60",
              )}
            >
              <TableHeader className="[&_tr]:border-border-subtle">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={tableHeadClass}>
                    {text.columns.contact}
                  </TableHead>
                  <TableHead className={cn(tableHeadClass, "w-36")}>
                    {text.columns.status}
                  </TableHead>
                  <TableHead className={cn(tableHeadClass, "w-[20%]")}>
                    {text.columns.mailbox}
                  </TableHead>
                  <TableHead className={cn(tableHeadClass, "w-48")}>
                    {text.columns.next}
                  </TableHead>
                  <TableHead className={cn(tableHeadClass, "w-44")}>
                    {text.columns.lastSent}
                  </TableHead>
                  <TableHead className={cn(tableHeadClass, "w-14")}>
                    <span className="sr-only">{text.columns.actions}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((enrollment) => {
                  const name = contactName(enrollment.contact);
                  const email = enrollment.contact.email;
                  const open =
                    enrollment.status === "active" ||
                    enrollment.status === "paused";
                  const hasNext =
                    open && enrollment.nextStepPosition < sequence.stepCount;
                  return (
                    <TableRow
                      key={enrollment.id}
                      className="border-border-subtle hover:bg-muted/50"
                    >
                      <TableCell className={tableCellClass}>
                        <button
                          type="button"
                          onClick={() => setViewing(enrollment)}
                          className={cn(
                            "block max-w-full truncate rounded-[4px] text-left font-medium text-foreground hover:underline",
                            focusRing,
                          )}
                        >
                          {name ?? email}
                        </button>
                        {name ? (
                          <div className="truncate text-[12.5px] text-ink-tertiary">
                            {email}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className={tableCellClass}>
                        <StatusBadge tone={enrollmentTones[enrollment.status]}>
                          {enrollmentLabels[enrollment.status]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className={tableCellClass}>
                        <div
                          className={cn(
                            "truncate",
                            enrollment.source
                              ? "text-muted-foreground"
                              : "text-ink-tertiary",
                          )}
                        >
                          {enrollment.source?.name || text.noMailbox}
                        </div>
                      </TableCell>
                      <TableCell className={cn(tableCellClass, "tabular-nums")}>
                        {hasNext ? (
                          <>
                            <div className="text-foreground">
                              {text.nextStep(enrollment.nextStepPosition + 1)}
                            </div>
                            <div className="truncate text-[12.5px] text-ink-tertiary">
                              {enrollment.status === "paused" ? (
                                enrollmentLabels.paused
                              ) : enrollment.nextRunAt ? (
                                <Moment
                                  clock={clock}
                                  value={enrollment.nextRunAt}
                                />
                              ) : (
                                text.waitingForWindow
                              )}
                            </div>
                          </>
                        ) : (
                          <span className="text-ink-tertiary">
                            {text.noNext}
                          </span>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          tableCellClass,
                          "whitespace-nowrap text-muted-foreground tabular-nums",
                        )}
                      >
                        {enrollment.lastSentAt ? (
                          <Moment clock={clock} value={enrollment.lastSentAt} />
                        ) : (
                          <span className="text-ink-tertiary">
                            {text.never}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={cn(tableCellClass, "text-right")}>
                        {busy === enrollment.id ? (
                          <span className="inline-grid size-7 place-items-center">
                            <Spinner className="size-3.5 text-ink-tertiary" />
                          </span>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              aria-label={text.actionsFor(email)}
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
                              className="w-52 p-1 text-[13px]"
                            >
                              <DropdownMenuItem
                                className={menuItemClass}
                                onClick={() => setViewing(enrollment)}
                              >
                                <Mails aria-hidden strokeWidth={1.6} />
                                {text.view}
                              </DropdownMenuItem>
                              {canPause(enrollment) ? (
                                <DropdownMenuItem
                                  className={menuItemClass}
                                  onClick={() => void act(enrollment, "pause")}
                                >
                                  <Pause aria-hidden strokeWidth={1.6} />
                                  {text.pause}
                                </DropdownMenuItem>
                              ) : null}
                              {canResume(enrollment) ? (
                                <DropdownMenuItem
                                  className={menuItemClass}
                                  onClick={() => void act(enrollment, "resume")}
                                >
                                  <Play aria-hidden strokeWidth={1.6} />
                                  {text.resume}
                                </DropdownMenuItem>
                              ) : null}
                              {canRemove(enrollment) ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    className={menuItemClass}
                                    onClick={() => setRemoving(enrollment)}
                                  >
                                    <UserRoundMinus
                                      aria-hidden
                                      strokeWidth={1.6}
                                    />
                                    {text.remove}
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {loaded.cursor ? (
              <div className="flex justify-center border-t border-border-subtle px-4 py-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loadingMore || stale}
                  aria-busy={loadingMore || undefined}
                  onClick={() => void loadMore()}
                  className={secondaryButtonClass}
                >
                  {loadingMore ? <Spinner /> : null}
                  {copy.loadMore}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <EnrollDialog
        open={enrollOpen}
        formKey={enrollKey}
        sequence={sequence}
        lists={lists}
        segments={segments}
        onOpenChange={setEnrollOpen}
        onEnrolled={handleEnrolled}
      />
      <EnrollmentSheet
        sequenceId={sequenceId}
        steps={sequence.steps}
        enrollment={viewing}
        clock={clock}
        onClose={() => setViewing(null)}
      />
      <RemoveDialog
        enrollment={removing}
        pending={busy !== null && busy === removing?.id}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing && (await act(removing, "remove"))) {
            setRemoving(null);
          }
        }}
      />
    </>
  );
}

type RemoveDialogProps = {
  enrollment: Enrollment | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

function RemoveDialog({
  enrollment,
  pending,
  onClose,
  onConfirm,
}: RemoveDialogProps) {
  const [last, setLast] = useState(enrollment);
  const dialog = text.removeDialog;

  if (enrollment !== null && enrollment !== last) {
    setLast(enrollment);
  }

  const shown = enrollment ?? last;

  return (
    <Dialog
      open={enrollment !== null}
      onOpenChange={(next) => {
        if (!next && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent className={dialogContentClass}>
        <DialogHeader>
          <DialogTitle className={`${dialogTitleClass} break-words`}>
            {dialog.title(shown?.contact.email ?? "")}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {dialog.body}
          </DialogDescription>
        </DialogHeader>
        <div className={dialogActionsClass}>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
            className={secondaryButtonClass}
          >
            {dialog.cancel}
          </Button>
          <Button
            type="button"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={onConfirm}
            className={dangerButtonClass}
          >
            {pending ? <Spinner /> : null}
            {dialog.confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
