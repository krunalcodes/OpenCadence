"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { useEffect, useRef } from "react";
import { focusRing } from "@/components/app-shell/page-header";
import { StatusBadge } from "@/components/status-badge";
import { copy } from "@/features/segments/lib/copy";
import type { SegmentCount } from "@/features/segments/lib/segments";

type SegmentCountCellProps = {
  count: SegmentCount | undefined;
  requestKey: string;
  segmentId: string;
  onRequest: (key: string, id: string) => void;
};

export function SegmentCountCell({
  count,
  requestKey,
  segmentId,
  onRequest,
}: SegmentCountCellProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const waiting = count === undefined;

  useEffect(() => {
    const node = ref.current;
    if (!waiting || !node) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      onRequest(requestKey, segmentId);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        onRequest(requestKey, segmentId);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [waiting, requestKey, segmentId, onRequest]);

  if (count === undefined || count.state === "loading") {
    return (
      <span ref={ref} className="inline-flex justify-end align-middle">
        <Skeleton className="h-4 w-12" />
        <span className="sr-only">{copy.countLoading}</span>
      </span>
    );
  }

  if (count.state === "ready") {
    return (
      <span className="text-foreground tabular-nums">
        {copy.count(count.count)}
      </span>
    );
  }

  const invalid = count.state === "invalid";
  const detail = invalid
    ? (count.message ?? copy.needsFixingFallback)
    : copy.countFailedDetail;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button type="button" className={cn("rounded-[6px]", focusRing)} />
        }
      >
        {invalid ? (
          <>
            <StatusBadge tone="danger">{copy.needsFixing}</StatusBadge>
            <span className="sr-only">{copy.needsFixingDetail(detail)}</span>
          </>
        ) : (
          <>
            <span className="text-ink-tertiary">{copy.countFailed}</span>
            <span className="sr-only">{detail}</span>
          </>
        )}
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-left leading-normal">
        {detail}
      </TooltipContent>
    </Tooltip>
  );
}
