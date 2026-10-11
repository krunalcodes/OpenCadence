"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { TriangleAlert } from "lucide-react";
import {
  dialogActionsClass,
  dialogTitleClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import type { CampaignProblem } from "@/features/campaigns/lib/campaigns";
import { copy, problemText } from "@/features/campaigns/lib/copy";

const text = copy.sendDialog;

export type SendSummary = {
  count: number;
  audience: string;
  from: string;
  source: string | null;
  subject: string;
  warnings: CampaignProblem[];
};

type SendDialogProps = {
  open: boolean;
  summary: SendSummary | null;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function SummaryList({ summary }: { summary: SendSummary }) {
  const rows = [
    { label: text.recipients, value: text.recipientsValue(summary.count) },
    { label: text.audience, value: summary.audience },
    { label: text.from, value: summary.from },
    ...(summary.source ? [{ label: text.source, value: summary.source }] : []),
    { label: text.subject, value: summary.subject },
  ];
  return (
    <dl className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border bg-muted/40 text-[13px]">
      {rows.map((row) => (
        <div key={row.label} className="flex min-w-0 gap-3 px-3 py-2">
          <dt className="w-28 shrink-0 text-ink-tertiary">{row.label}</dt>
          <dd className="min-w-0 flex-1 break-words font-medium text-foreground tabular-nums">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function WarningList({ warnings }: { warnings: CampaignProblem[] }) {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-warning-surface px-3 py-2.5 text-warning">
      <p className="flex items-center gap-2 text-[13px] font-medium">
        <TriangleAlert
          aria-hidden
          strokeWidth={1.6}
          className="size-4 shrink-0"
        />
        {text.warnings}
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-[30px] text-[13px]">
        {warnings.map((warning) => (
          <li key={`${warning.code}:${warning.field}`}>
            {problemText(warning)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SendDialog({
  open,
  summary,
  pending,
  error,
  onConfirm,
  onOpenChange,
}: SendDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || !pending) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className="gap-5 p-5 text-[13px] sm:max-w-[480px]">
        {summary ? (
          <>
            <DialogHeader>
              <DialogTitle className={`${dialogTitleClass} tabular-nums`}>
                {text.title(summary.count)}
              </DialogTitle>
              <DialogDescription className="text-[13px]">
                {text.body}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <SummaryList summary={summary} />
              <WarningList warnings={summary.warnings} />
              {error ? (
                <p role="alert" className="text-[13px] text-danger">
                  <span className="font-medium">{text.failed}.</span> {error}
                </p>
              ) : null}
            </div>
            <div className={dialogActionsClass}>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => onOpenChange(false)}
                className={secondaryButtonClass}
              >
                {text.cancel}
              </Button>
              <Button
                type="button"
                disabled={pending}
                aria-busy={pending || undefined}
                onClick={onConfirm}
                className={`${primaryButtonClass} tabular-nums`}
              >
                {pending ? <Spinner /> : null}
                {text.confirm(summary.count)}
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
