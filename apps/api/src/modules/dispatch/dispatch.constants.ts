export const SEND_QUEUE = "dispatch-send";
export const DISPATCH_MAINTENANCE_QUEUE = "dispatch-maintenance";

export type SendJob = { messageId: string; createdAt: string };

export const sendJobOptions = {
  attempts: 6,
  backoff: { type: "exponential" as const, delay: 15_000 },
};

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
