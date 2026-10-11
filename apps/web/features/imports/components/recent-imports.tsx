import { TickProgress } from "@workspace/ui/blocks/tick-progress";
import { Button } from "@workspace/ui/components/button";
import {
  Empty,
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
import { Download } from "lucide-react";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import { LoadFailed } from "@/components/product/load-failed";
import { SectionCard } from "@/components/product/section-card";
import {
  secondaryButtonClass,
  tableCellClass,
  tableHeadClass,
} from "@/components/product/styles";
import { StatusBadge } from "@/components/status-badge";
import { copy, statusLabels, statusTones } from "@/features/imports/lib/copy";
import { formatFileSize } from "@/features/imports/lib/file";
import {
  errorReportHref,
  type Import,
  knownTotal,
} from "@/features/imports/lib/imports";
import type { EventClock } from "@/lib/event-clock";

const text = copy.recent;

const numberHeadClass = cn(tableHeadClass, "text-right");
const numberCellClass = cn(
  tableCellClass,
  "text-right text-muted-foreground tabular-nums",
);

type RecentImportsProps = {
  failed: boolean;
  items: Import[];
  clock: EventClock;
  currentId: string | null;
  busy: boolean;
  retrying: boolean;
  onRetry: () => void;
  onResume: (item: Import) => void;
};

export function RecentImports({
  failed,
  items,
  clock,
  currentId,
  busy,
  retrying,
  onRetry,
  onResume,
}: RecentImportsProps) {
  return (
    <SectionCard
      id="recent-imports"
      title={text.title}
      description={text.description}
    >
      {failed && items.length === 0 ? (
        <LoadFailed
          title={text.loadFailed.title}
          body={text.loadFailed.body}
          retryLabel={text.loadFailed.retry}
          pending={retrying}
          onRetry={onRetry}
        />
      ) : items.length === 0 ? (
        <Empty className="px-6 py-10">
          <EmptyHeader>
            <EmptyTitle className="text-sm font-semibold text-foreground">
              {text.emptyTitle}
            </EmptyTitle>
            <EmptyDescription className="text-[13px]">
              {text.emptyBody}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table className="min-w-[1040px] text-[13px]">
          <TableHeader className="[&_tr]:border-border-subtle">
            <TableRow className="hover:bg-transparent">
              <TableHead className={tableHeadClass}>
                {text.columns.file}
              </TableHead>
              <TableHead className={tableHeadClass}>
                {text.columns.status}
              </TableHead>
              <TableHead className={tableHeadClass}>
                {text.columns.progress}
              </TableHead>
              <TableHead className={numberHeadClass}>
                {text.columns.created}
              </TableHead>
              <TableHead className={numberHeadClass}>
                {text.columns.updated}
              </TableHead>
              <TableHead className={numberHeadClass}>
                {text.columns.skipped}
              </TableHead>
              <TableHead className={numberHeadClass}>
                {text.columns.errors}
              </TableHead>
              <TableHead className={tableHeadClass}>
                {text.columns.started}
              </TableHead>
              <TableHead className={tableHeadClass}>
                <span className="sr-only">{text.columns.actions}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const name = item.fileName || text.unnamed;
              const total = knownTotal(item, null);
              const moment = item.startedAt ? clock(item.startedAt) : null;
              return (
                <TableRow
                  key={item.id}
                  className="border-border-subtle hover:bg-muted/50"
                >
                  <TableCell className={cn(tableCellClass, "max-w-80")}>
                    <div className="truncate font-medium text-foreground">
                      {name}
                    </div>
                    <div className="text-[12.5px] text-ink-tertiary tabular-nums">
                      {formatFileSize(item.fileSize)}
                    </div>
                  </TableCell>
                  <TableCell className={tableCellClass}>
                    <StatusBadge tone={statusTones[item.status]}>
                      {statusLabels[item.status]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell
                    className={cn(
                      tableCellClass,
                      "text-muted-foreground tabular-nums",
                    )}
                  >
                    {item.status === "uploaded" ? null : (
                      <div className="flex items-center gap-2.5">
                        {item.status === "running" ? (
                          <TickProgress
                            value={item.processedRows}
                            max={Math.max(total, 1)}
                            aria-label={text.progressLabel(name)}
                            className="w-20 shrink-0"
                          />
                        ) : null}
                        <span>{text.progress(item.processedRows, total)}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className={numberCellClass}>
                    {copy.count(item.createdCount)}
                  </TableCell>
                  <TableCell className={numberCellClass}>
                    {copy.count(item.updatedCount)}
                  </TableCell>
                  <TableCell className={numberCellClass}>
                    {copy.count(item.skippedCount)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      numberCellClass,
                      item.errorCount > 0 && "font-medium text-danger",
                    )}
                  >
                    {copy.count(item.errorCount)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      tableCellClass,
                      "text-muted-foreground tabular-nums",
                    )}
                  >
                    {moment ? (
                      <time dateTime={moment.iso} suppressHydrationWarning>
                        {moment.day}, {moment.time}
                      </time>
                    ) : null}
                  </TableCell>
                  <TableCell className={cn(tableCellClass, "text-right")}>
                    <div className="flex items-center justify-end gap-1.5">
                      {item.status === "uploaded" && item.id !== currentId ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          aria-label={text.resumeFor(name)}
                          onClick={() => onResume(item)}
                          className={cn(secondaryButtonClass, "px-2.5")}
                        >
                          {text.resume}
                        </Button>
                      ) : null}
                      {item.hasErrorReport ? (
                        <a
                          href={errorReportHref(item.id)}
                          download
                          aria-label={text.errorsFor(name)}
                          title={text.errorsFor(name)}
                          className={cn(
                            "-mr-1.5 grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground",
                            buttonFocusRing,
                          )}
                        >
                          <Download
                            aria-hidden
                            className="size-4"
                            strokeWidth={1.6}
                          />
                        </a>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}
