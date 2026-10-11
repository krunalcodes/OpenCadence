"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { useEffect, useState } from "react";
import {
  dialogTitleClass,
  secondaryButtonClass,
  segmentedGroupClass,
  segmentedItemClass,
} from "@/components/product/styles";
import { copy } from "@/features/templates/lib/copy";
import { previewDocument } from "@/features/templates/lib/document";
import type { ExportedEmail } from "@/features/templates/lib/editor";
import { renderSample } from "@/features/templates/lib/merge-tags";

const text = copy.previewDialog;

const widths = ["desktop", "mobile"] as const;

type Width = (typeof widths)[number];

type Loaded =
  | { state: "loading" }
  | { state: "ready"; html: string }
  | { state: "failed" };

type PreviewDialogProps = {
  open: boolean;
  subject: string;
  previewText: string;
  samples: Record<string, string>;
  exportEmail: () => Promise<ExportedEmail | null>;
  onOpenChange: (open: boolean) => void;
};

export function PreviewDialog({
  open,
  subject,
  previewText,
  samples,
  exportEmail,
  onOpenChange,
}: PreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-48px)] flex-col gap-4 p-5 text-[13px] sm:max-w-[860px]">
        {open ? (
          <PreviewBody
            subject={subject}
            previewText={previewText}
            samples={samples}
            exportEmail={exportEmail}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type PreviewBodyProps = Omit<PreviewDialogProps, "open" | "onOpenChange"> & {
  onClose: () => void;
};

function PreviewBody({
  subject,
  previewText,
  samples,
  exportEmail,
  onClose,
}: PreviewBodyProps) {
  const [width, setWidth] = useState<Width>("desktop");
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });

  useEffect(() => {
    let current = true;
    exportEmail().then((email) => {
      if (!current) {
        return;
      }
      setLoaded(
        email
          ? {
              state: "ready",
              html: previewDocument(renderSample(email.html, samples, "html")),
            }
          : { state: "failed" },
      );
    });
    return () => {
      current = false;
    };
  }, [exportEmail, samples]);

  const shownSubject = renderSample(subject, samples, "text").trim();
  const shownPreview = renderSample(previewText, samples, "text").trim();

  return (
    <>
      <DialogHeader className="pr-8">
        <DialogTitle className={dialogTitleClass}>{text.title}</DialogTitle>
        <DialogDescription className="text-[13px]">
          {text.description}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <dl className="min-w-0 flex-1 basis-72 text-[13px]">
          <div className="flex min-w-0 gap-2">
            <dt className="w-24 shrink-0 text-ink-tertiary">{text.subject}</dt>
            <dd
              className={cn(
                "min-w-0 truncate font-medium",
                shownSubject === "" && "font-normal text-ink-tertiary",
              )}
            >
              {shownSubject || text.noSubject}
            </dd>
          </div>
          {shownPreview ? (
            <div className="flex min-w-0 gap-2">
              <dt className="w-24 shrink-0 text-ink-tertiary">
                {text.previewText}
              </dt>
              <dd className="min-w-0 truncate text-muted-foreground">
                {shownPreview}
              </dd>
            </div>
          ) : null}
        </dl>
        <ToggleGroup
          aria-label={text.widthLabel}
          value={[width]}
          onValueChange={(next) => {
            const picked = widths.find((item) => item === next[0]);
            if (picked) {
              setWidth(picked);
            }
          }}
          className={segmentedGroupClass}
        >
          {widths.map((item) => (
            <ToggleGroupItem
              key={item}
              value={item}
              className={segmentedItemClass}
            >
              {text[item]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div
        aria-busy={loaded.state === "loading" || undefined}
        className="flex h-[58dvh] min-h-[280px] justify-center overflow-hidden rounded-lg border border-border bg-muted"
      >
        {loaded.state === "ready" ? (
          <iframe
            title={text.frameTitle}
            sandbox=""
            srcDoc={loaded.html}
            className={cn(
              "h-full bg-white transition-[width] duration-200 motion-reduce:transition-none",
              width === "mobile"
                ? "w-[375px] max-w-full border-x border-border"
                : "w-full",
            )}
          />
        ) : loaded.state === "loading" ? (
          <div className="flex w-full max-w-[600px] flex-col gap-3 p-8">
            <span className="sr-only">{text.preparing}</span>
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-2 h-9 w-32" />
          </div>
        ) : (
          <p role="alert" className="self-center px-6 text-muted-foreground">
            {text.failed}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className={secondaryButtonClass}
        >
          {text.close}
        </Button>
      </div>
    </>
  );
}
