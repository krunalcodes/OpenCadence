"use client";

import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Check, Copy, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  dialogActions,
  primaryButton,
  secondaryButton,
} from "@/features/settings/components/settings-parts";

export function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy(text: string, failure: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy", { description: failure });
    }
  }

  return { copied, copy };
}

function downloadCodes(codes: string[], email: string) {
  const lines = [
    "OpenCadence backup codes",
    `Account: ${email}`,
    `Created: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "Each code works once. Use one to sign in when you cannot use your authenticator app.",
    "",
    ...codes,
    "",
  ];
  const url = URL.createObjectURL(
    new Blob([lines.join("\n")], { type: "text/plain" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "opencadence-backup-codes.txt";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

type BackupCodesProps = {
  codes: string[];
  email: string;
  onDone: () => void;
};

export function BackupCodes({ codes, email, onDone }: BackupCodesProps) {
  const { copied, copy } = useCopy();
  const [saved, setSaved] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <ul
        aria-label="Backup codes"
        className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border border-border bg-muted/40 px-4 py-3 font-mono text-[13px] text-foreground tabular-nums"
      >
        {codes.map((code) => (
          <li key={code} className="select-all">
            {code}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            copy(
              codes.join("\n"),
              "Select the codes and copy them, or download them instead.",
            )
          }
          className={secondaryButton}
        >
          {copied ? (
            <Check strokeWidth={1.6} aria-hidden />
          ) : (
            <Copy strokeWidth={1.6} aria-hidden />
          )}
          {copied ? "Copied" : "Copy codes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => downloadCodes(codes, email)}
          className={secondaryButton}
        >
          <Download strokeWidth={1.6} aria-hidden />
          Download as text
        </Button>
        <span role="status" className="sr-only">
          {copied ? "Backup codes copied" : ""}
        </span>
      </div>

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="backup-codes-saved"
          checked={saved}
          onCheckedChange={(checked) => setSaved(checked)}
          className="mt-0.5 bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        <label
          htmlFor="backup-codes-saved"
          className="text-foreground leading-normal"
        >
          I have saved these codes somewhere safe. I understand they will not be
          shown again.
        </label>
      </div>

      <div className={dialogActions}>
        <Button
          type="button"
          disabled={!saved}
          onClick={onDone}
          className={primaryButton}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
