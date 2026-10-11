import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger, type OnModuleInit } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { uuidv7Floor } from "../../../common/uuid";
import { ContentArchive } from "../content-archive";
import {
  bulkIdempotencyRetentionDays,
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
  hourFloor,
  type PartitionedTable,
} from "../dispatch.repository";

const maintainPartitions = "maintain-partitions";
const archiveContents = "archive-contents";
const pruneIdempotencyKeys = "prune-idempotency-keys";
const requeueStuck = "requeue-stuck";
const requeueStuckDeep = "requeue-stuck-deep";
const reconcileHourlyStats = "reconcile-hourly-stats";
const backfillHourlyStats = "backfill-hourly-stats";

const partitionMonthsAhead = 3;
const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
const archiveBatchSize = 200;
const minuteMs = 60 * 1000;
const requeueBatchSize = 500;
const pruneBatchSize = 1000;
const backfillAttempts = 20;

export const idempotencySweepMs = 2 * dayMs;
export const reconcileWindowMs = 2 * dayMs;
export const reconcileSliceMs = 6 * hourMs;

export type BackfillCursor = { workspaceId: string; from: string };

function retentionStart(now: Date) {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - messageRetentionMonths,
      1,
    ),
  );
}

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
    await this.queue.upsertJobScheduler(
      reconcileHourlyStats,
      { every: hourMs },
      { name: reconcileHourlyStats, opts: { attempts: 1 } },
    );
    await this.queue.add(
      backfillHourlyStats,
      {},
      {
        jobId: backfillHourlyStats,
        attempts: backfillAttempts,
        backoff: { type: "exponential", delay: minuteMs },
        removeOnComplete: false,
        removeOnFail: false,
      },
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
      return this.pruneIdempotencyKeys();
    }
    if (job.name === reconcileHourlyStats) {
      return this.reconcileHourlyStats();
    }
    if (job.name === backfillHourlyStats) {
      return this.backfillHourlyStats(
        (job.data as { cursor?: BackfillCursor }).cursor ?? null,
        (cursor) => job.updateData({ cursor }),
      );
    }
    return null;
  }

  async pruneIdempotencyKeys(now = new Date()) {
    const before = new Date(now.getTime() - idempotencyRetentionHours * hourMs);
    const bulkBefore = new Date(
      now.getTime() - bulkIdempotencyRetentionDays * dayMs,
    );
    const sweepFrom = new Date(
      Math.max(bulkBefore.getTime(), before.getTime() - idempotencySweepMs),
    );
    const expired = await this.pruneKeys({
      from: null,
      before: bulkBefore,
      bulk: true,
    });
    const shortLived = await this.pruneKeys({
      from: sweepFrom,
      before,
      bulk: false,
    });
    return { removed: expired + shortLived };
  }

  private async pruneKeys(scope: {
    from: Date | null;
    before: Date;
    bulk: boolean;
  }) {
    let from = scope.from;
    let removed = 0;
    for (;;) {
      const batch = await this.repository.deleteIdempotencyKeys(
        { ...scope, from },
        pruneBatchSize,
      );
      removed += batch.count;
      if (batch.count < pruneBatchSize) {
        return removed;
      }
      from = batch.last ?? from;
    }
  }

  async reconcileHourlyStats(now = new Date(), workspaceIds?: string[]) {
    const to = new Date(hourFloor(now).getTime() + hourMs);
    const from = new Date(to.getTime() - reconcileWindowMs);
    const workspaces =
      workspaceIds ??
      (await this.repository.listHourlyStatsWorkspaces({ from, to }));
    let corrected = 0;
    let added = 0;
    let failed = 0;
    for (const workspaceId of workspaces) {
      try {
        for (
          let start = from.getTime();
          start < to.getTime();
          start += reconcileSliceMs
        ) {
          const result = await this.repository.reconcileHourlyStats(
            workspaceId,
            {
              from: new Date(start),
              to: new Date(Math.min(start + reconcileSliceMs, to.getTime())),
            },
          );
          corrected += result.corrected;
          added += result.added;
        }
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Hourly totals for workspace ${workspaceId} were not reconciled: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }
    }
    if (corrected + added > 0) {
      this.logger.warn(
        `Corrected ${corrected} and added ${added} hourly totals that had drifted.`,
      );
    }
    return { workspaces: workspaces.length, corrected, added, failed };
  }

  async backfillHourlyStats(
    cursor: BackfillCursor | null = null,
    save: (cursor: BackfillCursor) => Promise<unknown> = async () => undefined,
    now = new Date(),
  ) {
    const start = retentionStart(now);
    let resume = cursor;
    let workspaces = 0;
    let added = 0;
    for (;;) {
      const workspaceId: string | null = resume
        ? resume.workspaceId
        : await this.repository.nextWorkspaceWithMessages(null);
      if (!workspaceId) {
        return { workspaces, added };
      }
      let from = resume ? new Date(resume.from) : start;
      for (;;) {
        const first = await this.repository.firstMessageAt(workspaceId, from);
        if (!first || first > now) {
          break;
        }
        const day = new Date(Math.floor(first.getTime() / dayMs) * dayMs);
        from = new Date(day.getTime() + dayMs);
        const result = await this.repository.reconcileHourlyStats(workspaceId, {
          from: day,
          to: from,
        });
        added += result.added + result.corrected;
        await save({ workspaceId, from: from.toISOString() });
      }
      workspaces += 1;
      const next = await this.repository.nextWorkspaceWithMessages(workspaceId);
      if (!next) {
        return { workspaces, added };
      }
      resume = { workspaceId: next, from: start.toISOString() };
      await save(resume);
    }
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
    const cutoff = retentionStart(new Date());
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
    let hourlyStats = 0;
    for (;;) {
      const removed = await this.repository.deleteHourlyStatsBefore(
        cutoff,
        pruneBatchSize,
      );
      hourlyStats += removed;
      if (removed < pruneBatchSize) {
        return { dropped, hourlyStats };
      }
    }
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
