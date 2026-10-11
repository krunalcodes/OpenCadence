import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, type OnModuleInit } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import {
  FORMS_MAINTENANCE_QUEUE,
  pendingRetentionDays,
} from "../forms.constants";
import { FormsRepository } from "../forms.repository";

const purgePending = "purge-pending";
const dayMs = 24 * 60 * 60 * 1000;
const batchSize = 1000;

@Processor(FORMS_MAINTENANCE_QUEUE)
export class FormsMaintenanceProcessor
  extends WorkerHost
  implements OnModuleInit
{
  constructor(
    @InjectQueue(FORMS_MAINTENANCE_QUEUE) private readonly queue: Queue,
    @Inject(FormsRepository) private readonly repository: FormsRepository,
  ) {
    super();
  }

  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      purgePending,
      { every: dayMs },
      { name: purgePending, opts: { attempts: 1 } },
    );
  }

  async process(job: Job) {
    if (job.name === purgePending) {
      return this.purgePending();
    }
    return null;
  }

  async purgePending(now = new Date()) {
    const before = new Date(now.getTime() - pendingRetentionDays * dayMs);
    let removed = 0;
    for (;;) {
      const count = await this.repository.deletePendingBefore(
        before,
        batchSize,
      );
      removed += count;
      if (count < batchSize) {
        return { removed };
      }
    }
  }
}
