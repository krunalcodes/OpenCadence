"use client";

import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonFocusRing, focusRing } from "@/components/app-shell/page-header";
import {
  segmentedGroupClass,
  segmentedItemClass,
} from "@/components/product/styles";
import { previewDocument } from "@/features/campaigns/lib/campaigns";
import { copy } from "@/features/campaigns/lib/copy";
import { fetchTemplateContent } from "@/features/campaigns/queries/client";
import { appHref } from "@/lib/navigation";

const text = copy.composer.preview;

const widths = ["desktop", "mobile"] as const;

type Width = (typeof widths)[number];

type Loaded =
  | { key: string; state: "ready"; html: string }
  | { key: string; state: "failed"; missing: boolean };

type TemplatePreviewProps = {
  templateId: string | null;
  templateName: string;
  reloadKey: number;
};

export function TemplatePreview({
  templateId,
  templateName,
  reloadKey,
}: TemplatePreviewProps) {
  const [width, setWidth] = useState<Width>("desktop");
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = templateId ? `${templateId}:${attempt}:${reloadKey}` : null;

  useEffect(() => {
    if (!templateId || !key) {
      return;
    }
    let current = true;
    fetchTemplateContent(templateId).then((result) => {
      if (!current) {
        return;
      }
      setLoaded(
        result.ok
          ? { key, state: "ready", html: result.data.html }
          : {
              key,
              state: "failed",
              missing:
                result.error.status === 404 ||
                result.error.code === "not_found",
            },
      );
    });
    return () => {
      current = false;
    };
  }, [templateId, key]);

  const shown =
    templateId && loaded?.key.startsWith(`${templateId}:`) ? loaded : null;
  const loading = key !== null && loaded?.key !== key;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-[13px] font-medium text-foreground">
          {text.title}
        </h3>
        {templateId ? (
          <>
            <a
              href={appHref(`templates/${encodeURIComponent(templateId)}`)}
              target="_blank"
              rel="noreferrer"
              aria-label={text.editLabel(templateName)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-lg px-1.5 text-[12.5px] font-medium text-primary hover:underline",
                focusRing,
              )}
            >
              {text.edit}
              <ExternalLink
                aria-hidden
                strokeWidth={1.6}
                className="size-3.5"
              />
            </a>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={text.reload}
              title={text.reload}
              disabled={loading}
              onClick={() => setAttempt((current) => current + 1)}
              className={cn(
                "text-muted-foreground hover:bg-accent",
                buttonFocusRing,
              )}
            >
              <RefreshCw
                aria-hidden
                strokeWidth={1.6}
                className={cn(
                  loading && "animate-spin motion-reduce:animate-none",
                )}
              />
            </Button>
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
          </>
        ) : null}
      </div>
      <div
        aria-busy={loading || undefined}
        className="flex h-[440px] justify-center overflow-hidden rounded-lg border border-border bg-muted"
      >
        {!templateId ? (
          <p className="self-center px-6 text-center text-[13px] text-ink-tertiary">
            {text.empty}
          </p>
        ) : shown?.state === "ready" ? (
          shown.html.trim() === "" ? (
            <p className="self-center px-6 text-center text-[13px] text-muted-foreground">
              {text.emptyBody}
            </p>
          ) : (
            <iframe
              title={text.frameTitle}
              sandbox=""
              srcDoc={previewDocument(shown.html)}
              className={cn(
                "h-full bg-white transition-[width,opacity] duration-200 motion-reduce:transition-none",
                width === "mobile"
                  ? "w-[375px] max-w-full border-x border-border"
                  : "w-full",
                loading && "opacity-60",
              )}
            />
          )
        ) : shown?.state === "failed" && !loading ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-2 self-center px-6 text-center text-[13px] text-muted-foreground"
          >
            <p>{shown.missing ? text.missing : text.failed}</p>
            {shown.missing ? null : (
              <button
                type="button"
                onClick={() => setAttempt((current) => current + 1)}
                className={cn(
                  "rounded-[4px] font-medium text-primary underline-offset-2 hover:underline",
                  focusRing,
                )}
              >
                {text.retry}
              </button>
            )}
          </div>
        ) : (
          <div className="flex w-full max-w-[600px] flex-col gap-3 p-8">
            <span className="sr-only">{text.loading}</span>
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-2 h-9 w-32" />
          </div>
        )}
      </div>
      {templateId ? (
        <p className="text-[12.5px] text-ink-tertiary">{text.note}</p>
      ) : null}
    </div>
  );
}
