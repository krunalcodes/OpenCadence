import type { MessageKind } from "../suppression/suppression.service";

export const INBOX_POLL_QUEUE = "inbox-poll";
export const INBOX_MAINTENANCE_QUEUE = "inbox-maintenance";

export const inboxJobs = { poll: "poll", retention: "retention" } as const;

export type PollScope = { workspaceIds?: string[] };

export type PollOptions = {
  concurrency: number;
  sourceBudgetMs: number;
  callTimeoutMs: number;
  maxMessageAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
};

const secondMs = 1000;
const minuteMs = 60 * secondMs;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

export const pollEveryMs = 2 * minuteMs;
export const retentionEveryMs = 6 * hourMs;

export const pollDefaults: PollOptions = {
  concurrency: 5,
  sourceBudgetMs: 90 * secondMs,
  callTimeoutMs: 45 * secondMs,
  maxMessageAttempts: 3,
  backoffBaseMs: 5 * minuteMs,
  backoffMaxMs: 2 * hourMs,
};

export const polledKinds: MessageKind[] = ["campaign", "sequence", "reply"];
export const sourceRecencyMs = 30 * dayMs;
export const pollOverlapMs = 10 * minuteMs;
export const firstLookbackMs = dayMs;
export const pollPageSize = 100;
export const maxPagesPerRun = 10;
export const maxReferencesChecked = 20;
export const failureMemorySeconds = 24 * 60 * 60;
export const attemptMemorySeconds = 3 * 24 * 60 * 60;

export const credentialFailureCodes = [
  "invalid_credentials",
  "auth_revoked",
  "insufficient_permission",
  "blocked_by_policy",
];

export const threadStatuses = ["open", "closed"] as const;
export type ThreadStatus = (typeof threadStatuses)[number];

export const defaultThreadLimit = 30;
export const maxThreadLimit = 100;
export const maxSearchLength = 200;
export const maxThreadMessages = 200;
export const maxReplyTextLength = 100_000;
export const maxReplyHtmlLength = 400_000;
export const maxReferencesSent = 20;

export const retentionBatchSize = 1000;
export const maxRetentionBatches = 50;

export function pollLockKey(sourceId: string) {
  return `opencadence:inbox:poll:lock:${sourceId}`;
}

export function pollFailuresKey(sourceId: string) {
  return `opencadence:inbox:poll:failures:${sourceId}`;
}

export function pollBlockedKey(sourceId: string) {
  return `opencadence:inbox:poll:blocked:${sourceId}`;
}

export function pollAttemptsKey(sourceId: string, messageKey: string) {
  return `opencadence:inbox:poll:attempts:${sourceId}:${messageKey}`;
}
