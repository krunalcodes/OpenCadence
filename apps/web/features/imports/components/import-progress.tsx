import { TickProgress } from "@workspace/ui/blocks/tick-progress";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { Download } from "lucide-react";
import Link from "next/link";
import type { Ref } from "react";
import {
  linkButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { StatusBadge } from "@/components/status-badge";
import { Notice, StepHeading } from "@/features/imports/components/parts";
import { copy, statusLabels, statusTones } from "@/features/imports/lib/copy";
import {
  errorReportHref,
  type Import,
  isActive,
  isEstimatedTotal,
  knownTotal,
} from "@/features/imports/lib/imports";
import { appHref } from "@/lib/navigation";

const text = copy.progress;

type ImportProgressProps = {
  headingRef: Ref<HTMLHeadingElement>;
  item: Import;
  estimate: number | null;
  stale: boolean;
  onCancel: () => void;
  onAnother: () => void;
};

export function ImportProgress({
  headingRef,
  item,
  estimate,
  stale,
  onCancel,
  onAnother,
}: ImportProgressProps) {
  const active = isActive(item.status);
  const completed = item.status === "completed";
  const name = item.fileName || copy.recent.unnamed;
  const total = knownTotal(item, estimate);
  const counts = [
    { label: text.counts.created, value: item.createdCount },
    { label: text.counts.updated, value: item.updatedCount },
    { label: text.counts.skipped, value: item.skippedCount },
    { label: text.counts.errors, value: item.errorCount },
  ];

  return (
    <div className="flex max-w-[860px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <StepHeading ref={headingRef}>
          {active ? text.heading(name) : text.finishedHeading(name)}
        </StepHeading>
        <StatusBadge tone={statusTones[item.status]}>
          {statusLabels[item.status]}
        </StatusBadge>
      </div>

      <div className="flex flex-col gap-2">
        <TickProgress
          value={completed && total === 0 ? 1 : item.processedRows}
          max={Math.max(total, 1)}
          tone={completed ? "success" : "brand"}
          aria-label={text.label}
        />
        <p
          aria-live="polite"
          className="text-[12.5px] text-muted-foreground tabular-nums"
        >
          {text.rows(
            item.processedRows,
            total,
            isEstimatedTotal(item, estimate),
          )}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 @2xl:grid-cols-4">
        {counts.map((entry) => (
          <div key={entry.label} className="min-w-0">
            <dt className="text-xs font-medium text-ink-tertiary">
              {entry.label}
            </dt>
            <dd className="text-[20px] leading-[1.3] font-semibold tracking-[-0.02em] text-foreground tabular-nums">
              {copy.count(entry.value)}
            </dd>
          </div>
        ))}
      </dl>

      {stale && active ? (
        <Notice tone="warning" role="status">
          {text.stale}
        </Notice>
      ) : null}

      {item.status === "queued" ? (
        <p className="text-muted-foreground">{text.queued}</p>
      ) : null}
      {item.status === "running" ? (
        <p className="text-muted-foreground">{text.running}</p>
      ) : null}
      {completed ? (
        <div
          role="status"
          className="flex flex-col gap-1 text-muted-foreground"
        >
          <p>
            {text.completed(item.createdCount, item.updatedCount)}
            {item.skippedCount > 0
              ? ` ${text.completedSkipped(item.skippedCount)}`
              : ""}
          </p>
          {item.errorCount > 0 ? (
            <p>{text.completedErrors(item.errorCount)}</p>
          ) : null}
        </div>
      ) : null}
      {item.status === "cancelled" ? (
        <p role="status" className="text-muted-foreground">
          {text.cancelled}
        </p>
      ) : null}
      {item.status === "failed" ? (
        <div className="flex flex-col gap-2">
          <Notice tone="danger" role="alert">
            <span className="font-medium">{text.failedTitle}</span>{" "}
            {item.errorMessage ?? text.failedFallback}
          </Notice>
          <p className="text-muted-foreground">{text.failedNext}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {active ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className={secondaryButtonClass}
          >
            {text.cancel}
          </Button>
        ) : (
          <>
            {completed ? (
              <Link
                href={appHref("contacts")}
                className={cn(
                  linkButtonClass,
                  "border-transparent bg-primary text-primary-foreground",
                  primaryButtonClass,
                )}
              >
                {text.viewContacts}
              </Link>
            ) : null}
            {item.hasErrorReport ? (
              <a
                href={errorReportHref(item.id)}
                download
                className={cn(
                  linkButtonClass,
                  "gap-1.5 border-border",
                  secondaryButtonClass,
                )}
              >
                <Download aria-hidden className="size-4" strokeWidth={1.6} />
                {text.downloadErrors}
              </a>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={onAnother}
              className={secondaryButtonClass}
            >
              {text.another}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
