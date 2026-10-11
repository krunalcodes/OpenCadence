import { countOf, isRow, type Row, rowsOf, textOrNull } from "@/lib/api";

export type SequenceStatus = "draft" | "active" | "paused" | "archived";

export type SequenceStats = {
  enrolled: number;
  active: number;
  completed: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
  sent: number;
  opened: number;
  clicked: number;
};

export type SequenceSummary = {
  id: string;
  name: string;
  status: SequenceStatus;
  stepCount: number;
  stats: SequenceStats;
  createdAt: string;
  updatedAt: string;
};

export type ThreadMode = "reply" | "new";

export type StepStats = {
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
};

export type StepTemplate = { id: string; name: string };

export type Step = {
  id: string;
  position: number;
  delayMinutes: number;
  template: StepTemplate | null;
  subject: string;
  threadMode: ThreadMode;
  stats: StepStats;
};

export type SequenceSource = {
  id: string;
  name: string;
  email: string | null;
  integrationType: string;
  status: string;
  hasInbox: boolean;
};

export type Point = { x: number; y: number };

export type Layout = Record<string, Point>;

export type Sequence = SequenceSummary & {
  steps: Step[];
  sources: SequenceSource[];
  fromName: string | null;
  fromEmail: string | null;
  trackOpens: boolean;
  trackClicks: boolean;
  stopOnReply: boolean;
  timezone: string;
  sendDays: number[];
  windowStartMinute: number;
  windowEndMinute: number;
  dailyLimitPerSource: number | null;
  layout: Layout | null;
};

export type SequencesPage = {
  sequences: SequenceSummary[];
  nextCursor: string | null;
};

export type SequencesResult =
  | ({ state: "ready" } & SequencesPage)
  | { state: "failed" };

export type SequenceFilters = {
  status: SequenceStatus | null;
  search: string;
};

export type ProblemSeverity = "error" | "warning";

export type Problem = {
  severity: ProblemSeverity;
  field: string;
  code: string;
  message: string;
  stepId: string | null;
};

export type Check = { ready: boolean; problems: Problem[] };

export type SequenceSettings = {
  name: string;
  sourceIds: string[];
  fromName: string | null;
  fromEmail: string | null;
  trackOpens: boolean;
  trackClicks: boolean;
  stopOnReply: boolean;
  timezone: string;
  sendDays: number[];
  windowStartMinute: number;
  windowEndMinute: number;
  dailyLimitPerSource: number | null;
};

export const sequenceStatuses: SequenceStatus[] = [
  "draft",
  "active",
  "paused",
  "archived",
];

export const sequencePageSize = 30;
export const maxSearchLength = 200;
export const maxNameLength = 120;
export const maxFromNameLength = 120;
export const maxFromEmailLength = 254;
export const maxSubjectLength = 998;
export const maxSteps = 20;
export const maxDailyLimit = 10000;

export const emptyStepStats: StepStats = {
  sent: 0,
  opened: 0,
  clicked: 0,
  replied: 0,
  bounced: 0,
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function minuteOf(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1440, Math.max(0, Math.round(value)))
    : fallback;
}

function toStats(value: unknown): SequenceStats {
  const row: Row = isRow(value) ? value : {};
  return {
    enrolled: countOf(row.enrolled),
    active: countOf(row.active),
    completed: countOf(row.completed),
    replied: countOf(row.replied),
    bounced: countOf(row.bounced),
    unsubscribed: countOf(row.unsubscribed),
    sent: countOf(row.sent),
    opened: countOf(row.opened),
    clicked: countOf(row.clicked),
  };
}

function toStepStats(value: unknown): StepStats {
  const row: Row = isRow(value) ? value : {};
  return {
    sent: countOf(row.sent),
    opened: countOf(row.opened),
    clicked: countOf(row.clicked),
    replied: countOf(row.replied),
    bounced: countOf(row.bounced),
  };
}

export function toStatusFilter(value: string | null): SequenceStatus | null {
  return sequenceStatuses.find((status) => status === value) ?? null;
}

export function toSearchFilter(value: string | null) {
  return (value ?? "").trim().slice(0, maxSearchLength);
}

export function toSequenceSummary(value: unknown): SequenceSummary | null {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  const name = textOrNull(value.name);
  if (!id || !name) {
    return null;
  }
  const steps = rowsOf(value.steps);
  return {
    id,
    name,
    status: toStatusFilter(text(value.status)) ?? "draft",
    stepCount:
      typeof value.stepCount === "number"
        ? countOf(value.stepCount)
        : steps.length,
    stats: toStats(value.stats),
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
  };
}

function toStep(value: Row, index: number): Step | null {
  const id = textOrNull(value.id);
  if (!id) {
    return null;
  }
  const template = isRow(value.template) ? value.template : null;
  const templateId = template
    ? textOrNull(template.id)
    : textOrNull(value.templateId);
  return {
    id,
    position:
      typeof value.position === "number" ? countOf(value.position) : index + 1,
    delayMinutes: Math.max(0, Math.round(countOf(value.delayMinutes))),
    template: templateId
      ? {
          id: templateId,
          name: (template ? textOrNull(template.name) : null) ?? "",
        }
      : null,
    subject: text(value.subject),
    threadMode: value.threadMode === "new" ? "new" : "reply",
    stats: toStepStats(value.stats),
  };
}

function toSource(value: Row): SequenceSource | null {
  const id = textOrNull(value.id);
  if (!id) {
    return null;
  }
  const email = textOrNull(value.email);
  const integrationType = text(value.integrationType);
  return {
    id,
    name: textOrNull(value.name) ?? email ?? integrationType,
    email,
    integrationType,
    status: text(value.status) || "active",
    hasInbox: value.hasInbox === true,
  };
}

export function toLayout(value: unknown): Layout | null {
  if (!isRow(value)) {
    return null;
  }
  const layout: Layout = {};
  for (const [key, point] of Object.entries(value)) {
    if (
      isRow(point) &&
      typeof point.x === "number" &&
      typeof point.y === "number" &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y)
    ) {
      layout[key] = { x: point.x, y: point.y };
    }
  }
  return Object.keys(layout).length > 0 ? layout : null;
}

function toSendDays(value: unknown) {
  if (!Array.isArray(value)) {
    return [1, 2, 3, 4, 5];
  }
  const days = value.filter(
    (day): day is number =>
      typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= 7,
  );
  return [...new Set(days)].sort((a, b) => a - b);
}

export function toSequence(value: unknown): Sequence | null {
  const summary = toSequenceSummary(value);
  if (!summary || !isRow(value)) {
    return null;
  }
  const steps = rowsOf(value.steps)
    .flatMap((item, index) => {
      const step = toStep(item, index);
      return step ? [step] : [];
    })
    .sort((a, b) => a.position - b.position);
  return {
    ...summary,
    stepCount: steps.length,
    steps,
    sources: rowsOf(value.sources).flatMap((item) => {
      const source = toSource(item);
      return source ? [source] : [];
    }),
    fromName: textOrNull(value.fromName),
    fromEmail: textOrNull(value.fromEmail),
    trackOpens: value.trackOpens === true,
    trackClicks: value.trackClicks === true,
    stopOnReply: value.stopOnReply !== false,
    timezone: textOrNull(value.timezone) ?? "UTC",
    sendDays: toSendDays(value.sendDays),
    windowStartMinute: minuteOf(value.windowStartMinute, 540),
    windowEndMinute: minuteOf(value.windowEndMinute, 1020),
    dailyLimitPerSource:
      typeof value.dailyLimitPerSource === "number" &&
      value.dailyLimitPerSource > 0
        ? Math.round(value.dailyLimitPerSource)
        : null,
    layout: toLayout(value.layout),
  };
}

export function toSequencesPage(value: unknown): SequencesPage | null {
  if (!isRow(value) || !Array.isArray(value.items)) {
    return null;
  }
  return {
    sequences: rowsOf(value.items).flatMap((item) => {
      const sequence = toSequenceSummary(item);
      return sequence ? [sequence] : [];
    }),
    nextCursor: textOrNull(value.nextCursor),
  };
}

export function toCheck(value: unknown): Check | null {
  if (!isRow(value)) {
    return null;
  }
  const problems = rowsOf(value.problems).map(
    (item): Problem => ({
      severity: item.severity === "warning" ? "warning" : "error",
      field: text(item.field),
      code: text(item.code),
      message: text(item.message),
      stepId: textOrNull(item.stepId),
    }),
  );
  return {
    ready:
      typeof value.ready === "boolean"
        ? value.ready
        : !problems.some((problem) => problem.severity === "error"),
    problems,
  };
}

export function filtersSearch(filters: SequenceFilters) {
  const params = new URLSearchParams();
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.search) {
    params.set("search", filters.search);
  }
  return params.toString();
}

export function sequencesQuery(
  filters: SequenceFilters,
  cursor?: string | null,
) {
  const params = new URLSearchParams(filtersSearch(filters));
  if (cursor) {
    params.set("cursor", cursor);
  }
  params.set("limit", String(sequencePageSize));
  return params.toString();
}

export function sequencePath(id: string) {
  return `sequences/${encodeURIComponent(id)}`;
}

export function replyRate(stats: Pick<SequenceStats, "replied" | "enrolled">) {
  return stats.enrolled > 0 ? stats.replied / stats.enrolled : null;
}

export function cleanName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export const sequenceTabs = ["steps", "contacts", "settings"] as const;

export type SequenceTab = (typeof sequenceTabs)[number];

export function toTab(value: string | null): SequenceTab {
  return sequenceTabs.find((tab) => tab === value) ?? "steps";
}

const emailPattern = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:".]{2,}$/;

export function isEmail(value: string) {
  return value.length <= maxFromEmailLength && emailPattern.test(value);
}
