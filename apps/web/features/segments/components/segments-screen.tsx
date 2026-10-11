"use client";

import { Button } from "@workspace/ui/components/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import {
  Copy,
  Ellipsis,
  Funnel,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  buttonFocusRing,
  focusRing,
  PageHeader,
} from "@/components/app-shell/page-header";
import { describeFilter } from "@/components/filter-builder/filter";
import { LoadFailed } from "@/components/product/load-failed";
import {
  menuItemClass,
  primaryButtonClass,
  secondaryButtonClass,
  tableCellClass,
  tableHeadClass,
} from "@/components/product/styles";
import { DeleteSegmentDialog } from "@/features/segments/components/delete-segment-dialog";
import { SegmentCountCell } from "@/features/segments/components/segment-count";
import {
  type SegmentEditorTarget,
  SegmentSheet,
} from "@/features/segments/components/segment-sheet";
import { useSegmentCounts } from "@/features/segments/hooks/use-segment-counts";
import { copy } from "@/features/segments/lib/copy";
import {
  countKey,
  type Segment,
  type SegmentOptions,
  type SegmentsResult,
  segmentContactsSearch,
} from "@/features/segments/lib/segments";
import { useHydrated } from "@/hooks/use-hydrated";
import { createEventClock } from "@/lib/event-clock";
import { appHref } from "@/lib/navigation";

const noSegments: Segment[] = [];
const noneDeleted: string[] = [];
const noOptions: SegmentOptions = { fields: [], lists: [], tags: [] };
const createTarget: SegmentEditorTarget = { mode: "create" };

type SegmentsScreenProps = {
  result: SegmentsResult;
};

export function SegmentsScreen({ result }: SegmentsScreenProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const ready = result.state === "ready";
  const { counts, request } = useSegmentCounts();
  const [deleted, setDeleted] = useState(noneDeleted);
  const [removing, setRemoving] = useState<Segment | null>(null);
  const [target, setTarget] = useState(createTarget);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);
  const [retrying, startRetry] = useTransition();

  const options = useMemo<SegmentOptions>(
    () =>
      result.state === "ready"
        ? { fields: result.fields, lists: result.lists, tags: result.tags }
        : noOptions,
    [result],
  );
  const segments = (ready ? result.segments : noSegments).filter(
    (segment) => !deleted.includes(segment.id),
  );
  const clock = createEventClock(
    hydrated ? "local" : "stable",
    new Date(),
    copy.days,
  );

  function openSheet(next: SegmentEditorTarget) {
    setTarget(next);
    setSheetKey((current) => current + 1);
    setSheetOpen(true);
  }

  function handleSaved(segment: Segment, created: boolean) {
    setSheetOpen(false);
    toast.success(
      created
        ? copy.toasts.created(segment.name)
        : copy.toasts.saved(segment.name),
    );
    router.refresh();
  }

  function handleDeleted(segment: Segment) {
    setDeleted((current) => [...current, segment.id]);
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
              onClick={() => openSheet(createTarget)}
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
        className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs"
      >
        {!ready ? (
          <LoadFailed
            title={copy.loadFailed.title}
            body={copy.loadFailed.body}
            retryLabel={copy.loadFailed.retry}
            pending={retrying}
            onRetry={() => startRetry(() => router.refresh())}
          />
        ) : segments.length === 0 ? (
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyMedia
                variant="icon"
                className="size-9 border border-border bg-card text-primary shadow-xs"
              >
                <Funnel strokeWidth={1.6} aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-sm font-semibold text-foreground">
                {copy.emptyTitle}
              </EmptyTitle>
              <EmptyDescription className="text-[13px]">
                {copy.emptyBody}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                type="button"
                variant="outline"
                onClick={() => openSheet(createTarget)}
                className={secondaryButtonClass}
              >
                <Plus aria-hidden strokeWidth={1.8} />
                {copy.add}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Table className="min-w-[860px] table-fixed text-[13px]">
            <TableHeader className="[&_tr]:border-border-subtle">
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(tableHeadClass, "w-[28%]")}>
                  {copy.columns.name}
                </TableHead>
                <TableHead className={tableHeadClass}>
                  {copy.columns.rules}
                </TableHead>
                <TableHead className={cn(tableHeadClass, "w-36 text-right")}>
                  {copy.columns.contacts}
                </TableHead>
                <TableHead className={cn(tableHeadClass, "w-32")}>
                  {copy.columns.updated}
                </TableHead>
                <TableHead className={cn(tableHeadClass, "w-14")}>
                  <span className="sr-only">{copy.columns.actions}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map((segment) => {
                const moment = clock(segment.updatedAt);
                const summary = describeFilter(segment.rules, options);
                const key = countKey(segment);
                return (
                  <TableRow
                    key={segment.id}
                    className="border-border-subtle hover:bg-muted/50"
                  >
                    <TableCell className={tableCellClass}>
                      <div className="truncate font-medium text-foreground">
                        {segment.name}
                      </div>
                      {segment.description ? (
                        <div
                          title={segment.description}
                          className="truncate text-[12.5px] text-ink-tertiary"
                        >
                          {segment.description}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className={tableCellClass}>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              className={cn(
                                "block max-w-full truncate rounded-[6px] text-left text-muted-foreground",
                                focusRing,
                              )}
                            />
                          }
                        >
                          {summary}
                        </TooltipTrigger>
                        <TooltipContent className="max-w-96 text-left leading-normal">
                          {summary}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className={cn(tableCellClass, "text-right")}>
                      <SegmentCountCell
                        count={counts[key]}
                        requestKey={key}
                        segmentId={segment.id}
                        onRequest={request}
                      />
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
                          aria-label={copy.actionsFor(segment.name)}
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
                          className="w-44 p-1 text-[13px]"
                        >
                          <DropdownMenuItem
                            className={menuItemClass}
                            render={
                              <Link
                                href={`${appHref("contacts")}?${segmentContactsSearch(segment.id)}`}
                              />
                            }
                          >
                            <Users aria-hidden strokeWidth={1.6} />
                            {copy.menu.view}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className={menuItemClass}
                            onClick={() => openSheet({ mode: "edit", segment })}
                          >
                            <Pencil aria-hidden strokeWidth={1.6} />
                            {copy.menu.edit}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className={menuItemClass}
                            onClick={() =>
                              openSheet({ mode: "duplicate", segment })
                            }
                          >
                            <Copy aria-hidden strokeWidth={1.6} />
                            {copy.menu.duplicate}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            className={menuItemClass}
                            onClick={() => setRemoving(segment)}
                          >
                            <Trash2 aria-hidden strokeWidth={1.6} />
                            {copy.menu.remove}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <SegmentSheet
        open={sheetOpen}
        formKey={sheetKey}
        target={target}
        options={options}
        onOpenChange={setSheetOpen}
        onSaved={handleSaved}
      />
      <DeleteSegmentDialog
        segment={removing}
        onClose={() => setRemoving(null)}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
