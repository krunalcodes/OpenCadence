"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import { copy } from "@/features/integrations/lib/copy";

type CopyBlockProps = {
  label: string;
  value: string;
  multiline?: boolean;
  className?: string;
};

export function CopyBlock({
  label,
  value,
  multiline,
  className,
}: CopyBlockProps) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(copy.toasts.copyFailed, {
        description: copy.toasts.copyFailedBody,
      });
    }
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <div className="flex min-h-8 items-start gap-1 rounded-lg border border-border bg-muted/40 py-1 pr-1 pl-2.5">
        {multiline ? (
          <pre className="min-w-0 flex-1 overflow-x-auto py-1 font-mono text-[12px] leading-[1.5] text-foreground">
            <code>{value}</code>
          </pre>
        ) : (
          <code className="min-w-0 flex-1 self-center font-mono text-[12.5px] leading-[1.5] break-all text-foreground select-all">
            {value}
          </code>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={
            copied ? copy.sesSetup.copied(label) : copy.sesSetup.copy(label)
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
          {copied ? copy.sesSetup.copied(label) : ""}
        </span>
      </div>
    </div>
  );
}
