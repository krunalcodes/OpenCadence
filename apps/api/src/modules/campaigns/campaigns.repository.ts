import { Inject, Injectable } from "@nestjs/common";
import { and, type Db, eq, inArray, ne, schema, sql } from "@workspace/db";
import {
  type KeysetCursor,
  keysetTimestampFormat,
} from "../../common/pagination/keyset-cursor";
import { DATABASE } from "../../infra/database/database.module";
import type { CampaignStatus } from "./campaigns.constants";

const { campaigns } = schema;

export type CampaignRow = typeof campaigns.$inferSelect;

export type CampaignAudience = schema.CampaignAudience;

export type CampaignListRow = { campaign: CampaignRow; cursorAt: string };

export type DraftValues = {
  name: string;
  templateId: string | null;
  subject: string;
  previewText: string;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  sourceId: string | null;
  audience: CampaignAudience | null;
  trackOpens: boolean;
  trackClicks: boolean;
};

export type TransitionValues = Partial<
  Pick<
    CampaignRow,
    | "sourceId"
    | "snapshotId"
    | "scheduledAt"
    | "startedAt"
    | "completedAt"
    | "fanoutCursor"
    | "fanoutDoneAt"
    | "errorCode"
    | "errorMessage"
  >
>;

export const outcomeCounters = {
  sent: campaigns.sentCount,
  delivered: campaigns.deliveredCount,
  bounced: campaigns.bouncedCount,
  complained: campaigns.complainedCount,
  failed: campaigns.failedCount,
  opened: campaigns.openedCount,
  clicked: campaigns.clickedCount,
  unsubscribed: campaigns.unsubscribedCount,
} as const;

export type OutcomeCounter = keyof typeof outcomeCounters;

const counterFields = {
  sent: "sentCount",
  delivered: "deliveredCount",
  bounced: "bouncedCount",
  complained: "complainedCount",
  failed: "failedCount",
  opened: "openedCount",
  clicked: "clickedCount",
  unsubscribed: "unsubscribedCount",
} as const satisfies Record<OutcomeCounter, keyof CampaignRow>;

export type DeliveryCounts = {
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  failed: number;
  skipped: number;
};

function likePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function scoped(workspaceId: string, id: string) {
  return and(eq(campaigns.workspaceId, workspaceId), eq(campaigns.id, id));
}

@Injectable()
export class CampaignsRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  list(
    workspaceId: string,
    query: {
      status?: CampaignStatus;
      search?: string;
      cursor?: KeysetCursor;
      limit: number;
    },
  ): Promise<CampaignListRow[]> {
    const pattern = query.search ? `%${likePattern(query.search)}%` : null;
    return this.db
      .select({
        campaign: campaigns,
        cursorAt: sql<string>`to_char(${campaigns.createdAt} at time zone 'UTC', ${keysetTimestampFormat})`,
      })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.workspaceId, workspaceId),
          query.status ? eq(campaigns.status, query.status) : undefined,
          pattern ? sql`${campaigns.name} ilike ${pattern}` : undefined,
          query.cursor
            ? sql`(${campaigns.createdAt}, ${campaigns.id}) < (${query.cursor.at}::timestamptz, ${query.cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(
        sql`${campaigns.createdAt} desc nulls last`,
        sql`${campaigns.id} desc nulls last`,
      )
      .limit(query.limit);
  }

  listActivity(workspaceId: string, limit: number): Promise<CampaignRow[]> {
    return this.db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.workspaceId, workspaceId),
          ne(campaigns.status, "draft"),
        ),
      )
      .orderBy(
        sql`coalesce(${campaigns.startedAt}, ${campaigns.scheduledAt}, ${campaigns.createdAt}) desc nulls last`,
        sql`${campaigns.id} desc nulls last`,
      )
      .limit(limit);
  }

  async find(workspaceId: string, id: string): Promise<CampaignRow | null> {
    const [row] = await this.db
      .select()
      .from(campaigns)
      .where(scoped(workspaceId, id));
    return row ?? null;
  }

  async insert(
    workspaceId: string,
    values: DraftValues,
    userId: string | null,
  ): Promise<CampaignRow> {
    const [row] = await this.db
      .insert(campaigns)
      .values({ workspaceId, ...values, createdByUserId: userId })
      .returning();
    if (!row) {
      throw new Error("The campaign was not created.");
    }
    return row;
  }

  async updateDraft(
    workspaceId: string,
    id: string,
    values: Partial<DraftValues>,
  ): Promise<CampaignRow | null> {
    const [row] = await this.db
      .update(campaigns)
      .set(values)
      .where(and(scoped(workspaceId, id), eq(campaigns.status, "draft")))
      .returning();
    return row ?? null;
  }

  async deleteUnlessSending(workspaceId: string, id: string) {
    const rows = await this.db
      .delete(campaigns)
      .where(and(scoped(workspaceId, id), ne(campaigns.status, "sending")))
      .returning({ id: campaigns.id });
    return rows.length > 0;
  }

  async transition(
    workspaceId: string,
    id: string,
    from: CampaignStatus[],
    to: CampaignStatus,
    values: TransitionValues = {},
  ): Promise<CampaignRow | null> {
    const [row] = await this.db
      .update(campaigns)
      .set({ ...values, status: to })
      .where(and(scoped(workspaceId, id), inArray(campaigns.status, from)))
      .returning();
    return row ?? null;
  }

  async advanceFanout(
    workspaceId: string,
    id: string,
    step: {
      previousCursor: string | null;
      cursor: string | null;
      recipients: number;
      skipped: number;
      done: boolean;
    },
  ): Promise<boolean> {
    const rows = await this.db
      .update(campaigns)
      .set({
        fanoutCursor: step.cursor,
        recipientCount: sql`${campaigns.recipientCount} + ${step.recipients}`,
        skippedCount: sql`${campaigns.skippedCount} + ${step.skipped}`,
        ...(step.done ? { fanoutDoneAt: sql`now()` } : {}),
      })
      .where(
        and(
          scoped(workspaceId, id),
          sql`${campaigns.fanoutDoneAt} is null`,
          sql`${campaigns.fanoutCursor} is not distinct from ${step.previousCursor}::uuid`,
        ),
      )
      .returning({ id: campaigns.id });
    return rows.length > 0;
  }

  async increment(workspaceId: string, id: string, counter: OutcomeCounter) {
    const column = outcomeCounters[counter];
    await this.db
      .update(campaigns)
      .set({ [counterFields[counter]]: sql`${column} + 1` })
      .where(scoped(workspaceId, id));
  }

  async setDeliveryCounts(
    workspaceId: string,
    id: string,
    counts: DeliveryCounts,
  ) {
    await this.db
      .update(campaigns)
      .set({
        sentCount: counts.sent,
        deliveredCount: counts.delivered,
        bouncedCount: counts.bounced,
        complainedCount: counts.complained,
        failedCount: counts.failed,
        skippedCount: sql`case when ${campaigns.fanoutDoneAt} is not null then ${counts.skipped}::int else ${campaigns.skippedCount} end`,
      })
      .where(scoped(workspaceId, id));
  }

  startDue(now: Date): Promise<{ id: string; workspaceId: string }[]> {
    return this.db
      .update(campaigns)
      .set({ status: "sending", startedAt: now })
      .where(
        and(
          eq(campaigns.status, "scheduled"),
          sql`${campaigns.scheduledAt} <= ${now.toISOString()}::timestamptz`,
        ),
      )
      .returning({ id: campaigns.id, workspaceId: campaigns.workspaceId });
  }

  listToReconcile(
    finishedSince: Date,
    afterId: string | null,
    limit: number,
  ): Promise<CampaignRow[]> {
    return this.db
      .select()
      .from(campaigns)
      .where(
        and(
          sql`(${campaigns.status} in ('sending', 'paused')
            or (${campaigns.status} in ('sent', 'cancelled', 'failed')
              and ${campaigns.completedAt} >= ${finishedSince.toISOString()}::timestamptz))`,
          afterId ? sql`${campaigns.id} > ${afterId}::uuid` : undefined,
        ),
      )
      .orderBy(sql`${campaigns.id} asc`)
      .limit(limit);
  }
}
