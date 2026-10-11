import { Inject, Injectable } from "@nestjs/common";
import { and, asc, type Db, eq, schema, sql } from "@workspace/db";
import { DATABASE } from "../../infra/database/database.module";

const { segments } = schema;

export type SegmentRow = typeof segments.$inferSelect;
export type NewSegmentRow = typeof segments.$inferInsert;
export type SegmentChanges = Partial<
  Pick<NewSegmentRow, "name" | "description" | "rules">
>;

const uniqueViolation = "23505";
const nameConstraint = "segments_workspace_id_name_uidx";

export function isNameTaken(error: unknown) {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  return candidates.some((candidate) => {
    const value = candidate as { code?: string; constraint?: string } | null;
    return (
      value?.code === uniqueViolation && value.constraint === nameConstraint
    );
  });
}

@Injectable()
export class SegmentsRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  list(workspaceId: string) {
    return this.db
      .select()
      .from(segments)
      .where(eq(segments.workspaceId, workspaceId))
      .orderBy(asc(sql`lower(${segments.name})`), asc(segments.id));
  }

  async count(workspaceId: string) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(segments)
      .where(eq(segments.workspaceId, workspaceId));
    return row?.count ?? 0;
  }

  async find(workspaceId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(segments)
      .where(and(eq(segments.workspaceId, workspaceId), eq(segments.id, id)))
      .limit(1);
    return row ?? null;
  }

  async insert(row: NewSegmentRow) {
    const [created] = await this.db.insert(segments).values(row).returning();
    if (!created) {
      throw new Error("The segment was not created.");
    }
    return created;
  }

  async update(workspaceId: string, id: string, changes: SegmentChanges) {
    const [updated] = await this.db
      .update(segments)
      .set(changes)
      .where(and(eq(segments.workspaceId, workspaceId), eq(segments.id, id)))
      .returning();
    return updated ?? null;
  }

  async delete(workspaceId: string, id: string) {
    const rows = await this.db
      .delete(segments)
      .where(and(eq(segments.workspaceId, workspaceId), eq(segments.id, id)))
      .returning({ id: segments.id });
    return rows.length > 0;
  }
}
