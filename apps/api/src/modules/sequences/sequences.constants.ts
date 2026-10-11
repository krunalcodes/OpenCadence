import type { Audience } from "../segments/audience.service";

export const SEQUENCE_TICK_QUEUE = "sequence-tick";
export const SEQUENCE_ENROLL_QUEUE = "sequence-enroll";

export const SEQUENCE_CLOCK = Symbol("SEQUENCE_CLOCK");

export type SequenceClock = { now(): Date; random(): number };

export const systemClock: SequenceClock = {
  now: () => new Date(),
  random: Math.random,
};

export type SequenceScope = { workspaceIds?: string[] };

export const sequenceJobs = {
  tick: "tick",
  reconcile: "reconcile",
  enroll: "enroll",
} as const;

export type EnrollJob = {
  workspaceId: string;
  sequenceId: string;
  audience: Audience;
  afterContactId: string | null;
  userId: string | null;
};

export const sequenceStatuses = [
  "draft",
  "active",
  "paused",
  "archived",
] as const;
export type SequenceStatus = (typeof sequenceStatuses)[number];

export const enrollmentStatuses = [
  "active",
  "paused",
  "completed",
  "replied",
  "bounced",
  "unsubscribed",
  "failed",
  "removed",
] as const;
export type EnrollmentStatus = (typeof enrollmentStatuses)[number];

export const openEnrollmentStatuses: EnrollmentStatus[] = ["active", "paused"];
export const endableEnrollmentStatuses: EnrollmentStatus[] = [
  "active",
  "paused",
  "completed",
];

export const secondMs = 1000;
export const minuteMs = 60 * secondMs;
export const hourMs = 60 * minuteMs;
export const dayMs = 24 * hourMs;

export const tickEveryMs = 30 * secondMs;
export const reconcileEveryMs = 5 * minuteMs;

export const maxSteps = 20;
export const maxSources = 50;
export const maxDelayMinutes = 525_600;
export const maxEnrollContactIds = 1000;
export const enrollPageSize = 1000;

export const claimBatchSize = 100;
export const maxClaimBatches = 10;
export const claimLeaseMs = 10 * minuteMs;
export const retryUnusableSourceMs = hourMs;
export const retryAfterErrorMs = 15 * minuteMs;
export const maxOpeningJitterMs = 20 * minuteMs;
export const sourceSpacingMs = 25 * secondMs;
export const shortWindowMinutes = 60;

export const replySourceRecencyMs = 30 * dayMs;

export const reconcilePageSize = 100;
export const maxReconcilePages = 10;
