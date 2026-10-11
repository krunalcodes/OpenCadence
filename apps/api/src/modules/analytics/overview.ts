export const overviewRanges = ["24h", "7d", "30d", "90d"] as const;

export type OverviewRange = (typeof overviewRanges)[number];

export const defaultOverviewRange: OverviewRange = "7d";
export const defaultTimezone = "UTC";

const hourMs = 60 * 60 * 1000;
const minuteMs = 60 * 1000;
const minBlockHours = 0.25;
const scheduledBlockHours = 1;
const unknownProjectionMs = 30 * minuteMs;

const rangeHours: Record<OverviewRange, number> = {
  "24h": 24,
  "7d": 7 * 24,
  "30d": 30 * 24,
  "90d": 90 * 24,
};

export const bounceAlert = { rate: 0.02, minSent: 50 };
export const complaintAlert = { rate: 0.001, minSent: 500 };

export type OverviewMeasure = {
  value: number | null;
  previous: number | null;
  change: number | null;
};

export type OverviewStats = {
  sent: OverviewMeasure;
  opened: OverviewMeasure;
  openRate: OverviewMeasure;
  replied: OverviewMeasure;
  replyRate: OverviewMeasure;
  bounced: OverviewMeasure;
  bounceRate: OverviewMeasure;
  complained: OverviewMeasure;
  complaintRate: OverviewMeasure;
};

export type OverviewTotals = {
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  trackedSent: number;
  trackedDelivered: number;
  opened: number;
  sequenceSent: number;
  sequenceDelivered: number;
  replied: number;
};

export type OverviewBlockState = "sent" | "sending" | "scheduled";

export type OverviewCampaignBlock = {
  id: string;
  name: string;
  state: OverviewBlockState;
  startHour: number;
  endHour: number;
  startsAt: string;
  endsAt: string;
};

export type OverviewHourBlock = {
  state: "sent" | "sending";
  startHour: number;
  endHour: number;
  count: number;
};

export type OverviewSend = {
  id: string;
  kind: "campaign" | "sequence";
  name: string;
  detail: string | null;
  status: string;
  source: { id: string; name: string; integrationType: string } | null;
  scheduledAt: string | null;
  at: string;
  sent: number;
  done: number;
  total: number;
  steps: number | null;
  openRate: number | null;
  clickRate: number | null;
};

export type OverviewMailbox = {
  id: string;
  name: string;
  email: string | null;
  integrationType: string;
  status: "active" | "paused" | "needs_attention";
  sentToday: number;
  dailySendLimit: number | null;
  health: {
    day: string;
    health: "healthy" | "warning" | "failing" | "none";
    sent: number;
  }[];
};

export type OverviewAlertCode =
  | "domain_failing"
  | "source_needs_attention"
  | "source_paused"
  | "campaign_failed"
  | "bounce_rate_high"
  | "complaint_rate_high";

export type OverviewAlert = {
  code: OverviewAlertCode;
  entity: {
    type: "domain" | "source" | "campaign";
    id: string;
    name: string;
  } | null;
  others: number;
  rate: number | null;
  path: string;
};

export type OverviewSetup = {
  source: boolean;
  contacts: boolean;
  template: boolean;
  campaign: boolean;
};

export type OverviewPayload = {
  range: OverviewRange;
  timezone: string;
  generatedAt: string;
  period: { from: string; to: string; previousFrom: string };
  stats: OverviewStats;
  today: {
    date: string;
    nowHour: number;
    campaigns: OverviewCampaignBlock[];
    sequences: OverviewHourBlock[];
    transactional: OverviewHourBlock[];
  };
  sends: OverviewSend[];
  mailboxes: OverviewMailbox[];
  alert: OverviewAlert | null;
  summary: {
    running: number;
    scheduledToday: number;
    hasSent: boolean;
    sequences: "service" | "messages";
    setup: OverviewSetup | null;
  };
};

export type DayWindow = { date: string; start: Date; end: Date };

const timezonePattern = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/;

export function parseRange(value: unknown): OverviewRange | null {
  if (value === undefined || value === null || value === "") {
    return defaultOverviewRange;
  }
  return overviewRanges.find((range) => range === value) ?? null;
}

export function resolveTimezone(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return defaultTimezone;
  }
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !timezonePattern.test(value)
  ) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function rangeWindow(range: OverviewRange, now: Date) {
  const span = rangeHours[range] * hourMs;
  return {
    from: new Date(now.getTime() - span * 2),
    split: new Date(now.getTime() - span),
    to: now,
  };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string) {
  const known = formatters.get(timezone);
  if (known) {
    return known;
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatters.set(timezone, formatter);
  return formatter;
}

export function zonedParts(date: Date, timezone: string) {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timezone).formatToParts(date)) {
    if (part.type !== "literal") {
      parts[part.type] = Number(part.value);
    }
  }
  return {
    year: parts.year ?? 1970,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

function offsetMs(date: Date, timezone: string) {
  const parts = zonedParts(date, timezone);
  const local = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return local - Math.floor(date.getTime() / 1000) * 1000;
}

function zonedMidnight(
  year: number,
  month: number,
  day: number,
  timezone: string,
) {
  const local = Date.UTC(year, month - 1, day);
  const guess = local - offsetMs(new Date(local), timezone);
  return new Date(local - offsetMs(new Date(guess), timezone));
}

export function dayWindow(now: Date, timezone: string): DayWindow {
  const { year, month, day } = zonedParts(now, timezone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    start: zonedMidnight(year, month, day, timezone),
    end: zonedMidnight(year, month, day + 1, timezone),
  };
}

function roundHour(value: number) {
  return Math.round(value * 100) / 100;
}

export function hourOfDay(date: Date, day: DayWindow, timezone: string) {
  if (date.getTime() <= day.start.getTime()) {
    return 0;
  }
  if (date.getTime() >= day.end.getTime()) {
    return 24;
  }
  const parts = zonedParts(date, timezone);
  return roundHour(parts.hour + parts.minute / 60 + parts.second / 3600);
}

export function rateOf(part: number, delivered: number, sent: number) {
  const base = delivered > 0 ? delivered : sent;
  return base > 0 ? Math.min(part / base, 1) : null;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export function countMeasure(value: number, previous: number): OverviewMeasure {
  return {
    value,
    previous,
    change: previous > 0 ? round1(((value - previous) / previous) * 100) : null,
  };
}

export function rateMeasure(
  value: number | null,
  previous: number | null,
): OverviewMeasure {
  return {
    value,
    previous,
    change:
      value === null || previous === null
        ? null
        : round1((value - previous) * 100),
  };
}

export const emptyTotals: OverviewTotals = {
  sent: 0,
  delivered: 0,
  bounced: 0,
  complained: 0,
  trackedSent: 0,
  trackedDelivered: 0,
  opened: 0,
  sequenceSent: 0,
  sequenceDelivered: 0,
  replied: 0,
};

export function ratesOf(totals: OverviewTotals) {
  return {
    open: rateOf(totals.opened, totals.trackedDelivered, totals.trackedSent),
    reply: rateOf(
      totals.replied,
      totals.sequenceDelivered,
      totals.sequenceSent,
    ),
    bounce: totals.sent > 0 ? Math.min(totals.bounced / totals.sent, 1) : null,
    complaint:
      totals.sent > 0 ? Math.min(totals.complained / totals.sent, 1) : null,
  };
}

export function toStats(
  current: OverviewTotals,
  previous: OverviewTotals,
): OverviewStats {
  const now = ratesOf(current);
  const before = ratesOf(previous);
  return {
    sent: countMeasure(current.sent, previous.sent),
    opened: countMeasure(current.opened, previous.opened),
    openRate: rateMeasure(now.open, before.open),
    replied: countMeasure(current.replied, previous.replied),
    replyRate: rateMeasure(now.reply, before.reply),
    bounced: countMeasure(current.bounced, previous.bounced),
    bounceRate: rateMeasure(now.bounce, before.bounce),
    complained: countMeasure(current.complained, previous.complained),
    complaintRate: rateMeasure(now.complaint, before.complaint),
  };
}

export function hourlyCounts(
  rows: { kind: string; hour: number; count: number }[],
  kind: string,
) {
  const counts = Array.from({ length: 24 }, () => 0);
  for (const row of rows) {
    if (row.kind === kind && row.hour >= 0 && row.hour < 24) {
      counts[row.hour] = (counts[row.hour] ?? 0) + row.count;
    }
  }
  return counts;
}

export function hourBlocks(
  counts: number[],
  nowHour: number,
): OverviewHourBlock[] {
  const blocks: OverviewHourBlock[] = [];
  const currentHour = Math.min(Math.floor(nowHour), 23);
  let open: OverviewHourBlock | null = null;
  for (let hour = 0; hour < 24; hour += 1) {
    const count = counts[hour] ?? 0;
    if (count <= 0) {
      open = null;
      continue;
    }
    if (!open) {
      open = { state: "sent", startHour: hour, endHour: hour + 1, count: 0 };
      blocks.push(open);
    }
    open.count += count;
    open.endHour = hour + 1;
    if (hour === currentHour) {
      open.state = "sending";
      open.endHour = roundHour(
        Math.min(Math.max(nowHour, open.startHour + minBlockHours), 24),
      );
    }
  }
  return blocks;
}

export type CampaignTiming = {
  id: string;
  name: string;
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  fanoutDone: boolean;
  stats: { recipients: number; skipped: number; sent: number };
};

export function projectedEnd(campaign: CampaignTiming, now: Date) {
  const started = campaign.startedAt ? new Date(campaign.startedAt) : now;
  const total = Math.max(campaign.stats.recipients - campaign.stats.skipped, 0);
  const sent = Math.min(campaign.stats.sent, total);
  const elapsed = now.getTime() - started.getTime();
  if (!campaign.fanoutDone || sent <= 0 || elapsed <= 0) {
    return new Date(now.getTime() + unknownProjectionMs);
  }
  const remaining = (elapsed * (total - sent)) / sent;
  return new Date(now.getTime() + Math.max(remaining, minuteMs));
}

export function campaignBlock(
  campaign: CampaignTiming,
  day: DayWindow,
  timezone: string,
  now: Date,
): OverviewCampaignBlock | null {
  let state: OverviewBlockState;
  let start: Date;
  let end: Date;
  if (campaign.status === "scheduled" && campaign.scheduledAt) {
    state = "scheduled";
    start = new Date(campaign.scheduledAt);
    end = new Date(start.getTime() + scheduledBlockHours * hourMs);
  } else if (campaign.status === "sending" && campaign.startedAt) {
    state = "sending";
    start = new Date(campaign.startedAt);
    end = projectedEnd(campaign, now);
  } else if (
    campaign.status === "sent" &&
    campaign.startedAt &&
    campaign.completedAt
  ) {
    state = "sent";
    start = new Date(campaign.startedAt);
    end = new Date(campaign.completedAt);
  } else {
    return null;
  }
  const startsToday =
    start.getTime() >= day.start.getTime() &&
    start.getTime() < day.end.getTime();
  const overlaps =
    start.getTime() < day.end.getTime() && end.getTime() > day.start.getTime();
  if (state === "scheduled" ? !startsToday : !overlaps) {
    return null;
  }
  const startHour = Math.min(
    hourOfDay(start, day, timezone),
    24 - minBlockHours,
  );
  const endHour = Math.max(
    hourOfDay(end, day, timezone),
    startHour + minBlockHours,
  );
  return {
    id: campaign.id,
    name: campaign.name,
    state,
    startHour,
    endHour: roundHour(Math.min(endHour, 24)),
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  };
}

export type AlertInput = {
  failingDomains: { id: string; name: string }[];
  sources: { id: string; name: string; status: string }[];
  failedCampaigns: { id: string; name: string }[];
  totals: OverviewTotals;
};

export function pickAlert(input: AlertInput): OverviewAlert | null {
  const [domain, ...otherDomains] = input.failingDomains;
  if (domain) {
    return {
      code: "domain_failing",
      entity: { type: "domain", id: domain.id, name: domain.name },
      others: otherDomains.length,
      rate: null,
      path: "domains",
    };
  }
  const ofStatus = (status: string) =>
    input.sources.filter((source) => source.status === status);
  for (const [status, code] of [
    ["needs_attention", "source_needs_attention"],
    ["paused", "source_paused"],
  ] as const) {
    const [first, ...rest] = ofStatus(status);
    if (first) {
      return {
        code,
        entity: { type: "source", id: first.id, name: first.name },
        others: rest.length,
        rate: null,
        path: "integrations",
      };
    }
  }
  const [failed, ...otherFailed] = input.failedCampaigns;
  if (failed) {
    return {
      code: "campaign_failed",
      entity: { type: "campaign", id: failed.id, name: failed.name },
      others: otherFailed.length,
      rate: null,
      path: `campaigns/${failed.id}`,
    };
  }
  const rates = ratesOf(input.totals);
  if (
    rates.bounce !== null &&
    rates.bounce > bounceAlert.rate &&
    input.totals.sent >= bounceAlert.minSent
  ) {
    return {
      code: "bounce_rate_high",
      entity: null,
      others: 0,
      rate: rates.bounce,
      path: "suppressions",
    };
  }
  if (
    rates.complaint !== null &&
    rates.complaint > complaintAlert.rate &&
    input.totals.sent >= complaintAlert.minSent
  ) {
    return {
      code: "complaint_rate_high",
      entity: null,
      others: 0,
      rate: rates.complaint,
      path: "suppressions",
    };
  }
  return null;
}
