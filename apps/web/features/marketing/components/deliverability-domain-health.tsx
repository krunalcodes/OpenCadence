"use client";

import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";
import {
  Check,
  ChevronDown,
  Copy,
  Globe,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import * as React from "react";
import { dkimName, dkimValue, StatusBadge } from "./deliverability";

const checkRow =
  "grid grid-cols-[3.5rem_minmax(0,1fr)_auto_1rem] items-center gap-x-3 px-4 py-3";

function CopyField({
  id,
  label,
  value,
  copied,
  onCopy,
}: {
  id: string;
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block font-medium text-muted-foreground text-xs"
      >
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          className="h-8 min-w-0 flex-1 bg-card font-mono text-xs shadow-xs md:text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="bg-card shadow-xs"
          aria-label={
            copied ? `${label} copied` : `Copy ${label.toLowerCase()}`
          }
          onClick={onCopy}
        >
          {copied ? (
            <Check size={16} strokeWidth={1.75} className="text-success" />
          ) : (
            <Copy size={16} strokeWidth={1.75} />
          )}
        </Button>
      </div>
    </div>
  );
}

function DomainHealth({ className }: { className?: string }) {
  const [dkimOpen, setDkimOpen] = React.useState(true);
  const [copied, setCopied] = React.useState<"name" | "value" | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [checkedNow, setCheckedNow] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  React.useEffect(() => {
    if (!checking) return;
    const timer = window.setTimeout(() => {
      setChecking(false);
      setCheckedNow(true);
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [checking]);

  function copy(key: "name" | "value", text: string) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(key))
      .catch(() => setCopied(null));
  }

  function showFix() {
    setDkimOpen(true);
    const trigger = document.getElementById("deliverability-dkim-trigger");
    trigger?.scrollIntoView({ block: "nearest" });
    trigger?.focus();
  }

  return (
    <div className={cn("min-w-0 text-[13px] leading-normal", className)}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-[10px] border border-danger/20 bg-danger-surface px-3 py-2.5">
        <TriangleAlert
          aria-hidden
          size={16}
          strokeWidth={1.75}
          className="shrink-0 text-danger"
        />
        <p className="min-w-0 flex-1 basis-60 text-foreground">
          <strong className="font-semibold text-danger">
            DKIM is failing on getnorthwind.co.
          </strong>{" "}
          Sends from outreach@getnorthwind.co are paused until the record is
          fixed.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-danger/20 bg-card shadow-xs"
          onClick={showFix}
        >
          Fix DNS record
        </Button>
      </div>

      <Card className="mt-3.5 gap-0 rounded-xl border border-border py-0 text-[13px] shadow-xs ring-0">
        <div className="flex items-center gap-2.5 border-border-subtle border-b px-4 py-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-muted text-muted-foreground">
            <Globe aria-hidden size={16} strokeWidth={1.6} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-sm tracking-[-0.005em]">
              getnorthwind.co
            </h3>
            <p className="text-[12.5px] text-muted-foreground">
              Sending domain, 3 DNS checks
            </p>
          </div>
          <StatusBadge tone="danger">1 failing</StatusBadge>
        </div>

        <ul>
          <li className={cn(checkRow, "border-border-subtle border-b")}>
            <span className="font-medium">SPF</span>
            <span className="text-muted-foreground">
              Record found. Your SMTP host is authorised.
            </span>
            <StatusBadge tone="success">Pass</StatusBadge>
            <span />
          </li>

          <li className="border-border-subtle border-b">
            <Collapsible open={dkimOpen} onOpenChange={setDkimOpen}>
              <CollapsibleTrigger
                id="deliverability-dkim-trigger"
                className={cn(
                  checkRow,
                  "w-full text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                )}
              >
                <span className="font-medium">DKIM</span>
                <span className="text-muted-foreground">
                  No record found at{" "}
                  <span className="break-all font-mono text-xs">
                    oc1._domainkey
                  </span>
                </span>
                <StatusBadge tone="danger">Failing</StatusBadge>
                <ChevronDown
                  aria-hidden
                  size={16}
                  strokeWidth={1.75}
                  className={cn(
                    "text-muted-foreground",
                    dkimOpen && "rotate-180",
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-3 border-border-subtle border-t bg-background px-4 py-4">
                  <p className="text-muted-foreground">
                    Add this{" "}
                    <span className="font-medium text-foreground">TXT</span>{" "}
                    record at your DNS host, then check again.
                  </p>
                  <CopyField
                    id="deliverability-dkim-name"
                    label="Record name"
                    value={dkimName}
                    copied={copied === "name"}
                    onCopy={() => copy("name", dkimName)}
                  />
                  <CopyField
                    id="deliverability-dkim-value"
                    label="Record value"
                    value={dkimValue}
                    copied={copied === "value"}
                    onCopy={() => copy("value", dkimValue)}
                  />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      disabled={checking}
                      onClick={() => setChecking(true)}
                    >
                      {checking ? (
                        <LoaderCircle
                          aria-hidden
                          strokeWidth={1.75}
                          className="animate-spin motion-reduce:animate-none"
                        />
                      ) : (
                        <RefreshCw aria-hidden strokeWidth={1.75} />
                      )}
                      Check again
                    </Button>
                    <p
                      aria-live="polite"
                      className="text-muted-foreground text-xs"
                    >
                      {checking
                        ? "Looking up the record"
                        : checkedNow
                          ? "Checked just now. The record is still missing."
                          : "Last checked 2 minutes ago"}
                    </p>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </li>

          <li className={checkRow}>
            <span className="font-medium">DMARC</span>
            <span className="text-muted-foreground">
              Policy set to{" "}
              <span className="font-mono text-xs">p=quarantine</span>
            </span>
            <StatusBadge tone="success">Pass</StatusBadge>
            <span />
          </li>
        </ul>
      </Card>

      <p className="mt-3 text-muted-foreground text-xs">
        All figures on this page are sample data.
      </p>
    </div>
  );
}

export { DomainHealth };
