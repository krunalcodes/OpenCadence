import { Badge } from "@workspace/ui/components/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { cn } from "@workspace/ui/lib/utils";
import {
  CalendarClock,
  Check,
  ChevronsUpDown,
  Filter,
  Gauge,
  GripVertical,
  Paperclip,
  PenLine,
  Plus,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import type * as React from "react";
import {
  Section,
  SectionHeading,
} from "@/features/marketing/components/section";

const ICON = { size: 16, strokeWidth: 1.7, "aria-hidden": true } as const;

const TICK_MASK =
  "repeating-linear-gradient(90deg, black 0 3px, transparent 3px 6px)";

const tabTriggerClass =
  "h-full flex-none gap-2 px-3.5 text-sm data-active:bg-card data-active:text-foreground sm:px-4";

const blocks = [
  "Header",
  "Hero image",
  "Text",
  "Button",
  "Changelog",
  "Footer",
];

const suggestions = [
  { text: "Scheduling is here, and the editor got faster", chosen: true },
  { text: "{{first_name}}, here is what shipped in October", chosen: false },
  { text: "October at Northwind: two things worth opening", chosen: false },
];

const conditions = [
  { field: "Plan", note: "Custom field", operator: "is", values: ["Pro"] },
  {
    field: "Last opened",
    note: "Activity",
    operator: "within the last",
    values: ["30 days"],
  },
  {
    field: "Tags",
    note: "Tag",
    operator: "includes any of",
    values: ["customer", "webinar-2026"],
  },
  {
    field: "Country",
    note: "Contact field",
    operator: "is any of",
    values: ["Germany", "Netherlands"],
  },
];

const matches = [
  {
    name: "Ines Albrecht",
    email: "ines@kettlewerk.de",
    plan: "Pro",
    opened: "2 days ago",
  },
  {
    name: "Joris de Vries",
    email: "joris@halfmoon.nl",
    plan: "Pro",
    opened: "6 days ago",
  },
  {
    name: "Lena Brandt",
    email: "lena@brandt-co.de",
    plan: "Pro",
    opened: "19 days ago",
  },
];

const variants = [
  {
    label: "A",
    subject: "Scheduling is here, and the editor got faster",
    sent: 1640,
    opens: "44.1%",
    leading: true,
  },
  {
    label: "B",
    subject: "October update from Northwind Studio",
    sent: 1612,
    opens: "38.7%",
    leading: false,
  },
];

function Ticks({ value, done }: { value: number; done?: boolean }) {
  const fill = done ? "var(--success)" : "var(--primary)";
  return (
    <span
      aria-hidden
      className="block h-3 min-w-12 flex-1"
      style={{
        background: `linear-gradient(90deg, ${fill} ${value}%, var(--border) ${value}%)`,
        maskImage: TICK_MASK,
        WebkitMaskImage: TICK_MASK,
      }}
    />
  );
}

function StatusBadge({
  className,
  live,
  children,
}: {
  className?: string;
  live?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Badge
      className={cn(
        "h-[22px] gap-1.5 rounded-md px-2 font-medium text-xs",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full bg-current",
          live && "motion-safe:animate-pulse",
        )}
      />
      {children}
    </Badge>
  );
}

function Control({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex h-8 min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 shadow-xs",
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        {children}
      </span>
      <ChevronsUpDown {...ICON} className="shrink-0 text-ink-tertiary" />
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-md bg-accent px-1.5 font-medium text-xs">
      {children}
      <X
        aria-hidden
        size={12}
        strokeWidth={1.7}
        className="text-ink-tertiary"
      />
    </span>
  );
}

function FauxButton({
  primary,
  children,
}: {
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 font-medium text-[12.5px] shadow-xs",
        primary
          ? "border-brand-hover bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground",
      )}
    >
      {children}
    </span>
  );
}

function Frame({
  crumb,
  title,
  status,
  actions,
  children,
}: {
  crumb: string;
  title: string;
  status: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[12px] border border-border bg-card text-[13px] leading-normal shadow-xs">
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-border-subtle border-b px-4 py-2.5">
        <p className="min-w-0 truncate text-ink-tertiary">
          {crumb} / <span className="font-medium text-foreground">{title}</span>
        </p>
        {status}
        {actions ? (
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Panel({
  title,
  body,
  points,
  children,
}: {
  title: string;
  body: string;
  points: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_18.5rem] lg:gap-10">
      <div className="lg:order-last lg:pt-2">
        <h3 className="text-balance font-semibold text-xl tracking-[-0.02em]">
          {title}
        </h3>
        <p className="mt-3 text-pretty text-base text-muted-foreground">
          {body}
        </p>
        <ul className="mt-5 space-y-2.5 text-sm">
          {points.map((point) => (
            <li key={point} className="flex gap-2.5">
              <Check {...ICON} className="mt-0.5 shrink-0 text-primary" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
      {children}
    </div>
  );
}

function WritePanel() {
  return (
    <Frame
      crumb="Campaigns"
      title="October product update"
      status={
        <StatusBadge className="bg-border-subtle text-muted-foreground">
          Draft
        </StatusBadge>
      }
      actions={
        <span className="inline-flex rounded-lg border border-border bg-muted p-0.5 font-medium text-[12.5px] text-muted-foreground">
          <span className="rounded-md bg-card px-2.5 py-0.5 text-foreground shadow-xs">
            Builder
          </span>
          <span className="px-2.5 py-0.5">HTML</span>
          <span className="px-2.5 py-0.5">Markdown</span>
        </span>
      }
    >
      <div className="grid md:grid-cols-[11.5rem_minmax(0,1fr)]">
        <div className="hidden border-border-subtle border-r p-3 md:block">
          <p className="px-1 font-medium text-ink-tertiary text-xs">
            Template: Product update
          </p>
          <ul className="mt-2 space-y-1">
            {blocks.map((block) => (
              <li
                key={block}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 font-medium text-muted-foreground",
                  block === "Text" &&
                    "bg-card text-foreground shadow-xs ring-1 ring-border",
                )}
              >
                <GripVertical {...ICON} className="text-ink-tertiary" />
                {block}
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 px-1.5 font-medium text-primary">
            <Plus {...ICON} />
            Add block
          </p>
        </div>
        <div className="min-w-0 space-y-4 p-4">
          <div>
            <p className="font-medium text-muted-foreground text-xs">
              Subject line
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="flex h-8 min-w-0 flex-1 items-center rounded-lg border border-border bg-card px-2.5 shadow-xs">
                <span className="truncate">
                  October update: scheduling and a faster editor
                </span>
              </span>
              <FauxButton>
                <Sparkles {...ICON} className="text-primary" />
                Rewrite
              </FauxButton>
            </div>
            <div className="mt-2 rounded-lg border border-border bg-popover p-1.5 shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-x-3 px-2 py-1 text-ink-tertiary text-xs">
                <span className="font-medium text-muted-foreground">
                  3 rewrites, personalized for this segment
                </span>
                <span>Runs on your model key</span>
              </div>
              <ul>
                {suggestions.map((suggestion) => (
                  <li
                    key={suggestion.text}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5",
                      suggestion.chosen && "bg-muted",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {suggestion.text}
                    </span>
                    {suggestion.chosen ? (
                      <FauxButton primary>Use this</FauxButton>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="rounded-lg border border-border-subtle bg-background p-4">
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              Hi
              <span className="rounded-md bg-info-surface px-1.5 py-0.5 font-mono text-info text-xs">
                {'{{first_name | "there"}}'}
              </span>
            </p>
            <p className="mt-2.5 text-muted-foreground">
              You can now schedule a send in each contact's timezone, and the
              editor opens long drafts in under a second. The full changelog is
              attached.
            </p>
            <p className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 shadow-xs">
              <Paperclip {...ICON} className="shrink-0 text-ink-tertiary" />
              <span className="truncate font-medium">
                october-changelog.pdf
              </span>
              <span className="shrink-0 text-ink-tertiary tabular-nums">
                184 KB
              </span>
            </p>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function AudiencePanel() {
  return (
    <Frame
      crumb="Segments"
      title="Active Pro customers"
      status={
        <StatusBadge className="bg-success-surface text-success">
          Saved
        </StatusBadge>
      }
      actions={
        <span className="text-muted-foreground tabular-nums">
          <span className="font-semibold text-foreground">3,482</span> of 48,210
          contacts match
        </span>
      }
    >
      <div className="space-y-2 p-4">
        <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
          Contacts in
          <Chip>Newsletter</Chip>
          <Chip>Product updates</Chip>
          that match all of
        </p>
        {conditions.map((condition) => (
          <div
            key={condition.field}
            className="grid grid-cols-2 gap-2 border-border-subtle border-t pt-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] sm:border-0 sm:pt-0"
          >
            <Control>
              <span className="truncate font-medium">{condition.field}</span>
              <span className="hidden truncate text-ink-tertiary text-xs lg:inline">
                {condition.note}
              </span>
            </Control>
            <Control>{condition.operator}</Control>
            <Control className="col-span-2 sm:col-span-1">
              {condition.values.map((value) =>
                condition.values.length > 1 ? (
                  <Chip key={value}>{value}</Chip>
                ) : (
                  <span key={value} className="truncate tabular-nums">
                    {value}
                  </span>
                ),
              )}
            </Control>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          <span className="flex items-center gap-1.5 font-medium text-primary">
            <Plus {...ICON} />
            Add condition
          </span>
          <code className="min-w-0 truncate rounded-md bg-muted px-2 py-1 font-mono text-muted-foreground text-xs">
            plan = "pro" AND last_opened_at &gt; now() - 30d
          </code>
        </div>
      </div>
      <table className="w-full border-border-subtle border-t text-left">
        <thead>
          <tr className="bg-muted/60 text-ink-tertiary text-xs">
            <th className="px-4 py-2 font-medium">Contact</th>
            <th className="hidden px-4 py-2 font-medium sm:table-cell">Plan</th>
            <th className="px-4 py-2 text-right font-medium">Last opened</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((match) => (
            <tr key={match.email} className="border-border-subtle border-t">
              <td className="max-w-0 px-4 py-2.5">
                <p className="truncate font-medium">{match.name}</p>
                <p className="truncate text-ink-tertiary text-xs">
                  {match.email}
                </p>
              </td>
              <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                {match.plan}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right text-muted-foreground tabular-nums">
                {match.opened}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Frame>
  );
}

function SendPanel() {
  return (
    <Frame
      crumb="October product update"
      title="Send"
      status={
        <StatusBadge live className="bg-live text-live-foreground">
          Sending test group
        </StatusBadge>
      }
      actions={
        <span className="text-muted-foreground">
          via <span className="font-medium text-foreground">Resend</span>
        </span>
      }
    >
      <div className="grid gap-4 border-border-subtle border-b p-4 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
            <CalendarClock {...ICON} />
            Send the winner
          </p>
          <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-2">
            <Control>
              <span className="truncate tabular-nums">Today, 11:00</span>
            </Control>
            <Control>Europe/Berlin</Control>
          </div>
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
            <Gauge {...ICON} />
            Throttle
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <Control className="flex-1">
              <span className="truncate tabular-nums">2,000 per hour</span>
            </Control>
            <span className="shrink-0 text-ink-tertiary text-xs tabular-nums">
              about 8 h 46 min
            </span>
          </div>
        </div>
      </div>
      <div className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="font-semibold text-sm tracking-[-0.005em]">
            A/B test on subject line
          </p>
          <p className="text-ink-tertiary text-xs tabular-nums">
            20% test group, 2,190 contacts per version, winner by open rate
          </p>
        </div>
        <ul className="mt-3 space-y-3">
          {variants.map((variant) => (
            <li
              key={variant.label}
              className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-border-subtle border-t pt-3"
            >
              <span className="row-span-2 flex size-6 items-center justify-center rounded-md border border-border bg-muted font-semibold text-xs">
                {variant.label}
              </span>
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate font-medium">{variant.subject}</p>
                {variant.leading ? (
                  <StatusBadge className="bg-success-surface text-success">
                    Leading
                  </StatusBadge>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <Ticks value={Math.round((variant.sent / 2190) * 100)} />
                <span className="shrink-0 text-ink-tertiary text-xs tabular-nums">
                  {variant.sent.toLocaleString("en-US")} / 2,190
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums">
                  <span className="font-medium">{variant.opens}</span>{" "}
                  <span className="text-ink-tertiary text-xs">opens</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-3 border-border-subtle border-t pt-3">
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            Remaining contacts, scheduled 11:00
          </span>
          <Ticks value={0} />
          <span className="shrink-0 text-ink-tertiary text-xs tabular-nums">
            0 / 17,520
          </span>
        </div>
      </div>
    </Frame>
  );
}

function NewslettersWorkflow() {
  return (
    <Section id="workflow">
      <SectionHeading
        title="Write the newsletter, choose who gets it, decide when it sends"
        lead="The editor, your contact list, and the send controls sit in one app. Every campaign goes out through the provider you connect."
      />
      <Tabs defaultValue="write" className="mt-10 gap-6 md:mt-12">
        <TabsList
          aria-label="Campaign steps"
          className="border border-border bg-accent p-1 group-data-horizontal/tabs:h-11"
        >
          <TabsTrigger value="write" className={tabTriggerClass}>
            <PenLine {...ICON} />
            Write
          </TabsTrigger>
          <TabsTrigger value="audience" className={tabTriggerClass}>
            <Filter {...ICON} />
            Audience
          </TabsTrigger>
          <TabsTrigger value="send" className={tabTriggerClass}>
            <Send {...ICON} />
            Send
          </TabsTrigger>
        </TabsList>
        <TabsContent value="write">
          <Panel
            title="Build with blocks, or write the HTML yourself"
            body="Assemble an email from blocks and save it as a reusable template. Switch to plain HTML or Markdown when you want full control of the source."
            points={[
              "The AI writing assistant drafts, rewrites, and personalizes emails and subject lines with your own model key.",
              "Merge tags pull in any contact field and fall back to a default when the field is empty.",
              "Attach files to a campaign straight from the media library.",
            ]}
          >
            <WritePanel />
          </Panel>
        </TabsContent>
        <TabsContent value="audience">
          <Panel
            title="Segment on any field you store"
            body="Group contacts with lists and tags, add your own custom fields, and combine them into segments. The matching count updates as you add conditions."
            points={[
              "Advanced segments take a query expression over any contact field.",
              "Custom fields work in segments and as merge tags.",
              "One contact can sit in several lists and carry any number of tags.",
            ]}
          >
            <AudiencePanel />
          </Panel>
        </TabsContent>
        <TabsContent value="send">
          <Panel
            title="Pick the hour and set the pace"
            body="Schedule a campaign for a time and timezone, then cap how many emails leave per hour so a large list goes out at a rate your provider accepts."
            points={[
              "A/B tests send each version to part of the list, then send the winner to everyone else.",
              "Tick progress shows how far each version has gone while it sends.",
            ]}
          >
            <SendPanel />
          </Panel>
        </TabsContent>
      </Tabs>
      <p className="mt-4 text-ink-tertiary text-xs">
        The campaign, contacts, and figures shown here are sample data.
      </p>
    </Section>
  );
}

export {
  Chip,
  Control,
  FauxButton,
  Frame,
  ICON,
  NewslettersWorkflow,
  StatusBadge,
  Ticks,
};
