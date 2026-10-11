export const SEND_QUEUE = "dispatch-send";
export const DISPATCH_MAINTENANCE_QUEUE = "dispatch-maintenance";
export const CAMPAIGN_OUTCOMES_QUEUE = "campaign-outcomes";
export const SEQUENCE_OUTCOMES_QUEUE = "sequence-outcomes";

export type SendJob = {
  messageId: string;
  createdAt: string;
  kind?: string;
  sourceId?: string;
  integrationType?: string;
};

export function isBulkKind(kind: string | undefined) {
  return kind === "campaign" || kind === "sequence";
}

export const messageEventTypes = [
  "sent",
  "delivered",
  "delayed",
  "bounced",
  "complained",
  "failed",
  "opened",
  "clicked",
  "replied",
  "unsubscribed",
] as const;

export type MessageEventType = (typeof messageEventTypes)[number];

export type MessageOutcomeJob = {
  workspaceId: string;
  messageId: string;
  type: MessageEventType;
  first: boolean;
  occurredAt: string;
  contactId: string | null;
  campaignId: string | null;
  sequenceId: string | null;
  sequenceStepId: string | null;
  enrollmentId: string | null;
  email: string;
  url: string | null;
};

export const sendJobOptions = {
  attempts: 6,
  backoff: { type: "exponential" as const, delay: 15_000 },
};

export const outcomeJobOptions = {
  attempts: 8,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: { age: 60 * 60, count: 10_000 },
};

export function outcomeJobId(
  messageId: string,
  type: MessageEventType,
  eventId: string,
) {
  return `${messageId}_${type}_${eventId}`;
}

export const maxBatchRecipients = 500;
export const unsubscribeMarkerHeader = "x-opencadence-unsubscribe";

export const contentRetentionDays = 90;
export const messageRetentionMonths = 12;
export const idempotencyRetentionHours = 24;

const sendsPerSecond: Record<string, number> = { gmail: 1, resend: 8 };

export function sendsPerSecondFor(integrationType: string) {
  return sendsPerSecond[integrationType] ?? 5;
}

export function contentArchiveKey(
  workspaceId: string,
  messageId: string,
  createdAt: Date,
) {
  const year = createdAt.getUTCFullYear();
  const month = String(createdAt.getUTCMonth() + 1).padStart(2, "0");
  return `message-contents/${workspaceId}/${year}/${month}/${messageId}.json.gz`;
}
