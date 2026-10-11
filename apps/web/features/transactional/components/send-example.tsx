"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { Check, Code, Copy } from "lucide-react";
import { secondaryButtonClass } from "@/components/product/styles";
import { LinkedText } from "@/features/transactional/components/linked-text";
import { useCopy } from "@/features/transactional/hooks/use-copy";
import { copy, curlExample } from "@/features/transactional/lib/copy";
import { useOrigin } from "@/hooks/use-hydrated";

export function SendExample() {
  const origin = useOrigin();
  const { copied, copyText } = useCopy();
  const { empty } = copy;
  const example = curlExample(origin);

  return (
    <div className="flex max-w-[760px] flex-col gap-4 px-4 py-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-primary shadow-xs"
        >
          <Code className="size-4" strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            {empty.title}
          </h2>
          <p className="text-[13px] text-muted-foreground">{empty.body}</p>
        </div>
      </div>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] text-muted-foreground marker:text-ink-tertiary marker:tabular-nums">
        {empty.steps.map((step) => (
          <li key={step.path}>
            <LinkedText text={step} />
          </li>
        ))}
        <li>{empty.lastStep}</li>
      </ol>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-medium text-foreground">
            {empty.exampleLabel}
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => copyText(example)}
            className={cn(secondaryButtonClass, "px-[9px] text-[12.5px]")}
          >
            {copied ? (
              <Check aria-hidden strokeWidth={1.8} className="text-success" />
            ) : (
              <Copy aria-hidden strokeWidth={1.6} />
            )}
            {copied ? empty.copied : empty.copy}
          </Button>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-foreground">
          <code>{example}</code>
        </pre>
      </div>
      <p className="text-[13px] text-muted-foreground">{empty.after}</p>
    </div>
  );
}
