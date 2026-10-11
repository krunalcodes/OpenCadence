import { Inject, Injectable } from "@nestjs/common";
import { and, type Db, desc, eq, inArray, schema, sql } from "@workspace/db";
import { DATABASE } from "../../infra/database/database.module";

const { imports } = schema;

export type ImportRow = typeof imports.$inferSelect;
export type NewImportRow = typeof imports.$inferInsert;
export type ImportStatus =
  | "uploaded"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type ImportChanges = Partial<
  Pick<
    ImportRow,
    | "status"
    | "mapping"
    | "options"
    | "totalRows"
    | "processedRows"
    | "createdCount"
    | "updatedCount"
    | "skippedCount"
    | "errorCount"
    | "errorReportKey"
    | "errorMessage"
    | "startedAt"
    | "finishedAt"
  >
>;

export type StartOutcome =
  | { outcome: "started"; row: ImportRow }
  | { outcome: "conflict" | "too_many" | "not_found" };

const activeStatuses: ImportStatus[] = ["queued", "running"];

@Injectable()
export class ImportsRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  async insert(row: NewImportRow) {
    await this.db.insert(imports).values(row).onConflictDoNothing();
  }

  async find(workspaceId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(imports)
      .where(and(eq(imports.workspaceId, workspaceId), eq(imports.id, id)));
    return row ?? null;
  }

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(imports)
      .where(eq(imports.id, id));
    return row ?? null;
  }

  list(workspaceId: string, limit: number) {
    return this.db
      .select()
      .from(imports)
      .where(eq(imports.workspaceId, workspaceId))
      .orderBy(desc(imports.createdAt), desc(imports.id))
      .limit(limit);
  }

  start(
    workspaceId: string,
    id: string,
    changes: Pick<ImportRow, "mapping" | "options">,
    maxActive: number,
  ): Promise<StartOutcome> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`imports:${workspaceId}`}, 0))`,
      );
      const [current] = await tx
        .select({ status: imports.status })
        .from(imports)
        .where(and(eq(imports.workspaceId, workspaceId), eq(imports.id, id)));
      if (!current) {
        return { outcome: "not_found" };
      }
      if (current.status !== "uploaded") {
        return { outcome: "conflict" };
      }
      const [active] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(imports)
        .where(
          and(
            eq(imports.workspaceId, workspaceId),
            inArray(imports.status, activeStatuses),
          ),
        );
      if ((active?.count ?? 0) >= maxActive) {
        return { outcome: "too_many" };
      }
      const [row] = await tx
        .update(imports)
        .set({ ...changes, status: "queued" })
        .where(and(eq(imports.id, id), eq(imports.status, "uploaded")))
        .returning();
      return row ? { outcome: "started", row } : { outcome: "conflict" };
    });
  }

  async update(id: string, changes: ImportChanges, from?: ImportStatus[]) {
    const [row] = await this.db
      .update(imports)
      .set(changes)
      .where(
        and(
          eq(imports.id, id),
          from ? inArray(imports.status, from) : undefined,
        ),
      )
      .returning();
    return row ?? null;
  }

  async attachErrorReport(id: string, key: string) {
    await this.db
      .update(imports)
      .set({ errorReportKey: key })
      .where(and(eq(imports.id, id), sql`${imports.errorCount} > 0`));
  }
}

export type StoredOptions = {
  parts: number | null;
  started: boolean;
  updateExisting: boolean;
  listIds: string[];
  tagIds: string[];
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function readOptions(options: ImportRow["options"]): StoredOptions {
  const stored = options ?? {};
  return {
    parts:
      typeof stored.parts === "number" && Number.isInteger(stored.parts)
        ? stored.parts
        : null,
    started: typeof stored.updateExisting === "boolean",
    updateExisting: stored.updateExisting === true,
    listIds: stringArray(stored.listIds),
    tagIds: stringArray(stored.tagIds),
  };
}
