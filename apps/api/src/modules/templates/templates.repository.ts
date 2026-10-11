import { Inject, Injectable } from "@nestjs/common";
import { and, type Db, eq, schema, sql } from "@workspace/db";
import { databaseError, uniqueViolation } from "../../common/database-error";
import {
  type KeysetCursor,
  keysetTimestampFormat,
} from "../../common/pagination/keyset-cursor";
import { DATABASE } from "../../infra/database/database.module";

const { templates } = schema;

export type TemplateSummaryRow = {
  id: string;
  name: string;
  subject: string;
  previewText: string;
  createdAt: Date;
  updatedAt: Date;
  cursorAt: string;
};

export type TemplateRow = Omit<TemplateSummaryRow, "cursorAt"> & {
  document: Record<string, unknown> | null;
  html: string;
  text: string;
};

export type TemplateValues = {
  name: string;
  subject: string;
  previewText: string;
  document: Record<string, unknown> | null;
  html: string;
  text: string;
};

export type TemplateWriteResult =
  | { ok: true; row: TemplateRow }
  | { ok: false; reason: "name_taken" | "not_found" };

const summaryColumns = {
  id: templates.id,
  name: templates.name,
  subject: templates.subject,
  previewText: templates.previewText,
  createdAt: templates.createdAt,
  updatedAt: templates.updatedAt,
  cursorAt: sql<string>`to_char(${templates.updatedAt} at time zone 'UTC', ${keysetTimestampFormat})`,
};

const columns = {
  id: templates.id,
  name: templates.name,
  subject: templates.subject,
  previewText: templates.previewText,
  document: templates.document,
  html: templates.html,
  text: templates.text,
  createdAt: templates.createdAt,
  updatedAt: templates.updatedAt,
};

function likePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

@Injectable()
export class TemplatesRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  list(
    workspaceId: string,
    query: { search?: string; cursor?: KeysetCursor; limit: number },
  ): Promise<TemplateSummaryRow[]> {
    const pattern = query.search ? `%${likePattern(query.search)}%` : null;
    return this.db
      .select(summaryColumns)
      .from(templates)
      .where(
        and(
          eq(templates.workspaceId, workspaceId),
          pattern
            ? sql`(${templates.name} ilike ${pattern} or ${templates.subject} ilike ${pattern})`
            : undefined,
          query.cursor
            ? sql`(${templates.updatedAt}, ${templates.id}) < (${query.cursor.at}::timestamptz, ${query.cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(
        sql`${templates.updatedAt} desc nulls last`,
        sql`${templates.id} desc nulls last`,
      )
      .limit(query.limit);
  }

  async find(workspaceId: string, id: string): Promise<TemplateRow | null> {
    const [row] = await this.db
      .select(columns)
      .from(templates)
      .where(and(eq(templates.workspaceId, workspaceId), eq(templates.id, id)));
    return row ?? null;
  }

  async namesStartingWith(workspaceId: string, prefix: string) {
    const rows = await this.db
      .select({ name: templates.name })
      .from(templates)
      .where(
        and(
          eq(templates.workspaceId, workspaceId),
          sql`lower(${templates.name}) like ${`${likePattern(prefix.toLowerCase())}%`}`,
        ),
      );
    return rows.map((row) => row.name);
  }

  async insert(
    workspaceId: string,
    values: TemplateValues,
    userId: string | null,
  ): Promise<TemplateWriteResult> {
    try {
      const [row] = await this.db
        .insert(templates)
        .values({
          workspaceId,
          ...values,
          createdByUserId: userId,
          updatedByUserId: userId,
        })
        .returning(columns);
      return row ? { ok: true, row } : { ok: false, reason: "not_found" };
    } catch (error) {
      if (databaseError(error)?.code === uniqueViolation) {
        return { ok: false, reason: "name_taken" };
      }
      throw error;
    }
  }

  async update(
    workspaceId: string,
    id: string,
    values: Partial<TemplateValues>,
    userId: string | null,
  ): Promise<TemplateWriteResult> {
    try {
      const [row] = await this.db
        .update(templates)
        .set({ ...values, updatedByUserId: userId })
        .where(
          and(eq(templates.workspaceId, workspaceId), eq(templates.id, id)),
        )
        .returning(columns);
      return row ? { ok: true, row } : { ok: false, reason: "not_found" };
    } catch (error) {
      if (databaseError(error)?.code === uniqueViolation) {
        return { ok: false, reason: "name_taken" };
      }
      throw error;
    }
  }

  async delete(workspaceId: string, id: string) {
    const rows = await this.db
      .delete(templates)
      .where(and(eq(templates.workspaceId, workspaceId), eq(templates.id, id)))
      .returning({ id: templates.id });
    return rows.length > 0;
  }
}
