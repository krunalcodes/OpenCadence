import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, type OnModuleInit } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { SendCounter } from "../send-counter";
import { SendingSourcesRepository } from "../sending-sources.repository";

export const MAINTENANCE_QUEUE = "integrations-maintenance";

const flushCounters = "flush-counters";
const maintainPartitions = "maintain-partitions";
const pruneReceipts = "prune-receipts";

const partitionMonthsAhead = 3;
const eventRetentionMonths = 12;
const receiptRetentionDays = 7;
const dayMs = 24 * 60 * 60 * 1000;

function partitionMonth(name: string) {
  const match = /^sending_source_events_(\d{4})_(\d{2})$/.exec(name);
  return match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
    : null;
}

@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue,
    @Inject(SendCounter) private readonly counter: SendCounter,
    @Inject(SendingSourcesRepository)
    private readonly repository: SendingSourcesRepository,
  ) {
    super();
  }

  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      flushCounters,
      { every: 10_000 },
      { name: flushCounters, opts: { removeOnComplete: 20, attempts: 1 } },
    );
    await this.queue.upsertJobScheduler(
      maintainPartitions,
      { every: dayMs },
      { name: maintainPartitions },
    );
    await this.queue.upsertJobScheduler(
      pruneReceipts,
      { every: dayMs },
      { name: pruneReceipts },
    );
  }

  async process(job: Job) {
    if (job.name === flushCounters) {
      return { flushed: await this.counter.flush() };
    }
    if (job.name === maintainPartitions) {
      return this.maintainPartitions();
    }
    if (job.name === pruneReceipts) {
      await this.repository.deleteWebhookReceiptsBefore(
        new Date(Date.now() - receiptRetentionDays * dayMs),
      );
    }
    return null;
  }

  private async maintainPartitions() {
    await this.repository.ensureEventPartitions(partitionMonthsAhead);
    const now = new Date();
    const cutoff = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - eventRetentionMonths,
        1,
      ),
    );
    const dropped: string[] = [];
    for (const name of await this.repository.listEventPartitions()) {
      const month = partitionMonth(name);
      if (month && month < cutoff) {
        await this.repository.dropEventPartition(name);
        dropped.push(name);
      }
    }
    return { dropped };
  }
}
