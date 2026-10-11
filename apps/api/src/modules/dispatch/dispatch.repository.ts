import { Inject, Injectable } from "@nestjs/common";
import { and, type Db, desc, eq, lt, or, schema, sql } from "@workspace/db";
import { DATABASE } from "../../infra/database/database.module";

const { messageContents, messageIdempotencyKeys, messages, sendingSources } =
  schema;

export type MessageRow = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;
export type MessageContentRow = typeof messageContents.$inferSelect;
export type NewMessageContentRow = typeof messageContents.$inferInsert;

export type MessageListRow = MessageRow & {
  sourceName: string;
  integrationType: string;
};

export type MessageCursor = { createdAt: Date; id: string };

export type MessageListQuery = {
  workspaceId: string;
  status?: string;
  sourceId?: string;
  cursor?: MessageCursor;
  limit: number;
};

export type PartitionedTable = "messages" | "message_contents";

const partitionedTables: PartitionedTable[] = ["messages", "message_contents"];
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
      .orderBy(desc(messages.createdAt), desc(messages.id))
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
    }>(sql`
      select message_id, created_at, workspace_id, html, text, headers
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
