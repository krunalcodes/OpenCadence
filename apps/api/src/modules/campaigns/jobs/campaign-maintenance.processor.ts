import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, type OnModuleInit } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import {
  CAMPAIGN_MAINTENANCE_QUEUE,
  reconcileEveryMs,
  startScheduledEveryMs,
} from "../campaigns.constants";
import { CampaignsEngine } from "../campaigns.engine";

const startScheduled = "start-scheduled";
const reconcile = "reconcile";

@Processor(CAMPAIGN_MAINTENANCE_QUEUE)
export class CampaignMaintenanceProcessor
  extends WorkerHost
  implements OnModuleInit
{
  constructor(
    @InjectQueue(CAMPAIGN_MAINTENANCE_QUEUE) private readonly queue: Queue,
    @Inject(CampaignsEngine) private readonly engine: CampaignsEngine,
  ) {
    super();
  }

  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      startScheduled,
      { every: startScheduledEveryMs },
      { name: startScheduled, opts: { attempts: 1 } },
    );
    await this.queue.upsertJobScheduler(
      reconcile,
      { every: reconcileEveryMs },
      { name: reconcile, opts: { attempts: 1 } },
    );
  }

  async process(job: Job) {
    if (job.name === startScheduled) {
      return { started: await this.engine.startDue() };
    }
    if (job.name === reconcile) {
      return { completed: await this.engine.reconcile() };
    }
    return null;
  }
}
