"use client";

import { Button } from "@workspace/ui/components/button";
import { Kbd } from "@workspace/ui/components/kbd";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import { Lock, Send } from "lucide-react";
import Link from "next/link";
import { type RefObject, useEffect, useId, useState } from "react";
import { focusRing } from "@/components/app-shell/page-header";
import { primaryButtonClass } from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import {
  copy,
  describeReplyError,
  type ReplyProblem,
} from "@/features/inbox/lib/copy";
import { readDraft, writeDraft } from "@/features/inbox/lib/drafts";
import {
  type InboxMessage,
  maxReplyLength,
  type Thread,
} from "@/features/inbox/lib/inbox";
import { sendReply } from "@/features/inbox/queries/client";
import { appHref } from "@/lib/navigation";
import type { SourceStatus } from "@/lib/sources";

const text = copy.reply;

type ReplyBoxProps = {
  thread: Thread;
  sourceStatus: SourceStatus | null;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onSent: (message: InboxMessage) => void;
};

export function ReplyBox({
  thread,
  sourceStatus,
  inputRef,
  onSent,
}: ReplyBoxProps) {
  const base = useId();
  const fromId = `${base}-from`;
  const problemId = `${base}-problem`;
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<ReplyProblem | null>(null);

  useEffect(() => {
    const draft = readDraft(thread.id);
    if (draft !== "") {
      setValue(draft);
    }
  }, [thread.id]);

  const gone = thread.source.name === "" && thread.source.email === null;
  const sourceName = thread.source.name || thread.source.email || "";
  const notice = gone
    ? text.sourceGone
    : sourceStatus === "paused"
      ? text.sourcePaused(sourceName)
      : sourceStatus === "needs_attention"
        ? text.sourceNeedsAttention(sourceName)
        : null;
  const empty = value.trim() === "";

  function change(next: string) {
    setValue(next);
    writeDraft(thread.id, next);
    if (problem) {
      setProblem(null);
    }
  }

  async function send() {
    if (sending || empty || gone) {
      return;
    }
    if (value.length > maxReplyLength) {
      setProblem({ message: text.tooLong(maxReplyLength), sources: false });
      return;
    }
    setSending(true);
    setProblem(null);
    const result = await sendReply(thread.id, value);
    setSending(false);
    if (!result.ok) {
      setProblem(describeReplyError(result.error, thread.contact.email));
      return;
    }
    setValue("");
    writeDraft(thread.id, "");
    onSent(result.data);
  }

  return (
    <form
      aria-label={text.label}
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
      className="flex shrink-0 flex-col gap-2 border-t border-border-subtle bg-card px-5 py-3"
    >
      {notice ? (
        <p className="rounded-lg bg-warning-surface px-3 py-2 text-[12.5px] text-warning">
          {notice}{" "}
          <Link
            href={appHref("integrations")}
            className={cn(
              "rounded-[4px] font-medium underline underline-offset-2",
              focusRing,
            )}
          >
            {text.sources}
          </Link>
        </p>
      ) : null}
      <Textarea
        ref={inputRef}
        value={value}
        readOnly={sending}
        disabled={gone}
        rows={3}
        aria-label={text.label}
        aria-describedby={problem ? `${fromId} ${problemId}` : fromId}
        aria-invalid={problem ? true : undefined}
        aria-keyshortcuts="Meta+Enter Control+Enter"
        placeholder={text.placeholder}
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void send();
          }
        }}
        className="max-h-[38dvh] min-h-[72px] resize-none bg-card text-[13px] leading-normal shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:text-[13px]"
      />
      {problem ? (
        <p id={problemId} role="alert" className="text-[12.5px] text-danger">
          {problem.message}{" "}
          {problem.sources ? (
            <Link
              href={appHref("integrations")}
              className={cn(
                "rounded-[4px] font-medium underline underline-offset-2",
                focusRing,
              )}
            >
              {text.sources}
            </Link>
          ) : null}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p
          id={fromId}
          className="flex min-w-0 flex-1 basis-56 items-center gap-1.5 text-xs text-ink-tertiary"
        >
          <Lock aria-hidden className="size-3.5 shrink-0" strokeWidth={1.6} />
          <span className="shrink-0">{text.from}</span>
          <span
            title={text.fromHint}
            className="min-w-0 truncate font-medium text-muted-foreground"
          >
            {gone
              ? copy.thread.disconnected
              : thread.source.email && thread.source.email !== sourceName
                ? `${sourceName} (${thread.source.email})`
                : sourceName}
          </span>
          <span className="sr-only">{text.fromHint}</span>
        </p>
        <Kbd
          aria-hidden
          className="hidden h-[18px] rounded-[5px] border border-border bg-muted px-[5px] text-[11px] text-ink-tertiary @xl:inline-flex"
        >
          {text.sendKeys}
        </Kbd>
        <Button
          type="submit"
          disabled={sending || empty || gone}
          aria-busy={sending || undefined}
          className={primaryButtonClass}
        >
          {sending ? <Spinner /> : <Send aria-hidden strokeWidth={1.6} />}
          {sending ? text.sending : text.send}
        </Button>
      </div>
    </form>
  );
}
