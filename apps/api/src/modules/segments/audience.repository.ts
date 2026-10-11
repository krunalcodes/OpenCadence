import { Inject, Injectable } from "@nestjs/common";
import { and, type Db, eq, inArray, schema, sql } from "@workspace/db";
import { DATABASE } from "../../infra/database/database.module";

const { contacts, listMembers, lists, suppressions } = schema;

type SqlFragment = ReturnType<typeof sql>;

export type AudienceContactRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  fields: Record<string, string | number | boolean | null>;
};

export type AudienceScope =
  | { type: "all" }
  | { type: "lists"; listIds: string[] }
  | { type: "segment"; filter: SqlFragment | undefined };

const contactColumns = sql`
  ${contacts.id} as "id",
  ${contacts.email} as "email",
  ${contacts.firstName} as "firstName",
  ${contacts.lastName} as "lastName",
  ${contacts.company} as "company",
  ${contacts.jobTitle} as "jobTitle",
  ${contacts.phone} as "phone",
  ${contacts.city} as "city",
  ${contacts.country} as "country",
  ${contacts.fields} as "fields"
`;

function uuidArray(ids: string[]) {
  return sql`${`{${ids.join(",")}}`}::uuid[]`;
}

function emailIsSuppressed(workspaceId: string, email: SqlFragment) {
  return sql`exists (
    select 1 from ${suppressions}
    where ${suppressions.workspaceId} = ${workspaceId}::uuid
      and ${suppressions.email} = ${email}
  )`;
}

function memberIsSuppressed(workspaceId: string) {
  return sql`exists (
    select 1 from ${contacts} as member_contact
    where member_contact.workspace_id = ${workspaceId}::uuid
      and member_contact.id = ${listMembers.contactId}
      and ${emailIsSuppressed(workspaceId, sql`member_contact.email`)}
    offset 0
  )`;
}

function subscribedToAnyList(workspaceId: string, listIds: string[]) {
  return sql`exists (
    select 1 from ${listMembers}
    where ${listMembers.listId} = any(${uuidArray(listIds)})
      and ${listMembers.contactId} = ${contacts.id}
      and ${listMembers.workspaceId} = ${workspaceId}::uuid
      and ${listMembers.status} = 'subscribed'
  )`;
}

@Injectable()
export class AudienceRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  findLists(workspaceId: string, ids: string[]) {
    return this.db
      .select({ id: lists.id, name: lists.name })
      .from(lists)
      .where(and(eq(lists.workspaceId, workspaceId), inArray(lists.id, ids)))
      .orderBy(sql`lower(${lists.name})`, lists.id);
  }

  async count(workspaceId: string, scope: AudienceScope) {
    const result = await this.db.execute<{ count: number }>(
      this.countQuery(workspaceId, scope),
    );
    return result.rows[0]?.count ?? 0;
  }

  page(
    workspaceId: string,
    scope: AudienceScope,
    afterContactId: string | null,
    limit: number,
  ) {
    const query =
      scope.type === "lists"
        ? this.listsPageQuery(workspaceId, scope.listIds, afterContactId, limit)
        : this.contactsPageQuery(
            workspaceId,
            scope.type === "segment" ? scope.filter : undefined,
            afterContactId,
            limit,
          );
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`set local jit = off`);
      const result = await tx.execute<AudienceContactRow>(query);
      return result.rows;
    });
  }

  countQuery(workspaceId: string, scope: AudienceScope) {
    const narrowing =
      scope.type === "lists"
        ? sql` and ${subscribedToAnyList(workspaceId, scope.listIds)}`
        : scope.type === "segment" && scope.filter
          ? sql` and ${scope.filter}`
          : sql``;
    return sql`
      select count(*)::int as "count"
      from ${contacts}
      where ${contacts.workspaceId} = ${workspaceId}::uuid${narrowing}
        and not ${emailIsSuppressed(workspaceId, sql`${contacts.email}`)}
    `;
  }

  contactsPageQuery(
    workspaceId: string,
    filter: SqlFragment | undefined,
    afterContactId: string | null,
    limit: number,
  ) {
    return sql`
      select ${contactColumns}
      from ${contacts}
      where ${contacts.workspaceId} = ${workspaceId}::uuid
        ${afterContactId ? sql`and ${contacts.id} > ${afterContactId}::uuid` : sql``}
        ${filter ? sql`and ${filter}` : sql``}
        and not ${emailIsSuppressed(workspaceId, sql`${contacts.email}`)}
      order by ${contacts.id} asc
      limit ${limit}
    `;
  }

  listsPageQuery(
    workspaceId: string,
    listIds: string[],
    afterContactId: string | null,
    limit: number,
  ) {
    return sql`
      with page as (
        select distinct member.contact_id
        from unnest(${uuidArray(listIds)}) as audience_list (id)
        cross join lateral (
          select ${listMembers.contactId}
          from ${listMembers}
          where ${listMembers.listId} = audience_list.id
            and ${listMembers.workspaceId} = ${workspaceId}::uuid
            and ${listMembers.status} = 'subscribed'
            ${afterContactId ? sql`and ${listMembers.contactId} > ${afterContactId}::uuid` : sql``}
            and not ${memberIsSuppressed(workspaceId)}
          order by ${listMembers.contactId} asc
          limit ${limit}
        ) as member
        order by member.contact_id asc
        limit ${limit}
      )
      select ${contactColumns}
      from page
      join ${contacts}
        on ${contacts.workspaceId} = ${workspaceId}::uuid
        and ${contacts.id} = page.contact_id
      order by ${contacts.id} asc
    `;
  }
}
