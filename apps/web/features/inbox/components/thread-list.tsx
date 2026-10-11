"use client";

import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";
import type { MouseEvent } from "react";
import { focusRing } from "@/components/app-shell/page-header";
import { copy, originLabels } from "@/features/inbox/lib/copy";
import {
  contactLabel,
  relativeTime,
  type Thread,
} from "@/features/inbox/lib/inbox";
import type { EventClock } from "@/lib/event-clock";
import { appHref } from "@/lib/navigation";

const text = copy.row;

type ThreadListProps = {
  threads: Thread[];
  selectedId: string | null;
  now: number | null;
  clock: EventClock;
  dimmed: boolean;
  hrefFor: (id: string) => string;
  onSelect: (id: string) => void;
};

function isPlainClick(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function ThreadList({
  threads,
  selectedId,
  now,
  clock,
  dimmed,
  hrefFor,
  onSelect,
}: ThreadListProps) {
  return (
    <ul
      className={cn(
        "divide-y divide-border-subtle transition-opacity",
        dimmed && "opacity-60",
      )}
    >
      {threads.map((thread) => {
        const selected = thread.id === selectedId;
        const contact = contactLabel(thread);
        const subject = thread.subject || text.noSubject;
        const moment = clock(thread.lastMessageAt);
        const yours = thread.lastDirection === "outbound";
        return (
          <li
            key={thread.id}
            className={cn(
              "relative flex flex-col gap-0.5 py-2.5 pr-3.5 pl-7 transition-colors hover:bg-muted/60",
              selected && "bg-muted hover:bg-muted",
            )}
          >
            {thread.unread ? (
              <span className="absolute top-[17px] left-3 size-2 rounded-full bg-primary">
                <span className="sr-only">{text.unread}</span>
              </span>
            ) : null}
            <div className="flex min-w-0 items-baseline gap-2">
              <a
                href={hrefFor(thread.id)}
                data-thread-row={thread.id}
                aria-current={selected ? "true" : undefined}
                aria-label={text.open(contact, subject)}
                onClick={(event) => {
                  if (isPlainClick(event)) {
                    event.preventDefault();
                    onSelect(thread.id);
                  }
                }}
                className={cn(
                  "min-w-0 flex-1 truncate text-foreground outline-hidden after:absolute after:inset-0 focus-visible:after:rounded-[6px] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring",
                  thread.unread ? "font-semibold" : "font-medium",
                )}
              >
                {contact}
              </a>
              {moment ? (
                <time
                  dateTime={moment.iso}
                  suppressHydrationWarning
                  className="shrink-0 text-xs text-ink-tertiary tabular-nums"
                >
                  {now === null
                    ? moment.day
                    : copy.relative(
                        relativeTime(thread.lastMessageAt, now),
                        moment.day,
                      )}
                </time>
              ) : null}
            </div>
            <p
              className={cn(
                "truncate",
                thread.unread
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {subject}
            </p>
            {thread.snippet ? (
              <p className="truncate text-[12.5px] text-ink-tertiary">
                {thread.snippet}
              </p>
            ) : null}
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-ink-tertiary">
              {thread.origin ? (
                <>
                  <Link
                    href={appHref(
                      `${thread.origin.type === "campaign" ? "campaigns" : "sequences"}/${thread.origin.id}`,
                    )}
                    aria-label={text.originLink(
                      originLabels[thread.origin.type],
                      thread.origin.name,
                    )}
                    className={cn(
                      "relative z-10 inline-flex h-[18px] min-w-0 max-w-[60%] items-center rounded-[6px] bg-border-subtle px-1.5 font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
                      focusRing,
                    )}
                  >
                    <span className="truncate">{thread.origin.name}</span>
                  </Link>
                  <span aria-hidden>·</span>
                </>
              ) : null}
              <span className="shrink-0">
                {yours ? text.yours : text.theirs}
              </span>
              {thread.status === "closed" ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">{text.closed}</span>
                </>
              ) : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
