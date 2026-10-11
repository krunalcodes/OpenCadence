import { Inject, Injectable } from "@nestjs/common";
import { and, type Db, desc, eq, inArray, schema, sql } from "@workspace/db";
import { DATABASE } from "../../infra/database/database.module";

const { suppressions } = schema;

export type SuppressionRow = typeof suppressions.$inferSelect;
export type NewSuppressionRow = typeof suppressions.$inferInsert;

export type SuppressionCursor = { createdAt: string; id: string };

export type SuppressionListQuery = {
  workspaceId: string;
  reason?: string;
  emailPrefix?: string;
  cursor?: SuppressionCursor;
  limit: number;
};

const insertBatchSize = 500;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

@Injectable()
export class SuppressionRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  findByEmails(workspaceId: string, emails: string[], reasons?: string[]) {
    return this.db
      .select({ email: suppressions.email, reason: suppressions.reason })
      .from(suppressions)
      .where(
        and(
          eq(suppressions.workspaceId, workspaceId),
          inArray(suppressions.email, emails),
          reasons ? inArray(suppressions.reason, reasons) : undefined,
        ),
      );
  }

  async insertIgnoringExisting(rows: NewSuppressionRow[]) {
    if (rows.length === 0) {
      return 0;
    }
    return this.db.transaction(async (tx) => {
      let inserted = 0;
      for (let start = 0; start < rows.length; start += insertBatchSize) {
        const created = await tx
          .insert(suppressions)
          .values(rows.slice(start, start + insertBatchSize))
          .onConflictDoNothing()
          .returning({ id: suppressions.id });
        inserted += created.length;
      }
      return inserted;
    });
  }

  list(query: SuppressionListQuery) {
    const { cursor } = query;
    return this.db
      .select({
        id: suppressions.id,
        email: suppressions.email,
        reason: suppressions.reason,
        origin: suppressions.origin,
        sourceId: suppressions.sourceId,
        note: suppressions.note,
        createdAt: suppressions.createdAt,
        cursorCreatedAt: sql<string>`to_char(${suppressions.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(suppressions)
      .where(
        and(
          eq(suppressions.workspaceId, query.workspaceId),
          query.reason ? eq(suppressions.reason, query.reason) : undefined,
          query.emailPrefix
            ? sql`${suppressions.email} like ${`${escapeLike(query.emailPrefix)}%`}`
            : undefined,
          cursor
            ? sql`(${suppressions.createdAt}, ${suppressions.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(suppressions.createdAt), desc(suppressions.id))
      .limit(query.limit);
  }

  async delete(workspaceId: string, id: string) {
    const rows = await this.db
      .delete(suppressions)
      .where(
        and(eq(suppressions.workspaceId, workspaceId), eq(suppressions.id, id)),
      )
      .returning({ id: suppressions.id });
    return rows.length > 0;
  }
}
