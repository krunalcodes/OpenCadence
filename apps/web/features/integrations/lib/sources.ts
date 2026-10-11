import type { HealthDay } from "@workspace/ui/blocks/health-strip";

export type SourceStatus = "active" | "paused" | "needs_attention";

export type SourceError = { code: string; message: string; at: string };

export type SourceHealthDay = { day: string; health: HealthDay; sent: number };

export type SendingSource = {
  id: string;
  integrationType: string;
  name: string;
  email: string | null;
  status: SourceStatus;
  isDefault: boolean;
  dailySendLimit: number | null;
  sentToday: number;
  lastError: SourceError | null;
  lastTestedAt: string | null;
  createdAt: string;
  details: {
    permission?: "full" | "sending";
    domains?: { name: string; status: string }[];
    webhook?: WebhookState;
    account?: SourceAccount;
    identities?: SourceIdentity[];
    identitiesTruncated: boolean;
    events?: SourceEvents;
  };
  replyDetection: ReplyDetection;
  health: SourceHealthDay[];
};

export type WebhookState = "registered" | "pending" | "not_registered";

export type ReplyDetection =
  | "on"
  | "off"
  | "not_enabled"
  | "always"
  | "unsupported";

export type SourceAccount = {
  region: string;
  sandbox: boolean;
  sendingEnabled: boolean;
  quota: {
    max24HourSend: number | null;
    maxSendRate: number | null;
    sentLast24Hours: number | null;
  };
  configurationSet: string | null;
};

export type SourceIdentity = {
  name: string;
  type: "email" | "domain";
  verified: boolean;
};

export type SourceEvents = {
  webhookUrl: string | null;
  topicArn: string | null;
  destination: "configured" | "manual" | null;
};

type ProviderFlags = { gmail: boolean; outlook: boolean };

export type Connectable = ProviderFlags;

export type ServerSetup = {
  connectable: ProviderFlags;
  replyDetection: ProviderFlags;
  redirectUris: { gmail: string | null; outlook: string | null };
};

export type SourcesResult =
  | ({ state: "ready"; sources: SendingSource[] } & ServerSetup)
  | { state: "failed" };

export type EventTopicResult = {
  source: SendingSource;
  destination: "configured" | "manual";
  error: { code: string; message: string } | null;
};

export type EventSeverity = "info" | "warning" | "error";

export type SeverityFilter = "all" | "warning" | "error";

export type SourceEvent = {
  id: string;
  createdAt: string;
  sourceId: string;
  sourceName: string;
  integrationType: string;
  severity: EventSeverity;
  type: string;
  code: string | null;
  message: string | null;
};

export type EventsPage = { events: SourceEvent[]; nextCursor: string | null };

export type EventsResult =
  | ({ state: "ready" } & EventsPage)
  | {
      state: "failed";
    };

export type EventFilters = {
  sourceId: string | null;
  severity: SeverityFilter;
};

export const eventPageSize = 50;

export const nearLimitRatio = 0.85;

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rowsOf(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRow) : [];
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value !== "" ? value : null;
}

function countOf(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const statuses: SourceStatus[] = ["active", "paused", "needs_attention"];
const webhookStates: WebhookState[] = [
  "registered",
  "pending",
  "not_registered",
];
const replyStates: ReplyDetection[] = [
  "on",
  "off",
  "not_enabled",
  "always",
  "unsupported",
];

function toAccount(value: unknown): SourceAccount | undefined {
  if (!isRow(value)) {
    return undefined;
  }
  const region = textOrNull(value.region);
  if (!region) {
    return undefined;
  }
  const quota = isRow(value.quota) ? value.quota : {};
  return {
    region,
    sandbox: value.sandbox === true,
    sendingEnabled: value.sendingEnabled === true,
    quota: {
      max24HourSend: numberOrNull(quota.max24HourSend),
      maxSendRate: numberOrNull(quota.maxSendRate),
      sentLast24Hours: numberOrNull(quota.sentLast24Hours),
    },
    configurationSet: textOrNull(value.configurationSet),
  };
}

function toEvents(value: unknown): SourceEvents | undefined {
  if (!isRow(value)) {
    return undefined;
  }
  return {
    webhookUrl: textOrNull(value.webhookUrl),
    topicArn: textOrNull(value.topicArn),
    destination:
      value.destination === "configured" || value.destination === "manual"
        ? value.destination
        : null,
  };
}

function flagsOf(value: unknown): ProviderFlags {
  const row = isRow(value) ? value : {};
  return { gmail: row.gmail === true, outlook: row.outlook === true };
}
const healthDays: HealthDay[] = ["healthy", "warning", "failing", "none"];
const severities: EventSeverity[] = ["info", "warning", "error"];

export function toSource(value: unknown): SendingSource | null {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  const integrationType = textOrNull(value.integrationType);
  if (!id || !integrationType) {
    return null;
  }
  const details = isRow(value.details) ? value.details : {};
  const lastError = isRow(value.lastError) ? value.lastError : null;
  return {
    id,
    integrationType,
    name: textOrNull(value.name) ?? textOrNull(value.email) ?? integrationType,
    email: textOrNull(value.email),
    status: statuses.find((status) => status === value.status) ?? "active",
    isDefault: value.isDefault === true,
    dailySendLimit:
      typeof value.dailySendLimit === "number" ? value.dailySendLimit : null,
    sentToday: countOf(value.sentToday),
    lastError: lastError
      ? {
          code: textOrNull(lastError.code) ?? "",
          message: textOrNull(lastError.message) ?? "",
          at: textOrNull(lastError.at) ?? "",
        }
      : null,
    lastTestedAt: textOrNull(value.lastTestedAt),
    createdAt: textOrNull(value.createdAt) ?? "",
    details: {
      permission:
        details.permission === "full" || details.permission === "sending"
          ? details.permission
          : undefined,
      domains: Array.isArray(details.domains)
        ? rowsOf(details.domains).map((domain) => ({
            name: textOrNull(domain.name) ?? "",
            status: textOrNull(domain.status) ?? "",
          }))
        : undefined,
      webhook: webhookStates.find((state) => state === details.webhook),
      account: toAccount(details.account),
      identities: Array.isArray(details.identities)
        ? rowsOf(details.identities).map((identity) => ({
            name: textOrNull(identity.name) ?? "",
            type: identity.type === "email" ? "email" : "domain",
            verified: identity.verified === true,
          }))
        : undefined,
      identitiesTruncated: details.identitiesTruncated === true,
      events: toEvents(details.events),
    },
    replyDetection:
      replyStates.find((state) => state === value.replyDetection) ??
      "unsupported",
    health: rowsOf(value.health).map((day) => ({
      day: textOrNull(day.day) ?? "",
      health: healthDays.find((health) => health === day.health) ?? "none",
      sent: countOf(day.sent),
    })),
  };
}

export function toSourcesList(
  value: unknown,
): ({ sources: SendingSource[] } & ServerSetup) | null {
  if (!isRow(value) || !Array.isArray(value.sources)) {
    return null;
  }
  const redirectUris = isRow(value.redirectUris) ? value.redirectUris : {};
  return {
    sources: value.sources.flatMap((item) => {
      const source = toSource(item);
      return source ? [source] : [];
    }),
    connectable: flagsOf(value.connectable),
    replyDetection: flagsOf(value.replyDetection),
    redirectUris: {
      gmail: textOrNull(redirectUris.gmail),
      outlook: textOrNull(redirectUris.outlook),
    },
  };
}

function toEvent(value: Row): SourceEvent | null {
  const id = textOrNull(value.id);
  const createdAt = textOrNull(value.createdAt);
  if (!id || !createdAt) {
    return null;
  }
  return {
    id,
    createdAt,
    sourceId: textOrNull(value.sourceId) ?? "",
    sourceName: textOrNull(value.sourceName) ?? "",
    integrationType: textOrNull(value.integrationType) ?? "",
    severity:
      severities.find((severity) => severity === value.severity) ?? "info",
    type: textOrNull(value.type) ?? "",
    code: textOrNull(value.code),
    message: textOrNull(value.message),
  };
}

export function toEventsPage(value: unknown): EventsPage | null {
  if (!isRow(value) || !Array.isArray(value.events)) {
    return null;
  }
  return {
    events: rowsOf(value.events).flatMap((item) => {
      const event = toEvent(item);
      return event ? [event] : [];
    }),
    nextCursor: textOrNull(value.nextCursor),
  };
}

export function eventsQuery(filters: EventFilters, cursor?: string | null) {
  const params = new URLSearchParams();
  if (filters.sourceId) {
    params.set("sourceId", filters.sourceId);
  }
  if (filters.severity !== "all") {
    params.set("severity", filters.severity);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  params.set("limit", String(eventPageSize));
  return params.toString();
}

export function toSeverityFilter(value: string | undefined): SeverityFilter {
  return value === "warning" || value === "error" ? value : "all";
}

export function isNearLimit(source: SendingSource) {
  return (
    source.dailySendLimit !== null &&
    source.dailySendLimit > 0 &&
    source.sentToday / source.dailySendLimit >= nearLimitRatio
  );
}

export function isSignInMailbox(source: SendingSource) {
  return (
    source.integrationType === "gmail" || source.integrationType === "outlook"
  );
}

export function verifiedIdentities(source: SendingSource) {
  return (source.details.identities ?? [])
    .filter((identity) => identity.verified)
    .map((identity) => identity.name);
}

export function toEventTopicResult(value: unknown): EventTopicResult | null {
  if (!isRow(value)) {
    return null;
  }
  const source = toSource(value.source);
  if (!source) {
    return null;
  }
  const error = isRow(value.error) ? value.error : null;
  return {
    source,
    destination: value.destination === "configured" ? "configured" : "manual",
    error: error
      ? {
          code: textOrNull(error.code) ?? "",
          message: textOrNull(error.message) ?? "",
        }
      : null,
  };
}

export function needsReconnect(source: SendingSource) {
  return (
    isSignInMailbox(source) &&
    source.status === "needs_attention" &&
    source.lastError?.code === "auth_revoked"
  );
}
