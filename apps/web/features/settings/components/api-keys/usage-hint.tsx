"use client";

import { Button } from "@workspace/ui/components/button";
import { Check, Copy } from "lucide-react";
import { SettingsSection } from "@/features/settings/components/settings-section";
import {
  secondaryButtonClass,
  useCopy,
} from "@/features/settings/components/workspace-parts";

const hostVariable = "$OPENCADENCE_API_URL";

const example = `curl "${hostVariable}/v1/workspace" \\
  -H "x-api-key: YOUR_API_KEY"`;

export function UsageHint() {
  const { copied, copy } = useCopy();

  return (
    <SettingsSection
      title="Using a key"
      description={
        <>
          Send the key in the{" "}
          <code className="font-mono text-[12.5px] text-foreground">
            x-api-key
          </code>{" "}
          header of every request. The key identifies the workspace, so no
          workspace identifier goes in the URL.
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 text-[13px] text-muted-foreground">
            This request returns the workspace the key belongs to.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => copy(example, "Could not copy the example")}
            className={secondaryButtonClass}
          >
            {copied ? (
              <Check aria-hidden strokeWidth={1.8} className="text-success" />
            ) : (
              <Copy aria-hidden strokeWidth={1.6} />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-border-subtle bg-muted/60 px-3.5 py-3 font-mono text-[12.5px] text-foreground leading-relaxed">
          <code>{example}</code>
        </pre>
        <p className="text-[13px] text-muted-foreground">
          Set{" "}
          <code className="font-mono text-[12.5px] text-foreground">
            {hostVariable}
          </code>{" "}
          to the address where your OpenCadence API is running, and replace{" "}
          <code className="font-mono text-[12.5px] text-foreground">
            YOUR_API_KEY
          </code>{" "}
          with a key from the list above.
        </p>
      </div>
    </SettingsSection>
  );
}
