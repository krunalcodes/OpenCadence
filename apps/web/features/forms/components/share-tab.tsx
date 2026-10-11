"use client";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import { Check, Copy, ExternalLink, Info } from "lucide-react";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import {
  inputClass,
  linkButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { useCopy } from "@/features/forms/hooks/use-copy";
import { copy } from "@/features/forms/lib/copy";
import type { Form } from "@/features/forms/lib/forms";

const text = copy.share;

const monoClass =
  "font-mono text-[12.5px] leading-relaxed md:text-[12.5px] [font-feature-settings:normal]";

type SnippetProps = {
  id: string;
  title: string;
  when: string;
  label: string;
  value: string;
  rows?: number;
  openHref?: string | null;
};

function Snippet({
  id,
  title,
  when,
  label,
  value,
  rows,
  openHref,
}: SnippetProps) {
  const { copied, copyText } = useCopy();
  const whenId = `${id}-when`;

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-2.5 px-4 py-4"
    >
      <div>
        <h3
          id={`${id}-title`}
          className="text-[13px] font-semibold text-foreground"
        >
          {title}
        </h3>
        <p id={whenId} className="max-w-[720px] text-muted-foreground">
          {when}
        </p>
      </div>
      {value === "" ? (
        <p role="alert" className="text-danger">
          {text.missing}
        </p>
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          {rows ? (
            <Textarea
              id={id}
              readOnly
              rows={rows}
              spellCheck={false}
              value={value}
              aria-label={label}
              aria-describedby={whenId}
              onFocus={(event) => event.currentTarget.select()}
              className={cn(
                inputClass,
                monoClass,
                "min-w-0 flex-1 basis-80 resize-y bg-muted/50",
              )}
            />
          ) : (
            <Input
              id={id}
              readOnly
              spellCheck={false}
              value={value}
              aria-label={label}
              aria-describedby={whenId}
              onFocus={(event) => event.currentTarget.select()}
              className={cn(
                inputClass,
                monoClass,
                "min-w-0 flex-1 basis-80 bg-muted/50",
              )}
            />
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => void copyText(value)}
            className={secondaryButtonClass}
          >
            {copied ? (
              <Check aria-hidden strokeWidth={1.8} />
            ) : (
              <Copy aria-hidden strokeWidth={1.6} />
            )}
            <span aria-live="polite">{copied ? text.copied : text.copy}</span>
          </Button>
          {openHref ? (
            <a
              href={openHref}
              target="_blank"
              rel="noreferrer"
              className={cn(
                linkButtonClass,
                "gap-1.5 border-border bg-card px-3 text-foreground shadow-xs hover:bg-muted",
                buttonFocusRing,
              )}
            >
              <ExternalLink aria-hidden strokeWidth={1.6} className="size-4" />
              {text.open}
            </a>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function ShareTab({ form }: { form: Form }) {
  const published = form.status === "published";

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      {published ? null : (
        <p className="flex items-start gap-2.5 rounded-xl border border-border bg-info-surface px-4 py-3 text-info">
          <Info
            aria-hidden
            strokeWidth={1.6}
            className="mt-0.5 size-4 shrink-0"
          />
          {text.notPublished}
        </p>
      )}
      <div className="min-w-0 divide-y divide-border-subtle overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <Snippet
          id="form-share-link"
          title={text.link.title}
          when={text.link.when}
          label={text.link.label}
          value={form.embed.url}
          openHref={published ? form.embed.url : null}
        />
        <Snippet
          id="form-share-iframe"
          title={text.iframe.title}
          when={text.iframe.when}
          label={text.iframe.label}
          value={form.embed.iframe}
          rows={3}
        />
        <Snippet
          id="form-share-html"
          title={text.html.title}
          when={text.html.when}
          label={text.html.label}
          value={form.embed.html}
          rows={10}
        />
      </div>
    </div>
  );
}
