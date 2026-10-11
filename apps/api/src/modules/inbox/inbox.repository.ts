import { Inject, Injectable } from "@nestjs/common";
import { and, asc, type Db, eq, inArray, schema, sql } from "@workspace/db";
import {
  type KeysetCursor,
  keysetTimestampFormat,
} from "../../common/pagination/keyset-cursor";
import { DATABASE } from "../../infra/database/database.module";
import type { ThreadStatus } from "./inbox.constants";

const { inboxMessages, inboxThreads, sequenceReplyCursors } = schema;

export type ThreadRow = typeof inboxThreads.$inferSelect;
export type InboxMessageRow = typeof inboxMessages.$inferSelect;
export type ThreadListRow = ThreadRow & { cursorAt: string };

export type ThreadQuery = {
  status?: ThreadStatus;
  unread?: boolean;
  sourceId?: string;
  search?: string;
  cursor?: KeysetCursor;
  limit: number;
};

export type ThreadSeed = {
  rootMessageId: string | null;
  rootRfcMessageId: string;
  contactId: string | null;
  campaignId: string | null;
  sequenceId: string | null;
  enrollmentId: string | null;
  subject: string;
};

export type InboundInput = {
  workspaceId: string;
  sourceId: string;
  threadId: string | null;
  seed: ThreadSeed | null;
  rfcMessageId: string;
  inReplyTo: string | null;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string;
  text: string | null;
  html: string | null;
  snippet: string;
  occurredAt: Date;
};

export type OutboundInput = {
  workspaceId: string;
  threadId: string;
  rfcMessageId: string | null;
  inReplyTo: string | null;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string;
  text: string | null;
  html: string | null;
  snippet: string;
  outboundMessageId: string;
  sentByUserId: string | null;
  occurredAt: Date;
};

class DuplicateMessage extends Error {}

function timestamp(value: Date) {
  return sql`${value.toISOString()}::timestamptz`;
}

function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

const unreadOpen = sql`${inboxThreads.unread} and ${inboxThreads.status} = 'open'`;

@Injectable()
export class InboxRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  async findCursor(sourceId: string) {
    const [row] = await this.db
      .select()
      .from(sequenceReplyCursors)
      .where(eq(sequenceReplyCursors.sourceId, sourceId));
    return row ?? null;
  }

  async saveCursor(input: {
    workspaceId: string;
    sourceId: string;
    lastCheckedAt: Date;
    state: Record<string, string | number> | null;
  }) {
    await this.db
      .insert(sequenceReplyCursors)
      .values(input)
      .onConflictDoUpdate({
        target: sequenceReplyCursors.sourceId,
        set: {
          lastCheckedAt: input.lastCheckedAt,
          state: input.state,
          updatedAt: new Date(),
        },
      });
  }

  async hasMessage(workspaceId: string, rfcMessageId: string) {
    const [row] = await this.db
      .select({ id: inboxMessages.id })
      .from(inboxMessages)
      .where(
        and(
          eq(inboxMessages.workspaceId, workspaceId),
          eq(inboxMessages.rfcMessageId, rfcMessageId),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async findThreadByRfcIds(
    workspaceId: string,
    sourceId: string,
    rfcMessageIds: string[],
  ): Promise<ThreadRow | null> {
    if (rfcMessageIds.length === 0) {
      return null;
    }
    const [row] = await this.db
      .select({ thread: inboxThreads })
      .from(inboxMessages)
      .innerJoin(
        inboxThreads,
        and(
          eq(inboxThreads.workspaceId, inboxMessages.workspaceId),
          eq(inboxThreads.id, inboxMessages.threadId),
        ),
      )
      .where(
        and(
          eq(inboxMessages.workspaceId, workspaceId),
          inArray(inboxMessages.rfcMessageId, rfcMessageIds),
          eq(inboxThreads.sourceId, sourceId),
        ),
      )
      .orderBy(
        sql`${inboxMessages.occurredAt} desc nulls last`,
        sql`${inboxMessages.id} desc nulls last`,
      )
      .limit(1);
    return row?.thread ?? null;
  }

  async storeInbound(
    input: InboundInput,
  ): Promise<{ stored: boolean; threadId: string | null }> {
    try {
      return await this.db.transaction(async (tx) => {
        const [known] = await tx
          .select({ id: inboxMessages.id })
          .from(inboxMessages)
          .where(
            and(
              eq(inboxMessages.workspaceId, input.workspaceId),
              eq(inboxMessages.rfcMessageId, input.rfcMessageId),
            ),
          )
          .limit(1);
        if (known) {
          return { stored: false, threadId: null };
        }
        let threadId = input.threadId;
        if (!threadId && input.seed) {
          const [thread] = await tx
            .insert(inboxThreads)
            .values({
              workspaceId: input.workspaceId,
              sourceId: input.sourceId,
              contactId: input.seed.contactId,
              contactEmail: input.fromEmail,
              contactName: input.fromName,
              subject: input.seed.subject,
              snippet: input.snippet,
              rootMessageId: input.seed.rootMessageId,
              rootRfcMessageId: input.seed.rootRfcMessageId,
              campaignId: input.seed.campaignId,
              sequenceId: input.seed.sequenceId,
              enrollmentId: input.seed.enrollmentId,
              lastMessageAt: input.occurredAt,
            })
            .onConflictDoUpdate({
              target: [
                inboxThreads.workspaceId,
                inboxThreads.sourceId,
                inboxThreads.rootRfcMessageId,
              ],
              targetWhere: sql.raw("root_rfc_message_id is not null"),
              set: { updatedAt: new Date() },
            })
            .returning({ id: inboxThreads.id });
          threadId = thread?.id ?? null;
        }
        if (!threadId) {
          return { stored: false, threadId: null };
        }
        const inserted = await tx
          .insert(inboxMessages)
          .values({
            workspaceId: input.workspaceId,
            threadId,
            direction: "inbound",
            rfcMessageId: input.rfcMessageId,
            inReplyTo: input.inReplyTo,
            fromEmail: input.fromEmail,
            fromName: input.fromName,
            toEmails: input.toEmails,
            subject: input.subject,
            text: input.text,
            html: input.html,
            occurredAt: input.occurredAt,
          })
          .onConflictDoNothing()
          .returning({ id: inboxMessages.id });
        if (inserted.length === 0) {
          throw new DuplicateMessage();
        }
        const newest = sql`(${inboxThreads.messageCount} = 0 or ${inboxThreads.lastMessageAt} <= ${timestamp(input.occurredAt)})`;
        await tx
          .update(inboxThreads)
          .set({
            messageCount: sql`${inboxThreads.messageCount} + 1`,
            status: "open",
            unread: true,
            contactName: sql`coalesce(${inboxThreads.contactName}, ${input.fromName})`,
            snippet: sql`case when ${newest} then ${input.snippet} else ${inboxThreads.snippet} end`,
            lastDirection: sql`case when ${newest} then 'inbound' else ${inboxThreads.lastDirection} end`,
            lastMessageAt: sql`greatest(${inboxThreads.lastMessageAt}, ${timestamp(input.occurredAt)})`,
          })
          .where(
            and(
              eq(inboxThreads.workspaceId, input.workspaceId),
              eq(inboxThreads.id, threadId),
            ),
          );
        return { stored: true, threadId };
      });
    } catch (error) {
      if (error instanceof DuplicateMessage) {
        return { stored: false, threadId: null };
      }
      throw error;
    }
  }

  async storeOutbound(input: OutboundInput): Promise<InboxMessageRow> {
    return this.db.transaction(async (tx) => {
      const [message] = await tx
        .insert(inboxMessages)
        .values({
          workspaceId: input.workspaceId,
          threadId: input.threadId,
          direction: "outbound",
          rfcMessageId: input.rfcMessageId,
          inReplyTo: input.inReplyTo,
          fromEmail: input.fromEmail,
          fromName: input.fromName,
          toEmails: input.toEmails,
          subject: input.subject,
          text: input.text,
          html: input.html,
          outboundMessageId: input.outboundMessageId,
          sentByUserId: input.sentByUserId,
          occurredAt: input.occurredAt,
        })
        .returning();
      if (!message) {
        throw new Error("The reply was not stored.");
      }
      await tx
        .update(inboxThreads)
        .set({
          messageCount: sql`${inboxThreads.messageCount} + 1`,
          status: "open",
          unread: false,
          snippet: input.snippet,
          lastDirection: "outbound",
          lastMessageAt: sql`greatest(${inboxThreads.lastMessageAt}, ${timestamp(input.occurredAt)})`,
        })
        .where(
          and(
            eq(inboxThreads.workspaceId, input.workspaceId),
            eq(inboxThreads.id, input.threadId),
          ),
        );
      return message;
    });
  }

  async listThreads(
    workspaceId: string,
    query: ThreadQuery,
  ): Promise<ThreadListRow[]> {
    const pattern = query.search ? likePattern(query.search) : null;
    const rows = await this.db
      .select({
        thread: inboxThreads,
        cursorAt: sql<string>`to_char(${inboxThreads.lastMessageAt} at time zone 'UTC', ${keysetTimestampFormat})`,
      })
      .from(inboxThreads)
      .where(
        and(
          eq(inboxThreads.workspaceId, workspaceId),
          query.unread && query.status === "open" ? unreadOpen : undefined,
          query.unread && query.status !== "open"
            ? sql`${inboxThreads.unread}`
            : undefined,
          query.unread === false ? sql`not ${inboxThreads.unread}` : undefined,
          query.status && !(query.unread && query.status === "open")
            ? eq(inboxThreads.status, query.status)
            : undefined,
          query.sourceId
            ? eq(inboxThreads.sourceId, query.sourceId)
            : undefined,
          pattern
            ? sql`(${inboxThreads.contactEmail} ilike ${pattern} or ${inboxThreads.contactName} ilike ${pattern} or ${inboxThreads.subject} ilike ${pattern})`
            : undefined,
          query.cursor
            ? sql`(${inboxThreads.lastMessageAt}, ${inboxThreads.id}) < (${query.cursor.at}::timestamptz, ${query.cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(
        sql`${inboxThreads.lastMessageAt} desc nulls last`,
        sql`${inboxThreads.id} desc nulls last`,
      )
      .limit(query.limit);
    return rows.map((row) => ({ ...row.thread, cursorAt: row.cursorAt }));
  }

  async countUnread(workspaceId: string) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(inboxThreads)
      .where(and(eq(inboxThreads.workspaceId, workspaceId), unreadOpen));
    return row?.count ?? 0;
  }

  async findThread(workspaceId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(inboxThreads)
      .where(
        and(eq(inboxThreads.workspaceId, workspaceId), eq(inboxThreads.id, id)),
      )
      .limit(1);
    return row ?? null;
  }

  async updateThread(
    workspaceId: string,
    id: string,
    patch: { status?: ThreadStatus; unread?: boolean },
  ) {
    const [row] = await this.db
      .update(inboxThreads)
      .set(patch)
      .where(
        and(eq(inboxThreads.workspaceId, workspaceId), eq(inboxThreads.id, id)),
      )
      .returning();
    return row ?? null;
  }

  listMessages(workspaceId: string, threadId: string, limit: number) {
    return this.db
      .select()
      .from(inboxMessages)
      .where(
        and(
          eq(inboxMessages.workspaceId, workspaceId),
          eq(inboxMessages.threadId, threadId),
        ),
      )
      .orderBy(asc(inboxMessages.occurredAt), asc(inboxMessages.id))
      .limit(limit);
  }

  async listRecentRfcIds(workspaceId: string, threadId: string, limit: number) {
    const rows = await this.db
      .select({
        rfcMessageId: inboxMessages.rfcMessageId,
        direction: inboxMessages.direction,
      })
      .from(inboxMessages)
      .where(
        and(
          eq(inboxMessages.workspaceId, workspaceId),
          eq(inboxMessages.threadId, threadId),
          sql`${inboxMessages.rfcMessageId} is not null`,
        ),
      )
      .orderBy(
        sql`${inboxMessages.occurredAt} desc nulls last`,
        sql`${inboxMessages.id} desc nulls last`,
      )
      .limit(limit);
    return rows.reverse();
  }

  async deleteMessagesBefore(before: Date, limit: number) {
    const result = await this.db.execute<{
      workspaceId: string;
      threadId: string;
      removed: number;
    }>(sql`
      with doomed as (
        select "inbox_messages"."id"
        from "inbox_messages"
        where "inbox_messages"."created_at" < ${timestamp(before)}
        order by "inbox_messages"."created_at"
        limit ${limit}
      ), removed as (
        delete from "inbox_messages"
        using doomed
        where "inbox_messages"."id" = doomed.id
        returning "inbox_messages"."workspace_id", "inbox_messages"."thread_id"
      )
      select workspace_id as "workspaceId", thread_id as "threadId", count(*)::int as removed
      from removed
      group by 1, 2
    `);
    return result.rows;
  }

  async shrinkThreads(
    changes: { workspaceId: string; threadId: string; removed: number }[],
  ) {
    if (changes.length === 0) {
      return 0;
    }
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`
        update "inbox_threads"
        set message_count = greatest("inbox_threads"."message_count" - change.removed, 0)
        from unnest(
          ${sql.param(changes.map((change) => change.workspaceId))}::uuid[],
          ${sql.param(changes.map((change) => change.threadId))}::uuid[],
          ${sql.param(changes.map((change) => change.removed))}::int[]
        ) as change(workspace_id, thread_id, removed)
        where "inbox_threads"."workspace_id" = change.workspace_id
          and "inbox_threads"."id" = change.thread_id
      `);
      const deleted = await tx.execute(sql`
        delete from "inbox_threads"
        using unnest(
          ${sql.param(changes.map((change) => change.workspaceId))}::uuid[],
          ${sql.param(changes.map((change) => change.threadId))}::uuid[]
        ) as change(workspace_id, thread_id)
        where "inbox_threads"."workspace_id" = change.workspace_id
          and "inbox_threads"."id" = change.thread_id
          and not exists (
            select 1
            from "inbox_messages"
            where "inbox_messages"."workspace_id" = "inbox_threads"."workspace_id"
              and "inbox_messages"."thread_id" = "inbox_threads"."id"
          )
      `);
      return deleted.rowCount ?? 0;
    });
  }
}
