import { Inject, Injectable } from "@nestjs/common";
import {
  and,
  asc,
  type Db,
  desc,
  eq,
  gte,
  inArray,
  lt,
  schema,
  sql,
} from "@workspace/db";
import { DATABASE } from "../../infra/database/database.module";
import { quietFailureCodes, type WarmupScope } from "./warmup.constants";

const { warmupMailboxes, warmupMessages } = schema;

export type MailboxRow = typeof warmupMailboxes.$inferSelect;
export type NewMailboxRow = typeof warmupMailboxes.$inferInsert;
export type WarmupMessageRow = typeof warmupMessages.$inferSelect;
export type NewWarmupMessageRow = typeof warmupMessages.$inferInsert;

export type DailyCountsRow = {
  sourceId: string;
  day: string;
  sent: number;
  openers: number;
  inbox: number;
  spam: number;
};

type Executor = Pick<Db, "insert" | "update" | "delete" | "select" | "execute">;

const readableWhilePaused = ["manual", "bounces"];

function inWorkspaces(
  column:
    | typeof warmupMailboxes.workspaceId
    | typeof warmupMessages.senderWorkspaceId
    | typeof warmupMessages.recipientWorkspaceId,
  scope?: WarmupScope,
) {
  return scope?.workspaceIds ? inArray(column, scope.workspaceIds) : undefined;
}

@Injectable()
export class WarmupRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  transaction<T>(run: (tx: Executor) => Promise<T>) {
    return this.db.transaction((tx) => run(tx));
  }

  listMailboxes(workspaceId: string) {
    return this.db
      .select()
      .from(warmupMailboxes)
      .where(eq(warmupMailboxes.workspaceId, workspaceId));
  }

  async findMailbox(workspaceId: string, sourceId: string) {
    const [row] = await this.db
      .select()
      .from(warmupMailboxes)
      .where(
        and(
          eq(warmupMailboxes.workspaceId, workspaceId),
          eq(warmupMailboxes.sourceId, sourceId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findMailboxesByIds(sourceIds: string[]) {
    if (sourceIds.length === 0) {
      return [];
    }
    return this.db
      .select()
      .from(warmupMailboxes)
      .where(inArray(warmupMailboxes.sourceId, sourceIds));
  }

  async lockMailbox(sourceId: string, executor: Executor) {
    const [row] = await executor
      .select()
      .from(warmupMailboxes)
      .where(eq(warmupMailboxes.sourceId, sourceId))
      .limit(1)
      .for("update");
    return row ?? null;
  }

  async insertMailboxIfMissing(row: NewMailboxRow) {
    await this.db.insert(warmupMailboxes).values(row).onConflictDoNothing();
  }

  async updateMailbox(
    sourceId: string,
    patch: Partial<NewMailboxRow>,
    executor: Executor = this.db,
  ) {
    const [row] = await executor
      .update(warmupMailboxes)
      .set(patch)
      .where(eq(warmupMailboxes.sourceId, sourceId))
      .returning();
    return row ?? null;
  }

  async pauseMailbox(
    sourceId: string,
    reason: string,
    error: { code: string; message: string } | null,
  ) {
    const [row] = await this.db
      .update(warmupMailboxes)
      .set({
        pausedReason: reason,
        ...(error
          ? {
              lastErrorCode: error.code,
              lastErrorMessage: error.message.slice(0, 2000),
            }
          : {}),
      })
      .where(
        and(
          eq(warmupMailboxes.sourceId, sourceId),
          eq(warmupMailboxes.enabled, true),
          sql`${warmupMailboxes.pausedReason} is null`,
        ),
      )
      .returning({ sourceId: warmupMailboxes.sourceId });
    return Boolean(row);
  }

  listActiveMailboxes(scope?: WarmupScope) {
    return this.db
      .select()
      .from(warmupMailboxes)
      .where(
        and(
          eq(warmupMailboxes.enabled, true),
          sql`${warmupMailboxes.pausedReason} is null`,
          inWorkspaces(warmupMailboxes.workspaceId, scope),
        ),
      )
      .orderBy(asc(warmupMailboxes.sourceId));
  }

  listReadableMailboxes(scope?: WarmupScope) {
    return this.db
      .select()
      .from(warmupMailboxes)
      .where(
        and(
          eq(warmupMailboxes.enabled, true),
          sql`(${warmupMailboxes.pausedReason} is null or ${inArray(warmupMailboxes.pausedReason, readableWhilePaused)})`,
          inWorkspaces(warmupMailboxes.workspaceId, scope),
        ),
      )
      .orderBy(asc(warmupMailboxes.sourceId));
  }

  async poolCounts() {
    const [row] = await this.db
      .select({
        mailboxes: sql<number>`count(*)::int`,
        domains: sql<number>`count(distinct ${warmupMailboxes.domain})::int`,
      })
      .from(warmupMailboxes)
      .where(
        and(
          eq(warmupMailboxes.enabled, true),
          sql`${warmupMailboxes.pausedReason} is null`,
        ),
      );
    return { mailboxes: row?.mailboxes ?? 0, domains: row?.domains ?? 0 };
  }

  async countOpeners(
    senderSourceId: string,
    from: Date,
    to: Date,
    executor: Executor = this.db,
  ) {
    const [row] = await executor
      .select({ count: sql<number>`count(*)::int` })
      .from(warmupMessages)
      .where(
        and(
          eq(warmupMessages.senderSourceId, senderSourceId),
          eq(warmupMessages.kind, "opener"),
          gte(warmupMessages.sendAt, from),
          lt(warmupMessages.sendAt, to),
        ),
      );
    return row?.count ?? 0;
  }

  async countSent(senderSourceId: string, from: Date, to: Date) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(warmupMessages)
      .where(
        and(
          eq(warmupMessages.senderSourceId, senderSourceId),
          gte(warmupMessages.sentAt, from),
          lt(warmupMessages.sentAt, to),
        ),
      );
    return row?.count ?? 0;
  }

  async countFailures(
    senderSourceId: string,
    from: Date,
    to: Date,
    executor: Executor = this.db,
  ) {
    const [row] = await executor
      .select({ count: sql<number>`count(*)::int` })
      .from(warmupMessages)
      .where(
        and(
          eq(warmupMessages.senderSourceId, senderSourceId),
          eq(warmupMessages.status, "failed"),
          sql`coalesce(${warmupMessages.errorCode}, '') not in (${sql.join(
            quietFailureCodes.map((code) => sql`${code}`),
            sql`, `,
          )})`,
          gte(warmupMessages.sendAt, from),
          lt(warmupMessages.sendAt, to),
        ),
      );
    return row?.count ?? 0;
  }

  async countHeldDays(
    senderSourceId: string,
    from: Date,
    to: Date,
    executor: Executor = this.db,
  ) {
    const quiet = sql.join(
      quietFailureCodes.map((code) => sql`${code}`),
      sql`, `,
    );
    const result = await executor.execute<{ count: number }>(sql`
      select count(distinct day)::int as count from (
        select (${warmupMessages.sendAt} at time zone 'UTC')::date as day
        from ${warmupMessages}
        where ${warmupMessages.senderSourceId} = ${senderSourceId}
          and ${warmupMessages.status} = 'failed'
          and coalesce(${warmupMessages.errorCode}, '') not in (${quiet})
          and ${warmupMessages.sendAt} >= ${from.toISOString()}::timestamptz
          and ${warmupMessages.sendAt} < ${to.toISOString()}::timestamptz
        union all
        select (${warmupMessages.receivedAt} at time zone 'UTC')::date as day
        from ${warmupMessages}
        where ${warmupMessages.senderSourceId} = ${senderSourceId}
          and ${warmupMessages.landedIn} = 'spam'
          and ${warmupMessages.receivedAt} >= ${from.toISOString()}::timestamptz
          and ${warmupMessages.receivedAt} < ${to.toISOString()}::timestamptz
      ) as held
    `);
    return Number(result.rows[0]?.count ?? 0);
  }

  async insertMessages(
    rows: NewWarmupMessageRow[],
    executor: Executor = this.db,
  ) {
    if (rows.length > 0) {
      await executor.insert(warmupMessages).values(rows);
    }
  }

  claimDue(now: Date, limit: number, executor: Executor, scope?: WarmupScope) {
    return executor
      .select()
      .from(warmupMessages)
      .where(
        and(
          eq(warmupMessages.status, "scheduled"),
          sql`${warmupMessages.sendAt} <= ${now.toISOString()}::timestamptz`,
          inWorkspaces(warmupMessages.senderWorkspaceId, scope),
        ),
      )
      .orderBy(asc(warmupMessages.sendAt))
      .limit(limit)
      .for("update", { skipLocked: true });
  }

  async updateMessage(
    id: string,
    patch: Partial<NewWarmupMessageRow>,
    expectedStatus: string,
    executor: Executor = this.db,
  ) {
    const [row] = await executor
      .update(warmupMessages)
      .set(patch)
      .where(
        and(
          eq(warmupMessages.id, id),
          eq(warmupMessages.status, expectedStatus),
        ),
      )
      .returning();
    return row ?? null;
  }

  async setRescued(id: string) {
    await this.db
      .update(warmupMessages)
      .set({ rescued: true })
      .where(eq(warmupMessages.id, id));
  }

  deleteScheduled(senderSourceId: string) {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: warmupMessages.id })
        .from(warmupMessages)
        .where(
          and(
            eq(warmupMessages.senderSourceId, senderSourceId),
            eq(warmupMessages.status, "scheduled"),
          ),
        )
        .for("update", { skipLocked: true });
      if (rows.length === 0) {
        return 0;
      }
      await tx.delete(warmupMessages).where(
        inArray(
          warmupMessages.id,
          rows.map((row) => row.id),
        ),
      );
      return rows.length;
    });
  }

  async trimScheduledOpeners(
    senderSourceId: string,
    from: Date,
    to: Date,
    remove: number,
    executor: Executor,
  ) {
    const rows = await executor
      .select({ id: warmupMessages.id })
      .from(warmupMessages)
      .where(
        and(
          eq(warmupMessages.senderSourceId, senderSourceId),
          eq(warmupMessages.kind, "opener"),
          eq(warmupMessages.status, "scheduled"),
          gte(warmupMessages.sendAt, from),
          lt(warmupMessages.sendAt, to),
        ),
      )
      .orderBy(desc(warmupMessages.sendAt))
      .limit(remove)
      .for("update", { skipLocked: true });
    if (rows.length > 0) {
      await executor.delete(warmupMessages).where(
        inArray(
          warmupMessages.id,
          rows.map((row) => row.id),
        ),
      );
    }
    return rows.length;
  }

  failScheduledBefore(senderSourceId: string, before: Date, code: string) {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: warmupMessages.id })
        .from(warmupMessages)
        .where(
          and(
            eq(warmupMessages.senderSourceId, senderSourceId),
            eq(warmupMessages.status, "scheduled"),
            lt(warmupMessages.sendAt, before),
          ),
        )
        .for("update", { skipLocked: true });
      if (rows.length === 0) {
        return 0;
      }
      await tx
        .update(warmupMessages)
        .set({ status: "failed", errorCode: code })
        .where(
          inArray(
            warmupMessages.id,
            rows.map((row) => row.id),
          ),
        );
      return rows.length;
    });
  }

  listPending(recipientSourceId: string, from: Date, to: Date, limit: number) {
    return this.db
      .select()
      .from(warmupMessages)
      .where(
        and(
          eq(warmupMessages.recipientSourceId, recipientSourceId),
          eq(warmupMessages.status, "sent"),
          gte(warmupMessages.sentAt, from),
          sql`${warmupMessages.sentAt} <= ${to.toISOString()}::timestamptz`,
        ),
      )
      .orderBy(asc(warmupMessages.sentAt))
      .limit(limit);
  }

  recordReceived(
    id: string,
    patch: { landedIn: "inbox" | "spam"; receivedAt: Date },
    reply: NewWarmupMessageRow | null,
  ) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(warmupMessages)
        .set({ status: "received", ...patch })
        .where(
          and(eq(warmupMessages.id, id), eq(warmupMessages.status, "sent")),
        )
        .returning({ id: warmupMessages.id });
      if (!row) {
        return false;
      }
      if (reply) {
        await tx.insert(warmupMessages).values(reply);
      }
      return true;
    });
  }

  async markMissing(sentBefore: Date, scope?: WarmupScope) {
    const rows = await this.db
      .update(warmupMessages)
      .set({ status: "missing" })
      .where(
        and(
          eq(warmupMessages.status, "sent"),
          lt(warmupMessages.sentAt, sentBefore),
          inWorkspaces(warmupMessages.recipientWorkspaceId, scope),
        ),
      )
      .returning({ id: warmupMessages.id });
    return rows.length;
  }

  deleteMessagesBefore(createdBefore: Date, limit: number) {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: warmupMessages.id })
        .from(warmupMessages)
        .where(lt(warmupMessages.createdAt, createdBefore))
        .limit(limit)
        .for("update", { skipLocked: true });
      if (rows.length === 0) {
        return 0;
      }
      await tx.delete(warmupMessages).where(
        inArray(
          warmupMessages.id,
          rows.map((row) => row.id),
        ),
      );
      return rows.length;
    });
  }

  async dailyCounts(
    workspaceId: string,
    sourceIds: string[],
    since: Date,
  ): Promise<DailyCountsRow[]> {
    if (sourceIds.length === 0) {
      return [];
    }
    const day = sql<string>`to_char(${warmupMessages.sentAt} at time zone 'UTC', 'YYYY-MM-DD')`;
    return this.db
      .select({
        sourceId: warmupMessages.senderSourceId,
        day,
        sent: sql<number>`count(*)::int`,
        openers: sql<number>`(count(*) filter (where ${warmupMessages.kind} = 'opener'))::int`,
        inbox: sql<number>`(count(*) filter (where ${warmupMessages.landedIn} = 'inbox'))::int`,
        spam: sql<number>`(count(*) filter (where ${warmupMessages.landedIn} = 'spam'))::int`,
      })
      .from(warmupMessages)
      .where(
        and(
          eq(warmupMessages.senderWorkspaceId, workspaceId),
          inArray(warmupMessages.senderSourceId, sourceIds),
          gte(warmupMessages.sentAt, since),
        ),
      )
      .groupBy(warmupMessages.senderSourceId, day);
  }
}
