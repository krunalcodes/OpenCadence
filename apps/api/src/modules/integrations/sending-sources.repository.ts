import { Inject, Injectable } from "@nestjs/common";
import {
  and,
  asc,
  type Db,
  eq,
  gte,
  inArray,
  lt,
  ne,
  or,
  schema,
  sql,
} from "@workspace/db";
import { DATABASE } from "../../infra/database/database.module";

const {
  sendingSourceCredentials,
  sendingSourceDailyStats,
  sendingSourceEvents,
  sendingSources,
  sendingSourceWebhookReceipts,
} = schema;

export type SourceRow = typeof sendingSources.$inferSelect;
export type NewSourceRow = typeof sendingSources.$inferInsert;
export type CredentialsRow = typeof sendingSourceCredentials.$inferSelect;
export type NewCredentialsRow = typeof sendingSourceCredentials.$inferInsert;
export type DailyStatsRow = typeof sendingSourceDailyStats.$inferSelect;

export type EventSeverity = 1 | 2 | 3;

export type NewEvent = {
  workspaceId: string;
  sourceId: string;
  severity: EventSeverity;
  type: string;
  code?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
  actorUserId?: string | null;
};

export type EventCursor = { createdAt: Date; id: string };

export type EventListQuery = {
  workspaceId: string;
  sourceId?: string;
  severity?: EventSeverity;
  cursor?: EventCursor;
  limit: number;
};

type Executor = Pick<Db, "insert" | "update" | "delete" | "select" | "execute">;

const uniqueViolation = "23505";

export function isUniqueViolation(error: unknown, constraint: string) {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  return candidates.some((candidate) => {
    const value = candidate as { code?: string; constraint?: string } | null;
    return value?.code === uniqueViolation && value.constraint === constraint;
  });
}

export const nameConstraint = "sending_sources_workspace_id_name_uidx";
export const accountConstraint =
  "sending_sources_workspace_id_type_external_account_id_uidx";

export function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class SendingSourcesRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  transaction<T>(run: (tx: Executor) => Promise<T>) {
    return this.db.transaction((tx) => run(tx));
  }

  listSources(workspaceId: string) {
    return this.db
      .select()
      .from(sendingSources)
      .where(
        and(
          eq(sendingSources.workspaceId, workspaceId),
          ne(sendingSources.status, "disconnected"),
        ),
      )
      .orderBy(asc(sql`lower(${sendingSources.name})`));
  }

  async findSource(workspaceId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(sendingSources)
      .where(
        and(
          eq(sendingSources.workspaceId, workspaceId),
          eq(sendingSources.id, id),
          ne(sendingSources.status, "disconnected"),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findSourceById(id: string) {
    const [row] = await this.db
      .select()
      .from(sendingSources)
      .where(
        and(
          eq(sendingSources.id, id),
          ne(sendingSources.status, "disconnected"),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findSourceByAccount(
    workspaceId: string,
    integrationType: string,
    externalAccountId: string,
  ) {
    const [row] = await this.db
      .select()
      .from(sendingSources)
      .where(
        and(
          eq(sendingSources.workspaceId, workspaceId),
          eq(sendingSources.integrationType, integrationType),
          eq(sendingSources.externalAccountId, externalAccountId),
          ne(sendingSources.status, "disconnected"),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async insertSource(
    source: NewSourceRow,
    credentials: NewCredentialsRow,
    executor: Executor = this.db,
  ) {
    const [row] = await executor
      .insert(sendingSources)
      .values(source)
      .returning();
    await executor.insert(sendingSourceCredentials).values(credentials);
    if (!row) {
      throw new Error("The sending source was not saved.");
    }
    return row;
  }

  async updateSource(
    workspaceId: string,
    id: string,
    patch: Partial<NewSourceRow>,
    executor: Executor = this.db,
  ) {
    const [row] = await executor
      .update(sendingSources)
      .set(patch)
      .where(
        and(
          eq(sendingSources.workspaceId, workspaceId),
          eq(sendingSources.id, id),
        ),
      )
      .returning();
    return row ?? null;
  }

  async clearDefault(workspaceId: string, executor: Executor = this.db) {
    await executor
      .update(sendingSources)
      .set({ isDefault: false })
      .where(
        and(
          eq(sendingSources.workspaceId, workspaceId),
          eq(sendingSources.isDefault, true),
        ),
      );
  }

  async findCredentials(sourceId: string, executor: Executor = this.db) {
    const [row] = await executor
      .select()
      .from(sendingSourceCredentials)
      .where(eq(sendingSourceCredentials.sourceId, sourceId))
      .limit(1);
    return row ?? null;
  }

  async lockCredentials(sourceId: string, executor: Executor) {
    const [row] = await executor
      .select()
      .from(sendingSourceCredentials)
      .where(eq(sendingSourceCredentials.sourceId, sourceId))
      .limit(1)
      .for("update");
    return row ?? null;
  }

  async updateCredentials(
    sourceId: string,
    patch: Partial<NewCredentialsRow>,
    executor: Executor = this.db,
  ) {
    await executor
      .update(sendingSourceCredentials)
      .set(patch)
      .where(eq(sendingSourceCredentials.sourceId, sourceId));
  }

  async replaceCredentials(
    credentials: NewCredentialsRow,
    executor: Executor = this.db,
  ) {
    await executor
      .delete(sendingSourceCredentials)
      .where(eq(sendingSourceCredentials.sourceId, credentials.sourceId));
    await executor.insert(sendingSourceCredentials).values(credentials);
  }

  async deleteCredentials(sourceId: string, executor: Executor = this.db) {
    await executor
      .delete(sendingSourceCredentials)
      .where(eq(sendingSourceCredentials.sourceId, sourceId));
  }

  listDailyStats(workspaceId: string, sourceIds: string[], fromDay: string) {
    if (sourceIds.length === 0) {
      return Promise.resolve([] as DailyStatsRow[]);
    }
    return this.db
      .select()
      .from(sendingSourceDailyStats)
      .where(
        and(
          eq(sendingSourceDailyStats.workspaceId, workspaceId),
          inArray(sendingSourceDailyStats.sourceId, sourceIds),
          gte(sendingSourceDailyStats.day, fromDay),
        ),
      );
  }

  async findSentCount(sourceId: string, day: string) {
    const [row] = await this.db
      .select({ sentCount: sendingSourceDailyStats.sentCount })
      .from(sendingSourceDailyStats)
      .where(
        and(
          eq(sendingSourceDailyStats.sourceId, sourceId),
          eq(sendingSourceDailyStats.day, day),
        ),
      )
      .limit(1);
    return row?.sentCount ?? 0;
  }

  async saveSentCount(
    workspaceId: string,
    sourceId: string,
    day: string,
    sentCount: number,
  ) {
    await this.db
      .insert(sendingSourceDailyStats)
      .values({ workspaceId, sourceId, day, sentCount })
      .onConflictDoUpdate({
        target: [sendingSourceDailyStats.sourceId, sendingSourceDailyStats.day],
        set: {
          sentCount: sql`greatest(${sendingSourceDailyStats.sentCount}, excluded.sent_count)`,
          updatedAt: new Date(),
        },
      });
  }

  async insertEvent(event: NewEvent, executor: Executor = this.db) {
    await executor.insert(sendingSourceEvents).values({
      createdAt: new Date(),
      workspaceId: event.workspaceId,
      sourceId: event.sourceId,
      severity: event.severity,
      type: event.type,
      code: event.code ?? null,
      message: event.message?.slice(0, 2000) ?? null,
      metadata: event.metadata,
      actorUserId: event.actorUserId ?? null,
    });
    const warnings = event.severity === 2 ? 1 : 0;
    const errors = event.severity === 3 ? 1 : 0;
    const health =
      event.severity === 3
        ? "failing"
        : event.severity === 2
          ? "warning"
          : "healthy";
    await executor
      .insert(sendingSourceDailyStats)
      .values({
        workspaceId: event.workspaceId,
        sourceId: event.sourceId,
        day: utcDay(),
        warningCount: warnings,
        errorCount: errors,
        health,
      })
      .onConflictDoUpdate({
        target: [sendingSourceDailyStats.sourceId, sendingSourceDailyStats.day],
        set: {
          warningCount: sql`${sendingSourceDailyStats.warningCount} + ${warnings}`,
          errorCount: sql`${sendingSourceDailyStats.errorCount} + ${errors}`,
          health: sql`case
            when ${sendingSourceDailyStats.health} = 'failing' or excluded.health = 'failing' then 'failing'
            when ${sendingSourceDailyStats.health} = 'warning' or excluded.health = 'warning' then 'warning'
            else 'healthy' end`,
          updatedAt: new Date(),
        },
      });
  }

  listEvents(query: EventListQuery) {
    const { cursor } = query;
    return this.db
      .select({
        id: sendingSourceEvents.id,
        createdAt: sendingSourceEvents.createdAt,
        sourceId: sendingSourceEvents.sourceId,
        severity: sendingSourceEvents.severity,
        type: sendingSourceEvents.type,
        code: sendingSourceEvents.code,
        message: sendingSourceEvents.message,
        sourceName: sendingSources.name,
        integrationType: sendingSources.integrationType,
      })
      .from(sendingSourceEvents)
      .innerJoin(
        sendingSources,
        and(
          eq(sendingSources.workspaceId, sendingSourceEvents.workspaceId),
          eq(sendingSources.id, sendingSourceEvents.sourceId),
        ),
      )
      .where(
        and(
          eq(sendingSourceEvents.workspaceId, query.workspaceId),
          query.sourceId
            ? eq(sendingSourceEvents.sourceId, query.sourceId)
            : undefined,
          query.severity
            ? eq(sendingSourceEvents.severity, query.severity)
            : undefined,
          cursor
            ? or(
                lt(sendingSourceEvents.createdAt, cursor.createdAt),
                and(
                  eq(sendingSourceEvents.createdAt, cursor.createdAt),
                  lt(sendingSourceEvents.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(
        sql`${sendingSourceEvents.createdAt} desc nulls last`,
        sql`${sendingSourceEvents.id} desc nulls last`,
      )
      .limit(query.limit);
  }

  async insertWebhookReceipt(
    workspaceId: string,
    sourceId: string,
    providerEventId: string,
  ) {
    const rows = await this.db
      .insert(sendingSourceWebhookReceipts)
      .values({ workspaceId, sourceId, providerEventId })
      .onConflictDoNothing()
      .returning({
        providerEventId: sendingSourceWebhookReceipts.providerEventId,
      });
    return rows.length > 0;
  }

  async deleteWebhookReceiptsBefore(before: Date) {
    await this.db
      .delete(sendingSourceWebhookReceipts)
      .where(lt(sendingSourceWebhookReceipts.receivedAt, before));
  }

  async ensureEventPartitions(monthsAhead: number) {
    await this.db.execute(sql`
      do $$
      declare
        start_at timestamptz;
      begin
        for i in 0..${sql.raw(String(Math.trunc(monthsAhead)))} loop
          start_at := (date_trunc('month', now() at time zone 'UTC') + make_interval(months => i)) at time zone 'UTC';
          execute format(
            'create table if not exists %I partition of "sending_source_events" for values from (%L) to (%L)',
            'sending_source_events_' || to_char(start_at at time zone 'UTC', 'YYYY_MM'),
            start_at,
            ((start_at at time zone 'UTC') + interval '1 month') at time zone 'UTC'
          );
        end loop;
      end $$;
    `);
  }

  async listEventPartitions() {
    const result = await this.db.execute<{ name: string }>(sql`
      select child.relname as name
      from pg_inherits
      join pg_class parent on parent.oid = pg_inherits.inhparent
      join pg_class child on child.oid = pg_inherits.inhrelid
      where parent.relname = 'sending_source_events'
    `);
    return result.rows.map((row) => row.name);
  }

  async dropEventPartition(name: string) {
    if (!/^sending_source_events_\d{4}_\d{2}$/.test(name)) {
      throw new Error("Refusing to drop an unexpected table.");
    }
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '5s'`);
      await tx.execute(sql.raw(`drop table if exists "${name}"`));
    });
  }
}
