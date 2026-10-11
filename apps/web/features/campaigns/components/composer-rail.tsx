"use client";

import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  FlaskConical,
  Send,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { focusRing } from "@/components/app-shell/page-header";
import {
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import type {
  CampaignCheck,
  CampaignProblem,
  ProblemField,
} from "@/features/campaigns/lib/campaigns";
import { copy, problemText } from "@/features/campaigns/lib/copy";
import { appHref } from "@/lib/navigation";

const text = copy.rail;

export type CountView =
  | { state: "none" }
  | { state: "loading" }
  | { state: "unknown" }
  | { state: "ready"; count: number };

export type CheckView =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; check: CampaignCheck };

export type RailAction = "test" | "schedule" | "send";

type ComposerRailProps = {
  count: CountView;
  audience: string | null;
  from: string | null;
  source: string | null;
  subject: string;
  check: CheckView;
  checking: boolean;
  unsaved: boolean;
  canSend: boolean;
  note: string | null;
  busy: RailAction | null;
  onRetryCheck: () => void;
  onGoTo: (field: ProblemField) => void;
  onAction: (action: RailAction) => void;
};

const linkClass = cn(
  "rounded-[4px] text-left font-medium underline underline-offset-2",
  focusRing,
);

function ProblemItem({
  problem,
  onGoTo,
}: {
  problem: CampaignProblem;
  onGoTo: (field: ProblemField) => void;
}) {
  const error = problem.severity === "error";
  const Icon = error ? CircleAlert : TriangleAlert;
  const field = problem.field;
  return (
    <li className="flex items-start gap-2">
      <Icon
        aria-hidden
        strokeWidth={1.6}
        className={cn(
          "mt-0.5 size-4 shrink-0",
          error ? "text-danger" : "text-warning",
        )}
      />
      <div className="min-w-0 text-[13px] text-foreground">
        <p className="break-words">{problemText(problem)}</p>
        {field === "brand" ? (
          <Link
            href={appHref("settings/brand")}
            className={cn(linkClass, "text-[12.5px] text-primary")}
          >
            {text.goTo(text.sectionOf(field))}
          </Link>
        ) : field && field !== "schedule" ? (
          <button
            type="button"
            onClick={() => onGoTo(field)}
            className={cn(linkClass, "text-[12.5px] text-primary")}
          >
            {text.goTo(text.sectionOf(field))}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function Row({
  label,
  missing,
  children,
}: {
  label: string;
  missing?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 gap-3">
      <dt className="w-[68px] shrink-0 text-ink-tertiary">{label}</dt>
      <dd
        className={cn(
          "min-w-0 flex-1 break-words",
          missing ? "text-ink-tertiary" : "text-foreground",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

export function ComposerRail({
  count,
  audience,
  from,
  source,
  subject,
  check,
  checking,
  unsaved,
  canSend,
  note,
  busy,
  onRetryCheck,
  onGoTo,
  onAction,
}: ComposerRailProps) {
  const problems = check.state === "ready" ? check.check.problems : [];
  const errors = problems.filter((problem) => problem.severity === "error");
  const warnings = problems.filter((problem) => problem.severity === "warning");
  const stale = checking || unsaved;

  return (
    <aside
      aria-label={text.title}
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-[13px] shadow-xs"
    >
      <div className="flex flex-col gap-3 px-4 pt-4 pb-3.5">
        <div aria-live="polite">
          <p className="text-xs font-medium text-ink-tertiary">
            {text.recipients}
          </p>
          {count.state === "ready" ? (
            count.count === 0 ? (
              <p className="mt-0.5 text-[15px] font-semibold text-danger">
                {text.recipientsZero}
              </p>
            ) : (
              <p className="mt-0.5 text-muted-foreground">
                <span className="block text-[26px] leading-[1.2] font-semibold tracking-[-0.025em] text-foreground tabular-nums">
                  {copy.number(count.count)}
                </span>
                {text.recipientsNoun(count.count)}
              </p>
            )
          ) : count.state === "loading" ? (
            <div className="mt-1.5 flex flex-col gap-1.5">
              <span className="sr-only">{text.counting}</span>
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3.5 w-40" />
            </div>
          ) : (
            <p className="mt-0.5 text-[15px] font-semibold text-ink-tertiary">
              {count.state === "none"
                ? text.recipientsNone
                : text.recipientsUnknown}
            </p>
          )}
        </div>
        <dl className="flex flex-col gap-1.5">
          <Row label={text.audience} missing={!audience}>
            {audience ?? copy.noAudience}
          </Row>
          <Row label={text.from} missing={!from}>
            {from ?? text.fromMissing}
            {source ? (
              <span className="block text-[12.5px] text-ink-tertiary">
                {text.via(source)}
              </span>
            ) : null}
          </Row>
          <Row label={text.subject} missing={subject.trim() === ""}>
            {subject.trim() || text.subjectMissing}
          </Row>
        </dl>
      </div>

      <div
        aria-live="polite"
        aria-busy={stale || undefined}
        className="flex flex-col gap-2.5 border-t border-border-subtle px-4 py-3.5"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-[-0.005em] text-foreground">
            {text.checks}
          </h2>
          {stale ? (
            <>
              <Spinner className="size-3.5 text-ink-tertiary" />
              <span className="sr-only">{text.checking}</span>
            </>
          ) : null}
        </div>
        {check.state === "loading" ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : check.state === "failed" ? (
          <p className="text-danger">
            {text.checkFailed}{" "}
            <button
              type="button"
              disabled={checking}
              onClick={onRetryCheck}
              className={cn(linkClass, "text-primary disabled:opacity-50")}
            >
              {text.checkRetry}
            </button>
          </p>
        ) : (
          <div
            className={cn(
              "flex flex-col gap-3 transition-opacity",
              stale && "opacity-60",
            )}
          >
            {errors.length === 0 ? (
              <p className="flex items-start gap-2 text-success">
                <CircleCheck
                  aria-hidden
                  strokeWidth={1.6}
                  className="mt-0.5 size-4 shrink-0"
                />
                {warnings.length > 0 ? text.readyWithWarnings : text.ready}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="font-medium text-danger tabular-nums">
                  {text.errorsTitle(errors.length)}
                </p>
                <ul className="flex flex-col gap-2.5">
                  {errors.map((problem) => (
                    <ProblemItem
                      key={`${problem.code}:${problem.field}`}
                      problem={problem}
                      onGoTo={onGoTo}
                    />
                  ))}
                </ul>
              </div>
            )}
            {warnings.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="font-medium text-warning tabular-nums">
                  {text.warningsTitle(warnings.length)}
                </p>
                <ul className="flex flex-col gap-2.5">
                  {warnings.map((problem) => (
                    <ProblemItem
                      key={`${problem.code}:${problem.field}`}
                      problem={problem}
                      onGoTo={onGoTo}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border-subtle bg-muted/40 px-4 py-3.5">
        <Button
          type="button"
          disabled={!canSend || busy !== null}
          aria-busy={busy === "send" || undefined}
          aria-describedby={note ? "campaign-send-note" : undefined}
          onClick={() => onAction("send")}
          className={cn(primaryButtonClass, "w-full")}
        >
          {busy === "send" ? (
            <Spinner />
          ) : (
            <Send aria-hidden strokeWidth={1.6} />
          )}
          {text.sendNow}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!canSend || busy !== null}
            aria-busy={busy === "schedule" || undefined}
            aria-describedby={note ? "campaign-send-note" : undefined}
            onClick={() => onAction("schedule")}
            className={secondaryButtonClass}
          >
            {busy === "schedule" ? (
              <Spinner />
            ) : (
              <CalendarClock aria-hidden strokeWidth={1.6} />
            )}
            {text.schedule}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            aria-busy={busy === "test" || undefined}
            onClick={() => onAction("test")}
            className={secondaryButtonClass}
          >
            {busy === "test" ? (
              <Spinner />
            ) : (
              <FlaskConical aria-hidden strokeWidth={1.6} />
            )}
            {text.sendTest}
          </Button>
        </div>
        {note && !canSend ? (
          <p
            id="campaign-send-note"
            className="text-[12.5px] text-ink-tertiary"
          >
            {note}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
