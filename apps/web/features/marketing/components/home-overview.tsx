import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar";
import { Badge } from "@workspace/ui/components/badge";
import { cn } from "@workspace/ui/lib/utils";
import {
  ArrowRight,
  ArrowUpRight,
  Cloud,
  FileSpreadsheet,
  Inbox,
  LayoutGrid,
  type LucideIcon,
  Mail,
  Send,
  Server,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { type Feature, features } from "@/features/marketing/lib/features";
import { links } from "@/features/marketing/lib/links";
import { SectionHeading } from "./section";

type Tone = "live" | "success" | "warning" | "neutral";

const toneClasses: Record<Tone, string> = {
  live: "bg-live text-live-foreground",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  neutral: "bg-muted text-muted-foreground",
};

const providers: { name: string; icon: LucideIcon }[] = [
  { name: "Gmail", icon: Mail },
  { name: "Outlook", icon: Inbox },
  { name: "IMAP/SMTP", icon: Server },
  { name: "Resend", icon: Send },
  { name: "Amazon SES", icon: Cloud },
  { name: "SendGrid", icon: LayoutGrid },
];

const healthDays = [
  { id: "d01", state: "ok" },
  { id: "d02", state: "ok" },
  { id: "d03", state: "ok" },
  { id: "d04", state: "ok" },
  { id: "d05", state: "ok" },
  { id: "d06", state: "warn" },
  { id: "d07", state: "ok" },
  { id: "d08", state: "ok" },
  { id: "d09", state: "ok" },
  { id: "d10", state: "ok" },
  { id: "d11", state: "ok" },
  { id: "d12", state: "ok" },
  { id: "d13", state: "ok" },
  { id: "d14", state: "ok" },
] as const;

const sources = [
  { name: "Gmail", detail: "maya@northwind.studio", sent: 38, limit: 80 },
  { name: "Amazon SES", detail: "eu-west-1", sent: 4120, limit: 10000 },
  { name: "Resend", detail: "Transactional", sent: 610, limit: 2000 },
];

const members = [
  { initials: "MA", name: "Maya Alvarez", role: "Owner" },
  { initials: "SK", name: "Sam Keller", role: "Editor" },
  { initials: "LN", name: "Lena Novak", role: "Viewer" },
];

const differences = [
  {
    title: "You send through your own accounts",
    body: "Connect the mailboxes and providers you already use. The sender reputation you build stays with your domain, and delivery is billed by your provider at its rate.",
  },
  {
    title: "One contact list, one suppression list",
    body: "Newsletters and outreach read from the same contacts. Someone who unsubscribes from either is skipped by both.",
  },
  {
    title: "Pricing is not per contact",
    body: "Plans are not priced by the size of your list, so importing more contacts does not raise your bill.",
  },
];

function Frame({
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section className="overflow-x-clip px-0 sm:px-4" {...props}>
      <div className="mk-rails">
        <div className={cn("mk-row", className)}>{children}</div>
      </div>
    </section>
  );
}

function StatusBadge({
  tone,
  pulse = false,
  children,
}: {
  tone: Tone;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Badge
      className={cn(
        "h-[22px] gap-1.5 rounded-[6px] px-2 font-medium text-xs",
        toneClasses[tone],
      )}
    >
      <span className="relative flex size-1.5">
        {pulse ? (
          <span className="absolute inline-flex size-full rounded-full bg-current opacity-60 motion-safe:animate-ping" />
        ) : null}
        <span className="relative inline-flex size-1.5 rounded-full bg-current" />
      </span>
      {children}
    </Badge>
  );
}

function Ticks({ sent, limit }: { sent: number; limit: number }) {
  const percent = Math.round((sent / limit) * 100);
  return (
    <span
      className="block h-3 min-w-10 flex-1 [mask:repeating-linear-gradient(90deg,black_0_3px,transparent_3px_6px)]"
      style={{
        background: `linear-gradient(90deg, var(--primary) ${percent}%, var(--border) ${percent}%)`,
      }}
    />
  );
}

function Fragment({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "w-full min-w-0 rounded-[10px] border border-border bg-card p-3 text-[13px] shadow-xs",
        className,
      )}
    >
      {children}
    </div>
  );
}

function ArrowLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1.5 rounded-sm font-medium text-primary text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
      <ArrowRight
        aria-hidden="true"
        className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
  );
}

function RuleChip({
  mono = false,
  children,
}: {
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-[6px] border border-border bg-background px-2 text-xs",
        mono && "font-mono",
      )}
    >
      {children}
    </span>
  );
}

function NewslettersFragment() {
  return (
    <Fragment className="max-w-md">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">Active customers</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          1,248 contacts match
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-10 text-muted-foreground text-xs">Where</span>
          <RuleChip>Tag</RuleChip>
          <RuleChip>is</RuleChip>
          <RuleChip mono>customer</RuleChip>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-10 text-muted-foreground text-xs">And</span>
          <RuleChip>Last opened</RuleChip>
          <RuleChip>within</RuleChip>
          <RuleChip mono>30 days</RuleChip>
        </div>
      </div>
    </Fragment>
  );
}

function SequencesFragment() {
  return (
    <Fragment className="max-w-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs tabular-nums">
          Step 2 of 4
        </span>
        <StatusBadge tone="live" pulse>
          Sending
        </StatusBadge>
      </div>
      <p className="mt-2 truncate font-medium">Follow-up after no reply</p>
      <div className="mt-3 flex items-center gap-2.5">
        <Ticks sent={38} limit={80} />
        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
          38 / 80 today
        </span>
      </div>
    </Fragment>
  );
}

function TransactionalFragment() {
  return (
    <Fragment className="max-w-xs p-0">
      <div className="flex items-center justify-between gap-2 border-border border-b px-3 py-2">
        <span className="font-mono text-muted-foreground text-xs">
          POST /v1/transactional/send
        </span>
        <StatusBadge tone="success">202</StatusBadge>
      </div>
      <pre className="overflow-x-auto px-3 py-3 font-mono text-xs leading-relaxed">
        <code>
          {"{ "}
          <span className="text-primary">"template"</span>
          {': "receipt", '}
          <span className="text-primary">"to"</span>
          {': "dana@brightline.co" }'}
        </code>
      </pre>
    </Fragment>
  );
}

function DeliverabilityFragment() {
  return (
    <Fragment className="max-w-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-mono text-xs">
          northwind.studio
        </span>
        <StatusBadge tone="success">DNS verified</StatusBadge>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="flex h-[18px] shrink-0 items-end gap-0.5">
          {healthDays.map((day) => (
            <span
              key={day.id}
              className={cn(
                "h-full w-1 rounded-[1.5px]",
                day.state === "ok" ? "bg-success" : "bg-warning",
              )}
            />
          ))}
        </span>
        <span className="text-muted-foreground text-xs">Last 14 days</span>
      </div>
    </Fragment>
  );
}

function IntegrationsFragment() {
  return (
    <Fragment className="max-w-md p-0">
      {sources.map((source) => (
        <div
          key={source.name}
          className="flex items-center gap-3 border-border-subtle border-b px-3 py-2.5 last:border-b-0"
        >
          <div className="w-24 min-w-0 shrink-0 sm:w-36">
            <p className="truncate font-medium">{source.name}</p>
            <p className="truncate text-muted-foreground text-xs">
              {source.detail}
            </p>
          </div>
          <Ticks sent={source.sent} limit={source.limit} />
          <span className="w-24 shrink-0 text-right text-muted-foreground text-xs tabular-nums">
            {source.sent.toLocaleString("en-US")} /{" "}
            {source.limit.toLocaleString("en-US")}
          </span>
        </div>
      ))}
    </Fragment>
  );
}

function PlatformFragment() {
  return (
    <Fragment className="max-w-xs p-0">
      {members.map((member) => (
        <div
          key={member.name}
          className="flex items-center gap-2.5 border-border-subtle border-b px-3 py-2 last:border-b-0"
        >
          <Avatar className="size-6">
            <AvatarFallback className="text-[10px]">
              {member.initials}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate">{member.name}</span>
          <StatusBadge tone={member.role === "Owner" ? "success" : "neutral"}>
            {member.role}
          </StatusBadge>
        </div>
      ))}
    </Fragment>
  );
}

const tour: Record<
  Feature["slug"],
  {
    copy: string;
    linkLabel: string;
    span: string;
    hatch: boolean;
    visual: React.ReactNode;
  }
> = {
  newsletters: {
    copy: "Write a campaign, choose the segment that receives it, and schedule the send or test two subject lines first.",
    linkLabel: "Explore newsletters",
    span: "md:col-span-2 lg:col-span-6",
    hatch: true,
    visual: <NewslettersFragment />,
  },
  sequences: {
    copy: "Set up follow-ups that go out on your schedule and end the moment a contact writes back.",
    linkLabel: "Explore sequences",
    span: "lg:col-span-3",
    hatch: false,
    visual: <SequencesFragment />,
  },
  transactional: {
    copy: "Send receipts and password resets from your app with one request and a stored template.",
    linkLabel: "Explore the transactional API",
    span: "lg:col-span-3",
    hatch: false,
    visual: <TransactionalFragment />,
  },
  deliverability: {
    copy: "Warm up new mailboxes and check DNS and sending health for every sender in one view.",
    linkLabel: "Explore deliverability",
    span: "lg:col-span-3",
    hatch: false,
    visual: <DeliverabilityFragment />,
  },
  integrations: {
    copy: "Connect a mailbox for outreach and a provider for volume, then watch each one against its daily limit.",
    linkLabel: "Explore integrations",
    span: "lg:col-span-6",
    hatch: true,
    visual: <IntegrationsFragment />,
  },
  platform: {
    copy: "Give each client or team its own workspace, with roles, single sign-on, and an audit log.",
    linkLabel: "Explore teams and security",
    span: "md:col-span-2 lg:col-span-3",
    hatch: false,
    visual: <PlatformFragment />,
  },
};

function ProviderStrip() {
  return (
    <Frame aria-label="Sending providers">
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-7">
        <p className="col-span-2 flex items-center gap-2 bg-background px-6 py-4 font-mono text-primary text-xs sm:col-span-3 lg:col-span-1 lg:px-5">
          <span
            aria-hidden="true"
            className="size-[7px] shrink-0 border border-primary bg-live"
          />
          Sends through
        </p>
        <ul className="col-span-2 grid grid-cols-subgrid gap-px sm:col-span-3 lg:col-span-6">
          {providers.map((provider) => (
            <li
              key={provider.name}
              className="flex min-w-0 items-center gap-2.5 bg-background px-6 py-4 font-medium text-sm lg:px-5"
            >
              <provider.icon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="truncate">{provider.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </Frame>
  );
}

function ProductTour() {
  return (
    <Frame>
      <div className="px-6 py-14 md:px-10 md:py-20">
        <SectionHeading
          title="One app for every email you send"
          lead="Campaigns to your list, follow-ups to prospects, and receipts from your product all leave from one place, with one view of who received what."
        />
      </div>
      <div className="grid gap-px border-border border-t bg-border md:grid-cols-2 lg:grid-cols-12">
        {features.map((feature) => {
          const cell = tour[feature.slug];
          return (
            <article
              key={feature.slug}
              className={cn("flex min-w-0 flex-col bg-background", cell.span)}
            >
              <div
                aria-hidden="true"
                className={cn(
                  "flex min-h-48 items-center justify-center border-border border-b p-6 md:p-8",
                  cell.hatch && "mk-hatch",
                )}
              >
                {cell.visual}
              </div>
              <div className="flex flex-1 flex-col p-6 md:p-8">
                <h3 className="font-semibold text-lg tracking-[-0.015em]">
                  {feature.title}
                </h3>
                <p className="mt-2 max-w-md text-pretty text-muted-foreground">
                  {cell.copy}
                </p>
                <div className="mt-auto pt-6">
                  <ArrowLink href={feature.href}>{cell.linkLabel}</ArrowLink>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </Frame>
  );
}

function ContactRecord() {
  return (
    <div aria-hidden="true" className="w-full max-w-md">
      <p className="mb-3 font-mono text-muted-foreground text-xs">
        contacts / dana-whitfield
      </p>
      <Fragment className="p-0">
        <div className="flex items-center gap-3 border-border border-b p-4">
          <Avatar className="size-9">
            <AvatarFallback className="text-xs">DW</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-sm">Dana Whitfield</p>
            <p className="truncate text-muted-foreground text-xs">
              dana@brightline.co
            </p>
          </div>
          <StatusBadge tone="success">Subscribed</StatusBadge>
        </div>
        <div className="flex items-center gap-3 border-border-subtle border-b px-4 py-3">
          <Mail className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs">Newsletter</p>
            <p className="truncate font-medium">Product updates</p>
          </div>
          <span className="shrink-0 text-muted-foreground text-xs">
            Opened 2 days ago
          </span>
        </div>
        <div className="flex items-center gap-3 border-border border-b px-4 py-3">
          <Send className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs">Sequence</p>
            <p className="truncate font-medium">Agency founders</p>
          </div>
          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
            Step 2 of 4
          </span>
        </div>
        <div className="flex items-start gap-3 bg-muted/50 px-4 py-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-pretty text-muted-foreground text-xs leading-relaxed">
            <span className="font-medium text-foreground">
              Shared unsubscribe.
            </span>{" "}
            If Dana opts out of either one, the newsletter and the sequence both
            stop.
          </p>
        </div>
      </Fragment>
    </div>
  );
}

function Difference() {
  return (
    <Frame className="grid lg:grid-cols-[1.1fr_1fr]">
      <div className="min-w-0 px-6 py-14 md:px-10 md:py-20 lg:border-border lg:border-r">
        <SectionHeading title="Your providers, your reputation, and one bill that does not grow with your list" />
        <dl className="mt-10 border-border border-t">
          {differences.map((item) => (
            <div
              key={item.title}
              className="grid gap-1.5 border-border border-b py-5 sm:grid-cols-[14rem_1fr] sm:gap-6"
            >
              <dt className="font-medium">{item.title}</dt>
              <dd className="text-pretty text-muted-foreground">{item.body}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6">
          <ArrowLink href={links.pricing}>See pricing</ArrowLink>
        </div>
      </div>
      <div className="mk-hatch flex min-w-0 items-center justify-center border-border border-t px-6 py-12 md:px-10 lg:border-t-0">
        <ContactRecord />
      </div>
    </Frame>
  );
}

function ConnectFragment() {
  return (
    <Fragment className="flex items-center gap-2.5">
      <Mail className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">maya@northwind.studio</span>
      <StatusBadge tone="success">Connected</StatusBadge>
    </Fragment>
  );
}

function ImportFragment() {
  return (
    <Fragment className="flex items-center gap-2.5">
      <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-mono text-xs">
        contacts.csv
      </span>
      <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
        1,248 imported
      </span>
    </Fragment>
  );
}

function SendFragment() {
  return (
    <Fragment className="flex items-center gap-2.5">
      <span className="min-w-0 flex-1 truncate">October product update</span>
      <StatusBadge tone="live">Sending</StatusBadge>
    </Fragment>
  );
}

const steps = [
  {
    number: "01",
    title: "Connect a mailbox or provider",
    body: "Sign in to Gmail or Outlook, enter IMAP/SMTP details, or paste a key from Resend, Amazon SES, or SendGrid.",
    visual: <ConnectFragment />,
  },
  {
    number: "02",
    title: "Import or add contacts",
    body: "Upload a CSV and map its columns, or add people one at a time.",
    visual: <ImportFragment />,
  },
  {
    number: "03",
    title: "Send your first campaign or sequence",
    body: "Write the email, choose who receives it, and send now or pick a time.",
    visual: <SendFragment />,
  },
];

function Start() {
  return (
    <Frame>
      <div className="flex flex-col gap-6 px-6 py-14 md:flex-row md:items-end md:justify-between md:px-10 md:py-20">
        <SectionHeading
          title="Three steps to your first send"
          lead="Setup happens in the browser, from sign-up to a sent email."
        />
        <div className="shrink-0 md:pb-1.5">
          <ArrowLink href={links.signUp}>Start for free</ArrowLink>
        </div>
      </div>
      <ol className="grid gap-px border-border border-t bg-border md:grid-cols-3">
        {steps.map((step) => (
          <li
            key={step.number}
            className="flex min-w-0 flex-col bg-background p-6 md:p-8"
          >
            <span className="font-mono text-primary text-xs tabular-nums">
              {step.number}
            </span>
            <h3 className="mt-4 font-semibold text-lg tracking-[-0.015em]">
              {step.title}
            </h3>
            <p className="mt-2 text-pretty text-muted-foreground">
              {step.body}
            </p>
            <div aria-hidden="true" className="mt-auto pt-6">
              {step.visual}
            </div>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

function SelfHostNote() {
  return (
    <Frame className="px-6 py-5 md:px-10">
      <p className="text-muted-foreground text-sm">
        OpenCadence is open source. Prefer to run it yourself?{" "}
        <a
          href={links.selfHost}
          className="inline-flex items-center gap-1 rounded-sm font-medium text-foreground underline underline-offset-4 outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Self-hosting guide
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </a>
      </p>
    </Frame>
  );
}

function HomeOverview({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <ProviderStrip />
      <ProductTour />
      {children}
      <Difference />
      <Start />
      <SelfHostNote />
    </>
  );
}

export { HomeOverview };
