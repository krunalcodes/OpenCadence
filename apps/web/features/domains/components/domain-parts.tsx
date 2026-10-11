"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowLeft, Check, Copy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { buttonFocusRing, focusRing } from "@/components/app-shell/page-header";
import { StatusBadge } from "@/components/status-badge";
import { copy } from "@/features/domains/lib/copy";
import {
  type Domain,
  type DomainStatus,
  dkimSummary,
  type RecordStatus,
} from "@/features/domains/lib/domains";
import { appHref } from "@/lib/navigation";

export function DomainStatusBadge({ status }: { status: DomainStatus }) {
  const { label, tone } = copy.status(status);
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

export function RecordStatusBadge({ status }: { status: RecordStatus | null }) {
  if (!status) {
    return <StatusBadge tone="neutral">{copy.detail.notChecked}</StatusBadge>;
  }
  const { label, tone } = copy.recordStatus(status);
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

const markTones = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-ink-tertiary",
};

function RecordMark({
  name,
  status,
  fallback,
}: {
  name: string;
  status: RecordStatus | null;
  fallback: string;
}) {
  const state = status ? copy.recordStatus(status) : null;
  return (
    <span
      title={copy.recordMark(name, state?.label ?? fallback)}
      className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          markTones[state?.tone ?? "neutral"],
        )}
      />
      {name}
      <span className="sr-only">{state?.label ?? fallback}</span>
    </span>
  );
}

export function RecordMarks({ domain }: { domain: Domain }) {
  const dkim = dkimSummary(domain);
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <RecordMark
        name={copy.recordName("spf")}
        status={domain.checks?.spf?.status ?? null}
        fallback={copy.unknown}
      />
      <RecordMark
        name={copy.recordName("dkim")}
        status={dkim === "none" || dkim === "unknown" ? null : dkim}
        fallback={dkim === "none" ? copy.dkimNone : copy.unknown}
      />
      <RecordMark
        name={copy.recordName("dmarc")}
        status={domain.checks?.dmarc?.status ?? null}
        fallback={copy.unknown}
      />
    </span>
  );
}

export const backLinkClass = cn(
  "inline-flex h-7 w-fit items-center gap-1.5 rounded-lg px-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground",
  focusRing,
);

export function BackToDomains() {
  return (
    <Link href={appHref("domains")} className={backLinkClass}>
      <ArrowLeft aria-hidden strokeWidth={1.6} className="size-4" />
      {copy.detail.back}
    </Link>
  );
}

type CopyFieldProps = {
  label: string;
  value: string;
  plain?: boolean;
  className?: string;
};

export function CopyField({ label, value, plain, className }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(copy.clipboard.failed, {
        description: copy.clipboard.failedBody,
      });
    }
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <div className="flex min-h-8 items-start gap-1 rounded-lg border border-border bg-muted/40 py-1 pr-1 pl-2.5">
        <code className="min-w-0 flex-1 self-center font-mono text-[12.5px] leading-[1.5] break-all text-foreground select-all">
          {value}
        </code>
        {plain ? null : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={
                copied ? copy.detail.copied(label) : copy.detail.copy(label)
              }
              onClick={copyValue}
              className={cn(
                "size-6 shrink-0 text-muted-foreground hover:bg-accent",
                buttonFocusRing,
              )}
            >
              {copied ? (
                <Check aria-hidden strokeWidth={1.8} className="text-success" />
              ) : (
                <Copy aria-hidden strokeWidth={1.6} />
              )}
            </Button>
            <span aria-live="polite" className="sr-only">
              {copied ? copy.detail.copied(label) : ""}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
