import { Inject, Injectable } from "@nestjs/common";
import { and, asc, type Db, eq, inArray, schema, sql } from "@workspace/db";
import { databaseError, uniqueViolation } from "../../common/database-error";
import { DATABASE } from "../../infra/database/database.module";

const { sendingDomains, users } = schema;

export type DomainRow = typeof sendingDomains.$inferSelect;

export type StoredChecks = NonNullable<DomainRow["checks"]>;

export type DomainInsertResult =
  | { ok: true; row: DomainRow }
  | { ok: false; reason: "domain_taken" };

export type CheckSave = {
  status: string;
  checks: StoredChecks;
  checkedAt: Date | null;
  changedAt: Date;
  nextCheckAt: Date;
};

@Injectable()
export class DomainsRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  list(workspaceId: string): Promise<DomainRow[]> {
    return this.db
      .select()
      .from(sendingDomains)
      .where(eq(sendingDomains.workspaceId, workspaceId))
      .orderBy(asc(sendingDomains.domain), asc(sendingDomains.id));
  }

  async find(workspaceId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(sendingDomains)
      .where(
        and(
          eq(sendingDomains.workspaceId, workspaceId),
          eq(sendingDomains.id, id),
        ),
      );
    return row ?? null;
  }

  async count(workspaceId: string) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(sendingDomains)
      .where(eq(sendingDomains.workspaceId, workspaceId));
    return row?.count ?? 0;
  }

  async listNames(workspaceId: string) {
    const rows = await this.db
      .select({ domain: sendingDomains.domain })
      .from(sendingDomains)
      .where(eq(sendingDomains.workspaceId, workspaceId));
    return rows.map((row) => row.domain);
  }

  listFailing(workspaceId: string) {
    return this.db
      .select({ id: sendingDomains.id, domain: sendingDomains.domain })
      .from(sendingDomains)
      .where(
        and(
          eq(sendingDomains.workspaceId, workspaceId),
          eq(sendingDomains.status, "failing"),
        ),
      )
      .orderBy(
        sql`${sendingDomains.statusChangedAt} desc nulls last`,
        asc(sendingDomains.domain),
      );
  }

  async insert(
    workspaceId: string,
    values: {
      domain: string;
      dkimSelectors: string[];
      createdByUserId: string | null;
    },
  ): Promise<DomainInsertResult> {
    try {
      const [row] = await this.db
        .insert(sendingDomains)
        .values({ workspaceId, nextCheckAt: new Date(), ...values })
        .returning();
      if (!row) {
        throw new Error("The domain was not saved.");
      }
      return { ok: true, row };
    } catch (error) {
      if (databaseError(error)?.code === uniqueViolation) {
        return { ok: false, reason: "domain_taken" };
      }
      throw error;
    }
  }

  async updateSelectors(workspaceId: string, id: string, selectors: string[]) {
    const [row] = await this.db
      .update(sendingDomains)
      .set({ dkimSelectors: selectors })
      .where(
        and(
          eq(sendingDomains.workspaceId, workspaceId),
          eq(sendingDomains.id, id),
        ),
      )
      .returning();
    return row ?? null;
  }

  async saveCheck(workspaceId: string, id: string, save: CheckSave) {
    const changedAt = save.changedAt.toISOString();
    const [row] = await this.db
      .update(sendingDomains)
      .set({
        status: save.status,
        checks: save.checks,
        ...(save.checkedAt ? { lastCheckedAt: save.checkedAt } : {}),
        nextCheckAt: save.nextCheckAt,
        statusChangedAt: sql`case when ${sendingDomains.status} is distinct from ${save.status} then ${changedAt}::timestamptz else ${sendingDomains.statusChangedAt} end`,
      })
      .where(
        and(
          eq(sendingDomains.workspaceId, workspaceId),
          eq(sendingDomains.id, id),
        ),
      )
      .returning();
    return row ?? null;
  }

  async scheduleCheck(workspaceId: string, id: string, at: Date) {
    await this.db
      .update(sendingDomains)
      .set({ nextCheckAt: at })
      .where(
        and(
          eq(sendingDomains.workspaceId, workspaceId),
          eq(sendingDomains.id, id),
        ),
      );
  }

  async delete(workspaceId: string, id: string) {
    const rows = await this.db
      .delete(sendingDomains)
      .where(
        and(
          eq(sendingDomains.workspaceId, workspaceId),
          eq(sendingDomains.id, id),
        ),
      )
      .returning({ id: sendingDomains.id });
    return rows.length > 0;
  }

  claimDue(
    now: Date,
    leaseUntil: Date,
    limit: number,
    workspaceIds?: string[],
  ): Promise<DomainRow[]> {
    if (workspaceIds && workspaceIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.db.transaction(async (tx) => {
      const due = await tx
        .select({ id: sendingDomains.id })
        .from(sendingDomains)
        .where(
          and(
            sql`${sendingDomains.nextCheckAt} <= ${now.toISOString()}::timestamptz`,
            workspaceIds
              ? inArray(sendingDomains.workspaceId, workspaceIds)
              : undefined,
          ),
        )
        .orderBy(asc(sendingDomains.nextCheckAt))
        .limit(limit)
        .for("update", { skipLocked: true });
      if (due.length === 0) {
        return [];
      }
      return tx
        .update(sendingDomains)
        .set({ nextCheckAt: leaseUntil })
        .where(
          inArray(
            sendingDomains.id,
            due.map((row) => row.id),
          ),
        )
        .returning();
    });
  }

  async findUserEmail(userId: string) {
    const [row] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    return row?.email ?? null;
  }
}
