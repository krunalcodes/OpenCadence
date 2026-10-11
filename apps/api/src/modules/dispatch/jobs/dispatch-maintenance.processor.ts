import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger, type OnModuleInit } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { ContentArchive } from "../content-archive";
import {
  contentRetentionDays,
  DISPATCH_MAINTENANCE_QUEUE,
  idempotencyRetentionHours,
  messageRetentionMonths,
} from "../dispatch.constants";
import {
  DispatchRepository,
  type PartitionedTable,
} from "../dispatch.repository";

const maintainPartitions = "maintain-partitions";
const archiveContents = "archive-contents";
const pruneIdempotencyKeys = "prune-idempotency-keys";

const partitionMonthsAhead = 3;
const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
const archiveBatchSize = 200;

function partitionEnd(table: PartitionedTable, name: string) {
  const match = new RegExp(`^${table}_(\\d{4})_(\\d{2})$`).exec(name);
  return match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]), 1))
    : null;
}

@Processor(DISPATCH_MAINTENANCE_QUEUE)
export class DispatchMaintenanceProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(DispatchMaintenanceProcessor.name);

  constructor(
    @InjectQueue(DISPATCH_MAINTENANCE_QUEUE) private readonly queue: Queue,
    @Inject(DispatchRepository) private readonly repository: DispatchRepository,
    @Inject(ContentArchive) private readonly archive: ContentArchive,
  ) {
    super();
  }

  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      maintainPartitions,
      { every: dayMs },
      { name: maintainPartitions },
    );
    await this.queue.upsertJobScheduler(
      archiveContents,
      { every: dayMs },
      { name: archiveContents, opts: { attempts: 1 } },
    );
    await this.queue.upsertJobScheduler(
      pruneIdempotencyKeys,
      { every: hourMs },
      { name: pruneIdempotencyKeys },
    );
  }

  async process(job: Job) {
    if (job.name === maintainPartitions) {
      return this.maintainPartitions();
    }
    if (job.name === archiveContents) {
      return this.archiveContents();
    }
    if (job.name === pruneIdempotencyKeys) {
      await this.repository.deleteIdempotencyKeysBefore(
        new Date(Date.now() - idempotencyRetentionHours * hourMs),
      );
    }
    return null;
  }

  private async maintainPartitions() {
    await this.repository.ensurePartitions("messages", partitionMonthsAhead);
    await this.repository.ensurePartitions(
      "message_contents",
      partitionMonthsAhead,
    );
    const now = new Date();
    const cutoff = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - messageRetentionMonths,
        1,
      ),
    );
    const dropped: string[] = [];
    for (const name of await this.repository.listPartitions("messages")) {
      const end = partitionEnd("messages", name);
      if (end && end <= cutoff) {
        await this.repository.dropPartition("messages", name);
        dropped.push(name);
      }
    }
    return { dropped };
  }

  async archiveContents() {
    const cutoff = new Date(Date.now() - contentRetentionDays * dayMs);
    const archived: Record<string, number> = {};
    for (const name of await this.repository.listPartitions(
      "message_contents",
    )) {
      const end = partitionEnd("message_contents", name);
      if (!end || end > cutoff) {
        continue;
      }
      archived[name] = await this.archivePartition(name);
      await this.repository.dropPartition("message_contents", name);
      this.logger.log(
        `Archived ${archived[name]} email contents from ${name}.`,
      );
    }
    return { archived };
  }

  private async archivePartition(name: string) {
    let after: string | null = null;
    let count = 0;
    for (;;) {
      const rows = await this.repository.listPartitionContents(
        name,
        after,
        archiveBatchSize,
      );
      if (rows.length === 0) {
        return count;
      }
      await Promise.all(
        rows.map((row) =>
          this.archive.put(
            row.workspace_id,
            row.message_id,
            new Date(row.created_at),
            { html: row.html, text: row.text, headers: row.headers ?? {} },
          ),
        ),
      );
      count += rows.length;
      after = rows.at(-1)?.message_id ?? null;
    }
  }
}
