import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger, type OnModuleInit } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { uuidv7Floor } from "../../../common/uuid";
import { ContentArchive } from "../content-archive";
import {
  contentRetentionDays,
  DISPATCH_MAINTENANCE_QUEUE,
  idempotencyRetentionHours,
  messageRetentionMonths,
  SEND_QUEUE,
  type SendJob,
  sendJobOptions,
} from "../dispatch.constants";
import {
  DispatchRepository,
  type PartitionedTable,
} from "../dispatch.repository";

const maintainPartitions = "maintain-partitions";
const archiveContents = "archive-contents";
const pruneIdempotencyKeys = "prune-idempotency-keys";
const requeueStuck = "requeue-stuck";
const requeueStuckDeep = "requeue-stuck-deep";

const partitionMonthsAhead = 3;
const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
const archiveBatchSize = 200;
const minuteMs = 60 * 1000;
const requeueBatchSize = 500;

export const stuckAfterMs = 5 * minuteMs;
export const stuckWindowMs = hourMs;
export const stuckDeepWindowMs = 7 * dayMs;

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
    @InjectQueue(SEND_QUEUE) private readonly sendQueue: Queue<SendJob>,
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
    await this.queue.upsertJobScheduler(
      requeueStuck,
      { every: stuckAfterMs },
      { name: requeueStuck, opts: { attempts: 1 } },
    );
    await this.queue.upsertJobScheduler(
      requeueStuckDeep,
      { every: dayMs },
      { name: requeueStuckDeep, opts: { attempts: 1 } },
    );
  }

  async process(job: Job) {
    if (job.name === maintainPartitions) {
      return this.maintainPartitions();
    }
    if (job.name === archiveContents) {
      return this.archiveContents();
    }
    if (job.name === requeueStuck) {
      return this.requeueStuck(stuckWindowMs);
    }
    if (job.name === requeueStuckDeep) {
      return this.requeueStuck(stuckDeepWindowMs);
    }
    if (job.name === pruneIdempotencyKeys) {
      await this.repository.deleteIdempotencyKeysBefore(
        new Date(Date.now() - idempotencyRetentionHours * hourMs),
      );
    }
    return null;
  }

  async maintainPartitions() {
    await this.repository.ensurePartitions("messages", partitionMonthsAhead);
    await this.repository.ensurePartitions(
      "message_contents",
      partitionMonthsAhead,
    );
    await this.repository.ensurePartitions(
      "message_events",
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
    for (const table of ["message_events", "messages"] as const) {
      for (const name of await this.repository.listPartitions(table)) {
        const end = partitionEnd(table, name);
        if (end && end <= cutoff) {
          await this.repository.dropPartition(table, name);
          dropped.push(name);
        }
      }
    }
    return { dropped };
  }

  async requeueStuck(windowMs: number, now = new Date()) {
    const to = new Date(now.getTime() - stuckAfterMs);
    const from = new Date(to.getTime() - windowMs);
    const window = {
      from,
      to,
      fromId: uuidv7Floor(from),
      toId: uuidv7Floor(to),
    };
    let after: string | null = null;
    let checked = 0;
    for (;;) {
      const rows = await this.repository.listQueuedBetween(
        window,
        after,
        requeueBatchSize,
      );
      if (rows.length === 0) {
        return { checked };
      }
      await this.sendQueue.addBulk(
        rows.map((row) => ({
          name: "send",
          data: {
            messageId: row.id,
            createdAt: row.createdAt.toISOString(),
          },
          opts: { ...sendJobOptions, jobId: row.id },
        })),
      );
      checked += rows.length;
      after = rows.at(-1)?.id ?? null;
    }
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
            {
              html: row.html,
              text: row.text,
              headers: row.headers ?? {},
              snapshotId: row.snapshot_id,
              variables: row.variables,
            },
          ),
        ),
      );
      count += rows.length;
      after = rows.at(-1)?.message_id ?? null;
    }
  }
}
