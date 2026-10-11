import { Badge } from "@workspace/ui/components/badge";
import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import {
  Activity,
  ChevronRight,
  ChevronsUpDown,
  CodeXml,
  Funnel,
  GitBranch,
  Globe,
  Inbox,
  LayoutDashboard,
  type LucideIcon,
  Mail,
  PanelsTopLeft,
  Plug,
  Plus,
  RectangleEllipsis,
  Search,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { links } from "@/features/marketing/lib/links";

type NavItem = {
  icon: LucideIcon;
  label: string;
  count?: string;
  active?: boolean;
};

const navGroups: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { icon: LayoutDashboard, label: "Overview", active: true },
      { icon: Inbox, label: "Inbox", count: "18" },
    ],
  },
  {
    title: "Send",
    items: [
      { icon: Mail, label: "Campaigns", count: "12" },
      { icon: GitBranch, label: "Sequences", count: "5" },
      { icon: CodeXml, label: "Transactional" },
      { icon: PanelsTopLeft, label: "Templates" },
    ],
  },
  {
    title: "Audience",
    items: [
      { icon: Users, label: "Contacts", count: "48,210" },
      { icon: Funnel, label: "Segments" },
      { icon: RectangleEllipsis, label: "Forms" },
    ],
  },
  {
    title: "Sending",
    items: [
      { icon: Activity, label: "Deliverability" },
      { icon: Plug, label: "Integrations", count: "6" },
      { icon: Globe, label: "Domains" },
    ],
  },
];

const stats = [
  {
    label: "Emails sent",
    value: "20,752",
    delta: "+12.4%",
    good: true,
    note: "vs. previous 7 days",
  },
  {
    label: "Open rate",
    value: "46.9%",
    delta: "+2.1 pts",
    good: true,
    note: "9,733 unique opens",
  },
  {
    label: "Reply rate",
    value: "11.3%",
    delta: "+0.8 pts",
    good: true,
    note: "36 replies across 5 sequences",
  },
  {
    label: "Bounce rate",
    value: "1.9%",
    delta: "+0.6 pts",
    good: false,
    note: "Keep this under 2%",
  },
];

const hours = [
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
];

type EventKind = "sent" | "live" | "scheduled" | "warmup";

const lanes: {
  label: string;
  events: { kind: EventKind; left: number; width: number; label: string }[];
}[] = [
  {
    label: "Campaigns",
    events: [
      { kind: "sent", left: 6.25, width: 14.5, label: "Weekly digest" },
      {
        kind: "live",
        left: 21.9,
        width: 26,
        label: "October product update",
      },
      { kind: "scheduled", left: 49.5, width: 15, label: "Webinar invite" },
      { kind: "scheduled", left: 66, width: 11.5, label: "Win-back" },
    ],
  },
  {
    label: "Sequences",
    events: [
      {
        kind: "live",
        left: 18.75,
        width: 37.5,
        label: "Agency founders, step 2",
      },
      {
        kind: "scheduled",
        left: 62.5,
        width: 19,
        label: "Trial ending, step 3",
      },
    ],
  },
  {
    label: "Transactional",
    events: [{ kind: "sent", left: 0, width: 27.7, label: "214 sent by API" }],
  },
  {
    label: "Warm-up",
    events: [
      {
        kind: "warmup",
        left: 0,
        width: 75,
        label: "4 mailboxes, 50 of 84 sent",
      },
    ],
  },
];

const eventStyles: Record<EventKind, string> = {
  sent: "bg-sent-surface text-muted-foreground",
  live: "bg-live text-live-foreground",
  scheduled:
    "border border-ink-tertiary/60 border-dashed bg-card text-muted-foreground",
  warmup: "bg-warmup-surface text-brand-hover",
};

type SendStatus = "live" | "sent" | "scheduled";

const sends: {
  name: string;
  detail: string;
  via: string;
  viaMark: string;
  status: SendStatus;
  statusLabel: string;
  progress: number;
  count: string;
  opens: string;
}[] = [
  {
    name: "October product update",
    detail: "Segment: Active customers",
    via: "Resend",
    viaMark: "R",
    status: "live",
    statusLabel: "Sending",
    progress: 37,
    count: "8,112 / 21,900",
    opens: "41.2%",
  },
  {
    name: "Agency founders, step 2",
    detail: "Follow-up, day 3",
    via: "3 mailboxes",
    viaMark: "3",
    status: "live",
    statusLabel: "Sending",
    progress: 27,
    count: "64 / 240",
    opens: "58.0%",
  },
  {
    name: "Weekly digest",
    detail: "List: Newsletter",
    via: "Amazon SES",
    viaMark: "S",
    status: "sent",
    statusLabel: "Sent",
    progress: 100,
    count: "12,480",
    opens: "52.6%",
  },
  {
    name: "Webinar invite",
    detail: "Segment: Trial users",
    via: "Resend",
    viaMark: "R",
    status: "scheduled",
    statusLabel: "Scheduled 13:30",
    progress: 0,
    count: "0 / 5,300",
    opens: "n/a",
  },
];

const statusStyles: Record<SendStatus, string> = {
  live: "bg-live text-live-foreground",
  sent: "bg-success-surface text-success",
  scheduled: "bg-warning-surface text-warning",
};

const cardShell = "rounded-xl border border-border bg-card shadow-xs";

function LiveDot() {
  return (
    <span className="relative flex size-1.5 shrink-0">
      <span className="absolute inset-0 animate-ping rounded-full bg-live-foreground opacity-60 motion-reduce:hidden" />
      <span className="relative size-1.5 rounded-full bg-live-foreground" />
    </span>
  );
}

function StatusBadge({ status, label }: { status: SendStatus; label: string }) {
  return (
    <Badge
      className={cn(
        "h-[22px] gap-1.5 rounded-md px-2 font-medium text-xs tabular-nums",
        statusStyles[status],
      )}
    >
      {status === "live" ? (
        <LiveDot />
      ) : (
        <span className="size-1.5 shrink-0 rounded-full bg-current" />
      )}
      {label}
    </Badge>
  );
}

function TickProgress({
  value,
  complete,
}: {
  value: number;
  complete?: boolean;
}) {
  const fill = complete ? "var(--success)" : "var(--primary)";
  return (
    <span
      className="block h-3 min-w-16 flex-1"
      style={{
        background: `linear-gradient(90deg, ${fill} ${value}%, var(--border) ${value}%)`,
        maskImage:
          "repeating-linear-gradient(90deg, black 0 3px, transparent 3px 6px)",
        WebkitMaskImage:
          "repeating-linear-gradient(90deg, black 0 3px, transparent 3px 6px)",
      }}
    />
  );
}

function MockButton({
  primary,
  className,
  children,
}: {
  primary?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 font-medium shadow-xs",
        primary
          ? "border-brand-hover bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Sidebar() {
  return (
    <div className="hidden w-[228px] shrink-0 flex-col gap-3.5 border-border border-r bg-sidebar p-2.5 lg:flex">
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-primary text-live">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12h3l3-8 4 16 3-8h5" />
          </svg>
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate font-semibold">Northwind Studio</span>
          <span className="block text-[11.5px] text-ink-tertiary">
            Pro workspace
          </span>
        </span>
        <ChevronsUpDown
          size={16}
          strokeWidth={1.6}
          className="text-ink-tertiary"
        />
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-ink-tertiary shadow-xs">
        <Search size={16} strokeWidth={1.6} />
        Search or jump to
        <span className="ml-auto rounded-[5px] border border-border bg-sidebar px-1.5 text-[11px]">
          ⌘K
        </span>
      </div>

      {navGroups.map((group) => (
        <div key={group.title ?? "main"} className="flex flex-col gap-px">
          {group.title ? (
            <span className="px-2 py-1 font-medium text-[11.5px] text-ink-tertiary">
              {group.title}
            </span>
          ) : null}
          {group.items.map((item) => (
            <span
              key={item.label}
              className={cn(
                "flex items-center gap-2.5 rounded-[7px] px-2 py-1.5 font-medium text-muted-foreground",
                item.active &&
                  "bg-card text-foreground shadow-xs ring-1 ring-border",
              )}
            >
              <item.icon
                size={16}
                strokeWidth={1.6}
                className={cn("shrink-0", item.active && "text-primary")}
              />
              {item.label}
              {item.count ? (
                <span className="ml-auto font-normal text-[11.5px] text-ink-tertiary tabular-nums">
                  {item.count}
                </span>
              ) : null}
            </span>
          ))}
        </div>
      ))}

      <div className="mt-auto rounded-[10px] border border-border bg-card p-3 shadow-xs">
        <span className="block font-semibold">Warm-up in progress</span>
        <span className="mt-0.5 mb-2 block text-muted-foreground text-xs tabular-nums">
          4 mailboxes, day 9 of 14
        </span>
        <span className="block h-[5px] overflow-hidden rounded-full bg-border-subtle">
          <span className="block h-full w-[64%] rounded-full bg-primary" />
        </span>
      </div>
    </div>
  );
}

function StatsRow() {
  return (
    <div className={cn(cardShell, "overflow-hidden")}>
      <div className="-mt-px -ml-px grid grid-cols-2 md:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="border-border-subtle border-t border-l px-4 py-3.5 sm:px-[18px] sm:py-4"
          >
            <span className="block font-medium text-muted-foreground">
              {stat.label}
            </span>
            <span className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-semibold text-[22px] leading-tight tracking-[-0.025em] tabular-nums sm:text-[26px]">
                {stat.value}
              </span>
              <span
                className={cn(
                  "rounded-md px-1.5 py-px font-medium text-xs tabular-nums",
                  stat.good
                    ? "bg-success-surface text-success"
                    : "bg-danger-surface text-danger",
                )}
              >
                {stat.delta}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-ink-tertiary text-xs tabular-nums">
              {stat.note}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CadenceCard() {
  return (
    <div className={cn(cardShell, "overflow-hidden")}>
      <div className="flex items-center gap-3 border-border-subtle border-b px-4 py-3">
        <div className="min-w-0">
          <span className="block font-semibold text-sm tracking-[-0.005em]">
            Today's cadence
          </span>
          <span className="block truncate text-[12.5px] text-ink-tertiary">
            Everything going out from this workspace, hour by hour
          </span>
        </div>
        <div className="ml-auto hidden shrink-0 items-center gap-3.5 text-[12.5px] text-muted-foreground sm:flex">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-xs bg-live" />
            Sending
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-xs bg-sent-surface" />
            Sent
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-xs border border-ink-tertiary border-dashed bg-card" />
            Scheduled
          </span>
        </div>
      </div>

      <div className="overflow-x-auto overscroll-x-contain">
        <div className="min-w-[760px] px-4 pt-7 pb-4">
          <div className="grid grid-cols-[92px_1fr]">
            <span />
            <div className="grid grid-cols-16 font-mono text-[10.5px] text-ink-tertiary tabular-nums">
              {hours.map((hour) => (
                <span
                  key={hour}
                  className="border-border-subtle border-l pb-1.5 pl-1"
                >
                  {hour}
                </span>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -top-1 bottom-0 left-[calc(92px+(100%-92px)*0.277)] z-10 w-[1.5px] bg-primary">
              <span className="absolute -top-[19px] left-1/2 -translate-x-1/2 rounded-[5px] bg-primary px-1.5 py-px font-medium font-mono text-[10.5px] text-primary-foreground tabular-nums">
                10:26
              </span>
            </div>

            {lanes.map((lane) => (
              <div
                key={lane.label}
                className="grid h-[46px] grid-cols-[92px_1fr] items-center border-border-subtle border-t"
              >
                <span className="font-medium text-[12.5px] text-muted-foreground">
                  {lane.label}
                </span>
                <div className="relative h-full">
                  <div className="absolute inset-0 grid grid-cols-16">
                    {hours.map((hour) => (
                      <span
                        key={hour}
                        className="border-border-subtle border-l"
                      />
                    ))}
                  </div>
                  {lane.events.map((event) => (
                    <span
                      key={event.label}
                      className={cn(
                        "absolute top-[9px] flex h-7 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-lg px-2.5 font-medium text-xs tabular-nums",
                        eventStyles[event.kind],
                      )}
                      style={{
                        left: `${event.left}%`,
                        width: `${event.width}%`,
                      }}
                    >
                      {event.kind === "live" ? <LiveDot /> : null}
                      <span className="truncate">{event.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SendsCard() {
  return (
    <div className={cn(cardShell, "hidden overflow-hidden md:block")}>
      <div className="flex items-center gap-3 border-border-subtle border-b px-4 py-3">
        <div className="min-w-0">
          <span className="block font-semibold text-sm tracking-[-0.005em]">
            Today's sends
          </span>
          <span className="block truncate text-[12.5px] text-ink-tertiary">
            Campaigns and sequence steps going out today
          </span>
        </div>
        <MockButton className="ml-auto h-7 px-2.5 text-[12.5px]">
          View all
        </MockButton>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-muted/60 text-left text-ink-tertiary text-xs">
            <th className="border-border-subtle border-b px-4 py-2 font-medium">
              Name
            </th>
            <th className="border-border-subtle border-b px-4 py-2 font-medium">
              Sending via
            </th>
            <th className="border-border-subtle border-b px-4 py-2 font-medium">
              Status
            </th>
            <th className="border-border-subtle border-b px-4 py-2 font-medium">
              Progress
            </th>
            <th className="border-border-subtle border-b px-4 py-2 text-right font-medium">
              Opens
            </th>
          </tr>
        </thead>
        <tbody>
          {sends.map((send) => (
            <tr key={send.name} className="group/row">
              <td className="border-border-subtle border-b px-4 py-2.5 group-last/row:border-b-0">
                <span className="block whitespace-nowrap font-medium">
                  {send.name}
                </span>
                <span className="block whitespace-nowrap text-ink-tertiary text-xs">
                  {send.detail}
                </span>
              </td>
              <td className="border-border-subtle border-b px-4 py-2.5 group-last/row:border-b-0">
                <span className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground tabular-nums">
                  <span className="grid size-4 place-items-center rounded-sm bg-foreground font-semibold text-[9px] text-background">
                    {send.viaMark}
                  </span>
                  {send.via}
                </span>
              </td>
              <td className="border-border-subtle border-b px-4 py-2.5 group-last/row:border-b-0">
                <StatusBadge status={send.status} label={send.statusLabel} />
              </td>
              <td className="border-border-subtle border-b px-4 py-2.5 group-last/row:border-b-0">
                <span className="flex min-w-[170px] items-center gap-2">
                  <TickProgress
                    value={send.progress}
                    complete={send.status === "sent"}
                  />
                  <span className="whitespace-nowrap text-ink-tertiary text-xs tabular-nums">
                    {send.count}
                  </span>
                </span>
              </td>
              <td
                className={cn(
                  "border-border-subtle border-b px-4 py-2.5 text-right tabular-nums group-last/row:border-b-0",
                  send.opens === "n/a" && "text-ink-tertiary text-xs",
                )}
              >
                {send.opens}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverviewScreen() {
  return (
    <div
      aria-hidden="true"
      className="max-md:[mask-image:linear-gradient(180deg,black_84%,transparent)] md:[mask-image:linear-gradient(180deg,black_66%,transparent)] select-none overflow-hidden rounded-2xl border border-border bg-background text-left text-[13px] text-foreground leading-normal md:max-h-[740px]"
    >
      <div className="flex">
        <Sidebar />

        <div className="min-w-0 flex-1">
          <div className="flex h-[52px] items-center gap-2.5 border-border border-b px-4 sm:px-7">
            <span className="truncate text-ink-tertiary">
              Northwind Studio /{" "}
              <span className="font-medium text-foreground">Overview</span>
            </span>
            <span className="flex-1" />
            <MockButton className="hidden md:inline-flex">
              <Upload size={16} strokeWidth={1.6} />
              Import contacts
            </MockButton>
            <MockButton primary>
              <Plus size={16} strokeWidth={1.6} />
              New campaign
            </MockButton>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent font-semibold text-[11px]">
              MR
            </span>
          </div>

          <div className="flex flex-col gap-[18px] px-4 pt-6 pb-6 sm:px-7">
            <div className="flex items-end gap-3">
              <div className="min-w-0">
                <span className="block font-semibold text-2xl leading-tight tracking-[-0.025em]">
                  Good morning, Maya
                </span>
                <span className="mt-0.5 block text-[13.5px] text-muted-foreground tabular-nums">
                  2 sends are running and 3 are scheduled for today.
                </span>
              </div>
              <span className="ml-auto hidden shrink-0 rounded-lg border border-border bg-muted p-0.5 font-medium text-[12.5px] text-muted-foreground tabular-nums sm:inline-flex">
                <span className="rounded-md px-2.5 py-0.5">24h</span>
                <span className="rounded-md bg-card px-2.5 py-0.5 text-foreground shadow-xs">
                  7 days
                </span>
                <span className="rounded-md px-2.5 py-0.5">30 days</span>
                <span className="rounded-md px-2.5 py-0.5">90 days</span>
              </span>
            </div>

            <StatsRow />
            <CadenceCard />
            <SendsCard />
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section
      id="top"
      className="mk-dots relative isolate overflow-x-clip pt-28 pb-10 sm:pt-[140px] md:pb-16"
    >
      <div
        aria-hidden="true"
        className="mk-hero-glow pointer-events-none absolute inset-0 -z-10"
      />

      <div className="mx-auto flex w-full max-w-[1020px] flex-col items-center px-6 text-center">
        <Link
          href="/features/deliverability"
          className="group/chip inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-card py-[5px] pr-2.5 pl-1.5 font-medium text-[13px] shadow-xs outline-none transition-colors hover:border-ink-tertiary/60 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="rounded-full bg-live px-2 py-px text-live-foreground text-xs">
            New
          </span>
          <span className="truncate">Warm-up now ramps per mailbox</span>
          <ChevronRight
            aria-hidden="true"
            size={14}
            strokeWidth={1.75}
            className="shrink-0 text-ink-tertiary transition-transform group-hover/chip:translate-x-0.5 motion-reduce:transition-none"
          />
        </Link>

        <h1 className="mt-6 text-balance font-semibold text-[2.75rem] leading-[1.02] tracking-[-0.045em] sm:text-6xl sm:leading-none lg:text-[5.25rem]">
          Send newsletters and outreach on{" "}
          <span className="text-primary">one cadence.</span>
        </h1>

        <p className="mt-5 max-w-[600px] text-pretty text-lg text-muted-foreground leading-normal md:mt-6 md:text-[19px]">
          OpenCadence runs your campaigns, outreach sequences, transactional
          email and inbox warm-up in one app. Every message goes out through the
          mailboxes and providers you already use.
        </p>

        <div className="mt-7 flex w-full flex-col justify-center gap-2.5 sm:w-auto sm:flex-row md:mt-8">
          <Link
            href={links.signUp}
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-[46px] rounded-full px-[22px] text-[15px] hover:bg-brand-hover",
            )}
          >
            Start for free
          </Link>
          <Link
            href={links.demo}
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-[46px] rounded-full bg-card px-[22px] text-[15px] shadow-xs",
            )}
          >
            Book a demo
          </Link>
        </div>

        <p className="mt-5 text-pretty text-muted-foreground text-sm">
          Bring your own mailboxes and providers. No per-contact pricing.
        </p>
      </div>

      <div className="mx-auto mt-12 w-full max-w-[1228px] px-4 sm:px-6 md:mt-16">
        <p className="sr-only">
          A sample OpenCadence overview screen for the workspace Northwind
          Studio. A timeline called Today's cadence shows the day hour by hour
          in four lanes: campaigns, sequences, transactional email, and warm-up.
          Two sends are going out at 10:26, one finished earlier, and three are
          scheduled for later today. All figures are sample data.
        </p>
        <div className="mk-tilt">
          <OverviewScreen />
        </div>
      </div>
    </section>
  );
}

export { Hero };
