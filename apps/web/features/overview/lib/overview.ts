import type {
  CadenceEventState,
  CadenceLane,
} from "@workspace/ui/blocks/cadence-timeline";
import type { HealthDay } from "@workspace/ui/blocks/health-strip";
import { countOf, isRow, type Row, rowsOf, textOrNull } from "@/lib/api";

export const overviewRangeIds = ["24h", "7d", "30d", "90d"] as const;

export type OverviewRangeId = (typeof overviewRangeIds)[number];

export const defaultOverviewRange: OverviewRangeId = "7d";

export const timezoneCookie = "oc_timezone";
export const fallbackTimezone = "UTC";
export const refreshIntervalMs = 60_000;

const timezonePattern = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/;

export function toOverviewRange(value: string | null): OverviewRangeId {
  return (
    overviewRangeIds.find((range) => range === value) ?? defaultOverviewRange
  );
}

export function toTimezone(value: string | null | undefined) {
  return value && value.length <= 64 && timezonePattern.test(value)
    ? value
    : null;
}

export function overviewQuery(range: OverviewRangeId, timezone: string) {
  return new URLSearchParams({ range, timezone }).toString();
}

export type Measure = {
  value: number | null;
  previous: number | null;
  change: number | null;
};

export type OverviewStats = {
  sent: Measure;
  opened: Measure;
  openRate: Measure;
  replied: Measure;
  replyRate: Measure;
  bounced: Measure;
  bounceRate: Measure;
};

export type CampaignBlock = {
  id: string;
  name: string;
  state: "sent" | "sending" | "scheduled";
  startHour: number;
  endHour: number;
};

export type HourBlock = {
  state: "sent" | "sending";
  startHour: number;
  endHour: number;
  count: number;
};

export type SendKind = "campaign" | "sequence";

export type SendStatus =
  | "scheduled"
  | "sending"
  | "paused"
  | "sent"
  | "failed"
  | "active";

export type OverviewSend = {
  id: string;
  kind: SendKind;
  name: string;
  detail: string | null;
  status: SendStatus;
  source: { id: string; name: string; integrationType: string } | null;
  scheduledAt: string | null;
  sent: number;
  done: number;
  total: number;
  steps: number | null;
  openRate: number | null;
  clickRate: number | null;
};

export type MailboxStatus = "active" | "paused" | "needs_attention";

export type OverviewMailbox = {
  id: string;
  name: string;
  email: string | null;
  integrationType: string;
  status: MailboxStatus;
  sentToday: number;
  dailySendLimit: number | null;
  days: HealthDay[];
};

export type AlertCode =
  | "source_needs_attention"
  | "source_paused"
  | "campaign_failed"
  | "bounce_rate_high"
  | "complaint_rate_high";

export type OverviewAlert = {
  code: AlertCode;
  name: string | null;
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

export type Overview = {
  range: OverviewRangeId;
  timezone: string;
  generatedAt: string;
  stats: OverviewStats;
  today: {
    nowHour: number;
    campaigns: CampaignBlock[];
    sequences: HourBlock[];
    transactional: HourBlock[];
  };
  sends: OverviewSend[];
  mailboxes: OverviewMailbox[];
  alert: OverviewAlert | null;
  summary: {
    running: number;
    scheduledToday: number;
    hasSent: boolean;
    setup: OverviewSetup | null;
  };
};

export type OverviewResult =
  | { state: "ready"; overview: Overview }
  | { state: "failed" };

export type OverviewWarmup = {
  active: number;
  todaySent: number;
  todayTarget: number;
};

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toMeasure(value: unknown): Measure {
  const row = isRow(value) ? value : {};
  return {
    value: numberOrNull(row.value),
    previous: numberOrNull(row.previous),
    change: numberOrNull(row.change),
  };
}

function hourOf(value: unknown) {
  return Math.min(Math.max(countOf(value), 0), 24);
}

const blockStates = ["sent", "sending", "scheduled"] as const;
const sendStatuses: SendStatus[] = [
  "scheduled",
  "sending",
  "paused",
  "sent",
  "failed",
  "active",
];
const mailboxStatuses: MailboxStatus[] = [
  "active",
  "paused",
  "needs_attention",
];
const healthValues: HealthDay[] = ["healthy", "warning", "failing", "none"];
const alertCodes: AlertCode[] = [
  "source_needs_attention",
  "source_paused",
  "campaign_failed",
  "bounce_rate_high",
  "complaint_rate_high",
];

function toCampaignBlock(row: Row): CampaignBlock[] {
  const id = textOrNull(row.id);
  const state = blockStates.find((item) => item === row.state);
  return id && state
    ? [
        {
          id,
          name: textOrNull(row.name) ?? "",
          state,
          startHour: hourOf(row.startHour),
          endHour: hourOf(row.endHour),
        },
      ]
    : [];
}

function toHourBlock(row: Row): HourBlock {
  return {
    state: row.state === "sending" ? "sending" : "sent",
    startHour: hourOf(row.startHour),
    endHour: hourOf(row.endHour),
    count: countOf(row.count),
  };
}

function toSend(row: Row): OverviewSend[] {
  const id = textOrNull(row.id);
  const status = sendStatuses.find((item) => item === row.status);
  if (!id || !status) {
    return [];
  }
  const source = isRow(row.source) ? row.source : null;
  const sourceId = source ? textOrNull(source.id) : null;
  return [
    {
      id,
      kind: row.kind === "sequence" ? "sequence" : "campaign",
      name: textOrNull(row.name) ?? "",
      detail: textOrNull(row.detail),
      status,
      source:
        source && sourceId
          ? {
              id: sourceId,
              name: textOrNull(source.name) ?? "",
              integrationType: textOrNull(source.integrationType) ?? "",
            }
          : null,
      scheduledAt: textOrNull(row.scheduledAt),
      sent: countOf(row.sent),
      done: countOf(row.done),
      total: countOf(row.total),
      steps: numberOrNull(row.steps),
      openRate: numberOrNull(row.openRate),
      clickRate: numberOrNull(row.clickRate),
    },
  ];
}

function toMailbox(row: Row): OverviewMailbox[] {
  const id = textOrNull(row.id);
  if (!id) {
    return [];
  }
  const email = textOrNull(row.email);
  return [
    {
      id,
      name: textOrNull(row.name) ?? email ?? "",
      email,
      integrationType: textOrNull(row.integrationType) ?? "",
      status: mailboxStatuses.find((item) => item === row.status) ?? "active",
      sentToday: countOf(row.sentToday),
      dailySendLimit: numberOrNull(row.dailySendLimit),
      days: rowsOf(row.health).map(
        (day) => healthValues.find((item) => item === day.health) ?? "none",
      ),
    },
  ];
}

function toAlert(value: unknown): OverviewAlert | null {
  if (!isRow(value)) {
    return null;
  }
  const code = alertCodes.find((item) => item === value.code);
  const path = textOrNull(value.path);
  if (!code || !path) {
    return null;
  }
  return {
    code,
    name: isRow(value.entity) ? textOrNull(value.entity.name) : null,
    others: countOf(value.others),
    rate: numberOrNull(value.rate),
    path,
  };
}

function toSetup(value: unknown): OverviewSetup | null {
  return isRow(value)
    ? {
        source: value.source === true,
        contacts: value.contacts === true,
        template: value.template === true,
        campaign: value.campaign === true,
      }
    : null;
}

export function toOverview(value: unknown): Overview | null {
  if (!isRow(value) || !isRow(value.stats) || !isRow(value.today)) {
    return null;
  }
  const range = overviewRangeIds.find((item) => item === value.range);
  const summary = isRow(value.summary) ? value.summary : null;
  if (!range || !summary) {
    return null;
  }
  const { stats, today } = value;
  return {
    range,
    timezone: textOrNull(value.timezone) ?? fallbackTimezone,
    generatedAt: textOrNull(value.generatedAt) ?? "",
    stats: {
      sent: toMeasure(stats.sent),
      opened: toMeasure(stats.opened),
      openRate: toMeasure(stats.openRate),
      replied: toMeasure(stats.replied),
      replyRate: toMeasure(stats.replyRate),
      bounced: toMeasure(stats.bounced),
      bounceRate: toMeasure(stats.bounceRate),
    },
    today: {
      nowHour: hourOf(today.nowHour),
      campaigns: rowsOf(today.campaigns).flatMap(toCampaignBlock),
      sequences: rowsOf(today.sequences).map(toHourBlock),
      transactional: rowsOf(today.transactional).map(toHourBlock),
    },
    sends: rowsOf(value.sends).flatMap(toSend),
    mailboxes: rowsOf(value.mailboxes).flatMap(toMailbox),
    alert: toAlert(value.alert),
    summary: {
      running: countOf(summary.running),
      scheduledToday: countOf(summary.scheduledToday),
      hasSent: summary.hasSent === true,
      setup: toSetup(summary.setup),
    },
  };
}

export const defaultStartHour = 6;
export const defaultEndHour = 22;
const warmupEndHour = 20;

export type LaneLabels = {
  campaigns: string;
  sequences: string;
  transactional: string;
  warmup: string;
  sequenceBlock: (count: number) => string;
  transactionalBlock: (count: number) => string;
  warmupBlock: (mailboxes: number, sent: number, target: number) => string;
};

export function timelineWindow(today: Overview["today"]) {
  const blocks = [
    ...today.campaigns,
    ...today.sequences,
    ...today.transactional,
  ];
  const starts = blocks.map((block) => block.startHour);
  const ends = blocks.map((block) => block.endHour);
  return {
    startHour: Math.max(
      Math.floor(Math.min(defaultStartHour, today.nowHour, ...starts)),
      0,
    ),
    endHour: Math.min(
      Math.ceil(Math.max(defaultEndHour, today.nowHour, ...ends)),
      24,
    ),
  };
}

export function cadenceLanes(
  today: Overview["today"],
  warmup: OverviewWarmup | null,
  labels: LaneLabels,
): CadenceLane[] {
  const { startHour } = timelineWindow(today);
  const hourEvents = (
    id: string,
    blocks: HourBlock[],
    label: (count: number) => string,
  ) =>
    blocks.map((block) => ({
      id: `${id}-${block.startHour}`,
      label: label(block.count),
      start: block.startHour,
      end: block.endHour,
      state: block.state as CadenceEventState,
    }));
  return [
    {
      id: "campaigns",
      label: labels.campaigns,
      events: today.campaigns.map((block) => ({
        id: block.id,
        label: block.name,
        start: block.startHour,
        end: block.endHour,
        state: block.state,
      })),
    },
    {
      id: "sequences",
      label: labels.sequences,
      events: hourEvents("sequences", today.sequences, labels.sequenceBlock),
    },
    {
      id: "transactional",
      label: labels.transactional,
      events: hourEvents(
        "transactional",
        today.transactional,
        labels.transactionalBlock,
      ),
    },
    {
      id: "warm-up",
      label: labels.warmup,
      events:
        warmup && warmup.active > 0
          ? [
              {
                id: "warm-up-mailboxes",
                label: labels.warmupBlock(
                  warmup.active,
                  warmup.todaySent,
                  warmup.todayTarget,
                ),
                start: startHour,
                end: Math.max(warmupEndHour, startHour + 1),
                state: "warmup" as const,
              },
            ]
          : [],
    },
  ];
}

export function hasCadence(lanes: CadenceLane[]) {
  return lanes.some((lane) => lane.events.length > 0);
}

export type DayPart = "morning" | "afternoon" | "evening";

export function dayPart(nowHour: number): DayPart {
  if (nowHour >= 5 && nowHour < 12) {
    return "morning";
  }
  return nowHour >= 12 && nowHour < 18 ? "afternoon" : "evening";
}

export type DeltaTone = "good" | "bad" | "flat";

export function deltaTone(change: number, risingIsGood: boolean): DeltaTone {
  if (change === 0) {
    return "flat";
  }
  return change > 0 === risingIsGood ? "good" : "bad";
}

export function sendPath(send: OverviewSend) {
  return `${send.kind === "campaign" ? "campaigns" : "sequences"}/${send.id}`;
}

export function atDailyLimit(mailbox: OverviewMailbox) {
  return (
    mailbox.status === "active" &&
    mailbox.dailySendLimit !== null &&
    mailbox.dailySendLimit > 0 &&
    mailbox.sentToday >= mailbox.dailySendLimit
  );
}
