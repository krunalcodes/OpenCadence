import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar";
import { Badge } from "@workspace/ui/components/badge";
import { Card } from "@workspace/ui/components/card";
import { cn } from "@workspace/ui/lib/utils";
import {
  CircleStop,
  Clock,
  CornerUpLeft,
  GitBranch,
  Inbox,
  Repeat,
  Split,
} from "lucide-react";
import type * as React from "react";

type Tone = "live" | "success" | "warning" | "neutral";

const toneClasses: Record<Tone, string> = {
  live: "bg-live text-live-foreground",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  neutral: "bg-muted text-muted-foreground",
};

const mailboxes = [
  {
    address: "maya@northwind.studio",
    initials: "MA",
    provider: "Gmail",
    sent: 38,
    limit: 80,
  },
  {
    address: "sam@northwind.studio",
    initials: "SA",
    provider: "Outlook",
    sent: 71,
    limit: 80,
  },
  {
    address: "lena@northwind.studio",
    initials: "LE",
    provider: "IMAP/SMTP",
    sent: 22,
    limit: 50,
  },
];

const replies: {
  name: string;
  initials: string;
  company: string;
  time: string;
  snippet: string;
  label: string;
  tone: Tone;
  mailbox: string;
  stopped: string;
}[] = [
  {
    name: "Dana Whitfield",
    initials: "DW",
    company: "Brightline Agency",
    time: "10:12",
    snippet: "Yes, happy to take a look. Does Thursday morning work?",
    label: "Interested",
    tone: "success",
    mailbox: "maya@northwind.studio",
    stopped: "Agency founders",
  },
  {
    name: "Tom Okafor",
    initials: "TO",
    company: "Fieldnote",
    time: "09:48",
    snippet: "I am away until 20 October and will reply when I am back.",
    label: "Out of office",
    tone: "warning",
    mailbox: "sam@northwind.studio",
    stopped: "Trial ending",
  },
  {
    name: "Priya Raman",
    initials: "PR",
    company: "Lumen and Co",
    time: "Yesterday",
    snippet: "This is on hold for the quarter. Try me again in January.",
    label: "Not now",
    tone: "neutral",
    mailbox: "lena@northwind.studio",
    stopped: "Agency founders",
  },
];

function StatusBadge({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <Badge
      className={cn("h-[22px] gap-1.5 rounded-[6px] px-2", toneClasses[tone])}
    >
      <span className="relative flex size-1.5">
        {tone === "live" ? (
          <span className="absolute inline-flex size-full rounded-full bg-current opacity-60 motion-safe:animate-ping" />
        ) : null}
        <span className="relative inline-flex size-1.5 rounded-full bg-current" />
      </span>
      {children}
    </Badge>
  );
}

function Ticks({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "block h-3 min-w-12 flex-1 overflow-hidden bg-border [mask-image:repeating-linear-gradient(90deg,black_0_3px,transparent_3px_6px)]",
        className,
      )}
    >
      <span
        className="block h-full bg-primary"
        style={{ width: `${Math.round((value / max) * 100)}%` }}
      />
    </span>
  );
}

function StepBlock({
  step,
  title,
  state,
  className,
  children,
}: {
  step: string;
  title: string;
  state: "sent" | "sending" | "waiting";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-1.5 rounded-[8px] p-3 md:h-26 md:shrink-0",
        state === "sent" && "bg-sent-surface",
        state === "sending" && "border border-border bg-card shadow-xs",
        state === "waiting" &&
          "border border-ink-tertiary/60 border-dashed bg-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs tabular-nums">
          {step}
        </span>
        {state === "sent" ? (
          <StatusBadge tone="success">Sent</StatusBadge>
        ) : null}
        {state === "sending" ? (
          <StatusBadge tone="live">Sending</StatusBadge>
        ) : null}
        {state === "waiting" ? (
          <span className="text-muted-foreground text-xs">Waiting</span>
        ) : null}
      </div>
      <div className="truncate font-medium">{title}</div>
      <div className="flex items-center gap-2 text-muted-foreground text-xs tabular-nums">
        {children}
      </div>
    </div>
  );
}

function Connector({
  children,
  pill = false,
}: {
  children: React.ReactNode;
  pill?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative ml-5 border-border border-l py-2.5 pl-4 md:ml-0 md:flex md:h-26 md:items-center md:justify-center md:border-l-0 md:p-0 md:before:absolute md:before:inset-x-0 md:before:top-1/2 md:before:h-px md:before:bg-border",
        pill ? "md:flex-1" : "md:w-12 md:shrink-0",
      )}
    >
      <span
        className={cn(
          "relative inline-flex h-[22px] items-center whitespace-nowrap bg-card text-muted-foreground text-xs tabular-nums",
          pill
            ? "rounded-[6px] border border-border-subtle px-2 font-medium"
            : "px-1.5",
        )}
      >
        {children}
      </span>
    </div>
  );
}

function SequenceFlow() {
  return (
    <Card className="min-w-0 gap-0 py-0 text-[13px] shadow-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-border-subtle border-b px-5 py-3.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-[7px] border border-border bg-muted text-muted-foreground">
          <GitBranch size={16} strokeWidth={1.6} />
        </span>
        <div className="mr-auto min-w-0">
          <div className="font-semibold text-sm tracking-[-0.005em]">
            Agency founders
          </div>
          <div className="text-muted-foreground text-xs tabular-nums">
            Sequence, 4 steps, 271 contacts enrolled
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs tabular-nums">
          <Clock size={14} strokeWidth={1.6} />
          Sends Mon to Fri, 09:00 to 17:00
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
          <CornerUpLeft size={14} strokeWidth={1.6} />
          Stops on reply
        </span>
        <StatusBadge tone="success">Active</StatusBadge>
      </div>

      <div className="min-w-0 overflow-x-auto overscroll-x-contain p-5">
        <div className="flex flex-col md:min-w-[1056px] md:flex-row md:items-start">
          <StepBlock
            step="Step 1"
            title="Intro email"
            state="sent"
            className="md:w-32"
          >
            58.0% opened
          </StepBlock>
          <Connector pill>Wait 3 days</Connector>
          <div className="flex items-center md:w-36 md:shrink-0 md:flex-col">
            <div className="relative md:flex md:h-26 md:w-full md:items-center md:justify-center md:before:absolute md:before:inset-x-0 md:before:top-1/2 md:before:h-px md:before:bg-border">
              <span className="relative inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-border bg-card px-2.5 font-medium shadow-xs">
                <Split
                  size={16}
                  strokeWidth={1.6}
                  className="text-muted-foreground"
                />
                Replied?
              </span>
            </div>
            <div className="flex h-px w-12 shrink-0 items-center justify-center bg-border md:h-10 md:w-px">
              <span className="bg-card px-1 text-[11px] text-muted-foreground">
                Yes
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2 rounded-[8px] border border-border bg-muted px-2.5 py-1.5">
              <CircleStop
                size={16}
                strokeWidth={1.6}
                className="shrink-0 text-muted-foreground"
              />
              <div className="min-w-0 leading-tight">
                <div className="truncate font-medium text-xs">
                  Stop sequence
                </div>
                <div className="text-muted-foreground text-xs tabular-nums">
                  31 replied
                </div>
              </div>
            </div>
          </div>
          <Connector>No</Connector>
          <StepBlock
            step="Step 2"
            title="Follow-up"
            state="sending"
            className="md:w-40"
          >
            <Ticks value={64} max={240} />
            <span>64 / 240</span>
          </StepBlock>
          <Connector pill>Wait 4 days</Connector>
          <StepBlock
            step="Step 3"
            title="Case study"
            state="waiting"
            className="md:w-32"
          >
            Starts day 7
          </StepBlock>
          <Connector pill>Wait 7 days</Connector>
          <StepBlock
            step="Step 4"
            title="Last note"
            state="waiting"
            className="md:w-32"
          >
            Starts day 14
          </StepBlock>
        </div>
      </div>

      <div className="border-border-subtle border-t px-5 py-4">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs tabular-nums">
          <Repeat size={14} strokeWidth={1.6} />
          Rotating across 3 mailboxes, each with its own daily limit
        </div>
        <ul className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-3">
          {mailboxes.map((mailbox) => (
            <li key={mailbox.address} className="min-w-0">
              <div className="flex items-center gap-2">
                <Avatar size="sm">
                  <AvatarFallback className="bg-warmup-surface font-medium text-[10px] text-foreground">
                    {mailbox.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate font-medium">{mailbox.address}</div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-muted-foreground text-xs tabular-nums">
                <Ticks value={mailbox.sent} max={mailbox.limit} />
                <span className="whitespace-nowrap">
                  {mailbox.sent} of {mailbox.limit}
                </span>
              </div>
              <div className="mt-0.5 text-muted-foreground text-xs">
                {mailbox.provider}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function UnifiedInbox() {
  return (
    <Card className="min-w-0 gap-0 py-0 text-[13px] shadow-xs">
      <div className="flex items-center gap-2.5 border-border-subtle border-b px-4 py-3">
        <Inbox size={16} strokeWidth={1.6} className="text-primary" />
        <div className="mr-auto font-semibold text-sm tracking-[-0.005em]">
          Inbox
        </div>
        <span className="rounded-[6px] border border-border bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs tabular-nums">
          All 3 mailboxes
        </span>
      </div>
      <ul>
        {replies.map((reply) => (
          <li
            key={reply.name}
            className="flex gap-3 border-border-subtle border-b px-4 py-3 last:border-b-0"
          >
            <Avatar size="sm" className="mt-0.5">
              <AvatarFallback className="font-medium text-[10px]">
                {reply.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate font-medium">{reply.name}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {reply.company}
                </span>
                <span className="ml-auto shrink-0 text-muted-foreground text-xs tabular-nums">
                  {reply.time}
                </span>
              </div>
              <p className="mt-0.5 truncate text-muted-foreground">
                {reply.snippet}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
                <StatusBadge tone={reply.tone}>{reply.label}</StatusBadge>
                <span className="truncate">to {reply.mailbox}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-muted-foreground text-xs">
                <CircleStop size={14} strokeWidth={1.6} className="shrink-0" />
                <span className="truncate">Stopped {reply.stopped}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export { mailboxes, SequenceFlow, StatusBadge, Ticks, UnifiedInbox };
