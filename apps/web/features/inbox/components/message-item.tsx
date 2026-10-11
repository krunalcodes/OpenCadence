"use client";

import { cn } from "@workspace/ui/lib/utils";
import { useState } from "react";
import { focusRing } from "@/components/app-shell/page-header";
import { StatusBadge } from "@/components/status-badge";
import { useElementWidth } from "@/features/inbox/hooks/use-element-width";
import {
  copy,
  deliveryHints,
  deliveryLabels,
  deliveryTones,
} from "@/features/inbox/lib/copy";
import type { InboxMessage } from "@/features/inbox/lib/inbox";
import {
  estimateHtmlHeight,
  estimateTextHeight,
  frameSandbox,
  htmlDocument,
  maxBodyHeight,
  maxExpandedHeight,
  splitQuoted,
  textDocument,
} from "@/features/inbox/lib/message-body";
import type { EventClock } from "@/lib/event-clock";

const text = copy.thread;

const toggleClass = cn(
  "rounded-[6px] px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
  focusRing,
);

type MessageBodyProps = {
  message: InboxMessage;
  sender: string;
};

function MessageBody({ message, sender }: MessageBodyProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>(600);
  const [showQuoted, setShowQuoted] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!message.html && !message.text) {
    return <p className="text-ink-tertiary">{text.noBody}</p>;
  }

  const split = message.html ? null : splitQuoted(message.text ?? "");
  const shownText = split
    ? showQuoted || split.quoted === null
      ? (message.text ?? "").trim()
      : split.visible
    : "";
  const frame = message.html
    ? htmlDocument(message.html, text.imageLabel)
    : textDocument(shownText, text.imageLabel);
  const estimate = message.html
    ? estimateHtmlHeight(message.html, width)
    : estimateTextHeight(shownText, width);
  const clamped = estimate > maxBodyHeight;
  const height = Math.min(
    estimate,
    expanded ? maxExpandedHeight : maxBodyHeight,
  );
  const hasQuoted = split !== null && split.quoted !== null;

  return (
    <div ref={ref} className="min-w-0">
      <iframe
        title={text.frameTitle(sender)}
        sandbox={frameSandbox}
        referrerPolicy="no-referrer"
        srcDoc={frame}
        style={{ height }}
        className="block w-full border-0 bg-card"
      />
      {hasQuoted || clamped ? (
        <div className="-ml-1.5 mt-1.5 flex flex-wrap items-center gap-1">
          {hasQuoted ? (
            <button
              type="button"
              aria-expanded={showQuoted}
              onClick={() => setShowQuoted((shown) => !shown)}
              className={toggleClass}
            >
              {showQuoted ? text.hideQuoted : text.showQuoted}
            </button>
          ) : null}
          {clamped ? (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((open) => !open)}
              className={toggleClass}
            >
              {expanded ? text.showLess : text.showFull}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type MessageItemProps = {
  message: InboxMessage;
  clock: EventClock;
  label?: string;
};

export function MessageItem({ message, clock, label }: MessageItemProps) {
  const sender = message.from.name ?? message.from.email;
  const moment = clock(message.occurredAt);
  const outbound = message.direction === "outbound";
  const hint = message.status ? deliveryHints[message.status] : undefined;

  return (
    <article
      aria-label={label ?? text.frameTitle(sender)}
      className="flex min-w-0 flex-col gap-2 px-5 py-4"
    >
      <header className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-48">
          <p className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-medium text-foreground">
              {sender}
            </span>
            {message.from.name && message.from.email ? (
              <span className="min-w-0 truncate text-xs text-ink-tertiary">
                {message.from.email}
              </span>
            ) : null}
          </p>
          {message.to.length > 0 ? (
            <p className="truncate text-xs text-ink-tertiary">
              {text.to(message.to.join(", "))}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {outbound && message.status ? (
            <StatusBadge tone={deliveryTones[message.status]}>
              {deliveryLabels[message.status]}
            </StatusBadge>
          ) : null}
          {moment ? (
            <time
              dateTime={moment.iso}
              suppressHydrationWarning
              className="whitespace-nowrap text-xs text-ink-tertiary tabular-nums"
            >
              {`${moment.day}, ${moment.time}`}
            </time>
          ) : null}
        </div>
      </header>
      <MessageBody message={message} sender={sender} />
      {outbound && hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </article>
  );
}
