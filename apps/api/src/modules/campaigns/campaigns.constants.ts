import type { Queue } from "bullmq";

export const CAMPAIGN_FANOUT_QUEUE = "campaign-fanout";
export const CAMPAIGN_MAINTENANCE_QUEUE = "campaign-maintenance";

export type CampaignFanoutJob = { workspaceId: string; campaignId: string };

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

export const fanoutPageSize = 500;
export const maxQueuedPerCampaign = 2000;
export const fanoutWaitMs = 15_000;
export const startScheduledEveryMs = 30_000;
export const reconcileEveryMs = 2 * 60_000;
export const reconcileFinishedWithinMs = 24 * 60 * 60_000;
export const reconcileBatchSize = 500;

export const fanoutJobOptions = {
  attempts: 8,
  backoff: { type: "exponential" as const, delay: 10_000 },
  removeOnComplete: true,
  removeOnFail: true,
};

export function fanoutJobId(campaignId: string) {
  return `fanout_${campaignId}`;
}

export function addFanoutJob(
  queue: Queue<CampaignFanoutJob>,
  job: CampaignFanoutJob,
) {
  return queue.add("fanout", job, {
    ...fanoutJobOptions,
    jobId: fanoutJobId(job.campaignId),
  });
}
