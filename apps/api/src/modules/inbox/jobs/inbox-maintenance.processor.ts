import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import {
  INBOX_MAINTENANCE_QUEUE,
  inboxJobs,
  retentionEveryMs,
} from "../inbox.constants";
import { InboxRetention } from "../inbox-retention";

@Processor(INBOX_MAINTENANCE_QUEUE)
export class InboxMaintenanceProcessor
  extends WorkerHost
  implements OnModuleInit
{
  constructor(
    @InjectQueue(INBOX_MAINTENANCE_QUEUE) private readonly queue: Queue,
    @Inject(InboxRetention) private readonly retention: InboxRetention,
  ) {
    super();
  }

  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      inboxJobs.retention,
      { every: retentionEveryMs },
      { name: inboxJobs.retention, opts: { attempts: 1 } },
    );
  }

  process() {
    return this.retention.run();
  }
}
