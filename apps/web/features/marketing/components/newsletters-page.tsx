import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import {
  ArrowRight,
  Check,
  FileText,
  ImageIcon,
  Paperclip,
  Rss,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import {
  Chip,
  FauxButton,
  Frame,
  ICON,
  NewslettersWorkflow,
  StatusBadge,
} from "@/features/marketing/components/newsletters";
import {
  PageHero,
  Section,
  SectionHeading,
} from "@/features/marketing/components/section";
import { features } from "@/features/marketing/lib/features";
import { links } from "@/features/marketing/lib/links";

const builderPoints = [
  {
    title: "Templates and blocks",
    body: "Pick a template, drag blocks into order, and save your own layout as a template for the next issue.",
  },
  {
    title: "HTML and Markdown",
    body: "Switch any email to its HTML source, or write the whole thing in Markdown and let the template style it.",
  },
  {
    title: "AI writing assistant",
    body: "Draft a section, rewrite a paragraph, or personalize a subject line for a segment. The assistant works with your own model key.",
  },
];

const templates = [
  { name: "Product update", rows: ["h-5", "h-2", "h-2 w-2/3"], chosen: true },
  { name: "Monthly digest", rows: ["h-2", "h-2 w-3/4", "h-2", "h-2 w-1/2"] },
  { name: "Launch", rows: ["h-8", "h-2 w-1/2"] },
  { name: "Plain letter", rows: ["h-2 w-1/3", "h-2", "h-2", "h-2 w-3/4"] },
];

const markdownSource = [
  { n: 1, text: "# October at Northwind" },
  { n: 2, text: "" },
  { n: 3, text: 'Hi {{first_name | "there"}},' },
  { n: 4, text: "" },
  { n: 5, text: "You can now **schedule a send**" },
  { n: 6, text: "in each contact's timezone." },
  { n: 7, text: "" },
  { n: 8, text: "[Read the changelog](/changelog)" },
];

const lists = [
  { name: "Newsletter", count: "31,204" },
  { name: "Product updates", count: "18,960" },
  { name: "Webinar invites", count: "4,112" },
];

const tags = ["customer", "trial", "webinar-2026", "vip"];

const expression = [
  'list IN ("Newsletter", "Product updates")',
  'AND plan = "pro"',
  "AND last_opened_at > now() - 30d",
  'AND NOT tag = "churn-risk"',
];

const customFields = [
  { name: "Plan", key: "plan", type: "Select" },
  { name: "Renewal date", key: "renewal_date", type: "Date" },
  { name: "Seats", key: "seats", type: "Number" },
  { name: "Company", key: "company", type: "Text" },
];

const mergePreviews = [
  {
    who: "Ines Albrecht",
    note: "All fields set",
    text: "Hi Ines, your Pro plan renews on 3 November.",
  },
  {
    who: "joris@halfmoon.nl",
    note: "No first name",
    text: "Hi there, your Pro plan renews on 21 November.",
  },
];

const hours = [
  { time: "07:00", sent: 2000, state: "test" },
  { time: "08:00", sent: 2000, state: "test" },
  { time: "09:00", sent: 380, state: "test" },
  { time: "10:00", sent: 0, state: "wait" },
  { time: "11:00", sent: 2000, state: "done" },
  { time: "12:00", sent: 2000, state: "done" },
  { time: "13:00", sent: 2000, state: "live" },
  { time: "14:00", sent: 2000, state: "queued" },
  { time: "15:00", sent: 2000, state: "queued" },
  { time: "16:00", sent: 2000, state: "queued" },
  { time: "17:00", sent: 2000, state: "queued" },
  { time: "18:00", sent: 2000, state: "queued" },
  { time: "19:00", sent: 1520, state: "queued" },
] as const;

const barClass = {
  test: "mk-hatch border border-primary/50 bg-card",
  wait: "",
  done: "bg-primary",
  live: "bg-live motion-safe:animate-pulse",
  queued: "border border-border bg-accent",
} as const;

const legend = [
  { label: "A/B test group", className: barClass.test },
  { label: "Winner, sent", className: barClass.done },
  { label: "Sending now", className: "bg-live" },
  { label: "Queued", className: barClass.queued },
];

const sendPoints = [
  {
    title: "Scheduling",
    body: "Set the date, hour, and timezone for a campaign, and it goes out on its own.",
  },
  {
    title: "Send-time throttling",
    body: "Cap how many emails go out per hour. A large list leaves at a pace your provider accepts, and the campaign shows when the last one will send.",
  },
  {
    title: "A/B tests",
    body: "Send two versions to a share of the list. OpenCadence compares the results, then sends the winner to everyone else.",
  },
];

const preferences = [
  { name: "Newsletter", on: true },
  { name: "Product updates", on: true },
  { name: "Webinar invites", on: false },
];

const mediaFiles = [
  { name: "october-hero.png", size: "412 KB", kind: "image" },
  { name: "editor-speed.png", size: "288 KB", kind: "image" },
  { name: "team-photo.jpg", size: "1.1 MB", kind: "image" },
  { name: "october-changelog.pdf", size: "184 KB", kind: "file" },
] as const;

const stats = [
  { label: "Opens", value: "44.1%", count: "9,658" },
  { label: "Clicks", value: "9.8%", count: "2,146" },
  { label: "Bounces", value: "0.6%", count: "131" },
  { label: "Complaints", value: "0.02%", count: "4" },
  { label: "Unsubscribes", value: "0.3%", count: "66" },
];

const activity = [
  {
    who: "ines@kettlewerk.de",
    what: "Clicked Read the changelog",
    tone: "bg-success-surface text-success",
    badge: "Click",
  },
  {
    who: "m.okafor@lumen.example",
    what: "Mailbox full, will not retry",
    tone: "bg-danger-surface text-danger",
    badge: "Bounce",
  },
];

const issues = [
  { title: "October product update", date: "14 Oct 2026" },
  { title: "What we learned from 40 onboarding calls", date: "30 Sep 2026" },
  { title: "September product update", date: "16 Sep 2026" },
];

const related = [
  {
    slug: "deliverability",
    body: "Check DNS records and sender health before a campaign goes out.",
  },
  {
    slug: "integrations",
    body: "Connect Resend, Amazon SES, SendGrid, or SMTP as the provider your campaigns send through.",
  },
];

function Index({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-primary text-xs tabular-nums">
      {children}
    </span>
  );
}

function FauxToggle({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-7 shrink-0 items-center rounded-full p-0.5",
        on ? "justify-end bg-primary" : "bg-border",
      )}
    >
      <span className="size-3 rounded-full bg-card shadow-xs" />
    </span>
  );
}

function BuilderVisual() {
  return (
    <div
      aria-hidden
      className="mk-hatch min-w-0 space-y-4 border border-border p-4 text-[13px] leading-normal sm:p-6"
    >
      <ul className="grid grid-cols-2 border border-border bg-card sm:grid-cols-4">
        {templates.map((template, index) => (
          <li
            key={template.name}
            className={cn(
              "min-w-0 border-border p-3",
              index % 2 === 0 && "border-r",
              index < 2 && "border-b sm:border-b-0",
              index === 1 && "sm:border-r",
              index === 3 && "sm:border-r-0",
              index === 2 && "sm:border-r",
            )}
          >
            <div
              className={cn(
                "flex h-20 flex-col gap-1.5 rounded-md border bg-background p-2",
                template.chosen
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border-subtle",
              )}
            >
              {template.rows.map((row, rowIndex) => (
                <span
                  key={`${template.name}-${rowIndex.toString()}`}
                  className={cn(
                    "block shrink-0 rounded-sm",
                    row,
                    row.startsWith("h-2") ? "bg-border" : "bg-warmup-surface",
                  )}
                />
              ))}
            </div>
            <p className="mt-2 flex items-center gap-1 truncate font-medium text-xs">
              {template.chosen ? (
                <Check {...ICON} size={13} className="shrink-0 text-primary" />
              ) : null}
              <span className="truncate">{template.name}</span>
            </p>
          </li>
        ))}
      </ul>
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
            <span className="px-2.5 py-0.5">Builder</span>
            <span className="px-2.5 py-0.5">HTML</span>
            <span className="rounded-md bg-card px-2.5 py-0.5 text-foreground shadow-xs">
              Markdown
            </span>
          </span>
        }
      >
        <div className="grid md:grid-cols-2">
          <div className="min-w-0 overflow-x-auto border-border-subtle border-b py-3 md:border-r md:border-b-0">
            <ol className="min-w-max font-mono text-xs leading-6">
              {markdownSource.map((line) => (
                <li key={line.n} className="flex gap-3 px-4">
                  <span className="w-4 shrink-0 text-right text-ink-tertiary tabular-nums">
                    {line.n}
                  </span>
                  <span
                    className={cn(
                      "whitespace-pre",
                      line.text.startsWith("#") && "font-semibold",
                      line.text.startsWith("[") && "text-primary",
                    )}
                  >
                    {line.text}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="min-w-0 space-y-3 p-4">
            <p className="flex items-center gap-1.5 font-medium text-xs">
              <Sparkles {...ICON} className="text-primary" />
              Writing assistant
            </p>
            <p className="rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-xs">
              Rewrite lines 5 and 6 for people on the Pro plan
            </p>
            <p className="rounded-lg bg-muted px-2.5 py-2 text-muted-foreground">
              Pro workspaces can now schedule a send in each contact's timezone,
              so a 9:00 email arrives at 9:00 everywhere.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <FauxButton primary>Insert</FauxButton>
              <FauxButton>Try again</FauxButton>
              <span className="ml-auto text-ink-tertiary text-xs">
                Runs on your model key
              </span>
            </div>
          </div>
        </div>
      </Frame>
    </div>
  );
}

function BuilderSection() {
  return (
    <Section id="builder">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <div className="min-w-0">
          <SectionHeading
            title="An email builder that also speaks HTML and Markdown"
            lead="Start from a template and arrange blocks by hand. When you want the source, it is one click away."
          />
          <ul className="mt-8 border-border border-t">
            {builderPoints.map((point, index) => (
              <li
                key={point.title}
                className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-border border-b py-5"
              >
                <Index>{`0${index + 1}`}</Index>
                <div>
                  <h3 className="font-semibold text-base tracking-[-0.01em]">
                    {point.title}
                  </h3>
                  <p className="mt-1.5 text-pretty text-muted-foreground text-sm">
                    {point.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <BuilderVisual />
      </div>
    </Section>
  );
}

function Cell({
  title,
  body,
  className,
  children,
}: {
  title: string;
  body: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 border-border p-6 md:p-8", className)}>
      <h3 className="font-semibold text-lg tracking-[-0.015em]">{title}</h3>
      <p className="mt-2 max-w-md text-pretty text-muted-foreground text-sm">
        {body}
      </p>
      <div aria-hidden className="mt-6 text-[13px] leading-normal">
        {children}
      </div>
    </div>
  );
}

function AudienceSection() {
  return (
    <Section id="audience">
      <SectionHeading
        title="Send each campaign to the contacts it is meant for"
        lead="Organize contacts with lists and tags, store what you know about them in custom fields, and build segments from all of it."
      />
      <div className="mt-10 grid border border-border md:mt-14 md:grid-cols-6">
        <Cell
          title="Lists and tags"
          body="A contact can belong to several lists and carry any number of tags."
          className="border-b md:col-span-2 md:border-r"
        >
          <ul className="border-border-subtle border-t">
            {lists.map((list) => (
              <li
                key={list.name}
                className="flex items-center justify-between gap-3 border-border-subtle border-b py-2"
              >
                <span className="truncate font-medium">{list.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {list.count}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </p>
        </Cell>
        <Cell
          title="Segments with query expressions"
          body="Build a segment with the condition builder, or write the query expression yourself. The matching count updates as you type."
          className="border-b md:col-span-4"
        >
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
            <div className="overflow-x-auto p-4">
              <pre className="min-w-max font-mono text-xs leading-6">
                {expression.map((line, index) => (
                  <span key={line} className="block">
                    <span className="mr-4 inline-block w-3 text-right text-ink-tertiary">
                      {index + 1}
                    </span>
                    {line}
                  </span>
                ))}
              </pre>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-border-subtle border-t px-4 py-2.5">
              <StatusBadge className="bg-success-surface text-success">
                Valid expression
              </StatusBadge>
              <span className="text-muted-foreground tabular-nums">
                <span className="font-semibold text-foreground">3,482</span> of
                48,210 contacts match
              </span>
            </div>
          </div>
        </Cell>
        <Cell
          title="Custom fields"
          body="Add your own fields for anything you know about a contact. Each one is available in segments and in your emails."
          className="border-b md:col-span-3 md:border-r md:border-b-0"
        >
          <table className="w-full text-left">
            <thead>
              <tr className="text-ink-tertiary text-xs">
                <th className="pb-2 font-medium">Field</th>
                <th className="pb-2 font-medium">Key</th>
                <th className="pb-2 text-right font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {customFields.map((field) => (
                <tr key={field.key} className="border-border-subtle border-t">
                  <td className="py-2 pr-3 font-medium">{field.name}</td>
                  <td className="py-2 pr-3 font-mono text-muted-foreground text-xs">
                    {field.key}
                  </td>
                  <td className="py-2 text-right text-muted-foreground">
                    {field.type}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cell>
        <Cell
          title="Merge tags with fallbacks"
          body="Drop any contact field into a subject line or body. A fallback fills in when the field is empty."
          className="md:col-span-3"
        >
          <div className="overflow-x-auto rounded-lg bg-info-surface px-3 py-2">
            <code className="whitespace-nowrap font-mono text-info text-xs">
              {
                'Hi {{first_name | "there"}}, your {{plan | "free"}} plan renews on {{renewal_date}}.'
              }
            </code>
          </div>
          <ul className="mt-3">
            {mergePreviews.map((preview) => (
              <li
                key={preview.who}
                className="border-border-subtle border-t py-2.5"
              >
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                  <span className="truncate font-medium">{preview.who}</span>
                  <span className="text-ink-tertiary">{preview.note}</span>
                </p>
                <p className="mt-1 text-muted-foreground">{preview.text}</p>
              </li>
            ))}
          </ul>
        </Cell>
      </div>
    </Section>
  );
}

function SendSection() {
  return (
    <Section id="sending">
      <SectionHeading
        title="Schedule the send and control how fast it leaves"
        lead="Pick the hour, set an hourly limit, and test two versions on part of the list before the rest receive the better one."
      />
      <div aria-hidden className="mt-10 text-[13px] leading-normal md:mt-14">
        <Frame
          crumb="Campaigns"
          title="October product update"
          status={
            <StatusBadge live className="bg-live text-live-foreground">
              Sending
            </StatusBadge>
          }
          actions={
            <span className="text-muted-foreground tabular-nums">
              <span className="font-semibold text-foreground">9,040</span> of
              21,900 sent
            </span>
          }
        >
          <dl className="grid border-border-subtle border-b sm:grid-cols-3">
            <div className="min-w-0 border-border-subtle border-b p-4 sm:border-r sm:border-b-0">
              <dt className="text-ink-tertiary text-xs">Scheduled</dt>
              <dd className="mt-1 font-medium tabular-nums">
                Wed 14 Oct, 07:00 Europe/Berlin
              </dd>
            </div>
            <div className="min-w-0 border-border-subtle border-b p-4 sm:border-r sm:border-b-0">
              <dt className="text-ink-tertiary text-xs">Throttle</dt>
              <dd className="mt-1 font-medium tabular-nums">
                2,000 per hour, finishes 19:46
              </dd>
            </div>
            <div className="min-w-0 p-4">
              <dt className="text-ink-tertiary text-xs">A/B test</dt>
              <dd className="mt-1 font-medium tabular-nums">
                Version A won at 44.1% opens
              </dd>
            </div>
          </dl>
          <div className="overflow-x-auto">
            <div className="min-w-[640px] p-4">
              <div className="flex h-36 items-end gap-1.5 border-border border-b">
                {hours.map((hour) => (
                  <div
                    key={hour.time}
                    className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                  >
                    <span className="text-[11px] text-ink-tertiary tabular-nums">
                      {hour.state === "wait"
                        ? "Wait"
                        : hour.sent.toLocaleString("en-US")}
                    </span>
                    <span
                      className={cn(
                        "block w-full rounded-t-sm",
                        barClass[hour.state],
                      )}
                      style={{ height: `${(hour.sent / 2000) * 72}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-1.5 font-mono text-[11px] text-ink-tertiary">
                {hours.map((hour) => (
                  <span
                    key={hour.time}
                    className={cn(
                      "min-w-0 flex-1 text-center tabular-nums",
                      hour.state === "live" && "font-semibold text-foreground",
                    )}
                  >
                    {hour.time}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 border-border-subtle border-t px-4 py-3 text-muted-foreground text-xs">
            {legend.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <span className={cn("size-3 rounded-sm", item.className)} />
                {item.label}
              </li>
            ))}
          </ul>
        </Frame>
      </div>
      <ul className="mt-10 grid border-border border-y md:grid-cols-3">
        {sendPoints.map((point, index) => (
          <li
            key={point.title}
            className={cn(
              "min-w-0 border-border py-6 md:px-8 md:py-8",
              index > 0 && "border-t md:border-t-0 md:border-l",
              index === 0 && "md:pl-0",
              index === sendPoints.length - 1 && "md:pr-0",
            )}
          >
            <h3 className="font-semibold text-lg tracking-[-0.015em]">
              {point.title}
            </h3>
            <p className="mt-2 text-pretty text-muted-foreground text-sm">
              {point.body}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function FormsVisual() {
  return (
    <div className="grid border border-border bg-card sm:grid-cols-3">
      <div className="min-w-0 space-y-2.5 border-border border-b p-4 sm:border-r sm:border-b-0">
        <p className="font-mono text-ink-tertiary text-xs">1 Form</p>
        <p className="flex h-8 items-center truncate rounded-lg border border-border px-2.5 text-ink-tertiary shadow-xs">
          you@company.com
        </p>
        {preferences.slice(0, 2).map((item) => (
          <p key={item.name} className="flex items-center gap-2">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-[5px] bg-primary text-primary-foreground">
              <Check size={11} strokeWidth={2.5} />
            </span>
            <span className="truncate">{item.name}</span>
          </p>
        ))}
        <FauxButton primary>Subscribe</FauxButton>
      </div>
      <div className="min-w-0 space-y-2.5 border-border border-b p-4 sm:border-r sm:border-b-0">
        <p className="font-mono text-ink-tertiary text-xs">2 Double opt-in</p>
        <p className="font-medium">Confirm your subscription</p>
        <p className="text-muted-foreground">
          One click confirms the address before it joins a list.
        </p>
        <StatusBadge className="bg-success-surface text-success">
          Confirmed
        </StatusBadge>
      </div>
      <div className="min-w-0 space-y-2.5 p-4">
        <p className="font-mono text-ink-tertiary text-xs">3 Preferences</p>
        {preferences.map((item) => (
          <p
            key={item.name}
            className="flex items-center justify-between gap-2"
          >
            <span className="truncate">{item.name}</span>
            <FauxToggle on={item.on} />
          </p>
        ))}
        <p className="text-ink-tertiary text-xs underline underline-offset-2">
          Unsubscribe from everything
        </p>
      </div>
    </div>
  );
}

function MediaVisual() {
  return (
    <ul className="grid grid-cols-2 border border-border bg-card sm:grid-cols-4">
      {mediaFiles.map((file, index) => (
        <li
          key={file.name}
          className={cn(
            "min-w-0 border-border p-3",
            index % 2 === 0 && "border-r",
            index < 2 && "border-b sm:border-b-0",
            index === 1 && "sm:border-r",
          )}
        >
          <div className="mk-hatch flex h-16 items-center justify-center rounded-md border border-border-subtle text-ink-tertiary">
            {file.kind === "image" ? (
              <ImageIcon {...ICON} />
            ) : (
              <FileText {...ICON} />
            )}
          </div>
          <p className="mt-2 truncate font-medium text-xs">{file.name}</p>
          <p className="flex items-center gap-1 text-ink-tertiary text-xs tabular-nums">
            {file.kind === "file" ? (
              <Paperclip size={12} strokeWidth={1.7} className="shrink-0" />
            ) : null}
            <span className="truncate">
              {file.kind === "file" ? `Attached, ${file.size}` : file.size}
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}

function TrackingVisual() {
  return (
    <div className="border border-border bg-card">
      <dl className="grid grid-cols-2 sm:grid-cols-5">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={cn(
              "min-w-0 border-border-subtle border-b p-3",
              index % 2 === 0 && "border-r",
              index % 2 === 1 && "sm:border-r",
              index === stats.length - 1 &&
                "col-span-2 border-r-0 sm:col-span-1",
            )}
          >
            <dt className="truncate text-ink-tertiary text-xs">{stat.label}</dt>
            <dd className="mt-1 font-semibold text-base tabular-nums tracking-[-0.01em]">
              {stat.value}
            </dd>
            <dd className="text-ink-tertiary text-xs tabular-nums">
              {stat.count}
            </dd>
          </div>
        ))}
      </dl>
      <ul>
        {activity.map((row, index) => (
          <li
            key={row.who}
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5",
              index > 0 && "border-border-subtle border-t",
            )}
          >
            <StatusBadge className={row.tone}>{row.badge}</StatusBadge>
            <span className="min-w-0 truncate font-medium">{row.who}</span>
            <span className="min-w-0 truncate text-muted-foreground sm:ml-auto">
              {row.what}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArchiveVisual() {
  return (
    <div className="border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-border-subtle border-b px-4 py-2.5">
        <span className="min-w-0 truncate font-mono text-muted-foreground text-xs">
          northwind.example/archive
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-0.5 font-mono text-muted-foreground text-xs">
          <Rss size={12} strokeWidth={2} />
          /archive/feed.xml
        </span>
      </div>
      <ul>
        {issues.map((issue, index) => (
          <li
            key={issue.title}
            className={cn(
              "flex items-baseline justify-between gap-4 px-4 py-2.5",
              index > 0 && "border-border-subtle border-t",
            )}
          >
            <span className="min-w-0 truncate font-medium">{issue.title}</span>
            <span className="shrink-0 font-mono text-ink-tertiary text-xs tabular-nums">
              {issue.date}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ledger = [
  {
    title: "Subscription forms, double opt-in, and a preference centre",
    body: "Subscription forms collect signups, and double opt-in confirms each address by email. Subscribers pick the topics they want in a preference centre, and you can restyle every public page they see.",
    visual: <FormsVisual />,
  },
  {
    title: "Media library and attachments",
    body: "Upload images and files once and reuse them in any email. Attach a file to a campaign straight from the library.",
    visual: <MediaVisual />,
  },
  {
    title: "Tracking for every send",
    body: "Each campaign report counts opens, clicks, bounces, complaints, and unsubscribes, and lists them contact by contact. Bounces, complaints, and unsubscribes go on the suppression list your outreach sequences share.",
    visual: <TrackingVisual />,
  },
  {
    title: "A public archive with RSS",
    body: "Publish sent newsletters to a public archive page. Readers who prefer a feed reader can follow new issues over RSS.",
    visual: <ArchiveVisual />,
  },
];

function LedgerSection() {
  return (
    <Section id="more">
      <SectionHeading
        title="Grow the list, measure each send, keep every issue readable"
        lead="The parts of a newsletter that sit before and after the send button are in the same app."
      />
      <ol className="mt-10 border-border border-t md:mt-14">
        {ledger.map((row, index) => (
          <li
            key={row.title}
            className="grid gap-6 border-border border-b py-8 md:grid-cols-[3rem_minmax(0,4fr)_minmax(0,6fr)] md:gap-8 md:py-10"
          >
            <Index>{`0${index + 1}`}</Index>
            <div className="min-w-0">
              <h3 className="text-balance font-semibold text-lg tracking-[-0.015em]">
                {row.title}
              </h3>
              <p className="mt-2 text-pretty text-muted-foreground text-sm">
                {row.body}
              </p>
            </div>
            <div aria-hidden className="min-w-0 text-[13px] leading-normal">
              {row.visual}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function WorksWith() {
  return (
    <Section id="works-with">
      <div className="grid border border-border md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_minmax(0,3fr)]">
        <div className="mk-hatch min-w-0 border-border border-b p-6 md:border-r md:border-b-0 md:p-8">
          <h2 className="font-semibold text-xl tracking-[-0.02em]">
            Works with
          </h2>
          <p className="mt-2 text-pretty text-muted-foreground text-sm">
            Two more parts of OpenCadence that newsletters rely on.
          </p>
        </div>
        {related.map((item, index) => {
          const feature = features.find((entry) => entry.slug === item.slug);
          if (!feature) {
            return null;
          }
          return (
            <Link
              key={feature.slug}
              href={feature.href}
              className={cn(
                "group min-w-0 border-border p-6 outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset md:p-8",
                index === 0 && "border-b md:border-r md:border-b-0",
              )}
            >
              <span className="flex items-center justify-between gap-3 font-semibold text-base tracking-[-0.01em]">
                {feature.title}
                <ArrowRight
                  {...ICON}
                  className="shrink-0 text-primary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                />
              </span>
              <span className="mt-2 block text-pretty text-muted-foreground text-sm">
                {item.body}
              </span>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

function NewslettersPage() {
  return (
    <>
      <PageHero
        label="Newsletters and campaigns"
        title="Send newsletters to your whole list without paying per contact"
        lead="Build the email, pick a segment, and schedule the send in one app. Campaigns go out through the provider you connect, so you keep your sender reputation and pay your provider's rate."
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href={links.signUp}
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-11 px-5 text-[15px] hover:bg-brand-hover",
            )}
          >
            Start for free
          </Link>
          <Link
            href={links.demo}
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-11 px-5 text-[15px]",
            )}
          >
            Book a demo
          </Link>
        </div>
      </PageHero>
      <NewslettersWorkflow />
      <BuilderSection />
      <AudienceSection />
      <SendSection />
      <LedgerSection />
      <WorksWith />
    </>
  );
}

export { NewslettersPage };
