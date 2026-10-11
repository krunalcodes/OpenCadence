import { Badge } from "@workspace/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import type * as React from "react";

type Tone = "success" | "warning" | "danger" | "neutral";
type Day = "ok" | "warn" | "bad" | "none";

const toneClasses: Record<Tone, string> = {
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  neutral: "bg-border-subtle text-muted-foreground",
};

const dayClasses: Record<Day, string> = {
  ok: "h-full bg-success",
  warn: "h-full bg-warning",
  bad: "h-full bg-danger",
  none: "h-[45%] bg-border",
};

const dkimName = "oc1._domainkey.getnorthwind.co";
const dkimValue =
  "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAx7Qm2fT9cLr4Wn1pKzVb3HsYd8uEoJ5gXa";

const rampVolumes = [
  5, 8, 11, 15, 18, 21, 24, 27, 31, 34, 37, 40, 43, 47, 50, 53, 56, 59, 63, 66,
  70,
];
const rampDays = rampVolumes.length;
const rampToday = 12;
const rampPeak = 70;

const rampStats = [
  { label: "Schedule", value: "Day 12 of 21" },
  { label: "Today", value: "40 per mailbox" },
  { label: "Target", value: "70 per mailbox" },
  { label: "Warming", value: "4 mailboxes" },
];

const rampMailboxes: {
  address: string;
  day: number;
  note: string;
  paused?: boolean;
}[] = [
  { address: "maya@northwind.studio", day: 12, note: "40 a day" },
  { address: "sam@northwind.studio", day: 12, note: "40 a day" },
  { address: "priya@northwind.studio", day: 9, note: "31 a day" },
  {
    address: "outreach@getnorthwind.co",
    day: 10,
    note: "Paused at 34 a day",
    paused: true,
  },
];

const healthy: Day[] = Array.from({ length: 14 }, () => "ok");

function withDays(changes: Record<number, Day>): Day[] {
  return healthy.map((day, index) => changes[index] ?? day);
}

type Sender = {
  name: string;
  kind: string;
  today: string;
  days: Day[];
  summary: string;
  tone: Tone;
  status: string;
};

const senderGroups: { label: string; senders: Sender[] }[] = [
  {
    label: "Mailboxes",
    senders: [
      {
        name: "maya@northwind.studio",
        kind: "Gmail",
        today: "38 of 40 sent",
        days: healthy,
        summary: "healthy on all 14 days",
        tone: "success",
        status: "Healthy",
      },
      {
        name: "sam@northwind.studio",
        kind: "Outlook",
        today: "40 of 40 sent",
        days: withDays({ 8: "warn", 13: "warn" }),
        summary: "2 warning days, 12 healthy days",
        tone: "warning",
        status: "At limit",
      },
      {
        name: "priya@northwind.studio",
        kind: "Gmail",
        today: "22 of 31 sent",
        days: withDays({ 4: "warn" }),
        summary: "1 warning day, 13 healthy days",
        tone: "success",
        status: "Healthy",
      },
      {
        name: "outreach@getnorthwind.co",
        kind: "IMAP/SMTP",
        today: "Paused",
        days: withDays({
          0: "none",
          1: "none",
          2: "none",
          3: "none",
          10: "warn",
          11: "bad",
          12: "bad",
          13: "bad",
        }),
        summary: "4 days without data, 6 healthy, 1 warning, 3 failing",
        tone: "danger",
        status: "DKIM failing",
      },
    ],
  },
  {
    label: "Providers",
    senders: [
      {
        name: "Resend",
        kind: "API",
        today: "8,112 of 20,000 sent",
        days: healthy,
        summary: "healthy on all 14 days",
        tone: "success",
        status: "Healthy",
      },
      {
        name: "Amazon SES",
        kind: "API",
        today: "1,940 of 10,000 sent",
        days: withDays({ 6: "warn" }),
        summary: "1 warning day, 13 healthy days",
        tone: "success",
        status: "Healthy",
      },
    ],
  },
  {
    label: "Domains",
    senders: [
      {
        name: "northwind.studio",
        kind: "Sending domain",
        today: "3 of 3 checks pass",
        days: healthy,
        summary: "healthy on all 14 days",
        tone: "success",
        status: "Healthy",
      },
      {
        name: "getnorthwind.co",
        kind: "Sending domain",
        today: "2 of 3 checks pass",
        days: withDays({ 10: "warn", 11: "bad", 12: "bad", 13: "bad" }),
        summary: "10 healthy days, 1 warning, 3 failing",
        tone: "danger",
        status: "1 failing",
      },
    ],
  },
];

const dnsRecords: {
  check: string;
  title: string;
  body: string;
  name: string;
  value: string;
  tone: Tone;
  status: string;
}[] = [
  {
    check: "SPF",
    title: "Who may send for the domain",
    body: "OpenCadence reads the SPF record and confirms that the mailbox host or provider you connected is authorised to send.",
    name: "getnorthwind.co",
    value: "v=spf1 include:_spf.mailhost.example ~all",
    tone: "success",
    status: "Pass",
  },
  {
    check: "DKIM",
    title: "A signature on every message",
    body: "It looks up the selector your mail is signed with and tells you when the key is missing, shortened, or no longer matches.",
    name: dkimName,
    value: dkimValue,
    tone: "danger",
    status: "Failing",
  },
  {
    check: "DMARC",
    title: "What happens to mail that fails",
    body: "It reads the DMARC policy, shows the policy in force, and flags a domain that has no policy at all.",
    name: "_dmarc.getnorthwind.co",
    value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@getnorthwind.co",
    tone: "success",
    status: "Pass",
  },
];

const suppressionEvents: {
  time: string;
  address: string;
  event: string;
  tone: Tone;
  source: string;
}[] = [
  {
    time: "09:42",
    address: "dana@harborline.example",
    event: "Hard bounce",
    tone: "danger",
    source: "Sequence, step 2",
  },
  {
    time: "09:17",
    address: "lee@fernhill.example",
    event: "Spam complaint",
    tone: "warning",
    source: "October newsletter",
  },
  {
    time: "08:55",
    address: "omar@tidewater.example",
    event: "Hard bounce",
    tone: "danger",
    source: "October newsletter",
  },
  {
    time: "08:03",
    address: "ines@quillworks.example",
    event: "Unsubscribe",
    tone: "neutral",
    source: "Sequence, step 4",
  },
];

const limits = [
  { kind: "Provider", name: "Resend", sent: 8112, cap: 20000 },
  { kind: "Provider", name: "Amazon SES", sent: 1940, cap: 10000 },
  { kind: "Domain", name: "northwind.studio", sent: 9240, cap: 12000 },
  { kind: "Domain", name: "getnorthwind.co", sent: 1460, cap: 1500 },
];

const trackedLinks = [
  {
    label: "Open",
    url: "https://links.northwind.studio/o/8f2c1a.gif",
  },
  {
    label: "Click",
    url: "https://links.northwind.studio/c/8f2c1a/pricing",
  },
  {
    label: "Unsubscribe",
    url: "https://links.northwind.studio/u/8f2c1a",
  },
];

const monoLabel = "font-mono text-[11px] text-muted-foreground";

function StatusBadge({
  tone,
  className,
  children,
}: {
  tone: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Badge
      className={cn(
        "h-[22px] gap-1.5 rounded-md px-2 font-medium text-xs",
        toneClasses[tone],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </Badge>
  );
}

function HealthStrip({ days, summary }: { days: Day[]; summary: string }) {
  return (
    <span
      role="img"
      aria-label={`Last 14 days: ${summary}`}
      className="flex h-[18px] shrink-0 items-end gap-0.5"
    >
      {days.map((day, index) => (
        <span
          key={index}
          className={cn("w-1 rounded-[1.5px]", dayClasses[day])}
        />
      ))}
    </span>
  );
}

function TickProgress({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "block h-3 min-w-16 flex-1 [mask:repeating-linear-gradient(90deg,black_0_3px,transparent_3px_6px)]",
        className,
      )}
      style={{
        background: `linear-gradient(90deg, var(--primary) ${percent}%, var(--border) ${percent}%)`,
      }}
    />
  );
}

function WarmupRamp() {
  return (
    <div className="border border-border bg-card text-[13px] leading-normal">
      <dl className="grid grid-cols-2 border-border border-b lg:grid-cols-4">
        {rampStats.map((stat, index) => (
          <div
            key={stat.label}
            className={cn(
              "min-w-0 border-border px-4 py-3.5 md:px-5",
              index % 2 === 1 && "border-l",
              index >= 2 && "border-t lg:border-t-0",
              index === 2 && "lg:border-l",
            )}
          >
            <dt className={monoLabel}>{stat.label}</dt>
            <dd className="mt-1 font-semibold text-base tabular-nums tracking-[-0.01em]">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="px-4 pt-6 pb-4 md:px-5 md:pt-8">
        <div
          role="img"
          aria-label="Daily warm-up volume per mailbox over 21 days, rising from 5 emails on day 1 to 70 on day 21. Today is day 12 at 40 emails."
          className="flex h-36 items-end gap-[3px] sm:gap-1.5 md:h-52"
        >
          {rampVolumes.map((volume, index) => {
            const day = index + 1;
            return (
              <span
                key={day}
                className={cn(
                  "flex-1 rounded-[2px]",
                  day < rampToday && "bg-primary/30",
                  day === rampToday && "bg-primary",
                  day > rampToday && "mk-hatch border border-border",
                )}
                style={{ height: `${(volume / rampPeak) * 100}%` }}
              />
            );
          })}
        </div>
        <div
          aria-hidden
          className="relative mt-2 h-4 font-mono text-[10.5px] text-muted-foreground"
        >
          <span className="absolute left-0">Day 1, 5 sent</span>
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap font-medium text-primary"
            style={{ left: `${((rampToday - 0.5) / rampDays) * 100}%` }}
          >
            Day 12
          </span>
          <span className="absolute right-0">Day 21, 70</span>
        </div>
      </div>

      <ul className="grid border-border border-t sm:grid-cols-2 lg:grid-cols-4">
        {rampMailboxes.map((mailbox, index) => (
          <li
            key={mailbox.address}
            className={cn(
              "min-w-0 border-border px-4 py-3.5 md:px-5",
              index > 0 && "border-t sm:border-t-0",
              index % 2 === 1 && "sm:border-l",
              index >= 2 && "sm:border-t lg:border-t-0",
              index === 2 && "lg:border-l",
            )}
          >
            <p className="truncate font-medium">{mailbox.address}</p>
            <p className="mt-0.5 text-muted-foreground text-xs tabular-nums">
              Day {mailbox.day} of {rampDays}, {mailbox.note}
            </p>
            <div className="mt-2.5 flex">
              <TickProgress
                percent={(mailbox.day / rampDays) * 100}
                className={cn(mailbox.paused && "opacity-50")}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HealthTable() {
  return (
    <div className="border border-border bg-card">
      <Table className="min-w-[620px] text-[13px]">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className={cn(monoLabel, "h-9 px-4 font-normal")}>
              Sender
            </TableHead>
            <TableHead className={cn(monoLabel, "h-9 px-4 font-normal")}>
              Today
            </TableHead>
            <TableHead className={cn(monoLabel, "h-9 px-4 font-normal")}>
              Last 14 days
            </TableHead>
            <TableHead className={cn(monoLabel, "h-9 px-4 font-normal")}>
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        {senderGroups.map((group) => (
          <TableBody
            key={group.label}
            className="border-border border-b last:border-b-0"
          >
            <TableRow className="border-border-subtle hover:bg-transparent">
              <TableHead
                colSpan={4}
                scope="colgroup"
                className="mk-hatch h-8 px-4 font-mono font-normal text-[11px] text-primary"
              >
                {group.label}
              </TableHead>
            </TableRow>
            {group.senders.map((sender) => (
              <TableRow
                key={sender.name}
                className="border-border-subtle hover:bg-transparent"
              >
                <TableHead scope="row" className="h-auto px-4 py-2.5">
                  <span className="block font-medium">{sender.name}</span>
                  <span className="block font-normal text-muted-foreground text-xs">
                    {sender.kind}
                  </span>
                </TableHead>
                <TableCell className="px-4 py-2.5 text-muted-foreground tabular-nums">
                  {sender.today}
                </TableCell>
                <TableCell className="px-4 py-2.5">
                  <HealthStrip days={sender.days} summary={sender.summary} />
                </TableCell>
                <TableCell className="px-4 py-2.5">
                  <StatusBadge tone={sender.tone}>{sender.status}</StatusBadge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        ))}
      </Table>
    </div>
  );
}

function RecordLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className={monoLabel}>{label}</dt>
      <dd className="mt-1 overflow-x-auto border border-border bg-background px-2.5 py-2">
        <code className="whitespace-nowrap font-mono text-xs">{value}</code>
      </dd>
    </div>
  );
}

function DnsRecords() {
  return (
    <ul className="grid border border-border bg-card lg:grid-cols-3">
      {dnsRecords.map((record, index) => (
        <li
          key={record.check}
          className={cn(
            "flex min-w-0 flex-col border-border p-5 md:p-6",
            index > 0 && "border-t lg:border-t-0 lg:border-l",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-primary text-xs">
              {record.check}
            </span>
            <StatusBadge tone={record.tone}>{record.status}</StatusBadge>
          </div>
          <h3 className="mt-4 font-semibold text-lg tracking-[-0.01em]">
            {record.title}
          </h3>
          <p className="mt-2 mb-5 text-[15px] text-muted-foreground">
            {record.body}
          </p>
          <dl className="mt-auto space-y-3">
            <RecordLine label="TXT name" value={record.name} />
            <RecordLine label="TXT value" value={record.value} />
          </dl>
        </li>
      ))}
    </ul>
  );
}

function SuppressionLog() {
  return (
    <div className="border border-border bg-card text-[13px] leading-normal">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-border border-b px-4 py-3">
        <p className="font-semibold text-sm">Suppression list</p>
        <p className={monoLabel}>Newsletters + sequences</p>
      </div>
      <ul>
        {suppressionEvents.map((entry) => (
          <li
            key={entry.address}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-border-subtle border-b px-4 py-3"
          >
            <span className={cn(monoLabel, "w-10 shrink-0 tabular-nums")}>
              {entry.time}
            </span>
            <div className="min-w-0 flex-1 basis-44">
              <p className="truncate font-medium">{entry.address}</p>
              <p className="truncate text-muted-foreground text-xs">
                {entry.source}
              </p>
            </div>
            <span className="flex items-center gap-2">
              <StatusBadge tone={entry.tone}>{entry.event}</StatusBadge>
              <ArrowRight
                aria-hidden
                size={14}
                strokeWidth={1.75}
                className="text-muted-foreground"
              />
              <span className="font-medium text-xs">Suppressed</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mk-hatch px-4 py-3 text-muted-foreground text-xs tabular-nums">
        4 addresses added today. 0 sends to suppressed addresses.
      </p>
    </div>
  );
}

function RateLimits() {
  return (
    <ul className="grid border border-border bg-card sm:grid-cols-2 lg:grid-cols-4">
      {limits.map((limit, index) => {
        const percent = (limit.sent / limit.cap) * 100;
        return (
          <li
            key={limit.name}
            className={cn(
              "min-w-0 border-border p-5 md:p-6",
              index > 0 && "border-t sm:border-t-0",
              index % 2 === 1 && "sm:border-l",
              index >= 2 && "sm:border-t lg:border-t-0",
              index === 2 && "lg:border-l",
            )}
          >
            <p className={monoLabel}>{limit.kind}</p>
            <p className="mt-1 truncate font-medium text-sm">{limit.name}</p>
            <p className="mt-6 font-semibold text-3xl tabular-nums tracking-[-0.03em]">
              {limit.sent.toLocaleString("en-US")}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
              of {limit.cap.toLocaleString("en-US")} today
            </p>
            <div className="mt-4 flex">
              <TickProgress percent={percent} />
            </div>
            <p className={cn(monoLabel, "mt-2 tabular-nums")}>
              {(limit.cap - limit.sent).toLocaleString("en-US")} left
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function TrackingDomains() {
  return (
    <div className="border border-border bg-card text-[13px] leading-normal">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-border border-b px-4 py-3">
        <p className="min-w-0">
          <span className={monoLabel}>CNAME </span>
          <code className="break-all font-mono text-xs">
            links.northwind.studio
          </code>
        </p>
        <StatusBadge tone="success">Verified</StatusBadge>
      </div>
      <dl>
        {trackedLinks.map((link) => (
          <div
            key={link.label}
            className="grid gap-x-4 gap-y-1 border-border-subtle border-b px-4 py-3 last:border-b-0 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-center"
          >
            <dt className="font-medium">{link.label}</dt>
            <dd className="min-w-0 overflow-x-auto">
              <code className="whitespace-nowrap font-mono text-muted-foreground text-xs">
                {link.url}
              </code>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export {
  DnsRecords,
  dkimName,
  dkimValue,
  HealthTable,
  RateLimits,
  StatusBadge,
  SuppressionLog,
  TrackingDomains,
  WarmupRamp,
};
