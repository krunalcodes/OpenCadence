import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import type { Job } from "bullmq";
import {
  CAMPAIGN_OUTCOMES_QUEUE,
  type MessageOutcomeJob,
} from "../../dispatch/dispatch.constants";
import { CampaignsEngine } from "../campaigns.engine";

@Processor(CAMPAIGN_OUTCOMES_QUEUE, { concurrency: 8 })
export class CampaignOutcomesProcessor extends WorkerHost {
  constructor(
    @Inject(CampaignsEngine) private readonly engine: CampaignsEngine,
  ) {
    super();
  }

  async process(job: Job<MessageOutcomeJob>) {
    await this.engine.applyOutcome(job.data);
    return null;
  }
}
