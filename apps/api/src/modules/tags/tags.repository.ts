import { Inject, Injectable } from "@nestjs/common";
import { and, type Db, eq, inArray, schema, sql } from "@workspace/db";
import { DATABASE } from "../../infra/database/database.module";

const { tags, contactTags } = schema;

export type TagRow = {
  id: string;
  name: string;
  contactCount: number;
  createdAt: Date;
};

export type TagWriteResult =
  | { ok: true; id: string }
  | { ok: false; reason: "name_taken" | "not_found" };

export type AttachResult =
  | { ok: true; added: number }
  | { ok: false; missing: "tag" | "contact" };

const uniqueViolation = "23505";
const foreignKeyViolation = "23503";

function databaseError(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current !== "object") {
      return null;
    }
    const { code, constraint, cause } = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
      return {
        code,
        constraint: typeof constraint === "string" ? constraint : "",
      };
    }
    current = cause;
  }
  return null;
}

function uuidArray(ids: string[]) {
  return sql`${`{${ids.join(",")}}`}::uuid[]`;
}

@Injectable()
export class TagsRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  private selectWithCounts(workspaceId: string, id?: string) {
    return this.db
      .select({
        id: tags.id,
        name: tags.name,
        contactCount: sql<number>`count(${contactTags.contactId})::int`,
        createdAt: tags.createdAt,
      })
      .from(tags)
      .leftJoin(
        contactTags,
        and(
          eq(contactTags.tagId, tags.id),
          eq(contactTags.workspaceId, tags.workspaceId),
        ),
      )
      .where(
        and(
          eq(tags.workspaceId, workspaceId),
          id ? eq(tags.id, id) : undefined,
        ),
      )
      .groupBy(tags.id)
      .orderBy(sql`lower(${tags.name})`, tags.id);
  }

  listWithCounts(workspaceId: string): Promise<TagRow[]> {
    return this.selectWithCounts(workspaceId);
  }

  async findWithCounts(workspaceId: string, id: string) {
    const [row] = await this.selectWithCounts(workspaceId, id);
    return row ?? null;
  }

  async findExistingIds(workspaceId: string, ids: string[]) {
    const rows = await this.db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.workspaceId, workspaceId), inArray(tags.id, ids)));
    return rows.map((row) => row.id);
  }

  async insert(workspaceId: string, name: string): Promise<TagWriteResult> {
    try {
      const [row] = await this.db
        .insert(tags)
        .values({ workspaceId, name })
        .returning({ id: tags.id });
      return row
        ? { ok: true, id: row.id }
        : { ok: false, reason: "not_found" };
    } catch (error) {
      if (databaseError(error)?.code === uniqueViolation) {
        return { ok: false, reason: "name_taken" };
      }
      throw error;
    }
  }

  async rename(
    workspaceId: string,
    id: string,
    name: string,
  ): Promise<TagWriteResult> {
    try {
      const [row] = await this.db
        .update(tags)
        .set({ name })
        .where(and(eq(tags.workspaceId, workspaceId), eq(tags.id, id)))
        .returning({ id: tags.id });
      return row
        ? { ok: true, id: row.id }
        : { ok: false, reason: "not_found" };
    } catch (error) {
      if (databaseError(error)?.code === uniqueViolation) {
        return { ok: false, reason: "name_taken" };
      }
      throw error;
    }
  }

  async delete(workspaceId: string, id: string) {
    const rows = await this.db
      .delete(tags)
      .where(and(eq(tags.workspaceId, workspaceId), eq(tags.id, id)))
      .returning({ id: tags.id });
    return rows.length > 0;
  }

  async attach(
    workspaceId: string,
    tagIds: string[],
    contactIds: string[],
  ): Promise<AttachResult> {
    try {
      const result = await this.db.execute(sql`
        insert into ${contactTags} (contact_id, tag_id, workspace_id)
        select contact_id, tag_id, ${workspaceId}::uuid
        from unnest(${uuidArray(tagIds)}) as tag_id
        cross join unnest(${uuidArray(contactIds)}) as contact_id
        on conflict do nothing
      `);
      return { ok: true, added: result.rowCount ?? 0 };
    } catch (error) {
      const failure = databaseError(error);
      if (failure?.code === foreignKeyViolation) {
        return {
          ok: false,
          missing:
            failure.constraint === "contact_tags_tag_fk" ? "tag" : "contact",
        };
      }
      throw error;
    }
  }

  async detach(workspaceId: string, tagIds: string[], contactIds: string[]) {
    const result = await this.db.execute(sql`
      delete from ${contactTags}
      where ${contactTags.workspaceId} = ${workspaceId}::uuid
        and ${contactTags.tagId} = any(${uuidArray(tagIds)})
        and ${contactTags.contactId} = any(${uuidArray(contactIds)})
    `);
    return result.rowCount ?? 0;
  }
}
