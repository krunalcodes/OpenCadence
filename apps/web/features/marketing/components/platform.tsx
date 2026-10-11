import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar";
import { Badge } from "@workspace/ui/components/badge";
import { buttonVariants } from "@workspace/ui/components/button";
import { Kbd, KbdGroup } from "@workspace/ui/components/kbd";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import {
  Activity,
  Check,
  ChevronsUpDown,
  CornerDownLeft,
  Download,
  KeyRound,
  Lock,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import type * as React from "react";

const ICON = { size: 16, strokeWidth: 1.6 } as const;

const workspaces = [
  { name: "Northwind Studio", meta: "5 members", current: true },
  { name: "Harbor Coffee Roasters", meta: "3 members", current: false },
  { name: "Lumen Fitness", meta: "8 members", current: false },
];

const members = [
  {
    name: "Krunal Shah",
    email: "krunal@northwind.studio",
    initials: "KS",
    role: "Owner",
    twoFactor: true,
  },
  {
    name: "Maya Okafor",
    email: "maya@northwind.studio",
    initials: "MO",
    role: "Admin",
    twoFactor: true,
  },
  {
    name: "Sam Reyes",
    email: "sam@northwind.studio",
    initials: "SR",
    role: "Editor",
    twoFactor: true,
  },
  {
    name: "Priya Nair",
    email: "priya@northwind.studio",
    initials: "PN",
    role: "Editor",
    twoFactor: false,
  },
  {
    name: "Jonas Weber",
    email: "jonas@northwind.studio",
    initials: "JW",
    role: "Viewer",
    twoFactor: true,
  },
];

const auditEntries = [
  {
    actor: "Maya",
    initials: "MO",
    verb: "scheduled",
    target: "Webinar invite",
    time: "10:24",
  },
  {
    actor: "Sam",
    initials: "SR",
    verb: "connected",
    target: "outreach@getnorthwind.co",
    time: "09:52",
  },
  {
    actor: "Krunal",
    initials: "KS",
    verb: "created",
    target: "API key",
    time: "09:31",
  },
  {
    actor: "Maya",
    initials: "MO",
    verb: "changed the role of",
    target: "Priya Nair",
    time: "08:47",
  },
  {
    actor: "Priya",
    initials: "PN",
    verb: "exported",
    target: "1,204 contacts",
    time: "08:15",
  },
];

const reportTabs = ["Overview", "Campaigns", "Sequences", "Deliverability"];

const reportMetrics = [
  {
    label: "Opens",
    count: "6,564",
    rate: "52.6%",
    value: 52.6,
    tone: "primary",
  },
  {
    label: "Clicks",
    count: "1,136",
    rate: "9.1%",
    value: 9.1,
    tone: "primary",
  },
  {
    label: "Bounces",
    count: "237",
    rate: "1.9%",
    value: 1.9,
    tone: "warning",
  },
] as const;

const deliveredTrend = [
  { day: "28 Sep", height: 86, flagged: false },
  { day: "29 Sep", height: 90, flagged: false },
  { day: "30 Sep", height: 88, flagged: false },
  { day: "1 Oct", height: 92, flagged: false },
  { day: "2 Oct", height: 84, flagged: false },
  { day: "3 Oct", height: 58, flagged: true },
  { day: "4 Oct", height: 78, flagged: false },
  { day: "5 Oct", height: 88, flagged: false },
  { day: "6 Oct", height: 92, flagged: false },
  { day: "7 Oct", height: 94, flagged: false },
  { day: "8 Oct", height: 90, flagged: false },
  { day: "9 Oct", height: 95, flagged: false },
  { day: "10 Oct", height: 93, flagged: false },
  { day: "11 Oct", height: 96, flagged: false },
];

const languages = [
  { name: "English", current: false },
  { name: "Deutsch", current: true },
  { name: "Español", current: false },
  { name: "Français", current: false },
  { name: "Português", current: false },
];

const consentRows = [
  { label: "Source", value: "Form: Newsletter signup" },
  { label: "Consent given", value: "14 Mar 2026, 09:12 UTC" },
  { label: "Confirmed", value: "14 Mar 2026, 09:14 UTC" },
  { label: "IP address", value: "203.0.113.xxx", note: "Sample" },
];

const paletteActions = [
  { label: "New campaign", icon: Plus, keys: ["C"], selected: true },
  { label: "New contact", icon: Users, keys: ["N"], selected: false },
];

const paletteDestinations = [
  { label: "Campaigns", icon: Mail, keys: ["G", "C"] },
  { label: "Contacts", icon: Users, keys: ["G", "O"] },
  { label: "Deliverability", icon: Activity, keys: ["G", "D"] },
];

const TONES = {
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  neutral: "bg-border-subtle text-muted-foreground",
} as const;

function StatusBadge({
  tone,
  children,
}: {
  tone: keyof typeof TONES;
  children: React.ReactNode;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn("h-[22px] gap-1.5 rounded-[6px] px-2", TONES[tone])}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </Badge>
  );
}

function Ticks({
  value,
  tone = "primary",
  className,
}: {
  value: number;
  tone?: "primary" | "warning" | "success";
  className?: string;
}) {
  const fill = `var(--${tone})`;
  const mask =
    "repeating-linear-gradient(90deg, black 0 3px, transparent 3px 6px)";
  return (
    <span
      className={cn("block h-3 w-full", className)}
      style={{
        background: `linear-gradient(90deg, ${fill} ${value}%, var(--border) ${value}%)`,
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    />
  );
}

function FakeButton({
  variant = "outline",
  className,
  children,
}: {
  variant?: "outline" | "default" | "destructive";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        buttonVariants({ variant, size: "sm" }),
        variant === "outline" && "bg-card shadow-xs",
        variant === "default" && "hover:bg-brand-hover",
        "gap-1.5 text-[12.5px]",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Initials({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Avatar size="sm" className={className}>
      <AvatarFallback className="bg-accent font-medium text-[10px] text-foreground">
        {children}
      </AvatarFallback>
    </Avatar>
  );
}

function Visual({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "@container flex min-w-0 select-none flex-col bg-card text-[13px] leading-normal",
        className,
      )}
    >
      {children}
    </div>
  );
}

function TeamVisual() {
  return (
    <div className="grid flex-1 @xl:grid-cols-[244px_minmax(0,1fr)]">
      <div className="border-border-subtle border-b bg-muted/60 p-3 @xl:border-r @xl:border-b-0">
        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 font-semibold">
          <span className="grid size-6 place-items-center rounded-[7px] bg-primary font-semibold text-[11px] text-primary-foreground">
            N
          </span>
          <span className="truncate">Northwind Studio</span>
          <ChevronsUpDown {...ICON} className="ml-auto text-ink-tertiary" />
        </div>
        <div className="mt-1.5 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="flex items-center gap-2 border-border-subtle border-b px-2.5 py-2 text-ink-tertiary">
            <Search {...ICON} />
            Find a workspace
          </div>
          <ul className="p-1">
            {workspaces.map((workspace) => (
              <li
                key={workspace.name}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5",
                  workspace.current && "bg-accent",
                )}
              >
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-[5px] font-semibold text-[10px]",
                    workspace.current
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card text-muted-foreground",
                  )}
                >
                  {workspace.name.charAt(0)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {workspace.name}
                  </span>
                  <span className="block text-ink-tertiary text-xs tabular-nums">
                    {workspace.meta}
                  </span>
                </span>
                {workspace.current ? (
                  <Check {...ICON} className="ml-auto shrink-0 text-primary" />
                ) : null}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 border-border-subtle border-t px-3 py-2 font-medium text-muted-foreground">
            <Plus {...ICON} />
            New workspace
          </div>
        </div>
      </div>
      <Table className="text-[13px]">
        <TableHeader className="[&_tr]:border-border-subtle">
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="h-8 px-4 text-ink-tertiary text-xs">
              Member
            </TableHead>
            <TableHead className="h-8 px-4 text-ink-tertiary text-xs">
              Role
            </TableHead>
            <TableHead className="h-8 px-4 text-ink-tertiary text-xs">
              Two-factor
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.email} className="border-border-subtle">
              <TableCell className="px-4 py-2.5">
                <span className="flex items-center gap-2.5">
                  <Initials>{member.initials}</Initials>
                  <span className="min-w-0">
                    <span className="block font-medium">{member.name}</span>
                    <span className="block text-ink-tertiary text-xs">
                      {member.email}
                    </span>
                  </span>
                </span>
              </TableCell>
              <TableCell className="px-4 py-2.5">
                <Badge
                  variant="outline"
                  className={cn(
                    "h-[22px] rounded-[6px] px-2",
                    member.role === "Owner"
                      ? "border-transparent bg-accent text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {member.role}
                </Badge>
              </TableCell>
              <TableCell className="px-4 py-2.5">
                {member.twoFactor ? (
                  <StatusBadge tone="success">On</StatusBadge>
                ) : (
                  <StatusBadge tone="warning">Pending</StatusBadge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SignInVisual() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-start gap-3 border-border-subtle border-b px-5 py-3.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-[7px] border border-border bg-muted text-muted-foreground">
          <KeyRound {...ICON} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Single sign-on</span>
          <span className="block truncate text-ink-tertiary text-xs">
            OIDC, id.northwind.studio
          </span>
        </span>
        <StatusBadge tone="success">Connected</StatusBadge>
      </div>
      <div className="flex items-start gap-3 border-border-subtle border-b px-5 py-3.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-[7px] border border-border bg-muted text-muted-foreground">
          <ShieldCheck {...ICON} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Require two-factor</span>
          <span className="block text-ink-tertiary text-xs">
            For every member of this workspace
          </span>
        </span>
        <span className="mt-0.5 flex h-[18px] w-8 shrink-0 items-center justify-end rounded-full bg-primary p-0.5">
          <span className="size-3.5 rounded-full bg-card shadow-xs" />
        </span>
      </div>
      <div className="mt-auto px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-medium text-muted-foreground text-xs">
            Members enrolled
          </span>
          <span className="text-ink-tertiary text-xs tabular-nums">4 of 5</span>
        </div>
        <Ticks value={80} className="mt-2" />
      </div>
    </div>
  );
}

function AuditVisual() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-border-subtle border-b bg-muted/50 px-5 py-2.5">
        <span className="rounded-[6px] border border-border bg-card px-2 py-0.5 font-medium text-muted-foreground text-xs">
          All members
        </span>
        <span className="rounded-[6px] border border-border bg-card px-2 py-0.5 font-medium text-muted-foreground text-xs">
          Today
        </span>
        <span className="ml-auto text-ink-tertiary text-xs tabular-nums">
          5 events
        </span>
      </div>
      <ul>
        {auditEntries.map((entry) => (
          <li
            key={entry.time}
            className="flex items-center gap-2.5 border-border-subtle border-b px-5 py-2.5 last:border-b-0"
          >
            <Initials>{entry.initials}</Initials>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              <span className="font-medium text-foreground">{entry.actor}</span>{" "}
              {entry.verb}{" "}
              <span className="font-medium text-foreground">
                {entry.target}
              </span>
            </span>
            <span className="shrink-0 text-ink-tertiary text-xs tabular-nums">
              {entry.time}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportVisual() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-border-subtle border-b bg-muted/50 px-5 py-2.5">
        <span className="inline-flex max-w-full overflow-hidden rounded-lg border border-border bg-muted p-0.5">
          {reportTabs.map((tab) => (
            <span
              key={tab}
              className={cn(
                "rounded-[6px] px-2.5 py-0.5 font-medium text-[12.5px]",
                tab === "Campaigns"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground",
                tab === "Deliverability" && "hidden @md:block",
              )}
            >
              {tab}
            </span>
          ))}
        </span>
        <FakeButton className="ml-auto">
          <Download {...ICON} />
          Export CSV
        </FakeButton>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-4">
        <span className="font-semibold text-sm tracking-[-0.005em]">
          Weekly digest
        </span>
        <StatusBadge tone="success">Sent</StatusBadge>
        <span className="text-ink-tertiary text-xs tabular-nums">
          12,480 sent through Amazon SES
        </span>
      </div>
      <dl className="grid gap-x-6 gap-y-4 px-5 py-4 @md:grid-cols-3">
        {reportMetrics.map((metric) => (
          <div key={metric.label}>
            <dt className="font-medium text-muted-foreground text-xs">
              {metric.label}
            </dt>
            <dd className="mt-1">
              <span className="flex items-baseline gap-2">
                <span className="font-semibold text-[22px] leading-tight tracking-[-0.025em] tabular-nums">
                  {metric.rate}
                </span>
                <span className="text-ink-tertiary text-xs tabular-nums">
                  {metric.count}
                </span>
              </span>
              <Ticks value={metric.value} tone={metric.tone} className="mt-2" />
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto flex flex-wrap items-end gap-x-5 gap-y-3 border-border-subtle border-t px-5 py-4">
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-muted-foreground text-xs">
            Delivered, last 14 days
          </span>
          <span className="mt-0.5 block text-ink-tertiary text-xs tabular-nums">
            98.1% today. Bounces rose above 2% on 3 Oct.
          </span>
        </span>
        <span className="flex h-9 items-end gap-[3px]">
          {deliveredTrend.map((day) => (
            <span
              key={day.day}
              className={cn(
                "w-1.5 rounded-[1.5px]",
                day.flagged ? "bg-warning" : "bg-success",
              )}
              style={{ height: `${day.height}%` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

function ComplianceVisual() {
  return (
    <div className="grid flex-1 @xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="flex flex-col">
        <div className="flex items-center gap-2.5 border-border-subtle border-b px-5 py-3">
          <Initials>DW</Initials>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">Dana Whitfield</span>
            <span className="block truncate text-ink-tertiary text-xs">
              dana.whitfield@example.com
            </span>
          </span>
          <StatusBadge tone="success">Subscribed</StatusBadge>
        </div>
        <dl className="px-5 py-2">
          {consentRows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-4 border-border-subtle border-b py-2 last:border-b-0"
            >
              <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
              <dd className="flex min-w-0 items-baseline gap-2 text-right font-medium tabular-nums">
                <span className="truncate">{row.value}</span>
                {row.note ? (
                  <span className="rounded-[5px] bg-border-subtle px-1.5 font-medium text-[11px] text-muted-foreground">
                    {row.note}
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex flex-wrap gap-2 border-border-subtle border-t px-5 py-3">
          <FakeButton>
            <Upload {...ICON} />
            Export data
          </FakeButton>
          <FakeButton variant="destructive">
            <Trash2 {...ICON} />
            Erase contact
          </FakeButton>
        </div>
      </div>
      <div className="flex flex-col gap-4 border-border-subtle border-t bg-muted/60 p-5 @xl:border-t-0 @xl:border-l">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">One-click unsubscribe header</span>
            <Lock {...ICON} className="ml-auto shrink-0 text-ink-tertiary" />
          </div>
          <p className="mt-0.5 text-ink-tertiary text-xs">
            Added to every campaign and sequence email
          </p>
          <code className="mt-2 block overflow-hidden rounded-md border border-border bg-card px-2.5 py-2 font-mono text-[11.5px] text-muted-foreground leading-relaxed">
            <span className="block truncate">
              List-Unsubscribe: &lt;https://northwind.studio/u/8f3a&gt;
            </span>
            <span className="block truncate">
              List-Unsubscribe-Post: List-Unsubscribe=One-Click
            </span>
          </code>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">Suppression list</span>
            <Lock {...ICON} className="ml-auto shrink-0 text-ink-tertiary" />
          </div>
          <p className="mt-0.5 text-ink-tertiary text-xs">
            Checked on every send path. This setting cannot be turned off.
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-muted-foreground tabular-nums">
              312 suppressed contacts
            </span>
            <StatusBadge tone="success">Always on</StatusBadge>
          </div>
        </div>
      </div>
    </div>
  );
}

function LanguageVisual() {
  return (
    <div className="grid flex-1 @sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
      <div className="border-border-subtle border-b @sm:border-r @sm:border-b-0">
        <div className="flex items-center gap-2 border-border-subtle border-b px-4 py-2.5 text-ink-tertiary">
          <Search {...ICON} />
          Search languages
        </div>
        <ul className="p-1.5">
          {languages.map((language) => (
            <li
              key={language.name}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5",
                language.current && "bg-accent font-medium",
              )}
            >
              <span lang={language.current ? "de" : undefined}>
                {language.name}
              </span>
              {language.current ? (
                <Check {...ICON} className="ml-auto text-primary" />
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col justify-center bg-muted/60 p-4" lang="de">
        <span className="text-ink-tertiary text-xs" lang="en">
          Public subscribe page
        </span>
        <span className="mt-2 block font-semibold text-sm tracking-[-0.005em]">
          Northwind Studio Newsletter
        </span>
        <span className="mt-0.5 block text-muted-foreground text-xs">
          Einmal pro Woche in deinem Postfach.
        </span>
        <span className="mt-3 block font-medium text-xs">E-Mail-Adresse</span>
        <span className="mt-1 flex h-8 items-center rounded-lg border border-border bg-card px-2.5 text-ink-tertiary shadow-xs">
          du@beispiel.de
        </span>
        <FakeButton variant="default" className="mt-2 w-full">
          Abonnieren
        </FakeButton>
        <span className="mt-2 block text-[11.5px] text-ink-tertiary">
          Du kannst dich jederzeit abmelden.
        </span>
      </div>
    </div>
  );
}

function PaletteVisual() {
  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-xl border border-border bg-popover text-[13px] leading-normal shadow-lg">
      <div className="flex items-center gap-2 border-border-subtle border-b px-3.5 py-3">
        <Search {...ICON} className="shrink-0 text-ink-tertiary" />
        <span className="flex items-center font-medium">
          new
          <span className="ml-px h-4 w-px bg-primary motion-safe:animate-pulse" />
        </span>
        <Kbd className="ml-auto border border-border">Esc</Kbd>
      </div>
      <div className="p-1.5">
        <div className="px-2 py-1 font-medium text-ink-tertiary text-xs">
          Actions
        </div>
        {paletteActions.map((item) => (
          <div
            key={item.label}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5",
              item.selected ? "bg-accent font-medium" : "text-muted-foreground",
            )}
          >
            <item.icon {...ICON} className="shrink-0" />
            {item.label}
            <KbdGroup className="ml-auto">
              {item.selected ? (
                <Kbd className="border border-border bg-card">
                  <CornerDownLeft />
                </Kbd>
              ) : null}
              {item.keys.map((key) => (
                <Kbd key={key} className="border border-border">
                  {key}
                </Kbd>
              ))}
            </KbdGroup>
          </div>
        ))}
        <div className="mt-1 px-2 py-1 font-medium text-ink-tertiary text-xs">
          Go to
        </div>
        {paletteDestinations.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-muted-foreground"
          >
            <item.icon {...ICON} className="shrink-0" />
            {item.label}
            <KbdGroup className="ml-auto">
              {item.keys.map((key) => (
                <Kbd key={key} className="border border-border">
                  {key}
                </Kbd>
              ))}
            </KbdGroup>
          </div>
        ))}
      </div>
    </div>
  );
}

export {
  AuditVisual,
  ComplianceVisual,
  LanguageVisual,
  PaletteVisual,
  ReportVisual,
  SignInVisual,
  TeamVisual,
  Visual,
};
