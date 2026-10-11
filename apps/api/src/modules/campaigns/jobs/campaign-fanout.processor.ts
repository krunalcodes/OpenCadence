import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import { DelayedError, type Job } from "bullmq";
import {
  CAMPAIGN_FANOUT_QUEUE,
  type CampaignFanoutJob,
  fanoutWaitMs,
} from "../campaigns.constants";
import { CampaignsEngine } from "../campaigns.engine";

@Processor(CAMPAIGN_FANOUT_QUEUE, { concurrency: 4 })
export class CampaignFanoutProcessor extends WorkerHost {
  constructor(
    @Inject(CampaignsEngine) private readonly engine: CampaignsEngine,
  ) {
    super();
  }

  async process(job: Job<CampaignFanoutJob>, token?: string) {
    const result = await this.engine.fanOut(
      job.data.workspaceId,
      job.data.campaignId,
    );
    if (result.outcome === "wait") {
      await job.moveToDelayed(Date.now() + fanoutWaitMs, token);
      throw new DelayedError();
    }
    return result;
  }
}
