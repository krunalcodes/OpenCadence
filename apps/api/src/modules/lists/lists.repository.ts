import { Inject, Injectable } from "@nestjs/common";
import { and, type Db, eq, inArray, schema, sql } from "@workspace/db";
import { DATABASE } from "../../infra/database/database.module";

const { lists, listMembers } = schema;

export type ListMemberStatus = "subscribed" | "unsubscribed";

export type ListRow = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  publicName: string | null;
  publicDescription: string | null;
  subscribedCount: number;
  unsubscribedCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ListCatalogRow = {
  id: string;
  name: string;
  isPublic: boolean;
  publicName: string | null;
  publicDescription: string | null;
};

export type ListValues = {
  name: string;
  description: string | null;
  isPublic: boolean;
  publicName: string | null;
  publicDescription: string | null;
};

export type ListWriteResult =
  | { ok: true; id: string }
  | { ok: false; reason: "name_taken" | "not_found" };

export type AddMembersResult =
  | { ok: true; added: number }
  | { ok: false; missing: "list" | "contact" };

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
export class ListsRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  private selectWithCounts(workspaceId: string, id?: string) {
    return this.db
      .select({
        id: lists.id,
        name: lists.name,
        description: lists.description,
        isPublic: lists.isPublic,
        publicName: lists.publicName,
        publicDescription: lists.publicDescription,
        subscribedCount: sql<number>`(count(*) filter (where ${listMembers.status} = 'subscribed'))::int`,
        unsubscribedCount: sql<number>`(count(*) filter (where ${listMembers.status} = 'unsubscribed'))::int`,
        createdAt: lists.createdAt,
        updatedAt: lists.updatedAt,
      })
      .from(lists)
      .leftJoin(
        listMembers,
        and(
          eq(listMembers.listId, lists.id),
          eq(listMembers.workspaceId, lists.workspaceId),
        ),
      )
      .where(
        and(
          eq(lists.workspaceId, workspaceId),
          id ? eq(lists.id, id) : undefined,
        ),
      )
      .groupBy(lists.id)
      .orderBy(sql`lower(${lists.name})`, lists.id);
  }

  listWithCounts(workspaceId: string): Promise<ListRow[]> {
    return this.selectWithCounts(workspaceId);
  }

  async findWithCounts(workspaceId: string, id: string) {
    const [row] = await this.selectWithCounts(workspaceId, id);
    return row ?? null;
  }

  catalog(workspaceId: string): Promise<ListCatalogRow[]> {
    return this.db
      .select({
        id: lists.id,
        name: lists.name,
        isPublic: lists.isPublic,
        publicName: lists.publicName,
        publicDescription: lists.publicDescription,
      })
      .from(lists)
      .where(eq(lists.workspaceId, workspaceId))
      .orderBy(sql`lower(${lists.name})`, lists.id);
  }

  async findExistingIds(workspaceId: string, ids: string[]) {
    const rows = await this.db
      .select({ id: lists.id })
      .from(lists)
      .where(and(eq(lists.workspaceId, workspaceId), inArray(lists.id, ids)));
    return rows.map((row) => row.id);
  }

  async insert(
    workspaceId: string,
    values: Pick<ListValues, "name" | "description"> & Partial<ListValues>,
  ): Promise<ListWriteResult> {
    try {
      const [row] = await this.db
        .insert(lists)
        .values({ workspaceId, ...values })
        .returning({ id: lists.id });
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

  async update(
    workspaceId: string,
    id: string,
    values: Partial<ListValues>,
  ): Promise<ListWriteResult> {
    try {
      const [row] = await this.db
        .update(lists)
        .set(values)
        .where(and(eq(lists.workspaceId, workspaceId), eq(lists.id, id)))
        .returning({ id: lists.id });
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
      .delete(lists)
      .where(and(eq(lists.workspaceId, workspaceId), eq(lists.id, id)))
      .returning({ id: lists.id });
    return rows.length > 0;
  }

  async addMembers(
    workspaceId: string,
    listIds: string[],
    contactIds: string[],
  ): Promise<AddMembersResult> {
    try {
      const result = await this.db.execute(sql`
        insert into ${listMembers} (list_id, contact_id, workspace_id, status, subscribed_at)
        select list_id, contact_id, ${workspaceId}::uuid, 'subscribed', now()
        from unnest(${uuidArray(listIds)}) as list_id
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
            failure.constraint === "list_members_list_fk" ? "list" : "contact",
        };
      }
      throw error;
    }
  }

  async removeMembers(
    workspaceId: string,
    listIds: string[],
    contactIds: string[],
  ) {
    const result = await this.db.execute(sql`
      delete from ${listMembers}
      where ${listMembers.workspaceId} = ${workspaceId}::uuid
        and ${listMembers.listId} = any(${uuidArray(listIds)})
        and ${listMembers.contactId} = any(${uuidArray(contactIds)})
    `);
    return result.rowCount ?? 0;
  }

  async setMemberStatus(
    workspaceId: string,
    listId: string,
    contactId: string,
    status: ListMemberStatus,
  ) {
    const rows = await this.db
      .update(listMembers)
      .set(
        status === "subscribed"
          ? {
              status,
              subscribedAt: sql`case when ${listMembers.status} = 'subscribed' and ${listMembers.subscribedAt} is not null then ${listMembers.subscribedAt} else now() end`,
              unsubscribedAt: null,
            }
          : {
              status,
              unsubscribedAt: sql`case when ${listMembers.status} = 'unsubscribed' and ${listMembers.unsubscribedAt} is not null then ${listMembers.unsubscribedAt} else now() end`,
            },
      )
      .where(
        and(
          eq(listMembers.workspaceId, workspaceId),
          eq(listMembers.listId, listId),
          eq(listMembers.contactId, contactId),
        ),
      )
      .returning({ contactId: listMembers.contactId });
    return rows.length > 0;
  }
}
