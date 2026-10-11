"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import {
  Archive,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  MailOpen,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { type RefObject, useEffect, useRef, useState } from "react";
import { buttonFocusRing, focusRing } from "@/components/app-shell/page-header";
import { secondaryButtonClass } from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { StatusBadge } from "@/components/status-badge";
import { MessageItem } from "@/features/inbox/components/message-item";
import { ReplyBox } from "@/features/inbox/components/reply-box";
import { copy, originLabels } from "@/features/inbox/lib/copy";
import {
  contactLabel,
  hasOriginal,
  type InboxMessage,
  type ThreadDetail,
} from "@/features/inbox/lib/inbox";
import type { ThreadAction } from "@/features/inbox/queries/client";
import type { EventClock } from "@/lib/event-clock";
import { appHref } from "@/lib/navigation";
import type { SourceStatus } from "@/lib/sources";

const text = copy.thread;

const stickDistance = 96;

const metaLinkClass = cn(
  "rounded-[4px] font-medium text-foreground underline-offset-2 hover:underline",
  focusRing,
);

type ThreadViewProps = {
  thread: ThreadDetail;
  clock: EventClock;
  sourceStatus: SourceStatus | null;
  acting: ThreadAction | null;
  replyRef: RefObject<HTMLTextAreaElement | null>;
  onBack: () => void;
  onClose: () => void;
  onReopen: () => void;
  onMarkUnread: () => void;
  onReplySent: (message: InboxMessage) => void;
};

export function ThreadView({
  thread,
  clock,
  sourceStatus,
  acting,
  replyRef,
  onBack,
  onClose,
  onReopen,
  onMarkUnread,
  onReplySent,
}: ThreadViewProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const [showOriginal, setShowOriginal] = useState(false);

  const original = hasOriginal(thread.messages) ? thread.messages[0] : null;
  const replies = original ? thread.messages.slice(1) : thread.messages;
  const messageCount = thread.messages.length;
  const contact = contactLabel(thread);
  const closed = thread.status === "closed";
  const busy = acting !== null;
  const sourceName = thread.source.name || thread.source.email;

  useEffect(() => {
    const element = scroller.current;
    if (element && atEnd.current && messageCount > 0) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messageCount]);

  return (
    <div className="@container flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-start gap-x-3 gap-y-2 border-b border-border-subtle px-5 py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={text.back}
          onClick={onBack}
          className={cn(
            "-ml-1.5 text-muted-foreground hover:bg-accent @3xl/inbox:hidden",
            buttonFocusRing,
          )}
        >
          <ArrowLeft aria-hidden strokeWidth={1.6} />
        </Button>
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              {thread.subject || text.noSubject}
            </h2>
            {closed ? (
              <StatusBadge tone="neutral">{text.closedBadge}</StatusBadge>
            ) : null}
          </div>
          <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            {thread.contact.id ? (
              <Link
                href={`${appHref("contacts")}?search=${encodeURIComponent(thread.contact.email)}`}
                aria-label={text.viewContact(contact)}
                className={cn(metaLinkClass, "max-w-full truncate")}
              >
                {contact}
              </Link>
            ) : (
              <span className="max-w-full truncate font-medium text-foreground">
                {contact}
              </span>
            )}
            {thread.contact.name ? (
              <span className="max-w-full truncate text-ink-tertiary">
                {thread.contact.email}
              </span>
            ) : null}
            <span aria-hidden className="text-ink-tertiary">
              ·
            </span>
            <span className="max-w-full truncate">
              {text.arrivedIn}{" "}
              <span className="font-medium text-foreground">
                {sourceName || text.disconnected}
              </span>
            </span>
            {thread.origin ? (
              <>
                <span aria-hidden className="text-ink-tertiary">
                  ·
                </span>
                <span className="max-w-full truncate">
                  {originLabels[thread.origin.type]}{" "}
                  <Link
                    href={appHref(
                      `${thread.origin.type === "campaign" ? "campaigns" : "sequences"}/${thread.origin.id}`,
                    )}
                    className={metaLinkClass}
                  >
                    {thread.origin.name}
                  </Link>
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={busy || thread.unread}
            aria-busy={acting === "unread" || undefined}
            aria-keyshortcuts="U"
            onClick={onMarkUnread}
            className={cn(
              "px-2.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground",
              buttonFocusRing,
            )}
          >
            {acting === "unread" ? (
              <Spinner />
            ) : (
              <MailOpen aria-hidden strokeWidth={1.6} />
            )}
            {text.markUnread}
          </Button>
          {closed ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              aria-busy={acting === "reopen" || undefined}
              onClick={onReopen}
              className={secondaryButtonClass}
            >
              {acting === "reopen" ? (
                <Spinner />
              ) : (
                <RotateCcw aria-hidden strokeWidth={1.6} />
              )}
              {text.reopen}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              aria-busy={acting === "close" || undefined}
              aria-keyshortcuts="E"
              onClick={onClose}
              className={secondaryButtonClass}
            >
              {acting === "close" ? (
                <Spinner />
              ) : (
                <Archive aria-hidden strokeWidth={1.6} />
              )}
              {text.close}
            </Button>
          )}
        </div>
      </header>

      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          atEnd.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            stickDistance;
        }}
        className="min-h-0 flex-1 divide-y divide-border-subtle overflow-y-auto overscroll-contain"
      >
        {original ? (
          <div>
            <button
              type="button"
              aria-expanded={showOriginal}
              onClick={() => setShowOriginal((shown) => !shown)}
              className={cn(
                "flex w-full items-center gap-1.5 px-5 py-2.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                focusRing,
                "focus-visible:-outline-offset-2",
              )}
            >
              {showOriginal ? (
                <ChevronDown
                  aria-hidden
                  className="size-3.5"
                  strokeWidth={1.8}
                />
              ) : (
                <ChevronRight
                  aria-hidden
                  className="size-3.5"
                  strokeWidth={1.8}
                />
              )}
              {showOriginal ? text.hideOriginal : text.showOriginal}
            </button>
            {showOriginal ? (
              <MessageItem
                message={original}
                clock={clock}
                label={text.originalLabel}
              />
            ) : null}
          </div>
        ) : null}
        {replies.map((message) => (
          <MessageItem key={message.id} message={message} clock={clock} />
        ))}
      </div>

      <ReplyBox
        key={thread.id}
        thread={thread}
        sourceStatus={sourceStatus}
        inputRef={replyRef}
        onSent={(message) => {
          atEnd.current = true;
          onReplySent(message);
        }}
      />
    </div>
  );
}
