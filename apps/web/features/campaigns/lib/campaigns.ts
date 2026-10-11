import { countOf, isRow, type Row, rowsOf, textOrNull } from "@/lib/api";
import {
  type Audience,
  type AudienceSelection,
  toAudience,
  toAudienceSelection,
} from "@/lib/audience";
import type { SourceChoice, SourceStatus } from "@/lib/sources";

export const campaignStatuses = [
  "draft",
  "scheduled",
  "sending",
  "paused",
  "sent",
  "cancelled",
  "failed",
] as const;

export type CampaignStatus = (typeof campaignStatuses)[number];

export const statKeys = [
  "recipients",
  "skipped",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "failed",
  "opened",
  "clicked",
  "unsubscribed",
] as const;

export type StatKey = (typeof statKeys)[number];

export type CampaignStats = Record<StatKey, number>;

export type CampaignSummary = {
  id: string;
  name: string;
  status: CampaignStatus;
  subject: string;
  audienceLabel: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  stats: CampaignStats;
  createdAt: string;
  updatedAt: string;
};

export type CampaignSource = {
  id: string;
  name: string;
  email: string | null;
  integrationType: string;
  status: SourceStatus;
};

export type CampaignError = { code: string; message: string };

export type Campaign = CampaignSummary & {
  template: { id: string; name: string } | null;
  previewText: string;
  from: { name: string | null; email: string | null };
  replyTo: string | null;
  source: CampaignSource | null;
  audience: Audience | null;
  trackOpens: boolean;
  trackClicks: boolean;
  error: CampaignError | null;
  fanoutDone: boolean;
};

export const problemFields = [
  "template",
  "subject",
  "audience",
  "source",
  "from",
  "brand",
  "schedule",
] as const;

export type ProblemField = (typeof problemFields)[number];

export type CampaignProblem = {
  severity: "error" | "warning";
  field: ProblemField | null;
  code: string;
  message: string;
};

export type CampaignCheck = {
  ready: boolean;
  recipientCount: number | null;
  problems: CampaignProblem[];
};

export const recipientStatuses = [
  "queued",
  "sent",
  "delivered",
  "delayed",
  "bounced",
  "complained",
  "failed",
  "skipped",
] as const;

export type RecipientStatus = (typeof recipientStatuses)[number];

export type CampaignRecipient = {
  id: string;
  contactId: string | null;
  email: string;
  status: RecipientStatus;
  openedAt: string | null;
  clickedAt: string | null;
  unsubscribedAt: string | null;
  error: CampaignError | null;
  sentAt: string | null;
};

export type CampaignsPage = {
  campaigns: CampaignSummary[];
  nextCursor: string | null;
};

export type CampaignsResult =
  | ({ state: "ready" } & CampaignsPage)
  | { state: "failed" };

export type CampaignResult =
  | { state: "ready"; campaign: Campaign }
  | { state: "missing" }
  | { state: "failed" };

export type RecipientsPage = {
  recipients: CampaignRecipient[];
  nextCursor: string | null;
};

export type CampaignFilters = {
  status: CampaignStatus | null;
  search: string;
};

export type CampaignDraft = {
  name: string;
  templateId: string | null;
  subject: string;
  previewText: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  sourceId: string | null;
  audience: Audience | null;
  trackOpens: boolean;
  trackClicks: boolean;
};

export type DraftField = keyof CampaignDraft;

export const draftFields: DraftField[] = [
  "name",
  "templateId",
  "subject",
  "previewText",
  "fromName",
  "fromEmail",
  "replyTo",
  "sourceId",
  "audience",
  "trackOpens",
  "trackClicks",
];

export const campaignPageSize = 30;
export const recipientPageSize = 50;
export const maxSearchLength = 200;
export const maxNameLength = 120;
export const maxSubjectLength = 998;
export const maxPreviewTextLength = 300;
export const maxFromNameLength = 120;

const sourceStatuses: SourceStatus[] = ["active", "paused", "needs_attention"];

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toStats(value: unknown): CampaignStats {
  const row: Row = isRow(value) ? value : {};
  const stats = {} as CampaignStats;
  for (const key of statKeys) {
    stats[key] = countOf(row[key]);
  }
  return stats;
}

function toError(value: unknown): CampaignError | null {
  if (!isRow(value)) {
    return null;
  }
  const code = text(value.code);
  const message = text(value.message);
  return code || message ? { code, message } : null;
}

export function toCampaignStatus(value: unknown): CampaignStatus | null {
  return campaignStatuses.find((status) => status === value) ?? null;
}

export function toRecipientStatus(value: unknown): RecipientStatus | null {
  return recipientStatuses.find((status) => status === value) ?? null;
}

export function toCampaignSummary(value: unknown): CampaignSummary | null {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  const status = toCampaignStatus(value.status);
  if (!id || !status) {
    return null;
  }
  return {
    id,
    name: text(value.name),
    status,
    subject: text(value.subject),
    audienceLabel: textOrNull(value.audienceLabel),
    scheduledAt: textOrNull(value.scheduledAt),
    startedAt: textOrNull(value.startedAt),
    completedAt: textOrNull(value.completedAt),
    stats: toStats(value.stats),
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
  };
}

function toCampaignSource(value: unknown): CampaignSource | null {
  if (!isRow(value)) {
    return null;
  }
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
    status:
      sourceStatuses.find((status) => status === value.status) ?? "active",
  };
}

function toTemplateRef(value: unknown) {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  return id ? { id, name: text(value.name) } : null;
}

export function toCampaign(value: unknown): Campaign | null {
  const summary = toCampaignSummary(value);
  if (!summary || !isRow(value)) {
    return null;
  }
  const from: Row = isRow(value.from) ? value.from : {};
  return {
    ...summary,
    template: toTemplateRef(value.template),
    previewText: text(value.previewText),
    from: { name: textOrNull(from.name), email: textOrNull(from.email) },
    replyTo: textOrNull(value.replyTo),
    source: toCampaignSource(value.source),
    audience: isRow(value.audience)
      ? toAudience(toAudienceSelection(value.audience))
      : null,
    trackOpens: value.trackOpens !== false,
    trackClicks: value.trackClicks !== false,
    error: toError(value.error),
    fanoutDone: value.fanoutDone === true,
  };
}

export function toCampaignsPage(value: unknown): CampaignsPage | null {
  if (!isRow(value) || !Array.isArray(value.items)) {
    return null;
  }
  return {
    campaigns: rowsOf(value.items).flatMap((item) => {
      const campaign = toCampaignSummary(item);
      return campaign ? [campaign] : [];
    }),
    nextCursor: textOrNull(value.nextCursor),
  };
}

function toProblem(value: Row): CampaignProblem | null {
  const message = text(value.message);
  const code = text(value.code);
  if (!message && !code) {
    return null;
  }
  return {
    severity: value.severity === "warning" ? "warning" : "error",
    field: problemFields.find((field) => field === value.field) ?? null,
    code,
    message,
  };
}

export function toCampaignCheck(value: unknown): CampaignCheck | null {
  if (!isRow(value)) {
    return null;
  }
  const problems = rowsOf(value.problems).flatMap((item) => {
    const problem = toProblem(item);
    return problem ? [problem] : [];
  });
  return {
    ready:
      value.ready === true &&
      !problems.some((problem) => problem.severity === "error"),
    recipientCount:
      typeof value.recipientCount === "number"
        ? countOf(value.recipientCount)
        : null,
    problems,
  };
}

export function toRecipient(value: Row): CampaignRecipient | null {
  const id = textOrNull(value.messageId) ?? textOrNull(value.id);
  const email = textOrNull(value.email);
  if (!id || !email) {
    return null;
  }
  return {
    id,
    contactId: textOrNull(value.contactId),
    email,
    status: toRecipientStatus(value.status) ?? "queued",
    openedAt: textOrNull(value.openedAt),
    clickedAt: textOrNull(value.clickedAt),
    unsubscribedAt: textOrNull(value.unsubscribedAt),
    error: toError(value.error),
    sentAt: textOrNull(value.sentAt),
  };
}

export function toRecipientsPage(value: unknown): RecipientsPage | null {
  if (!isRow(value) || !Array.isArray(value.items)) {
    return null;
  }
  return {
    recipients: rowsOf(value.items).flatMap((item) => {
      const recipient = toRecipient(item);
      return recipient ? [recipient] : [];
    }),
    nextCursor: textOrNull(value.nextCursor),
  };
}

export function toSearchFilter(value: string | null) {
  return (value ?? "").trim().slice(0, maxSearchLength);
}

export function campaignsQuery(
  filters: CampaignFilters,
  cursor?: string | null,
) {
  const params = new URLSearchParams();
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.search) {
    params.set("search", filters.search);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  params.set("limit", String(campaignPageSize));
  return params.toString();
}

export function filtersSearch(filters: CampaignFilters) {
  const params = new URLSearchParams();
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.search) {
    params.set("search", filters.search);
  }
  return params.toString();
}

export function recipientsQuery(
  status: RecipientStatus | null,
  cursor?: string | null,
) {
  const params = new URLSearchParams();
  if (status) {
    params.set("status", status);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  params.set("limit", String(recipientPageSize));
  return params.toString();
}

export function campaignPath(id: string) {
  return `campaigns/${encodeURIComponent(id)}`;
}

export function isFinal(status: CampaignStatus) {
  return status === "sent" || status === "cancelled" || status === "failed";
}

export function refreshInterval(status: CampaignStatus) {
  if (status === "sending") {
    return 5000;
  }
  return status === "scheduled" || status === "paused" ? 15000 : null;
}

export function rateOf(part: number, stats: CampaignStats) {
  const base = stats.delivered > 0 ? stats.delivered : stats.sent;
  return base > 0 ? Math.min(part / base, 1) : null;
}

export function progressOf(stats: CampaignStats) {
  const total = Math.max(stats.recipients - stats.skipped, 0);
  return {
    total,
    sent: Math.min(stats.sent, total),
    handled: Math.min(stats.sent + stats.failed, total),
  };
}

export function draftOf(campaign: Campaign): CampaignDraft {
  return {
    name: campaign.name,
    templateId: campaign.template?.id ?? null,
    subject: campaign.subject,
    previewText: campaign.previewText,
    fromName: campaign.from.name ?? "",
    fromEmail: campaign.from.email ?? "",
    replyTo: campaign.replyTo ?? "",
    sourceId: campaign.source?.id ?? null,
    audience: campaign.audience,
    trackOpens: campaign.trackOpens,
    trackClicks: campaign.trackClicks,
  };
}

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function draftPayload(
  draft: CampaignDraft,
): Record<DraftField, unknown> {
  return {
    name: draft.name.trim().replace(/\s+/g, " "),
    templateId: draft.templateId,
    subject: draft.subject.trim(),
    previewText: draft.previewText.trim(),
    fromName: optional(draft.fromName),
    fromEmail: optional(draft.fromEmail),
    replyTo: optional(draft.replyTo),
    sourceId: draft.sourceId,
    audience: draft.audience,
    trackOpens: draft.trackOpens,
    trackClicks: draft.trackClicks,
  };
}

export function changedPayload(
  saved: Record<DraftField, unknown>,
  next: Record<DraftField, unknown>,
  skip: DraftField[],
): Row {
  const changes: Row = {};
  for (const field of draftFields) {
    if (
      !skip.includes(field) &&
      JSON.stringify(saved[field]) !== JSON.stringify(next[field])
    ) {
      changes[field] = next[field];
    }
  }
  return changes;
}

export function selectionOf(audience: Audience | null): AudienceSelection {
  if (!audience) {
    return { type: "lists", listIds: [], segmentId: null };
  }
  return toAudienceSelection(audience);
}

export function effectiveSource(
  sources: SourceChoice[],
  sourceId: string | null,
) {
  return sourceId
    ? (sources.find((source) => source.id === sourceId) ?? null)
    : (sources.find((source) => source.isDefault) ?? null);
}

export function withCampaignSource(
  sources: SourceChoice[],
  chosen: CampaignSource | null,
): SourceChoice[] {
  if (!chosen || sources.some((source) => source.id === chosen.id)) {
    return sources;
  }
  return [...sources, { ...chosen, isDefault: false }];
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string) {
  return value.length <= 320 && emailPattern.test(value);
}

export function previewDocument(html: string) {
  const base = '<base target="_blank" />';
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (head) => `${head}${base}`);
  }
  return `<!doctype html><html><head>${base}<meta charset="utf-8" /></head><body>${html}</body></html>`;
}
