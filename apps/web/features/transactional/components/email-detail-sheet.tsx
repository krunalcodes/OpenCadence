"use client";

import { Button } from "@workspace/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import { SourceMark } from "@/components/product/source-mark";
import {
  secondaryButtonClass,
  segmentedGroupClass,
  segmentedItemClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { StatusBadge } from "@/components/status-badge";
import { LinkedText } from "@/features/transactional/components/linked-text";
import { useCopy } from "@/features/transactional/hooks/use-copy";
import {
  copy,
  describeError,
  kindLabels,
  sendErrorView,
  statusLabels,
  statusTones,
} from "@/features/transactional/lib/copy";
import type {
  Email,
  EmailContent,
  EmailDetail,
} from "@/features/transactional/lib/emails";
import { fetchEmail } from "@/features/transactional/queries/client";
import type { ApiResult } from "@/lib/api";
import type { EventClock } from "@/lib/event-clock";

const { sheet } = copy;

const countFormat = new Intl.NumberFormat("en-US");

const termClass = "text-muted-foreground";
const blockClass =
  "overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2.5 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap break-words text-foreground";

type EmailDetailSheetProps = {
  email: Email | null;
  clock: EventClock;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function Addresses({ items }: { items: string[] }) {
  return (
    <ul className="flex min-w-0 flex-col gap-0.5">
      {items.map((address) => (
        <li key={address} className="break-all text-foreground">
          {address}
        </li>
      ))}
    </ul>
  );
}

function Moment({ clock, value }: { clock: EventClock; value: string }) {
  const moment = clock(value);
  return moment ? (
    <time dateTime={moment.iso}>{sheet.whenAt(moment.day, moment.time)}</time>
  ) : null;
}

export function EmailDetailSheet({
  email,
  clock,
  open,
  onOpenChange,
}: EmailDetailSheetProps) {
  const error = email?.error ? sendErrorView(email.error) : null;
  const tags = email ? Object.entries(email.tags) : [];
  const recipient = email?.to[0] ?? copy.noRecipient;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 text-[13px] data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]">
        {email ? (
          <>
            <SheetHeader className="gap-1 border-b border-border-subtle px-5 py-4 pr-12">
              <SheetTitle className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                {email.subject || copy.noSubject}
              </SheetTitle>
              <SheetDescription className="truncate text-[13px] leading-normal">
                {sheet.to(recipient, Math.max(email.to.length - 1, 0))}
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <dl className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-x-3 gap-y-3">
                <dt className={termClass}>{sheet.status}</dt>
                <dd>
                  <StatusBadge tone={statusTones[email.status]}>
                    {statusLabels[email.status]}
                  </StatusBadge>
                </dd>
                <dt className={termClass}>{sheet.when}</dt>
                <dd className="text-foreground tabular-nums">
                  <Moment clock={clock} value={email.createdAt} />
                </dd>
                {email.sentAt ? (
                  <>
                    <dt className={termClass}>{sheet.sentAt}</dt>
                    <dd className="text-foreground tabular-nums">
                      <Moment clock={clock} value={email.sentAt} />
                    </dd>
                  </>
                ) : null}
                {email.lastEventAt ? (
                  <>
                    <dt className={termClass}>{sheet.lastEvent}</dt>
                    <dd className="text-foreground tabular-nums">
                      <Moment clock={clock} value={email.lastEventAt} />
                    </dd>
                  </>
                ) : null}
                <dt className={termClass}>{sheet.from}</dt>
                <dd className="break-all text-foreground">
                  {email.from.name
                    ? sheet.sender(email.from.name, email.from.email)
                    : email.from.email}
                </dd>
                <dt className={termClass}>{sheet.toLabel}</dt>
                <dd>
                  <Addresses items={email.to} />
                </dd>
                {email.cc.length > 0 ? (
                  <>
                    <dt className={termClass}>{sheet.cc}</dt>
                    <dd>
                      <Addresses items={email.cc} />
                    </dd>
                  </>
                ) : null}
                {email.bcc.length > 0 ? (
                  <>
                    <dt className={termClass}>{sheet.bcc}</dt>
                    <dd>
                      <Addresses items={email.bcc} />
                    </dd>
                  </>
                ) : null}
                <dt className={termClass}>{sheet.source}</dt>
                <dd className="flex min-w-0 items-center gap-2">
                  {email.integrationType ? (
                    <SourceMark
                      integration={{ id: email.integrationType, mark: null }}
                      className="size-5 rounded-[5px] [&_svg]:size-3"
                    />
                  ) : null}
                  <span className="truncate text-foreground">
                    {email.sourceName || copy.removedSource}
                  </span>
                </dd>
                <dt className={termClass}>{sheet.kind}</dt>
                <dd className="text-foreground">{kindLabels[email.kind]}</dd>
                <dt className={termClass}>{sheet.attempts}</dt>
                <dd className="text-foreground tabular-nums">
                  {countFormat.format(email.attempts)}
                </dd>
                {tags.length > 0 ? (
                  <>
                    <dt className={termClass}>{sheet.tags}</dt>
                    <dd>
                      <ul className="flex flex-wrap gap-1.5">
                        {tags.map(([key, value]) => (
                          <li
                            key={key}
                            className="inline-flex h-[22px] max-w-full items-center rounded-[6px] bg-border-subtle px-2 text-xs font-medium text-foreground"
                          >
                            <span className="truncate">
                              {sheet.tag(key, value)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </>
                ) : null}
              </dl>

              {error ? (
                <div className="mt-5 rounded-lg border border-danger/20 bg-danger-surface px-3 py-2.5">
                  <h3 className="text-[13px] font-medium text-danger">
                    {sheet.errorTitle}
                  </h3>
                  <p className="mt-0.5 text-[13px] text-foreground">
                    {error.summary}
                  </p>
                  {error.code || error.detail ? (
                    <p className="mt-1.5 break-words font-mono text-[12.5px] text-muted-foreground">
                      {error.code}
                      {error.code && error.detail ? <br /> : null}
                      {error.detail}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {email.suppressed.length > 0 ? (
                <div className="mt-5">
                  <h3 className="text-[13px] font-medium text-foreground">
                    {sheet.suppressedTitle(email.suppressed.length)}
                  </h3>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    <LinkedText text={sheet.suppressedBody} />
                  </p>
                  <ul className="mt-2 flex flex-col gap-0.5">
                    {email.suppressed.map((address) => (
                      <li key={address} className="break-all text-foreground">
                        {address}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-5">
                <label
                  htmlFor="email-detail-id"
                  className="mb-1.5 block text-[13px] font-medium text-foreground"
                >
                  {sheet.idLabel}
                </label>
                <IdField key={email.id} id={email.id} />
              </div>

              <ContentSection key={email.id} id={email.id} />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function IdField({ id }: { id: string }) {
  const { copied, copyText } = useCopy();
  return (
    <InputGroup className="h-8 bg-card shadow-xs">
      <InputGroupInput
        id="email-detail-id"
        readOnly
        value={id}
        onFocus={(event) => event.target.select()}
        className="font-mono text-[12.5px]"
      />
      <InputGroupAddon align="inline-end" className="pr-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={copied ? sheet.copiedId : sheet.copyId}
          onClick={() => copyText(id)}
          className={cn(
            "size-6 text-muted-foreground hover:bg-accent",
            buttonFocusRing,
          )}
        >
          {copied ? (
            <Check aria-hidden strokeWidth={1.8} className="text-success" />
          ) : (
            <Copy aria-hidden strokeWidth={1.6} />
          )}
        </Button>
      </InputGroupAddon>
      <span aria-live="polite" className="sr-only">
        {copied ? sheet.copiedId : ""}
      </span>
    </InputGroup>
  );
}

type Loaded = { attempt: number; value: ApiResult<EmailDetail> };

function ContentSection({ id }: { id: string }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let active = true;
    void fetchEmail(id).then((value) => {
      if (active) {
        setLoaded({ attempt, value });
      }
    });
    return () => {
      active = false;
    };
  }, [id, attempt]);

  const result = loaded?.attempt === attempt ? loaded.value : null;
  const retrying = loaded !== null && result === null;

  return (
    <section aria-busy={result === null || undefined} className="mt-5">
      <h3 className="mb-1.5 text-[13px] font-medium text-foreground">
        {sheet.contentTitle}
      </h3>
      {result === null && !retrying ? (
        <div aria-hidden="true">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2.5 h-[420px] w-full rounded-lg" />
        </div>
      ) : result === null || !result.ok ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
        >
          <p className="min-w-0 text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {sheet.contentFailed.title}
            </span>{" "}
            {loaded && !loaded.value.ok
              ? describeError(loaded.value.error)
              : null}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={retrying}
            aria-busy={retrying || undefined}
            onClick={() => setAttempt((current) => current + 1)}
            className={cn(secondaryButtonClass, "px-[9px] text-[12.5px]")}
          >
            {retrying ? <Spinner className="size-3.5" /> : null}
            {sheet.contentFailed.retry}
          </Button>
        </div>
      ) : result.data.content ? (
        <ContentTabs content={result.data.content} />
      ) : (
        <p className="rounded-lg border border-border bg-muted px-3 py-2.5 text-[13px] text-muted-foreground">
          {sheet.contentGone}
        </p>
      )}
    </section>
  );
}

type ContentTab = "html" | "text" | "headers";

const contentTabs: ContentTab[] = ["html", "text", "headers"];

function ContentTabs({ content }: { content: EmailContent }) {
  const [picked, setPicked] = useState<ContentTab | null>(null);
  const tab =
    picked ?? (content.html ? "html" : content.text ? "text" : "headers");
  const headers = Object.entries(content.headers);

  return (
    <div className="flex flex-col gap-2.5">
      <ToggleGroup
        aria-label={sheet.contentLabel}
        value={[tab]}
        onValueChange={(next) => {
          const id = contentTabs.find((item) => item === next[0]);
          if (id) {
            setPicked(id);
          }
        }}
        className={segmentedGroupClass}
      >
        {contentTabs.map((id) => (
          <ToggleGroupItem key={id} value={id} className={segmentedItemClass}>
            {sheet.contentTabs[id]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {tab === "html" ? (
        content.html ? (
          <iframe
            title={sheet.htmlFrameTitle}
            sandbox=""
            srcDoc={content.html}
            className="h-[420px] w-full rounded-lg border border-border bg-white"
          />
        ) : (
          <p className="text-[13px] text-muted-foreground">{sheet.noHtml}</p>
        )
      ) : tab === "text" ? (
        content.text ? (
          <pre className={blockClass}>{content.text}</pre>
        ) : (
          <p className="text-[13px] text-muted-foreground">{sheet.noText}</p>
        )
      ) : headers.length > 0 ? (
        <pre className={blockClass}>
          {headers.map(([name, value]) => sheet.header(name, value)).join("\n")}
        </pre>
      ) : (
        <p className="text-[13px] text-muted-foreground">{sheet.noHeaders}</p>
      )}
    </div>
  );
}
