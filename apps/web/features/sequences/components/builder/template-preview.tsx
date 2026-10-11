"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";
import { useEffect, useState } from "react";
import { copy } from "@/features/sequences/lib/copy";
import { fetchTemplateHtml } from "@/features/sequences/queries/client";

const text = copy.builder.panel;

type Loaded =
  | { id: string; state: "ready"; html: string }
  | { id: string; state: "failed" };

function previewDocument(html: string) {
  const base = '<base target="_blank" />';
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (head) => `${head}${base}`);
  }
  return `<!doctype html><html><head>${base}<meta charset="utf-8" /></head><body>${html}</body></html>`;
}

export function TemplatePreview({ templateId }: { templateId: string | null }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!templateId) {
      return;
    }
    let current = true;
    fetchTemplateHtml(templateId).then((result) => {
      if (!current) {
        return;
      }
      if (result.ok) {
        setLoaded({ id: templateId, state: "ready", html: result.data.html });
      } else {
        setLoaded({ id: templateId, state: "failed" });
      }
    });
    return () => {
      current = false;
    };
  }, [templateId]);

  const frameClass =
    "flex h-[300px] overflow-hidden rounded-lg border border-border bg-muted";

  if (!templateId) {
    return (
      <div className={frameClass}>
        <p className="m-auto px-6 text-center text-[13px] text-muted-foreground">
          {text.previewEmpty}
        </p>
      </div>
    );
  }

  const html =
    loaded?.id === templateId && loaded.state === "ready" ? loaded.html : null;
  const failed = loaded?.id === templateId && loaded.state === "failed";

  if (html !== null) {
    return html.trim() === "" ? (
      <div className={frameClass}>
        <p className="m-auto px-6 text-center text-[13px] text-muted-foreground">
          {text.previewBlank}
        </p>
      </div>
    ) : (
      <div className="flex flex-col gap-1.5">
        <div className={frameClass}>
          <iframe
            title={text.previewFrame}
            sandbox=""
            srcDoc={previewDocument(html)}
            className="h-full w-full bg-white"
          />
        </div>
        <p className="text-xs text-ink-tertiary">{text.previewNote}</p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className={frameClass}>
        <p
          role="alert"
          className="m-auto px-6 text-center text-[13px] text-muted-foreground"
        >
          {text.previewFailed}
        </p>
      </div>
    );
  }

  return (
    <div aria-busy="true" className={frameClass}>
      <div className="flex w-full flex-col gap-3 p-5">
        <span className="sr-only">{text.previewLoading}</span>
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-2 h-8 w-28" />
      </div>
    </div>
  );
}
