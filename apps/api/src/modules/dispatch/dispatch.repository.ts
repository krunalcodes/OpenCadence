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
import {
  bulkIdempotencyKeyPrefixes,
  type MessageEventType,
} from "./dispatch.constants";

const {
  contentSnapshots,
  messageContents,
  messageEvents,
  messageHourlyStats,
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

export type TotalsWindow = { from: Date; split: Date; to: Date };

export const hourlyCounters = [
  "sent",
  "delivered",
  "bounced",
  "complained",
  "failed",
  "opened",
  "clicked",
  "replied",
  "unsubscribed",
] as const;

export type HourlyCounter = (typeof hourlyCounters)[number];

type SQL = ReturnType<typeof sql>;

type MessageState = {
  status: string;
  opened: boolean;
  clicked: boolean;
  replied: boolean;
  unsubscribed: boolean;
};

type HourlyKey = {
  workspaceId: string;
  hour: Date;
  kind: string;
  trackOpens: boolean;
};

const hourMs = 60 * 60 * 1000;

const countedStatuses = {
  sent: ["sent", "delivered", "delayed", "bounced", "complained"],
  delivered: ["delivered", "complained"],
  bounced: ["bounced"],
  complained: ["complained"],
  failed: ["failed"],
} as const satisfies Partial<Record<HourlyCounter, readonly string[]>>;

function statusIn(statuses: readonly string[]) {
  const list = statuses.map((status) => `'${status}'`).join(", ");
  return sql`${messages.status} in (${sql.raw(list)})`;
}

const counted: Record<HourlyCounter, SQL> = {
  sent: statusIn(countedStatuses.sent),
  delivered: statusIn(countedStatuses.delivered),
  bounced: statusIn(countedStatuses.bounced),
  complained: statusIn(countedStatuses.complained),
  failed: statusIn(countedStatuses.failed),
  opened: sql`${messages.firstOpenedAt} is not null`,
  clicked: sql`${messages.firstClickedAt} is not null`,
  replied: sql`${messages.repliedAt} is not null`,
  unsubscribed: sql`${messages.unsubscribedAt} is not null`,
};

function counts(state: MessageState): Record<HourlyCounter, number> {
  const has = (statuses: readonly string[]) =>
    Number(statuses.includes(state.status));
  return {
    sent: has(countedStatuses.sent),
    delivered: has(countedStatuses.delivered),
    bounced: has(countedStatuses.bounced),
    complained: has(countedStatuses.complained),
    failed: has(countedStatuses.failed),
    opened: Number(state.opened),
    clicked: Number(state.clicked),
    replied: Number(state.replied),
    unsubscribed: Number(state.unsubscribed),
  };
}

export function hourlyDelta(before: MessageState, after: MessageState) {
  const from = counts(before);
  const to = counts(after);
  const delta = Object.fromEntries(
    hourlyCounters.map((counter) => [counter, to[counter] - from[counter]]),
  ) as Record<HourlyCounter, number>;
  return hourlyCounters.some((counter) => delta[counter] !== 0) ? delta : null;
}

export function hourFloor(date: Date) {
  return new Date(Math.floor(date.getTime() / hourMs) * hourMs);
}

export function hourCeil(date: Date) {
  return new Date(Math.ceil(date.getTime() / hourMs) * hourMs);
}

function timestamp(date: Date) {
  return sql`${date.toISOString()}::timestamptz`;
}

function counterList(render: (counter: HourlyCounter) => SQL) {
  return sql.join(hourlyCounters.map(render), sql`, `);
}

function bucketCounts(
  workspaceId: string,
  window: { from: Date; to: Date },
  key?: { kind: string; trackOpens: boolean },
) {
  return sql`
    select
      date_trunc('hour', ${messages.createdAt}, 'UTC') as hour,
      ${messages.kind} as kind,
      ${messages.trackOpens} as track_opens,
      ${counterList(
        (counter) =>
          sql`(count(*) filter (where ${counted[counter]}))::int as ${sql.identifier(counter)}`,
      )}
    from ${messages}
    where ${messages.workspaceId} = ${workspaceId}
      and ${messages.createdAt} >= ${timestamp(window.from)}
      and ${messages.createdAt} < ${timestamp(window.to)}
      ${key ? sql`and ${messages.kind} = ${key.kind} and ${messages.trackOpens} = ${key.trackOpens}` : sql``}
    group by 1, 2, 3
    having ${sql.join(
      hourlyCounters.map(
        (counter) => sql`count(*) filter (where ${counted[counter]}) > 0`,
      ),
      sql` or `,
    )}
  `;
}

function mergeTotals(rows: EngagementTotalsRow[]) {
  const merged = new Map<boolean, EngagementTotalsRow>();
  for (const row of rows) {
    const known = merged.get(row.current);
    if (!known) {
      merged.set(row.current, { ...row });
      continue;
    }
    known.sent += row.sent;
    known.delivered += row.delivered;
    known.bounced += row.bounced;
    known.complained += row.complained;
    known.trackedSent += row.trackedSent;
    known.trackedDelivered += row.trackedDelivered;
    known.opened += row.opened;
    known.sequenceSent += row.sequenceSent;
    known.sequenceDelivered += row.sequenceDelivered;
    known.replied += row.replied;
  }
  return [...merged.values()];
}

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
const bulkIdempotencyKey = sql.join(
  bulkIdempotencyKeyPrefixes.map(
    (prefix) =>
      sql`${messageIdempotencyKeys.key} like ${sql.raw(`'${prefix}%'`)}`,
  ),
  sql` or `,
);

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
          kind: messages.kind,
          trackOpens: messages.trackOpens,
          previousOpenCount: sql<number>`old.open_count`,
          before: {
            status: sql<string>`old.status`,
            opened: sql<boolean>`old.first_opened_at is not null`,
            clicked: sql<boolean>`old.first_clicked_at is not null`,
            replied: sql<boolean>`old.replied_at is not null`,
            unsubscribed: sql<boolean>`old.unsubscribed_at is not null`,
          },
          after: {
            status: messages.status,
            opened: sql<boolean>`new.first_opened_at is not null`,
            clicked: sql<boolean>`new.first_clicked_at is not null`,
            replied: sql<boolean>`new.replied_at is not null`,
            unsubscribed: sql<boolean>`new.unsubscribed_at is not null`,
          },
        });
      if (!updated) {
        return null;
      }
      const delta = hourlyDelta(updated.before, updated.after);
      if (delta) {
        await this.addToHourlyStats(
          tx,
          {
            workspaceId: updated.workspaceId,
            hour: hourFloor(write.messageCreatedAt),
            kind: updated.kind,
            trackOpens: updated.trackOpens,
          },
          delta,
        );
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
    window: TotalsWindow,
  ): Promise<EngagementTotalsRow[]> {
    const previous = {
      from: hourCeil(window.from),
      to: hourFloor(window.split),
    };
    const current = { from: hourCeil(window.split), to: hourFloor(window.to) };
    if (previous.from > previous.to || current.from > current.to) {
      return this.engagementTotalsFromMessages(workspaceId, window);
    }
    const edges = [
      { from: window.from, to: previous.from },
      { from: previous.to, to: current.from },
      { from: current.to, to: window.to },
    ].filter((edge) => edge.from < edge.to);
    const [whole, partial] = await Promise.all([
      this.totalsFromHourlyStats(workspaceId, previous, current),
      edges.length > 0
        ? this.totalsFromMessages(workspaceId, window.split, edges)
        : [],
    ]);
    return mergeTotals([...whole, ...partial]);
  }

  engagementTotalsFromMessages(
    workspaceId: string,
    window: TotalsWindow,
  ): Promise<EngagementTotalsRow[]> {
    return this.totalsFromMessages(workspaceId, window.split, [
      { from: window.from, to: window.to },
    ]);
  }

  private async totalsFromHourlyStats(
    workspaceId: string,
    previous: { from: Date; to: Date },
    current: { from: Date; to: Date },
  ): Promise<EngagementTotalsRow[]> {
    const stats = messageHourlyStats;
    const sum = (counter: HourlyCounter, filter?: SQL) =>
      sql<number>`coalesce(sum(${stats[counter]})${filter ? sql` filter (where ${filter})` : sql``}, 0)::int`;
    const sequence = sql`${stats.kind} = 'sequence'`;
    return this.db
      .select({
        current: sql<boolean>`${stats.hour} >= ${timestamp(current.from)}`,
        sent: sum("sent"),
        delivered: sum("delivered"),
        bounced: sum("bounced"),
        complained: sum("complained"),
        trackedSent: sum("sent", sql`${stats.trackOpens}`),
        trackedDelivered: sum("delivered", sql`${stats.trackOpens}`),
        opened: sum("opened", sql`${stats.trackOpens}`),
        sequenceSent: sum("sent", sequence),
        sequenceDelivered: sum("delivered", sequence),
        replied: sum("replied", sequence),
      })
      .from(stats)
      .where(
        and(
          eq(stats.workspaceId, workspaceId),
          sql`${stats.kind} <> 'test'`,
          or(
            and(gte(stats.hour, previous.from), lt(stats.hour, previous.to)),
            and(gte(stats.hour, current.from), lt(stats.hour, current.to)),
          ),
        ),
      )
      .groupBy(sql`1`);
  }

  private async totalsFromMessages(
    workspaceId: string,
    split: Date,
    ranges: { from: Date; to: Date }[],
  ): Promise<EngagementTotalsRow[]> {
    const tracked = sql`${messages.trackOpens}`;
    const sequence = sql`${messages.kind} = 'sequence'`;
    const count = (...filters: SQL[]) =>
      sql<number>`(count(*) filter (where ${sql.join(filters, sql` and `)}))::int`;
    return this.db
      .select({
        current: sql<boolean>`${messages.createdAt} >= ${timestamp(split)}`,
        sent: count(counted.sent),
        delivered: count(counted.delivered),
        bounced: count(counted.bounced),
        complained: count(counted.complained),
        trackedSent: count(tracked, counted.sent),
        trackedDelivered: count(tracked, counted.delivered),
        opened: count(tracked, counted.opened),
        sequenceSent: count(sequence, counted.sent),
        sequenceDelivered: count(sequence, counted.delivered),
        replied: count(sequence, counted.replied),
      })
      .from(messages)
      .where(
        and(
          eq(messages.workspaceId, workspaceId),
          or(
            ...ranges.map((range) =>
              and(
                gte(messages.createdAt, range.from),
                lt(messages.createdAt, range.to),
              ),
            ),
          ),
          sql`${messages.kind} <> 'test'`,
        ),
      )
      .groupBy(sql`1`);
  }

  private async addToHourlyStats(
    tx: Pick<Db, "insert" | "execute">,
    key: HourlyKey,
    delta: Record<HourlyCounter, number>,
  ) {
    const stats = messageHourlyStats;
    const [row] = await tx
      .insert(stats)
      .values({ ...key, ...delta })
      .onConflictDoUpdate({
        target: [stats.workspaceId, stats.hour, stats.kind, stats.trackOpens],
        set: Object.fromEntries(
          hourlyCounters.map((counter) => [
            counter,
            sql`${stats[counter]} + excluded.${sql.identifier(counter)}`,
          ]),
        ),
      })
      .returning({ created: sql<boolean>`${stats}.xmax = 0` });
    if (!row?.created) {
      return;
    }
    const window = {
      from: key.hour,
      to: new Date(key.hour.getTime() + hourMs),
    };
    await tx.execute(sql`
      update ${stats} as stats
      set ${counterList((counter) => sql`${sql.identifier(counter)} = fresh.${sql.identifier(counter)}`)}
      from (${bucketCounts(key.workspaceId, window, key)}) as fresh
      where stats.workspace_id = ${key.workspaceId}
        and stats.hour = fresh.hour
        and stats.kind = fresh.kind
        and stats.track_opens = fresh.track_opens
    `);
  }

  async reconcileHourlyStats(
    workspaceId: string,
    range: { from: Date; to: Date },
  ) {
    const stats = messageHourlyStats;
    const window = { from: hourFloor(range.from), to: hourCeil(range.to) };
    return this.db.transaction(async (tx) => {
      const locked = await tx
        .select({
          hour: stats.hour,
          kind: stats.kind,
          trackOpens: stats.trackOpens,
        })
        .from(stats)
        .where(
          and(
            eq(stats.workspaceId, workspaceId),
            gte(stats.hour, window.from),
            lt(stats.hour, window.to),
          ),
        )
        .orderBy(stats.hour, stats.kind, stats.trackOpens)
        .for("update");
      const hours = locked.map((row) => row.hour.toISOString());
      const kinds = locked.map((row) => row.kind);
      const tracked = locked.map((row) => row.trackOpens);
      const result = await tx.execute<{ corrected: number; added: number }>(sql`
        with fresh as materialized (
          ${bucketCounts(workspaceId, window)}
        ),
        locked as (
          select * from unnest(
            ${sql.param(hours)}::timestamptz[],
            ${sql.param(kinds)}::text[],
            ${sql.param(tracked)}::boolean[]
          ) as held(hour, kind, track_opens)
        ),
        corrected as (
          update ${stats} as stats
          set ${counterList((counter) => sql`${sql.identifier(counter)} = coalesce(fresh.${sql.identifier(counter)}, 0)`)}
          from locked
          left join fresh
            on fresh.hour = locked.hour
            and fresh.kind = locked.kind
            and fresh.track_opens = locked.track_opens
          where stats.workspace_id = ${workspaceId}
            and stats.hour = locked.hour
            and stats.kind = locked.kind
            and stats.track_opens = locked.track_opens
            and (${counterList((counter) => sql`stats.${sql.identifier(counter)}`)})
              is distinct from
              (${counterList((counter) => sql`coalesce(fresh.${sql.identifier(counter)}, 0)`)})
          returning 1
        ),
        added as (
          insert into ${stats} (workspace_id, hour, kind, track_opens, ${counterList((counter) => sql`${sql.identifier(counter)}`)})
          select ${workspaceId}::uuid, hour, kind, track_opens, ${counterList((counter) => sql`${sql.identifier(counter)}`)}
          from fresh
          on conflict do nothing
          returning 1
        )
        select
          (select count(*) from corrected)::int as corrected,
          (select count(*) from added)::int as added
      `);
      const [row] = result.rows;
      return { corrected: row?.corrected ?? 0, added: row?.added ?? 0 };
    });
  }

  async listHourlyStatsWorkspaces(window: { from: Date; to: Date }) {
    const rows = await this.db
      .selectDistinct({ workspaceId: messageHourlyStats.workspaceId })
      .from(messageHourlyStats)
      .where(
        and(
          gte(messageHourlyStats.hour, window.from),
          lt(messageHourlyStats.hour, window.to),
        ),
      );
    return rows.map((row) => row.workspaceId);
  }

  async nextWorkspaceWithMessages(after: string | null) {
    const [row] = await this.db
      .select({ workspaceId: messages.workspaceId })
      .from(messages)
      .where(after ? sql`${messages.workspaceId} > ${after}::uuid` : undefined)
      .orderBy(messages.workspaceId)
      .limit(1);
    return row?.workspaceId ?? null;
  }

  async firstMessageAt(workspaceId: string, from: Date) {
    const [row] = await this.db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(
        and(
          eq(messages.workspaceId, workspaceId),
          gte(messages.createdAt, from),
        ),
      )
      .orderBy(messages.createdAt)
      .limit(1);
    return row?.createdAt ?? null;
  }

  async deleteHourlyStatsBefore(before: Date, limit: number) {
    const result = await this.db.execute(sql`
      delete from ${messageHourlyStats} as stats
      where (stats.workspace_id, stats.hour, stats.kind, stats.track_opens) in (
        select workspace_id, hour, kind, track_opens
        from ${messageHourlyStats}
        where hour < ${timestamp(before)}
        order by hour
        limit ${limit}
      )
    `);
    return result.rowCount ?? 0;
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

  listConnectedSources(workspaceIds?: string[]) {
    return this.db
      .select({
        workspaceId: sendingSources.workspaceId,
        sourceId: sendingSources.id,
        integrationType: sendingSources.integrationType,
      })
      .from(sendingSources)
      .where(
        and(
          sql`${sendingSources.status} <> 'disconnected'`,
          workspaceIds
            ? sql`${sendingSources.workspaceId} = any(${sql.param(workspaceIds)}::uuid[])`
            : undefined,
        ),
      );
  }

  async filterRecentSenders(
    candidates: { workspaceId: string; sourceId: string }[],
    since: Date,
    kinds: string[],
  ) {
    if (candidates.length === 0 || kinds.length === 0) {
      return [];
    }
    const result = await this.db.execute<{
      workspaceId: string;
      sourceId: string;
    }>(sql`
      select candidate.workspace_id as "workspaceId", candidate.source_id as "sourceId"
      from unnest(
        ${sql.param(candidates.map((candidate) => candidate.workspaceId))}::uuid[],
        ${sql.param(candidates.map((candidate) => candidate.sourceId))}::uuid[]
      ) as candidate(workspace_id, source_id)
      where exists (
        select 1
        from "messages"
        where "messages"."workspace_id" = candidate.workspace_id
          and "messages"."source_id" = candidate.source_id
          and "messages"."created_at" >= ${timestamp(since)}
          and "messages"."kind" = any(${sql.param(kinds)}::text[])
      )
      order by 1, 2
    `);
    return result.rows;
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

  async deleteIdempotencyKeys(
    scope: { from: Date | null; before: Date; bulk: boolean },
    limit: number,
  ) {
    const keys = messageIdempotencyKeys;
    const result = await this.db.execute<{ count: number; last: Date | null }>(
      sql`
        with expired as (
          select workspace_id, key
          from ${keys}
          where ${keys.createdAt} < ${timestamp(scope.before)}
            ${scope.from ? sql`and ${keys.createdAt} >= ${timestamp(scope.from)}` : sql``}
            ${scope.bulk ? sql`` : sql`and not (${bulkIdempotencyKey})`}
          order by ${keys.createdAt}
          limit ${limit}
        ),
        removed as (
          delete from ${keys} as stored
          using expired
          where stored.workspace_id = expired.workspace_id
            and stored.key = expired.key
          returning stored.created_at
        )
        select count(*)::int as count, max(created_at) as last from removed
      `,
    );
    const [row] = result.rows;
    return {
      count: row?.count ?? 0,
      last: row?.last ? new Date(row.last) : null,
    };
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

  async findListedByAssignedId(
    workspaceId: string,
    rfcMessageId: string,
    providerMessageId: string,
  ) {
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
          eq(sendingSources.workspaceId, workspaceId),
          eq(messages.providerMessageId, providerMessageId),
          eq(messages.rfcMessageId, rfcMessageId),
        ),
      )
      .orderBy(desc(messages.createdAt))
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
