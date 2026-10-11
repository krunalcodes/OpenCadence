import type { HealthDay } from "@workspace/ui/blocks/health-strip";
import { countOf, isRow, type Row, rowsOf, textOrNull } from "@/lib/api";

export type WarmupStatus =
  | "off"
  | "warming"
  | "ready"
  | "paused"
  | "unavailable";

export type PausedReason =
  | "manual"
  | "source_unavailable"
  | "sign_in_failed"
  | "bounces";

export type WarmupSettings = {
  startPerDay: number;
  incrementPerDay: number;
  maxPerDay: number;
  randomize: boolean;
  replyRate: number;
  weekdaysOnly: boolean;
};

export type WarmupDay = {
  day: string;
  sent: number;
  inbox: number;
  spam: number;
};

export type WarmupMailbox = {
  sourceId: string;
  name: string;
  email: string | null;
  integrationType: string;
  capable: boolean;
  enabled: boolean;
  status: WarmupStatus;
  pausedReason: PausedReason | null;
  day: number | null;
  readyAfterDays: number;
  todayTarget: number;
  todaySent: number;
  settings: WarmupSettings;
  identifier: string | null;
  placement: { inbox: number; spam: number; rate: number | null };
  days: WarmupDay[];
  lastError: { code: string; message: string } | null;
};

export type WarmupPool = { mailboxes: number; domains: number };

export type WarmupOverview = { mailboxes: WarmupMailbox[]; pool: WarmupPool };

export type WarmupResult =
  | ({ state: "ready" } & WarmupOverview)
  | { state: "failed" };

export type WarmupUpdate = Partial<WarmupSettings> & {
  enabled?: boolean;
  paused?: boolean;
};

export type NumberSetting =
  | "startPerDay"
  | "incrementPerDay"
  | "maxPerDay"
  | "replyRate";

export const numberSettings: NumberSetting[] = [
  "startPerDay",
  "incrementPerDay",
  "maxPerDay",
  "replyRate",
];

export const settingRanges: Record<
  NumberSetting,
  { min: number; max: number }
> = {
  startPerDay: { min: 1, max: 50 },
  incrementPerDay: { min: 1, max: 5 },
  maxPerDay: { min: 1, max: 50 },
  replyRate: { min: 0, max: 60 },
};

export const defaultReadyAfterDays = 14;
export const minPoolMailboxes = 2;
export const minPoolDomains = 2;
export const smallPoolMailboxes = 20;
export const placementWarningRate = 0.8;
export const placementDangerRate = 0.5;

const statuses: WarmupStatus[] = [
  "off",
  "warming",
  "ready",
  "paused",
  "unavailable",
];

const pausedReasons: PausedReason[] = [
  "manual",
  "source_unavailable",
  "sign_in_failed",
  "bounces",
];

function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toSettings(value: unknown): WarmupSettings {
  const row = isRow(value) ? value : {};
  return {
    startPerDay: numberOr(row.startPerDay, 0),
    incrementPerDay: numberOr(row.incrementPerDay, 0),
    maxPerDay: numberOr(row.maxPerDay, 0),
    randomize: row.randomize === true,
    replyRate: numberOr(row.replyRate, 0),
    weekdaysOnly: row.weekdaysOnly === true,
  };
}

export function toMailbox(value: unknown): WarmupMailbox | null {
  if (!isRow(value)) {
    return null;
  }
  const sourceId = textOrNull(value.sourceId);
  const integrationType = textOrNull(value.integrationType);
  if (!sourceId || !integrationType) {
    return null;
  }
  const email = textOrNull(value.email);
  const placement: Row = isRow(value.placement) ? value.placement : {};
  const lastError = isRow(value.lastError) ? value.lastError : null;
  const capable = value.capable === true;
  return {
    sourceId,
    name: textOrNull(value.name) ?? email ?? integrationType,
    email,
    integrationType,
    capable,
    enabled: value.enabled === true,
    status:
      statuses.find((status) => status === value.status) ??
      (capable ? "off" : "unavailable"),
    pausedReason:
      pausedReasons.find((reason) => reason === value.pausedReason) ?? null,
    day: typeof value.day === "number" ? value.day : null,
    readyAfterDays: numberOr(value.readyAfterDays, defaultReadyAfterDays),
    todayTarget: countOf(value.todayTarget),
    todaySent: countOf(value.todaySent),
    settings: toSettings(value.settings),
    identifier: textOrNull(value.identifier),
    placement: {
      inbox: countOf(placement.inbox),
      spam: countOf(placement.spam),
      rate:
        typeof placement.rate === "number" && Number.isFinite(placement.rate)
          ? placement.rate
          : null,
    },
    days: rowsOf(value.days).map((day) => ({
      day: textOrNull(day.day) ?? "",
      sent: countOf(day.sent),
      inbox: countOf(day.inbox),
      spam: countOf(day.spam),
    })),
    lastError: lastError
      ? {
          code: textOrNull(lastError.code) ?? "",
          message: textOrNull(lastError.message) ?? "",
        }
      : null,
  };
}

export function toOverview(value: unknown): WarmupOverview | null {
  if (!isRow(value) || !Array.isArray(value.mailboxes)) {
    return null;
  }
  const pool: Row = isRow(value.pool) ? value.pool : {};
  return {
    mailboxes: value.mailboxes.flatMap((item) => {
      const mailbox = toMailbox(item);
      return mailbox ? [mailbox] : [];
    }),
    pool: {
      mailboxes: countOf(pool.mailboxes),
      domains: countOf(pool.domains),
    },
  };
}

export function capableFirst(mailboxes: WarmupMailbox[]) {
  return [
    ...mailboxes.filter((mailbox) => mailbox.capable),
    ...mailboxes.filter((mailbox) => !mailbox.capable),
  ];
}

export function healthOf(day: WarmupDay): HealthDay {
  if (day.spam > 0) {
    return "warning";
  }
  return day.sent > 0 ? "healthy" : "none";
}

export type PlacementTone = "normal" | "warning" | "danger";

export function placementTone(rate: number): PlacementTone {
  if (rate < placementDangerRate) {
    return "danger";
  }
  return rate < placementWarningRate ? "warning" : "normal";
}

export function isFirstTurnOn(mailbox: WarmupMailbox) {
  return !mailbox.enabled && mailbox.identifier === null;
}

export function poolTooSmall(pool: WarmupPool) {
  return pool.mailboxes < minPoolMailboxes || pool.domains < minPoolDomains;
}

export function poolIsSmall(pool: WarmupPool) {
  return pool.mailboxes < smallPoolMailboxes;
}

export function parseSetting(id: NumberSetting, raw: string) {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const value = Number(text);
  const range = settingRanges[id];
  return value >= range.min && value <= range.max ? value : null;
}

export function rampDay(start: number, increment: number, max: number) {
  if (start >= max) {
    return 1;
  }
  return Math.ceil((max - start) / increment) + 1;
}
