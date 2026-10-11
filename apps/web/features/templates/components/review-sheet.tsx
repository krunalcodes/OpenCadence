"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { CircleCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { secondaryButtonClass } from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { type BadgeTone, StatusBadge } from "@/components/status-badge";
import { AiSetupNote } from "@/features/templates/components/ai-setup-note";
import {
  maxAiHtmlLength,
  type Review,
  type Severity,
  severities,
} from "@/features/templates/lib/ai";
import { copy, describeAiError } from "@/features/templates/lib/copy";
import type { ExportedEmail } from "@/features/templates/lib/editor";
import { reviewEmail } from "@/features/templates/queries/client";

const text = copy.ai.review;

const tones: Record<Severity, BadgeTone> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

const placeholders = ["one", "two", "three"];

type State =
  | { status: "loading" }
  | { status: "ready"; review: Review }
  | { status: "failed"; message: string };

type ReviewSheetProps = {
  open: boolean;
  aiConfigured: boolean;
  subject: string;
  previewText: string;
  exportEmail: () => Promise<ExportedEmail | null>;
  onOpenChange: (open: boolean) => void;
};

export function ReviewSheet({
  open,
  aiConfigured,
  subject,
  previewText,
  exportEmail,
  onOpenChange,
}: ReviewSheetProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  const run = useRef(0);
  const fields = useRef({ subject, previewText });
  fields.current = { subject, previewText };

  const load = useCallback(async () => {
    run.current += 1;
    const id = run.current;
    setState({ status: "loading" });
    const email = await exportEmail();
    if (run.current !== id) {
      return;
    }
    if (!email) {
      setState({ status: "failed", message: copy.editor.exportFailed });
      return;
    }
    if (email.html.length > maxAiHtmlLength) {
      setState({ status: "failed", message: copy.ai.errors.validation });
      return;
    }
    const result = await reviewEmail({
      subject: fields.current.subject.trim(),
      previewText: fields.current.previewText.trim(),
      html: email.html,
    });
    if (run.current !== id) {
      return;
    }
    setState(
      result.ok
        ? { status: "ready", review: result.data }
        : { status: "failed", message: describeAiError(result.error) },
    );
  }, [exportEmail]);

  useEffect(() => {
    if (open) {
      void load();
    }
    return () => {
      run.current += 1;
    };
  }, [open, load]);

  const review = state.status === "ready" ? state.review : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 text-[13px] data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]">
        <SheetHeader className="gap-1 border-b border-border-subtle px-5 py-4 pr-12">
          <SheetTitle className="text-[15px] font-semibold tracking-[-0.01em]">
            {text.title}
          </SheetTitle>
          <SheetDescription className="text-[13px] leading-normal">
            {text.description}
          </SheetDescription>
        </SheetHeader>

        <div
          aria-live="polite"
          aria-busy={state.status === "loading" || undefined}
          className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4"
        >
          {state.status === "loading" ? (
            <div className="flex flex-col gap-4">
              <span className="sr-only">{text.running}</span>
              {placeholders.map((item) => (
                <div key={item} className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-4/5" />
                </div>
              ))}
            </div>
          ) : state.status === "failed" ? (
            <p role="alert" className="text-danger">
              <span className="font-medium">{text.failed}.</span>{" "}
              {state.message}
            </p>
          ) : review && review.issues.length === 0 ? (
            <div className="flex items-start gap-2.5">
              <CircleCheck
                aria-hidden
                strokeWidth={1.6}
                className="mt-px size-4 shrink-0 text-success"
              />
              <div>
                <p className="font-medium">{text.clear}</p>
                <p className="text-muted-foreground">{text.clearBody}</p>
              </div>
            </div>
          ) : review ? (
            severities.map((severity) => {
              const issues = review.issues.filter(
                (issue) => issue.severity === severity,
              );
              if (issues.length === 0) {
                return null;
              }
              return (
                <section key={severity} className="flex flex-col gap-2.5">
                  <h3 className="flex items-center gap-2 text-[13px] font-semibold">
                    {text.severities[severity]}
                    <span className="font-normal text-ink-tertiary tabular-nums">
                      {text.count(issues.length)}
                    </span>
                  </h3>
                  <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border">
                    {issues.map((issue) => (
                      <li
                        key={`${issue.source}:${issue.title}:${issue.detail}`}
                        className="flex flex-col gap-1.5 px-3 py-2.5"
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <StatusBadge tone={tones[severity]}>
                            {text.severityBadges[severity]}
                          </StatusBadge>
                          <p className="min-w-0 flex-1 basis-40 font-medium">
                            {issue.title}
                          </p>
                          <span className="text-[12px] text-ink-tertiary">
                            {text.sources[issue.source]}
                          </span>
                        </div>
                        {issue.detail ? (
                          <p className="text-muted-foreground">
                            {issue.detail}
                          </p>
                        ) : null}
                        {issue.suggestion ? (
                          <p>
                            <span className="font-medium">
                              {text.suggestion}:
                            </span>{" "}
                            {issue.suggestion}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-4">
          <div className="min-w-0 flex-1 basis-56 text-[12.5px] text-muted-foreground">
            {review ? (
              review.aiReviewed ? (
                <p>{text.aiRan}</p>
              ) : aiConfigured ? (
                <p>{text.aiSkippedConfigured}</p>
              ) : (
                <div className="flex flex-col gap-1">
                  <p>{text.aiSkippedNotConfigured}</p>
                  <AiSetupNote compact />
                </div>
              )
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={state.status === "loading"}
            aria-busy={state.status === "loading" || undefined}
            onClick={() => void load()}
            className={secondaryButtonClass}
          >
            {state.status === "loading" ? <Spinner /> : null}
            {text.run}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
