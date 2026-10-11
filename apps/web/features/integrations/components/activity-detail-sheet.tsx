"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { cn } from "@workspace/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import {
  SourceMark,
  secondaryButtonClass,
} from "@/features/integrations/components/integration-parts";
import {
  activityCopy,
  type EventClock,
  eventResponse,
  eventText,
  severityLabels,
  severityTones,
} from "@/features/integrations/lib/activity";
import { integrationMark } from "@/features/integrations/lib/catalog";
import type { SourceEvent } from "@/features/integrations/lib/sources";
import { appHref } from "@/lib/navigation";

const linkButtonClass =
  "inline-flex h-8 items-center justify-center rounded-lg border text-[13px] font-medium whitespace-nowrap transition-colors";

type ActivityDetailSheetProps = {
  event: SourceEvent | null;
  clock: EventClock;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ActivityDetailSheet({
  event,
  clock,
  open,
  onOpenChange,
}: ActivityDetailSheetProps) {
  const [copied, setCopied] = useState(false);
  const { sheet } = activityCopy;
  const text = event ? eventText(event) : null;
  const moment = event ? clock(event.createdAt) : null;
  const response = event ? eventResponse(event) : null;

  async function copyResponse(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(sheet.copyFailed, { description: sheet.copyFailedBody });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 text-[13px] data-[side=right]:w-full data-[side=right]:sm:max-w-[460px]">
        {event && text ? (
          <>
            <SheetHeader className="gap-1 border-b border-border-subtle px-5 py-4 pr-12">
              <SheetTitle className="text-[15px] font-semibold tracking-[-0.01em]">
                {text.title}
              </SheetTitle>
              <SheetDescription className="text-[13px] leading-normal">
                {text.detail}
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <dl className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3 gap-y-3">
                <dt className="text-muted-foreground">{sheet.when}</dt>
                <dd className="text-foreground tabular-nums">
                  {moment ? (
                    <time dateTime={moment.iso}>
                      {sheet.whenAt(moment.day, moment.time)}
                    </time>
                  ) : null}
                </dd>
                <dt className="text-muted-foreground">{sheet.source}</dt>
                <dd className="flex min-w-0 items-center gap-2">
                  {event.integrationType ? (
                    <SourceMark
                      integration={integrationMark(event.integrationType)}
                      className="size-6"
                    />
                  ) : null}
                  <span className="truncate text-foreground">
                    {event.sourceName || activityCopy.removedSource}
                  </span>
                </dd>
                <dt className="text-muted-foreground">{sheet.result}</dt>
                <dd>
                  <StatusBadge tone={severityTones[event.severity]}>
                    {severityLabels[event.severity]}
                  </StatusBadge>
                </dd>
              </dl>

              {response ? (
                <div className="mt-5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <h3 className="text-[13px] font-medium text-foreground">
                      {sheet.response}
                    </h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copyResponse(response)}
                      className={cn(
                        secondaryButtonClass,
                        "px-[9px] text-[12.5px]",
                      )}
                    >
                      {copied ? (
                        <Check
                          aria-hidden
                          strokeWidth={1.8}
                          className="text-success"
                        />
                      ) : (
                        <Copy aria-hidden strokeWidth={1.6} />
                      )}
                      {copied ? sheet.copied : sheet.copy}
                    </Button>
                  </div>
                  <pre className="overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-foreground">
                    {response}
                  </pre>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border-subtle px-5 py-4 sm:flex-row sm:justify-end">
              <Link
                href={appHref("integrations")}
                className={cn(
                  linkButtonClass,
                  "border-border",
                  secondaryButtonClass,
                )}
              >
                {sheet.viewSource}
              </Link>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
