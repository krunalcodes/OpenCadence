import { Inject, Injectable } from "@nestjs/common";
import { and, asc, type Db, eq, inArray, schema, sql } from "@workspace/db";
import { DATABASE } from "../../infra/database/database.module";
import type { ContactTextColumn, StoredCustomValue } from "./contact-input";
import { escapeLike, type SqlFragment } from "./filters/filter.compiler";

const { contacts, contactFields, contactTags, listMembers, lists, tags } =
  schema;

export type ContactRow = Awaited<
  ReturnType<ContactsRepository["pageQuery"]>
>[number];
export type ContactFieldRow = typeof contactFields.$inferSelect;

export type ContactCursor = { createdAt: string; id: string };

export type ContactScope = {
  workspaceId: string;
  search?: string;
  listId?: string;
  tagId?: string;
  filter?: SqlFragment;
};

export type ContactPageQuery = ContactScope & {
  cursor?: ContactCursor;
  limit: number;
};

export type ContactColumns = Partial<Record<ContactTextColumn, string | null>>;

export type ContactUpsertRow = {
  email: string;
  columns: ContactColumns;
  fields: Record<string, StoredCustomValue>;
};

export type FieldInsertResult =
  | { ok: true; row: ContactFieldRow }
  | { ok: false; reason: "limit_reached" | "key_taken" };

export const minimumSubstringSearchLength = 3;

const columnNames: Record<ContactTextColumn, string> = {
  firstName: "first_name",
  lastName: "last_name",
  company: "company",
  jobTitle: "job_title",
  phone: "phone",
  city: "city",
  country: "country",
  timezone: "timezone",
};

const selection = {
  id: contacts.id,
  email: contacts.email,
  firstName: contacts.firstName,
  lastName: contacts.lastName,
  company: contacts.company,
  jobTitle: contacts.jobTitle,
  phone: contacts.phone,
  city: contacts.city,
  country: contacts.country,
  timezone: contacts.timezone,
  fields: contacts.fields,
  origin: contacts.origin,
  createdAt: contacts.createdAt,
  updatedAt: contacts.updatedAt,
  cursorCreatedAt: sql<string>`to_char(${contacts.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
};

function searchCondition(search?: string) {
  const term = search?.trim().toLowerCase();
  if (!term) {
    return undefined;
  }
  return term.length >= minimumSubstringSearchLength
    ? sql`${contacts.searchText} like ${`%${escapeLike(term)}%`}`
    : sql`${contacts.email} like ${`${escapeLike(term)}%`}`;
}

function scopeConditions(scope: ContactScope) {
  return [
    eq(contacts.workspaceId, scope.workspaceId),
    searchCondition(scope.search),
    scope.listId
      ? sql`exists (select 1 from ${listMembers} where ${listMembers.listId} = ${scope.listId} and ${listMembers.contactId} = ${contacts.id})`
      : undefined,
    scope.tagId
      ? sql`exists (select 1 from ${contactTags} where ${contactTags.contactId} = ${contacts.id} and ${contactTags.tagId} = ${scope.tagId})`
      : undefined,
    scope.filter,
  ];
}

function isUniqueViolation(error: unknown) {
  const seen = new Set<unknown>();
  let current = error;
  while (
    typeof current === "object" &&
    current !== null &&
    !seen.has(current)
  ) {
    if ((current as { code?: unknown }).code === "23505") {
      return true;
    }
    seen.add(current);
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

@Injectable()
export class ContactsRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  pageQuery(query: ContactPageQuery) {
    const { cursor } = query;
    return this.db
      .select(selection)
      .from(contacts)
      .where(
        and(
          ...scopeConditions(query),
          cursor
            ? sql`(${contacts.createdAt}, ${contacts.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(
        sql`${contacts.createdAt} desc nulls last`,
        sql`${contacts.id} desc nulls last`,
      )
      .limit(query.limit);
  }

  countQuery(scope: ContactScope) {
    return this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(and(...scopeConditions(scope)));
  }

  async count(scope: ContactScope) {
    const [row] = await this.countQuery(scope);
    return row?.count ?? 0;
  }

  async findById(workspaceId: string, id: string) {
    const [row] = await this.db
      .select(selection)
      .from(contacts)
      .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, id)))
      .limit(1);
    return row ?? null;
  }

  findByIds(workspaceId: string, ids: string[]) {
    return this.db
      .select(selection)
      .from(contacts)
      .where(
        and(eq(contacts.workspaceId, workspaceId), inArray(contacts.id, ids)),
      );
  }

  async existingIds(workspaceId: string, ids: string[]) {
    const rows = await this.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(eq(contacts.workspaceId, workspaceId), inArray(contacts.id, ids)),
      );
    return rows.map((row) => row.id);
  }

  tagsOf(workspaceId: string, contactIds: string[]) {
    return this.db
      .select({
        contactId: contactTags.contactId,
        id: tags.id,
        name: tags.name,
      })
      .from(contactTags)
      .innerJoin(tags, eq(tags.id, contactTags.tagId))
      .where(
        and(
          inArray(contactTags.contactId, contactIds),
          eq(contactTags.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(sql`lower(${tags.name})`));
  }

  listsOf(workspaceId: string, contactIds: string[]) {
    return this.db
      .select({
        contactId: listMembers.contactId,
        id: lists.id,
        name: lists.name,
        status: listMembers.status,
      })
      .from(listMembers)
      .innerJoin(lists, eq(lists.id, listMembers.listId))
      .where(
        and(
          inArray(listMembers.contactId, contactIds),
          eq(listMembers.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(sql`lower(${lists.name})`));
  }

  async existingListIds(workspaceId: string, ids: string[]) {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({ id: lists.id })
      .from(lists)
      .where(and(eq(lists.workspaceId, workspaceId), inArray(lists.id, ids)));
    return rows.map((row) => row.id);
  }

  async existingTagIds(workspaceId: string, ids: string[]) {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.workspaceId, workspaceId), inArray(tags.id, ids)));
    return rows.map((row) => row.id);
  }

  async insert(
    workspaceId: string,
    values: ContactUpsertRow & { origin: string },
  ) {
    const [row] = await this.db
      .insert(contacts)
      .values({
        workspaceId,
        email: values.email,
        ...values.columns,
        fields: values.fields,
        origin: values.origin,
      })
      .onConflictDoNothing({ target: [contacts.workspaceId, contacts.email] })
      .returning({ id: contacts.id });
    return row?.id ?? null;
  }

  async update(
    workspaceId: string,
    id: string,
    values: {
      email?: string;
      columns: ContactColumns;
      fieldsToSet: Record<string, StoredCustomValue>;
      fieldsToRemove: string[];
    },
  ): Promise<"updated" | "not_found" | "email_taken"> {
    try {
      const rows = await this.db
        .update(contacts)
        .set({
          ...(values.email ? { email: values.email } : {}),
          ...values.columns,
          fields: sql`(${contacts.fields} || ${JSON.stringify(values.fieldsToSet)}::jsonb) - array(select jsonb_array_elements_text(${JSON.stringify(values.fieldsToRemove)}::jsonb))`,
        })
        .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, id)))
        .returning({ id: contacts.id });
      return rows.length > 0 ? "updated" : "not_found";
    } catch (error) {
      if (isUniqueViolation(error)) {
        return "email_taken";
      }
      throw error;
    }
  }

  async delete(workspaceId: string, id: string) {
    const rows = await this.db
      .delete(contacts)
      .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, id)))
      .returning({ id: contacts.id });
    return rows.length > 0;
  }

  async deleteMany(workspaceId: string, ids: string[]) {
    const rows = await this.db
      .delete(contacts)
      .where(
        and(eq(contacts.workspaceId, workspaceId), inArray(contacts.id, ids)),
      )
      .returning({ id: contacts.id });
    return rows.length;
  }

  upsertMany(
    workspaceId: string,
    rows: ContactUpsertRow[],
    origin: string,
    updateExisting: boolean,
  ) {
    const target = [contacts.workspaceId, contacts.email];
    const insert = this.db.insert(contacts).values(
      rows.map((row) => ({
        workspaceId,
        email: row.email,
        firstName: row.columns.firstName ?? null,
        lastName: row.columns.lastName ?? null,
        company: row.columns.company ?? null,
        jobTitle: row.columns.jobTitle ?? null,
        phone: row.columns.phone ?? null,
        city: row.columns.city ?? null,
        country: row.columns.country ?? null,
        timezone: row.columns.timezone ?? null,
        fields: row.fields,
        origin,
      })),
    );
    const keepWhenAbsent = Object.fromEntries(
      Object.entries(columnNames).map(([property, column]) => [
        property,
        sql.raw(`coalesce(excluded.${column}, contacts.${column})`),
      ]),
    );
    const resolved = updateExisting
      ? insert.onConflictDoUpdate({
          target,
          set: {
            ...keepWhenAbsent,
            fields: sql.raw("contacts.fields || excluded.fields"),
            updatedAt: sql`now()`,
          },
        })
      : insert.onConflictDoNothing({ target });
    return resolved.returning({
      id: contacts.id,
      email: contacts.email,
      created: sql<boolean>`(xmax = 0)`,
    });
  }

  listFields(workspaceId: string) {
    return this.db
      .select()
      .from(contactFields)
      .where(eq(contactFields.workspaceId, workspaceId))
      .orderBy(
        asc(contactFields.position),
        asc(contactFields.createdAt),
        asc(contactFields.id),
      );
  }

  insertField(
    workspaceId: string,
    values: {
      key: string;
      label: string;
      type: string;
      options: string[] | null;
    },
    maxFields: number,
  ): Promise<FieldInsertResult> {
    return this.db.transaction(async (tx): Promise<FieldInsertResult> => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`contact_fields:${workspaceId}`}, 0))`,
      );
      const [summary] = await tx
        .select({
          count: sql<number>`count(*)::int`,
          lastPosition: sql<number>`coalesce(max(${contactFields.position}), -1)::int`,
        })
        .from(contactFields)
        .where(eq(contactFields.workspaceId, workspaceId));
      if ((summary?.count ?? 0) >= maxFields) {
        return { ok: false, reason: "limit_reached" };
      }
      const [row] = await tx
        .insert(contactFields)
        .values({
          workspaceId,
          ...values,
          position: (summary?.lastPosition ?? -1) + 1,
        })
        .onConflictDoNothing({
          target: [contactFields.workspaceId, contactFields.key],
        })
        .returning();
      return row ? { ok: true, row } : { ok: false, reason: "key_taken" };
    });
  }

  async updateField(
    workspaceId: string,
    id: string,
    values: { label?: string; options?: string[]; position?: number },
  ) {
    const [row] = await this.db
      .update(contactFields)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(contactFields.workspaceId, workspaceId),
          eq(contactFields.id, id),
        ),
      )
      .returning();
    return row ?? null;
  }

  async findField(workspaceId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(contactFields)
      .where(
        and(
          eq(contactFields.workspaceId, workspaceId),
          eq(contactFields.id, id),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async deleteField(workspaceId: string, id: string) {
    const rows = await this.db
      .delete(contactFields)
      .where(
        and(
          eq(contactFields.workspaceId, workspaceId),
          eq(contactFields.id, id),
        ),
      )
      .returning({ id: contactFields.id });
    return rows.length > 0;
  }
}
