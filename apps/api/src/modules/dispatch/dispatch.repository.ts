import { Inject, Injectable } from "@nestjs/common";
import {
  and,
  type Db,
  desc,
  eq,
  gte,
  inArray,
  lt,
  or,
  schema,
  sql,
} from "@workspace/db";
import { DATABASE } from "../../infra/database/database.module";
import type { MessageEventType } from "./dispatch.constants";

const {
  contentSnapshots,
  messageContents,
  messageEvents,
  messageIdempotencyKeys,
  messages,
  sendingSources,
} = schema;

export type MessageRow = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;
export type MessageContentRow = typeof messageContents.$inferSelect;
export type NewMessageContentRow = typeof messageContents.$inferInsert;

export type SnapshotRow = typeof contentSnapshots.$inferSelect;
export type MessageEventRow = typeof messageEvents.$inferSelect;

export type BatchInsertRow = {
  message: NewMessageRow & { id: string; createdAt: Date };
  content: NewMessageContentRow | null;
  idempotency: { key: string; requestHash: string };
};

export type EventWrite = {
  messageId: string;
  messageCreatedAt: Date;
  eventId: string;
  impliedEventId: string;
  eventCreatedAt: Date;
  type: MessageEventType;
  occurredAt: Date;
  url: string | null;
  userAgent: string | null;
  metadata: Record<string, string> | null;
  patch?: Partial<NewMessageRow>;
  error?: { code: string; message: string };
  expectedStatus?: string[];
  touchLastEvent: boolean;
};

export type EventResult = {
  workspaceId: string;
  first: boolean;
  impliedOpen: boolean;
};

const deliveryRank: Partial<Record<MessageEventType, number>> = {
  sent: 1,
  delayed: 2,
  delivered: 3,
  failed: 4,
  bounced: 5,
  complained: 6,
};

export type MessageListRow = MessageRow & {
  sourceName: string;
  integrationType: string;
};

export type MessageCursor = { createdAt: Date; id: string };

export type MessageListQuery = {
  workspaceId: string;
  status?: string;
  sourceId?: string;
  campaignId?: string;
  sequenceId?: string;
  enrollmentId?: string;
  contactId?: string;
  cursor?: MessageCursor;
  limit: number;
};

export type EngagementTotalsRow = {
  current: boolean;
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  trackedSent: number;
  trackedDelivered: number;
  opened: number;
  sequenceSent: number;
  sequenceDelivered: number;
  replied: number;
};

export type HourlyKindRow = { kind: string; hour: number; count: number };

export type PartitionedTable =
  | "messages"
  | "message_contents"
  | "message_events";

const partitionedTables: PartitionedTable[] = [
  "messages",
  "message_contents",
  "message_events",
];
const idempotencyConstraint = "message_idempotency_keys_pk";

function assertPartitionedTable(
  table: string,
): asserts table is PartitionedTable {
  if (!partitionedTables.includes(table as PartitionedTable)) {
    throw new Error("Unexpected partitioned table.");
  }
}

export function isIdempotencyConflict(error: unknown) {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  return candidates.some((candidate) => {
    const value = candidate as { code?: string; constraint?: string } | null;
    return (
      value?.code === "23505" && value.constraint === idempotencyConstraint
    );
  });
}

const listColumns = {
  message: messages,
  sourceName: sendingSources.name,
  integrationType: sendingSources.integrationType,
};

@Injectable()
export class DispatchRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  async insertMessage(
    message: NewMessageRow,
    content: NewMessageContentRow | null,
    idempotency: { key: string; requestHash: string } | null,
  ) {
    await this.db.transaction(async (tx) => {
      if (idempotency && message.id && message.createdAt) {
        await tx.insert(messageIdempotencyKeys).values({
          workspaceId: message.workspaceId,
          key: idempotency.key,
          requestHash: idempotency.requestHash,
          messageId: message.id,
          messageCreatedAt: message.createdAt,
        });
      }
      await tx.insert(messages).values(message);
      if (content) {
        await tx.insert(messageContents).values(content);
      }
    });
  }

  async insertBatch(rows: BatchInsertRow[]) {
    if (rows.length === 0) {
      return new Set<string>();
    }
    return this.db.transaction(async (tx) => {
      const won = await tx
        .insert(messageIdempotencyKeys)
        .values(
          rows.map((row) => ({
            workspaceId: row.message.workspaceId,
            key: row.idempotency.key,
            requestHash: row.idempotency.requestHash,
            messageId: row.message.id,
            messageCreatedAt: row.message.createdAt,
          })),
        )
        .onConflictDoNothing()
        .returning({ messageId: messageIdempotencyKeys.messageId });
      const inserted = new Set(won.map((row) => row.messageId));
      const accepted = rows.filter((row) => inserted.has(row.message.id));
      if (accepted.length === 0) {
        return inserted;
      }
      await tx.insert(messages).values(accepted.map((row) => row.message));
      const contents = accepted.flatMap((row) =>
        row.content ? [row.content] : [],
      );
      if (contents.length > 0) {
        await tx.insert(messageContents).values(contents);
      }
      return inserted;
    });
  }

  async findIdempotencyKeys(workspaceId: string, keys: string[]) {
    if (keys.length === 0) {
      return [];
    }
    return this.db
      .select({
        key: messageIdempotencyKeys.key,
        messageId: messageIdempotencyKeys.messageId,
        status: messages.status,
      })
      .from(messageIdempotencyKeys)
      .leftJoin(
        messages,
        and(
          eq(messages.id, messageIdempotencyKeys.messageId),
          eq(messages.createdAt, messageIdempotencyKeys.messageCreatedAt),
        ),
      )
      .where(
        and(
          eq(messageIdempotencyKeys.workspaceId, workspaceId),
          inArray(messageIdempotencyKeys.key, keys),
        ),
      );
  }

  async insertSnapshot(snapshot: typeof contentSnapshots.$inferInsert) {
    const [row] = await this.db
      .insert(contentSnapshots)
      .values(snapshot)
      .returning({ id: contentSnapshots.id });
    if (!row) {
      throw new Error("The content snapshot was not saved.");
    }
    return row;
  }

  async findSnapshot(workspaceId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(contentSnapshots)
      .where(
        and(
          eq(contentSnapshots.workspaceId, workspaceId),
          eq(contentSnapshots.id, id),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async applyEvent(write: EventWrite): Promise<EventResult | null> {
    const at = write.occurredAt.toISOString();
    const rank = deliveryRank[write.type];
    const currentRank = sql`case ${messages.status} when 'sent' then 1 when 'delayed' then 2 when 'delivered' then 3 when 'failed' then 4 when 'bounced' then 5 when 'complained' then 6 else 0 end`;
    const advance =
      rank === undefined
        ? null
        : sql`${currentRank} < ${sql.raw(String(rank))}`;
    const firstAt = (column: unknown) =>
      sql`coalesce(${column}, ${at}::timestamptz)`;
    const { error } = write;
    const changes = {
      updatedAt: new Date(),
      ...(advance
        ? {
            status: sql`case when ${advance} then ${write.type}::text else ${messages.status} end`,
          }
        : {}),
      ...(advance && error
        ? {
            errorCode: sql`case when ${advance} then ${error.code}::text else ${messages.errorCode} end`,
            errorMessage: sql`case when ${advance} then ${error.message}::text else ${messages.errorMessage} end`,
          }
        : {}),
      ...(write.touchLastEvent
        ? {
            lastEventAt: sql`greatest(${messages.lastEventAt}, ${at}::timestamptz)`,
          }
        : {}),
      ...(write.type === "opened"
        ? {
            openCount: sql`${messages.openCount} + 1`,
            firstOpenedAt: firstAt(messages.firstOpenedAt),
          }
        : {}),
      ...(write.type === "clicked"
        ? {
            clickCount: sql`${messages.clickCount} + 1`,
            firstClickedAt: firstAt(messages.firstClickedAt),
            openCount: sql`greatest(${messages.openCount}, 1)`,
            firstOpenedAt: firstAt(messages.firstOpenedAt),
          }
        : {}),
      ...(write.type === "replied"
        ? { repliedAt: firstAt(messages.repliedAt) }
        : {}),
      ...(write.type === "unsubscribed"
        ? { unsubscribedAt: firstAt(messages.unsubscribedAt) }
        : {}),
      ...write.patch,
    };
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(messages)
        .set(changes)
        .where(
          and(
            eq(messages.id, write.messageId),
            eq(messages.createdAt, write.messageCreatedAt),
            write.expectedStatus
              ? sql`${messages.status} = any(${sql.param(write.expectedStatus)}::text[])`
              : undefined,
          ),
        )
        .returning({
          workspaceId: messages.workspaceId,
          previousOpenCount: sql<number>`old.open_count`,
        });
      if (!updated) {
        return null;
      }
      const event = {
        createdAt: write.eventCreatedAt,
        workspaceId: updated.workspaceId,
        messageId: write.messageId,
        messageCreatedAt: write.messageCreatedAt,
      };
      const [inserted] = await tx
        .insert(messageEvents)
        .values({
          ...event,
          id: write.eventId,
          type: write.type,
          url: write.url,
          userAgent: write.userAgent,
          metadata: write.metadata,
        })
        .returning({
          first: sql<boolean>`not exists (
            select 1 from message_events earlier
            where earlier.message_id = ${write.messageId}::uuid
              and earlier.created_at >= ${write.messageCreatedAt.toISOString()}::timestamptz
              and earlier.type = ${write.type}
              and earlier.id <> ${write.eventId}::uuid
          )`,
        });
      const impliedOpen =
        write.type === "clicked" && Number(updated.previousOpenCount) === 0;
      if (impliedOpen) {
        await tx.insert(messageEvents).values({
          ...event,
          id: write.impliedEventId,
          type: "opened",
          userAgent: write.userAgent,
          metadata: { implied: "clicked" },
        });
      }
      return {
        workspaceId: updated.workspaceId,
        first: inserted?.first === true,
        impliedOpen,
      };
    });
  }

  async countByStatus(
    workspaceId: string,
    scope: {
      campaignId?: string;
      sequenceId?: string;
      sourceId?: string;
      since?: Date;
    },
  ) {
    return this.db
      .select({
        status: messages.status,
        count: sql<number>`count(*)::int`,
      })
      .from(messages)
      .where(
        and(
          eq(messages.workspaceId, workspaceId),
          scope.campaignId
            ? eq(messages.campaignId, scope.campaignId)
            : undefined,
          scope.sequenceId
            ? eq(messages.sequenceId, scope.sequenceId)
            : undefined,
          scope.sourceId ? eq(messages.sourceId, scope.sourceId) : undefined,
          scope.since ? gte(messages.createdAt, scope.since) : undefined,
        ),
      )
      .groupBy(messages.status);
  }

  async engagementTotals(
    workspaceId: string,
    window: { from: Date; split: Date; to: Date },
  ): Promise<EngagementTotalsRow[]> {
    const sent = sql`${messages.status} in ('sent', 'delivered', 'delayed', 'bounced', 'complained')`;
    const delivered = sql`${messages.status} in ('delivered', 'complained')`;
    const sequence = sql`${messages.kind} = 'sequence'`;
    return this.db
      .select({
        current: sql<boolean>`${messages.createdAt} >= ${window.split.toISOString()}::timestamptz`,
        sent: sql<number>`(count(*) filter (where ${sent}))::int`,
        delivered: sql<number>`(count(*) filter (where ${delivered}))::int`,
        bounced: sql<number>`(count(*) filter (where ${messages.status} = 'bounced'))::int`,
        complained: sql<number>`(count(*) filter (where ${messages.status} = 'complained'))::int`,
        trackedSent: sql<number>`(count(*) filter (where ${messages.trackOpens} and ${sent}))::int`,
        trackedDelivered: sql<number>`(count(*) filter (where ${messages.trackOpens} and ${delivered}))::int`,
        opened: sql<number>`(count(*) filter (where ${messages.trackOpens} and ${messages.firstOpenedAt} is not null))::int`,
        sequenceSent: sql<number>`(count(*) filter (where ${sequence} and ${sent}))::int`,
        sequenceDelivered: sql<number>`(count(*) filter (where ${sequence} and ${delivered}))::int`,
        replied: sql<number>`(count(*) filter (where ${sequence} and ${messages.repliedAt} is not null))::int`,
      })
      .from(messages)
      .where(
        and(
          eq(messages.workspaceId, workspaceId),
          gte(messages.createdAt, window.from),
          lt(messages.createdAt, window.to),
          sql`${messages.kind} <> 'test'`,
        ),
      )
      .groupBy(sql`1`);
  }

  async hourlyByKind(
    workspaceId: string,
    window: { from: Date; to: Date; timezone: string; kinds: string[] },
  ): Promise<HourlyKindRow[]> {
    return this.db
      .select({
        kind: messages.kind,
        hour: sql<number>`extract(hour from ${messages.createdAt} at time zone ${window.timezone})::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(messages)
      .where(
        and(
          eq(messages.workspaceId, workspaceId),
          gte(messages.createdAt, window.from),
          lt(messages.createdAt, window.to),
          inArray(messages.kind, window.kinds),
          sql`${messages.status} in ('sent', 'delivered', 'delayed', 'bounced', 'complained')`,
        ),
      )
      .groupBy(sql`1`, sql`2`);
  }

  async hasMessages(workspaceId: string) {
    const [row] = await this.db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.workspaceId, workspaceId),
          sql`${messages.kind} <> 'test'`,
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async listEvents(
    workspaceId: string,
    messageId: string,
    messageCreatedAt: Date,
    limit: number,
  ) {
    return this.db
      .select()
      .from(messageEvents)
      .where(
        and(
          eq(messageEvents.messageId, messageId),
          eq(messageEvents.workspaceId, workspaceId),
          gte(messageEvents.createdAt, messageCreatedAt),
        ),
      )
      .orderBy(
        sql`${messageEvents.createdAt} desc nulls last`,
        sql`${messageEvents.id} desc nulls last`,
      )
      .limit(limit);
  }

  async listQueuedBetween(
    window: { from: Date; to: Date; fromId: string; toId: string },
    afterId: string | null,
    limit: number,
  ) {
    return this.db
      .select({ id: messages.id, createdAt: messages.createdAt })
      .from(messages)
      .where(
        and(
          gte(messages.createdAt, window.from),
          lt(messages.createdAt, window.to),
          gte(messages.id, window.fromId),
          lt(messages.id, window.toId),
          eq(messages.status, "queued"),
          afterId ? sql`${messages.id} > ${afterId}::uuid` : undefined,
        ),
      )
      .orderBy(messages.id)
      .limit(limit);
  }

  async findIdempotencyKey(workspaceId: string, key: string) {
    const [row] = await this.db
      .select()
      .from(messageIdempotencyKeys)
      .where(
        and(
          eq(messageIdempotencyKeys.workspaceId, workspaceId),
          eq(messageIdempotencyKeys.key, key),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async deleteIdempotencyKeysBefore(before: Date) {
    await this.db
      .delete(messageIdempotencyKeys)
      .where(lt(messageIdempotencyKeys.createdAt, before));
  }

  async findMessage(id: string, createdAt: Date) {
    const [row] = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.id, id), eq(messages.createdAt, createdAt)))
      .limit(1);
    return row ?? null;
  }

  async findListedMessage(workspaceId: string, id: string, createdAt: Date) {
    const [row] = await this.db
      .select(listColumns)
      .from(messages)
      .innerJoin(
        sendingSources,
        and(
          eq(sendingSources.workspaceId, messages.workspaceId),
          eq(sendingSources.id, messages.sourceId),
        ),
      )
      .where(
        and(
          eq(messages.id, id),
          eq(messages.createdAt, createdAt),
          eq(messages.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    return row ? this.flatten(row) : null;
  }

  async listMessages(query: MessageListQuery) {
    const { cursor } = query;
    const rows = await this.db
      .select(listColumns)
      .from(messages)
      .innerJoin(
        sendingSources,
        and(
          eq(sendingSources.workspaceId, messages.workspaceId),
          eq(sendingSources.id, messages.sourceId),
        ),
      )
      .where(
        and(
          eq(messages.workspaceId, query.workspaceId),
          query.status ? eq(messages.status, query.status) : undefined,
          query.sourceId ? eq(messages.sourceId, query.sourceId) : undefined,
          query.campaignId
            ? eq(messages.campaignId, query.campaignId)
            : undefined,
          query.sequenceId
            ? eq(messages.sequenceId, query.sequenceId)
            : undefined,
          query.enrollmentId
            ? eq(messages.enrollmentId, query.enrollmentId)
            : undefined,
          query.contactId ? eq(messages.contactId, query.contactId) : undefined,
          cursor
            ? or(
                lt(messages.createdAt, cursor.createdAt),
                and(
                  eq(messages.createdAt, cursor.createdAt),
                  lt(messages.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(
        sql`${messages.createdAt} desc nulls last`,
        sql`${messages.id} desc nulls last`,
      )
      .limit(query.limit);
    return rows.map((row) => this.flatten(row));
  }

  async findByProviderMessageId(sourceId: string, providerMessageId: string) {
    const [row] = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.sourceId, sourceId),
          eq(messages.providerMessageId, providerMessageId),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(1);
    return row ?? null;
  }

  async updateMessage(
    id: string,
    createdAt: Date,
    patch: Partial<NewMessageRow>,
    expectedStatus?: string[],
  ) {
    const rows = await this.db
      .update(messages)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(messages.id, id),
          eq(messages.createdAt, createdAt),
          expectedStatus
            ? sql`${messages.status} = any(${sql.param(expectedStatus)}::text[])`
            : undefined,
        ),
      )
      .returning({ id: messages.id });
    return rows.length > 0;
  }

  async findContent(messageId: string, createdAt: Date) {
    const [row] = await this.db
      .select()
      .from(messageContents)
      .where(
        and(
          eq(messageContents.messageId, messageId),
          eq(messageContents.createdAt, createdAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async ensurePartitions(table: PartitionedTable, monthsAhead: number) {
    assertPartitionedTable(table);
    await this.db.execute(sql`
      do $$
      declare
        start_at timestamptz;
      begin
        for i in 0..${sql.raw(String(Math.trunc(monthsAhead)))} loop
          start_at := (date_trunc('month', now() at time zone 'UTC') + make_interval(months => i)) at time zone 'UTC';
          execute format(
            'create table if not exists %I partition of %I for values from (%L) to (%L)',
            ${sql.raw(`'${table}'`)} || '_' || to_char(start_at at time zone 'UTC', 'YYYY_MM'),
            ${sql.raw(`'${table}'`)},
            start_at,
            ((start_at at time zone 'UTC') + interval '1 month') at time zone 'UTC'
          );
        end loop;
      end $$;
    `);
  }

  async listPartitions(table: PartitionedTable) {
    assertPartitionedTable(table);
    const result = await this.db.execute<{ name: string }>(sql`
      select child.relname as name
      from pg_inherits
      join pg_class parent on parent.oid = pg_inherits.inhparent
      join pg_class child on child.oid = pg_inherits.inhrelid
      where parent.relname = ${table}
    `);
    return result.rows.map((row) => row.name);
  }

  async dropPartition(table: PartitionedTable, name: string) {
    assertPartitionedTable(table);
    if (!new RegExp(`^${table}_\\d{4}_\\d{2}$`).test(name)) {
      throw new Error("Refusing to drop an unexpected table.");
    }
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '5s'`);
      await tx.execute(sql.raw(`drop table if exists "${name}"`));
    });
  }

  async listPartitionContents(
    partition: string,
    afterMessageId: string | null,
    limit: number,
  ) {
    if (!/^message_contents_\d{4}_\d{2}$/.test(partition)) {
      throw new Error("Unexpected content partition.");
    }
    const table = sql.raw(`"${partition}"`);
    const result = await this.db.execute<{
      message_id: string;
      created_at: Date;
      workspace_id: string;
      html: string | null;
      text: string | null;
      headers: Record<string, string> | null;
      snapshot_id: string | null;
      variables: Record<string, string> | null;
    }>(sql`
      select message_id, created_at, workspace_id, html, text, headers, snapshot_id, variables
      from ${table}
      where ${afterMessageId}::uuid is null or message_id > ${afterMessageId}::uuid
      order by message_id
      limit ${limit}
    `);
    return result.rows;
  }

  private flatten(row: {
    message: MessageRow;
    sourceName: string;
    integrationType: string;
  }): MessageListRow {
    return {
      ...row.message,
      sourceName: row.sourceName,
      integrationType: row.integrationType,
    };
  }
}
