import type { CadenceEventState } from "@workspace/ui/blocks/cadence-timeline";
import type { BadgeTone } from "@/components/status-badge";
import {
  type AlertCode,
  atDailyLimit,
  type DayPart,
  type LaneLabels,
  type MailboxStatus,
  type OverviewAlert,
  type OverviewMailbox,
  type OverviewRangeId,
  type OverviewSend,
  type OverviewSetup,
  type SendStatus,
} from "@/features/overview/lib/overview";

const countFormat = new Intl.NumberFormat("en-US");
const rateFormat = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const changeFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

export function formatCount(value: number) {
  return countFormat.format(value);
}

export function formatRate(value: number | null) {
  return value === null ? copy.none : rateFormat.format(value);
}

function plural(count: number, one: string, many: string) {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

const greetings: Record<DayPart, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};

const comparisons: Record<OverviewRangeId, string> = {
  "24h": "vs. previous 24 hours",
  "7d": "vs. previous 7 days",
  "30d": "vs. previous 30 days",
  "90d": "vs. previous 90 days",
};

const periods: Record<OverviewRangeId, string> = {
  "24h": "the last 24 hours",
  "7d": "the last 7 days",
  "30d": "the last 30 days",
  "90d": "the last 90 days",
};

export const rangeLabels: Record<OverviewRangeId, string> = {
  "24h": "24h",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

export const sendStatusTones: Record<SendStatus, BadgeTone> = {
  scheduled: "warning",
  sending: "live",
  paused: "danger",
  sent: "success",
  failed: "danger",
  active: "live",
};

const sendStatusLabels: Record<SendStatus, string> = {
  scheduled: "Scheduled",
  sending: "Sending",
  paused: "Paused",
  sent: "Sent",
  failed: "Failed",
  active: "Running",
};

const mailboxStatusTones: Record<MailboxStatus, BadgeTone> = {
  active: "success",
  paused: "warning",
  needs_attention: "danger",
};

const mailboxStatusLabels: Record<MailboxStatus, string> = {
  active: "Healthy",
  paused: "Paused",
  needs_attention: "Needs attention",
};

const alertTitles: Record<AlertCode, (alert: OverviewAlert) => string> = {
  domain_failing: (alert) =>
    `${alert.name ?? "A sending domain"} is failing its DNS checks.`,
  source_needs_attention: (alert) =>
    `${alert.name ?? "A source"} needs attention.`,
  source_paused: (alert) => `${alert.name ?? "A source"} is paused.`,
  campaign_failed: (alert) => `${alert.name ?? "A campaign"} failed to send.`,
  bounce_rate_high: (alert) => `Bounce rate is ${formatRate(alert.rate)}.`,
  complaint_rate_high: (alert) =>
    `Spam complaint rate is ${formatRate(alert.rate)}.`,
};

const alertActions: Record<AlertCode, string> = {
  domain_failing: "Fix DNS records",
  source_needs_attention: "Fix source",
  source_paused: "Review source",
  campaign_failed: "Open campaign",
  bounce_rate_high: "Review bounces",
  complaint_rate_high: "Review complaints",
};

function alertBody(alert: OverviewAlert, range: OverviewRangeId) {
  const more = (one: string, many: string) =>
    alert.others > 0 ? ` ${plural(alert.others, one, many)}.` : "";
  switch (alert.code) {
    case "domain_failing":
      return `Receivers cannot authenticate mail from it, so it is more likely to land in spam or be rejected.${more("other domain is failing too", "other domains are failing too")}`;
    case "source_needs_attention":
      return `Nothing can go out through it until it is reconnected.${more("other source has the same problem", "other sources have the same problem")}`;
    case "source_paused":
      return `Sends through it wait until it is resumed.${more("other source is paused", "other sources are paused")}`;
    case "campaign_failed":
      return `Open it to see what went wrong.${more("other campaign failed too", "other campaigns failed too")}`;
    case "bounce_rate_high":
      return `That is above 2% over ${periods[range]}. Remove addresses that bounce before the next send.`;
    case "complaint_rate_high":
      return `That is above 0.1% over ${periods[range]}. Send only to people who asked for your email.`;
  }
}

function formatWhen(value: string, timezone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
  const sameDay = dayKey.format(date) === dayKey.format(new Date());
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(sameDay ? {} : { month: "short", day: "numeric" }),
  }).format(date);
}

type SetupStep = {
  id: keyof OverviewSetup;
  title: string;
  body: string;
  action: string;
  path: string;
};

const setupSteps: SetupStep[] = [
  {
    id: "source",
    title: "Connect a sending source",
    body: "A mailbox or an email provider you already use. Every email goes out through it.",
    action: "Connect a source",
    path: "integrations",
  },
  {
    id: "contacts",
    title: "Add contacts",
    body: "Import a CSV file or add people one at a time.",
    action: "Add contacts",
    path: "contacts",
  },
  {
    id: "template",
    title: "Create a template",
    body: "Design the email once and reuse it in campaigns and sequences.",
    action: "Create a template",
    path: "templates",
  },
  {
    id: "campaign",
    title: "Send a campaign",
    body: "Pick the template and who gets it, then send now or schedule it.",
    action: "New campaign",
    path: "campaigns",
  },
];

const legend: { state: CadenceEventState; label: string }[] = [
  { state: "sending", label: "Sending" },
  { state: "sent", label: "Sent" },
  { state: "scheduled", label: "Scheduled" },
];

const lanes: LaneLabels = {
  campaigns: "Campaigns",
  sequences: "Sequences",
  transactional: "Transactional",
  warmup: "Warm-up",
  sequenceBlock: (count) => `${formatCount(count)} sent`,
  transactionalBlock: (count) => `${formatCount(count)} sent by API`,
  warmupBlock: (mailboxes, sent, target) =>
    `${plural(mailboxes, "mailbox", "mailboxes")}, ${formatCount(sent)} of ${formatCount(target)} sent`,
};

export const copy = {
  none: "–",
  title: "Overview",
  greeting: (part: DayPart, firstName: string) =>
    firstName ? `${greetings[part]}, ${firstName}` : greetings[part],
  description: (running: number, scheduled: number) => {
    if (running === 0 && scheduled === 0) {
      return "Nothing is sending right now and nothing is scheduled for today.";
    }
    const runningPart =
      running === 1
        ? "1 send is running"
        : `${formatCount(running)} sends are running`;
    const scheduledPart =
      scheduled === 1
        ? "1 is scheduled"
        : `${formatCount(scheduled)} are scheduled`;
    return `${runningPart} and ${scheduledPart} for today.`;
  },
  rangeLabel: "Date range",
  refreshing: "Loading the new range",
  stats: {
    sent: "Emails sent",
    openRate: "Open rate",
    replyRate: "Reply rate",
    bounceRate: "Bounce rate",
    comparison: (range: OverviewRangeId) => comparisons[range],
    noSends: (range: OverviewRangeId) => `Nothing sent in ${periods[range]}`,
    opens: (count: number) => plural(count, "unique open", "unique opens"),
    noTracking: "No mail with open tracking",
    replies: (count: number) => plural(count, "reply", "replies"),
    noSequences: "No sequence mail sent",
    bounceTarget: "Keep this under 2%",
    bounces: (count: number) => plural(count, "bounce", "bounces"),
    percentChange: (change: number) => `${changeFormat.format(change)}%`,
    pointChange: (change: number) => `${changeFormat.format(change)} pts`,
  },
  alert: {
    title: (alert: OverviewAlert) => alertTitles[alert.code](alert),
    body: alertBody,
    action: (alert: OverviewAlert) => alertActions[alert.code],
  },
  cadence: {
    title: "Today's cadence",
    description: "Everything going out from this workspace, hour by hour",
    empty: "Nothing has gone out today and nothing is scheduled",
    legend,
    lanes,
  },
  sends: {
    title: "Recent sends",
    description: "Campaigns and running sequences, newest first",
    actionLabel: "View all",
    actionPath: "campaigns",
    emptyTitle: "No campaigns or sequences yet.",
    emptyBody:
      "Campaigns you send or schedule and sequences you start show up here.",
    emptyAction: "New campaign",
    sequenceVia: "Its own mailboxes",
    viaFallback: "Not chosen",
    columns: {
      name: "Name",
      via: "Sending via",
      status: "Status",
      progress: "Progress",
      opens: "Opens",
      clicks: "Clicks",
    },
    kind: (send: OverviewSend) =>
      send.kind === "campaign" ? "Campaign" : "Sequence",
    detail: (send: OverviewSend) => {
      if (send.kind === "sequence") {
        return send.steps === null
          ? "Sequence"
          : `Sequence, ${plural(send.steps, "step", "steps")}`;
      }
      return send.detail ?? "Campaign";
    },
    status: (send: OverviewSend, timezone: string) => {
      const label = sendStatusLabels[send.status];
      const when =
        send.status === "scheduled" && send.scheduledAt
          ? formatWhen(send.scheduledAt, timezone)
          : "";
      return when ? `${label} ${when}` : label;
    },
    progress: (send: OverviewSend) => {
      if (send.total === 0) {
        return copy.none;
      }
      if (send.kind === "sequence") {
        return `${formatCount(send.done)} / ${formatCount(send.total)} done`;
      }
      return send.status === "sent"
        ? formatCount(send.total)
        : `${formatCount(send.done)} / ${formatCount(send.total)}`;
    },
    progressLabel: (send: OverviewSend) =>
      send.kind === "sequence"
        ? `${send.name}: ${formatCount(send.done)} of ${formatCount(send.total)} contacts finished`
        : `${send.name}: ${formatCount(send.done)} of ${formatCount(send.total)} sent`,
  },
  mailboxes: {
    title: "Mailboxes and providers",
    description: (count: number) =>
      count === 0 ? "None connected" : `${formatCount(count)} connected`,
    actionLabel: "Manage",
    actionPath: "integrations",
    healthLabel: "Health over the last 14 days",
    emptyTitle: "No sending source connected.",
    emptyBody: "Connect a mailbox or a provider to start sending.",
    emptyAction: "Connect a source",
    status: (mailbox: OverviewMailbox) =>
      atDailyLimit(mailbox)
        ? "Limit reached"
        : mailboxStatusLabels[mailbox.status],
    tone: (mailbox: OverviewMailbox): BadgeTone =>
      atDailyLimit(mailbox) ? "warning" : mailboxStatusTones[mailbox.status],
    detail: (mailbox: OverviewMailbox) => {
      const sent =
        mailbox.dailySendLimit === null
          ? `${formatCount(mailbox.sentToday)} sent today`
          : `${formatCount(mailbox.sentToday)} of ${formatCount(mailbox.dailySendLimit)} today`;
      return mailbox.email && mailbox.email !== mailbox.name
        ? `${mailbox.email} · ${sent}`
        : sent;
    },
  },
  setup: {
    description: "Four steps to your first send.",
    title: "Get ready to send",
    progress: (done: number, total: number) => `${done} of ${total} done`,
    done: "Done",
    todo: "To do",
    steps: setupSteps,
  },
  failed: {
    title: "The overview could not be loaded.",
    body: "Check your connection and try again.",
    retry: "Try again",
  },
};
