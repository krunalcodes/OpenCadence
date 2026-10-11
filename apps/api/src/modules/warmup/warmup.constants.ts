export const WARMUP_QUEUE = "warmup";

export const WARMUP_RANDOM = Symbol("WARMUP_RANDOM");
export const WARMUP_CONTENT = Symbol("WARMUP_CONTENT");

export const warmupJobs = {
  plan: "plan",
  sendDue: "send-due",
  sync: "sync",
  prune: "prune",
} as const;

export const minuteMs = 60 * 1000;
export const hourMs = 60 * minuteMs;
export const dayMs = 24 * hourMs;

export const planEveryMs = 10 * minuteMs;
export const sendDueEveryMs = minuteMs;
export const syncEveryMs = 5 * minuteMs;
export const pruneEveryMs = dayMs;

export const warmupDefaults = {
  startPerDay: 5,
  incrementPerDay: 2,
  maxPerDay: 30,
  randomize: true,
  replyRate: 30,
  weekdaysOnly: false,
} as const;

export const warmupLimits = {
  startPerDay: { min: 1, max: 50 },
  incrementPerDay: { min: 1, max: 5 },
  maxPerDay: { min: 1, max: 50 },
  replyRate: { min: 0, max: 60 },
} as const;

export const readyAfterDays = 14;
export const restartAfterOffDays = 14;
export const statsDays = 14;
export const randomizeSpread = 5;
export const realSendingCap = 15;
export const planningEndsAtUtcHour = 20;
export const minSendGapMs = 3 * minuteMs;
export const syncMinAgeMs = 2 * minuteMs;
export const syncMaxAgeMs = 48 * hourMs;
export const searchSlackMs = 10 * minuteMs;
export const replyDelayMinMs = 5 * minuteMs;
export const replyDelayMaxMs = 60 * minuteMs;
export const failuresBeforePause = 3;
export const retentionDays = 45;
export const sendBatchSize = 20;
export const maxSendBatchesPerRun = 25;
export const syncBatchSize = 200;
export const pruneBatchSize = 1000;
export const warmupFolderName = "OpenCadence warm-up";

export const quietFailureCodes = [
  "daily_limit_reached",
  "warmup_paused",
  "partner_unavailable",
  "source_paused",
  "source_needs_attention",
  "source_missing",
];

export const signInFailureCodes = [
  "invalid_credentials",
  "auth_revoked",
  "blocked_by_policy",
];

export type WarmupPausedReason =
  | "manual"
  | "source_unavailable"
  | "sign_in_failed"
  | "bounces";

export type WarmupRandom = () => number;

export type WarmupScope = { workspaceIds?: string[] };
