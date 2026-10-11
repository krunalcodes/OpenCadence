import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar";
import { buttonVariants } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { cn } from "@workspace/ui/lib/utils";
import {
  ArrowRight,
  Clock,
  CornerDownRight,
  CornerUpLeft,
  Split,
} from "lucide-react";
import Link from "next/link";
import { features } from "@/features/marketing/lib/features";
import { links } from "@/features/marketing/lib/links";
import { PageHero, Section, SectionHeading } from "./section";
import {
  mailboxes,
  SequenceFlow,
  StatusBadge,
  Ticks,
  UnifiedInbox,
} from "./sequences";

const bleed = "-mx-6 -mb-16 border-border border-t md:-mx-10 md:-mb-24";

const focusRing =
  "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const controls: { term: string; body: string }[] = [
  {
    term: "Delays",
    body: "Set the wait between steps in days or hours. The next step is scheduled when the wait ends.",
  },
  {
    term: "Conditions",
    body: "Check what a contact did with the last email, such as opened, clicked, or neither, before choosing what happens next.",
  },
  {
    term: "Branches",
    body: "Send each group down its own path, with different emails and different waits.",
  },
  {
    term: "Stop on reply",
    body: "A reply cancels that contact's remaining steps and moves the conversation to the inbox.",
  },
];

const branches: {
  answer: string;
  title: string;
  subject: string;
  count: string;
}[] = [
  {
    answer: "Yes",
    title: "Follow-up A",
    subject: "The case study I mentioned",
    count: "112 contacts",
  },
  {
    answer: "No",
    title: "Follow-up B",
    subject: "Trying a different subject line",
    count: "128 contacts",
  },
];

const days: { day: string; open: boolean }[] = [
  { day: "Mon", open: true },
  { day: "Tue", open: true },
  { day: "Wed", open: true },
  { day: "Thu", open: true },
  { day: "Fri", open: true },
  { day: "Sat", open: false },
  { day: "Sun", open: false },
];

const queue: {
  time: string;
  contact: string;
  initials: string;
  sending?: boolean;
}[] = [
  { time: "10:42", contact: "Dana Whitfield", initials: "MA", sending: true },
  { time: "10:47", contact: "Tom Okafor", initials: "SA" },
  { time: "10:53", contact: "Priya Raman", initials: "LE" },
  { time: "10:58", contact: "Jonas Berg", initials: "MA" },
  { time: "11:04", contact: "Aiko Mori", initials: "SA" },
];

type Segment = { kind: "text" | "spin" | "tag"; value: string };

const subjectSource: Segment[] = [
  { kind: "spin", value: "{Quick question|A thought}" },
  { kind: "text", value: " about " },
  { kind: "tag", value: "{{company}}" },
];

const bodySource: Segment[] = [
  { kind: "spin", value: "{Hi|Hello}" },
  { kind: "text", value: " " },
  { kind: "tag", value: "{{first_name}}" },
  { kind: "text", value: ", " },
  { kind: "spin", value: "{I saw|I noticed}" },
  { kind: "text", value: " that " },
  { kind: "tag", value: "{{company}}" },
  { kind: "text", value: " is growing its sales team. " },
  { kind: "spin", value: "{Worth a short call|Open to a quick chat}" },
  { kind: "text", value: " this week?" },
];

const variants: {
  to: string;
  subject: string;
  body: string;
}[] = [
  {
    to: "dana@brightline.example",
    subject: "Quick question about Brightline Agency",
    body: "Hi Dana, I saw that Brightline Agency is growing its sales team. Worth a short call this week?",
  },
  {
    to: "tom@fieldnote.example",
    subject: "A thought about Fieldnote",
    body: "Hello Tom, I noticed that Fieldnote is growing its sales team. Open to a quick chat this week?",
  },
];

const replyLabels: {
  label: string;
  tone: "success" | "warning" | "neutral";
  body: string;
}[] = [
  {
    label: "Interested",
    tone: "success",
    body: "They want to talk. Answer from the inbox and the reply goes out from the mailbox they wrote to.",
  },
  {
    label: "Out of office",
    tone: "warning",
    body: "An automatic reply. Keep it out of the way until the contact is back.",
  },
  {
    label: "Not now",
    tone: "neutral",
    body: "A real answer that needs a later follow-up, kept apart from the ones that need you today.",
  },
];

const suppressed: {
  email: string;
  reason: string;
  source: string;
}[] = [
  {
    email: "priya@lumen.example",
    reason: "Unsubscribed",
    source: "Newsletter",
  },
  {
    email: "marc@harborline.example",
    reason: "Unsubscribed",
    source: "Sequence",
  },
  {
    email: "info@oldmill.example",
    reason: "Bounced",
    source: "Sequence",
  },
];

const related = features.filter(
  (feature) =>
    feature.slug === "deliverability" || feature.slug === "integrations",
);

function Source({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment) => (
        <span
          key={segment.value}
          className={cn(
            segment.kind === "spin" && "text-primary",
            segment.kind === "tag" &&
              "rounded-[4px] bg-accent px-1 py-0.5 text-foreground",
          )}
        >
          {segment.value}
        </span>
      ))}
    </>
  );
}

function BranchEditor() {
  return (
    <Card className="min-w-0 gap-0 py-0 text-[13px] shadow-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-border-subtle border-b px-4 py-3">
        <span className="font-semibold text-sm tracking-[-0.005em]">
          After step 1
        </span>
        <span className="font-mono text-muted-foreground text-xs">
          Agency founders
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-border-subtle border-b px-4 py-3">
        <Clock
          size={16}
          strokeWidth={1.6}
          className="shrink-0 text-muted-foreground"
        />
        <span className="text-muted-foreground">Wait</span>
        <span className="rounded-[6px] border border-border px-2 py-0.5 font-medium tabular-nums">
          3 days
        </span>
        <span className="text-muted-foreground">then check</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-border-subtle border-b px-4 py-3">
        <Split
          size={16}
          strokeWidth={1.6}
          className="shrink-0 text-muted-foreground"
        />
        <span className="text-muted-foreground">If contact</span>
        <span className="rounded-[6px] border border-border px-2 py-0.5 font-medium">
          opened step 1
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] divide-y divide-border-subtle sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {branches.map((branch) => (
          <div key={branch.answer} className="min-w-0 px-4 py-4">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <CornerDownRight size={14} strokeWidth={1.6} />
              {branch.answer}
            </div>
            <div className="mt-2 font-medium">{branch.title}</div>
            <div className="mt-0.5 truncate text-muted-foreground">
              {branch.subject}
            </div>
            <div className="mt-3 font-mono text-muted-foreground text-xs tabular-nums">
              {branch.count}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-border-subtle border-t px-4 py-3">
        <CornerUpLeft
          size={16}
          strokeWidth={1.6}
          className="shrink-0 text-muted-foreground"
        />
        <span className="mr-auto">Stop this contact when they reply</span>
        <StatusBadge tone="success">On</StatusBadge>
      </div>
    </Card>
  );
}

function DailyLimits() {
  return (
    <ul className="grid gap-4 text-[13px]">
      {mailboxes.map((mailbox) => (
        <li key={mailbox.address} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate font-medium">{mailbox.address}</span>
            <span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
              {mailbox.sent} / {mailbox.limit}
            </span>
          </div>
          <div className="mt-2 flex">
            <Ticks value={mailbox.sent} max={mailbox.limit} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SendingWindow() {
  return (
    <div className="text-[13px]">
      <ul className="grid gap-1.5">
        {days.map((item) => (
          <li key={item.day} className="flex items-center gap-3">
            <span className="w-8 shrink-0 font-mono text-muted-foreground text-xs">
              {item.day}
            </span>
            <span
              className={cn(
                "relative block h-3 min-w-0 flex-1",
                item.open ? "bg-border-subtle" : "mk-hatch bg-muted",
              )}
            >
              {item.open ? (
                <span
                  className="absolute inset-y-0 bg-primary"
                  style={{ left: "37.5%", width: "33.34%" }}
                />
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-between pl-11 font-mono text-[11px] text-muted-foreground tabular-nums">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  );
}

function RotationQueue() {
  return (
    <ul className="divide-y divide-border-subtle text-[13px]">
      {queue.map((item) => (
        <li
          key={item.time}
          className="flex items-center gap-3 py-1.5 first:pt-0 last:pb-0"
        >
          <span className="w-10 shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
            {item.time}
          </span>
          <span className="min-w-0 flex-1 truncate">{item.contact}</span>
          {item.sending ? <StatusBadge tone="live">Sending</StatusBadge> : null}
          <Avatar size="sm">
            <AvatarFallback className="bg-warmup-surface font-medium text-[10px] text-foreground">
              {item.initials}
            </AvatarFallback>
          </Avatar>
        </li>
      ))}
    </ul>
  );
}

const limitCells = [
  {
    title: "A daily limit for every mailbox",
    body: "Give each mailbox its own cap. When one reaches it, that mailbox stops for the day and its remaining sends move to tomorrow.",
    visual: <DailyLimits />,
  },
  {
    title: "Sending windows",
    body: "Pick the days and hours a sequence may send. A step that comes due outside the window waits until it opens again.",
    visual: <SendingWindow />,
  },
  {
    title: "Mailbox rotation",
    body: "Add several mailboxes to a sequence and each send goes out from the next one in turn, so a single address never carries the whole list.",
    visual: <RotationQueue />,
  },
];

function SequencesPage() {
  return (
    <>
      <PageHero
        label="Sequences and inbox"
        title="Follow up on every lead and always know who replied."
        lead="Build outreach with delays, conditions, and branches. OpenCadence sends each step from your own mailboxes, stops when a contact writes back, and puts every reply in one inbox."
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href={links.signUp}
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-11 gap-2 px-5 hover:bg-brand-hover",
            )}
          >
            Start for free
            <ArrowRight aria-hidden="true" size={16} strokeWidth={1.75} />
          </Link>
          <Link
            href={links.demo}
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-11 px-5",
            )}
          >
            Book a demo
          </Link>
        </div>
      </PageHero>

      <Section id="flow">
        <SectionHeading
          title="The whole sequence on one screen."
          lead="Every step shows where it stands: sent, sending now, or waiting on a delay. Underneath, you can see which mailboxes are carrying today's sends."
        />
        <figure className="mt-10 min-w-0 md:mt-14">
          <figcaption className="sr-only">
            Sample sequence called Agency founders. Step 1, the intro email, is
            sent. After a 3 day wait, contacts who replied leave the sequence
            and the rest receive step 2, the follow-up, which is sending now at
            64 of 240. Steps 3 and 4 are waiting. Sends rotate across three
            mailboxes, each with a daily limit.
          </figcaption>
          <div aria-hidden="true">
            <SequenceFlow />
          </div>
          <p className="mt-3 font-mono text-muted-foreground text-xs">
            Figures in these screens are sample data.
          </p>
        </figure>
      </Section>

      <Section id="branching">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="min-w-0">
            <SectionHeading
              title="Decide what happens after each email."
              lead="Each contact moves through the sequence on their own clock, and what they do with one email decides which one they get next."
            />
            <dl className="mt-8 divide-y divide-border border-border border-y">
              {controls.map((item) => (
                <div
                  key={item.term}
                  className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[8.5rem_minmax(0,1fr)]"
                >
                  <dt className="font-medium text-sm">{item.term}</dt>
                  <dd className="text-pretty text-muted-foreground text-sm leading-relaxed">
                    {item.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div
            aria-hidden="true"
            className="mk-hatch min-w-0 self-start border border-border p-4 sm:p-8"
          >
            <BranchEditor />
          </div>
        </div>
      </Section>

      <Section id="limits">
        <SectionHeading
          title="Send at a pace your mailboxes can keep up."
          lead="Mailbox providers watch how much a single address sends and when. Set the pace once and every sequence stays inside it."
        />
        <div
          className={cn(
            bleed,
            "mt-12 grid grid-cols-[minmax(0,1fr)] divide-y divide-border lg:grid-cols-3 lg:divide-x lg:divide-y-0",
          )}
        >
          {limitCells.map((cell) => (
            <div key={cell.title} className="min-w-0 p-6 md:p-10 lg:p-8">
              <div
                aria-hidden="true"
                className="flex min-h-[11.5rem] flex-col justify-center"
              >
                {cell.visual}
              </div>
              <h3 className="mt-6 font-medium text-base">{cell.title}</h3>
              <p className="mt-1.5 text-pretty text-muted-foreground text-sm leading-relaxed">
                {cell.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="writing">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div
            aria-hidden="true"
            className="order-2 min-w-0 border border-border text-[13px] lg:order-1"
          >
            <div className="border-border border-b px-4 py-2 font-mono text-muted-foreground text-xs">
              Step 1, as written
            </div>
            <div className="grid gap-3 px-4 py-4 font-mono text-[13px] leading-relaxed">
              <p className="break-words">
                <span className="text-muted-foreground">Subject: </span>
                <Source segments={subjectSource} />
              </p>
              <p className="break-words">
                <Source segments={bodySource} />
              </p>
            </div>
            <div className="border-border border-t px-4 py-2 font-mono text-muted-foreground text-xs">
              As two contacts receive it
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)] divide-y divide-border border-border border-t sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              {variants.map((variant) => (
                <div key={variant.to} className="min-w-0 bg-card px-4 py-4">
                  <div className="truncate font-mono text-muted-foreground text-xs">
                    To {variant.to}
                  </div>
                  <div className="mt-3 font-medium">{variant.subject}</div>
                  <p className="mt-1.5 text-pretty text-muted-foreground leading-relaxed">
                    {variant.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="order-1 min-w-0 lg:order-2">
            <SectionHeading
              title="Write one email that reads differently every time."
              lead="Spintax changes the wording from one send to the next, and merge tags fill in what you know about each contact."
            />
            <dl className="mt-8 grid gap-5 text-sm">
              <div>
                <dt className="font-mono text-primary text-xs">
                  {"{Hi|Hello|Hey}"}
                </dt>
                <dd className="mt-1.5 text-pretty text-muted-foreground leading-relaxed">
                  Spintax. Write the options between braces and each email picks
                  one, so a hundred sends are not a hundred identical messages.
                </dd>
              </div>
              <div>
                <dt className="font-mono text-primary text-xs">
                  {"{{first_name}}"}
                </dt>
                <dd className="mt-1.5 text-pretty text-muted-foreground leading-relaxed">
                  Merge tags. Pull in any field from the contact record, in the
                  subject line as well as the body.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </Section>

      <Section id="inbox">
        <SectionHeading
          title="Every reply in one inbox."
          lead="Replies from all your connected mailboxes arrive in a single list. Each one shows the mailbox it came to and the sequence it stopped."
        />
        <div
          className={cn(
            bleed,
            "mt-12 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]",
          )}
        >
          <div
            aria-hidden="true"
            className="mk-hatch min-w-0 p-4 sm:p-8 md:p-10"
          >
            <UnifiedInbox />
          </div>
          <div className="min-w-0 border-border border-t lg:border-t-0 lg:border-l">
            <h3 className="px-6 pt-6 font-mono text-muted-foreground text-xs md:px-10 lg:px-8 lg:pt-8">
              Reply labels
            </h3>
            <ul className="mt-4 divide-y divide-border border-border border-t">
              {replyLabels.map((item) => (
                <li key={item.label} className="px-6 py-5 md:px-10 lg:px-8">
                  <StatusBadge tone={item.tone}>{item.label}</StatusBadge>
                  <p className="mt-2.5 text-pretty text-muted-foreground text-sm leading-relaxed">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <section className="px-0 sm:px-4">
        <div className="mk-rails">
          <div className="mk-row grid grid-cols-[minmax(0,1fr)] gap-x-16 gap-y-8 px-6 py-12 md:px-10 md:py-14 lg:grid-cols-2 lg:items-center">
            <div className="min-w-0">
              <h2 className="text-balance font-semibold text-2xl tracking-[-0.02em]">
                An unsubscribe counts everywhere.
              </h2>
              <p className="mt-3 max-w-lg text-pretty text-muted-foreground leading-relaxed">
                Sequences and newsletters share one suppression list. A contact
                who unsubscribes from either, or whose address bounces, is
                skipped by both from then on.
              </p>
            </div>
            <ul
              aria-hidden="true"
              className="min-w-0 divide-y divide-border-subtle border border-border bg-card text-[13px]"
            >
              {suppressed.map((row) => (
                <li
                  key={row.email}
                  className="grid grid-cols-[minmax(0,1fr)_auto_4.5rem] items-center gap-x-3 px-4 py-2.5"
                >
                  <span className="min-w-0 truncate font-mono text-xs">
                    {row.email}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {row.reason}
                  </span>
                  <span className="text-right text-muted-foreground text-xs">
                    {row.source}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="px-0 sm:px-4">
        <div className="mk-rails">
          <div className="mk-row grid grid-cols-[minmax(0,1fr)] divide-y divide-border md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] md:divide-x md:divide-y-0">
            <h2 className="flex items-center px-6 py-5 font-mono text-muted-foreground text-xs md:px-10">
              Works with
            </h2>
            {related.map((feature) => (
              <Link
                key={feature.slug}
                href={feature.href}
                className={cn(
                  "group flex min-w-0 items-center gap-4 px-6 py-5 transition-colors hover:bg-accent md:px-8",
                  focusRing,
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{feature.title}</span>
                  <span className="mt-0.5 block text-pretty text-muted-foreground text-sm">
                    {feature.description}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  size={16}
                  strokeWidth={1.75}
                  className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export { SequencesPage };
