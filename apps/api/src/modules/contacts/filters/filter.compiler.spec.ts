import { createDb, schema } from "@workspace/db";
import { compileFilter, escapeLike } from "./filter.compiler";
import type {
  FilterCondition,
  FilterFieldDefinition,
  FilterGroup,
} from "./filter.types";

const db = createDb("postgres://compile-only:unused@localhost:1/unused");

const fields = new Map<string, FilterFieldDefinition>(
  (
    [
      { key: "plan", label: "Plan", type: "text" },
      { key: "seats", label: "Seats", type: "number" },
      { key: "renewal", label: "Renewal", type: "date" },
      { key: "vip", label: "VIP", type: "boolean" },
      { key: "tier", label: "Tier", type: "select" },
    ] as FilterFieldDefinition[]
  ).map((field) => [field.key, field]),
);

const listId = "0198c0de-0000-7000-8000-000000000001";
const tagId = "0198c0de-0000-7000-8000-000000000002";
const prefix = 'select "id" from "contacts" where ';

function render(group: FilterGroup) {
  const fragment = compileFilter(group, fields);
  if (!fragment) {
    return null;
  }
  const query = db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(fragment)
    .toSQL();
  expect(query.sql.startsWith(prefix)).toBe(true);
  return { sql: query.sql.slice(prefix.length), params: query.params };
}

function one(condition: FilterCondition) {
  const rendered = render({ match: "all", conditions: [condition] });
  if (!rendered) {
    throw new Error("The condition compiled to nothing.");
  }
  return rendered;
}

describe("compileFilter", () => {
  it("compiles an empty filter to no condition", () => {
    expect(render({ match: "all", conditions: [] })).toBeNull();
    expect(render({ match: "any", conditions: [] })).toBeNull();
  });

  it("compares the email column directly so its index applies", () => {
    expect(one({ field: "email", op: "is", value: "Ada@Example.com" })).toEqual(
      {
        sql: '("contacts"."email" = $1)',
        params: ["ada@example.com"],
      },
    );
    expect(one({ field: "email", op: "starts_with", value: "Ada" })).toEqual({
      sql: '("contacts"."email" like $1)',
      params: ["ada%"],
    });
  });

  it("compares other text columns ignoring case", () => {
    expect(one({ field: "company", op: "is", value: "Acme" })).toEqual({
      sql: '(lower("contacts"."company") = $1)',
      params: ["acme"],
    });
    expect(one({ field: "firstName", op: "is_not", value: "Ada" })).toEqual({
      sql: '(lower("contacts"."first_name") is distinct from $1)',
      params: ["ada"],
    });
    expect(one({ field: "city", op: "contains", value: "York" })).toEqual({
      sql: '(lower("contacts"."city") like $1)',
      params: ["%york%"],
    });
    expect(one({ field: "city", op: "ends_with", value: "York" })).toEqual({
      sql: '(lower("contacts"."city") like $1)',
      params: ["%york"],
    });
    expect(one({ field: "jobTitle", op: "not_contains", value: "VP" })).toEqual(
      {
        sql: '(("contacts"."job_title" is null or lower("contacts"."job_title") not like $1))',
        params: ["%vp%"],
      },
    );
    expect(one({ field: "phone", op: "is_set" })).toEqual({
      sql: '("contacts"."phone" is not null)',
      params: [],
    });
    expect(one({ field: "country", op: "is_not_set" })).toEqual({
      sql: '("contacts"."country" is null)',
      params: [],
    });
  });

  it("keeps user text out of the SQL and escapes LIKE wildcards", () => {
    const hostile = "50%_off\\'; drop table contacts; --";
    const rendered = one({ field: "company", op: "contains", value: hostile });
    expect(rendered.sql).toBe('(lower("contacts"."company") like $1)');
    expect(rendered.params).toEqual([
      "%50\\%\\_off\\\\'; drop table contacts; --%",
    ]);
    expect(escapeLike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");

    const custom = one({
      field: "custom",
      key: "plan",
      op: "is",
      value: `pro"}'; drop table contacts; --`,
    });
    expect(custom.sql).toBe('("contacts"."fields" @> $1::jsonb)');
    expect(JSON.parse(String(custom.params[0]))).toEqual({
      plan: `pro"}'; drop table contacts; --`,
    });
  });

  it("compiles date conditions on built-in columns", () => {
    expect(
      one({ field: "createdAt", op: "before", value: "2026-03-01" }),
    ).toEqual({
      sql: '("contacts"."created_at" < $1::timestamptz)',
      params: ["2026-03-01T00:00:00Z"],
    });
    expect(
      one({ field: "createdAt", op: "after", value: "2026-03-01" }),
    ).toEqual({
      sql: '("contacts"."created_at" >= $1::timestamptz)',
      params: ["2026-03-02T00:00:00.000Z"],
    });
    expect(
      one({ field: "updatedAt", op: "after", value: "2026-03-01T12:00:00Z" }),
    ).toEqual({
      sql: '("contacts"."updated_at" > $1::timestamptz)',
      params: ["2026-03-01T12:00:00Z"],
    });
    expect(one({ field: "createdAt", op: "in_last_days", value: 30 })).toEqual({
      sql: '("contacts"."created_at" >= now() - make_interval(days => $1::int))',
      params: [30],
    });
    expect(
      one({ field: "updatedAt", op: "not_in_last_days", value: 7 }),
    ).toEqual({
      sql: '("contacts"."updated_at" < now() - make_interval(days => $1::int))',
      params: [7],
    });
  });

  it("uses JSONB containment for custom equality so the GIN index applies", () => {
    expect(
      one({ field: "custom", key: "plan", op: "is", value: "Pro" }),
    ).toEqual({
      sql: '("contacts"."fields" @> $1::jsonb)',
      params: ['{"plan":"Pro"}'],
    });
    expect(
      one({ field: "custom", key: "tier", op: "is_not", value: "Gold" }),
    ).toEqual({
      sql: '(not ("contacts"."fields" @> $1::jsonb))',
      params: ['{"tier":"Gold"}'],
    });
    expect(one({ field: "custom", key: "seats", op: "is", value: 5 })).toEqual({
      sql: '("contacts"."fields" @> $1::jsonb)',
      params: ['{"seats":5}'],
    });
    expect(
      one({ field: "custom", key: "renewal", op: "is", value: "2026-05-01" }),
    ).toEqual({
      sql: '("contacts"."fields" @> $1::jsonb)',
      params: ['{"renewal":"2026-05-01"}'],
    });
    expect(one({ field: "custom", key: "vip", op: "is_true" })).toEqual({
      sql: '("contacts"."fields" @> $1::jsonb)',
      params: ['{"vip":true}'],
    });
    expect(one({ field: "custom", key: "vip", op: "is_false" })).toEqual({
      sql: '("contacts"."fields" @> $1::jsonb)',
      params: ['{"vip":false}'],
    });
  });

  it("guards numeric comparisons so a non-numeric value cannot raise", () => {
    const expected = (operator: string) =>
      `((case when jsonb_typeof("contacts"."fields" -> $1::text) = 'number' then ("contacts"."fields" ->> $2::text)::numeric end) ${operator} $3::numeric)`;
    const operators = { gt: ">", gte: ">=", lt: "<", lte: "<=" } as const;
    for (const [op, operator] of Object.entries(operators)) {
      expect(
        one({
          field: "custom",
          key: "seats",
          op: op as keyof typeof operators,
          value: 10,
        }),
      ).toEqual({ sql: expected(operator), params: ["seats", "seats", 10] });
    }
  });

  it("compares custom dates as guarded text", () => {
    expect(
      one({
        field: "custom",
        key: "renewal",
        op: "before",
        value: "2026-05-01",
      }),
    ).toEqual({
      sql: `((case when ("contacts"."fields" ->> $1::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then ("contacts"."fields" ->> $2::text) end) collate "C" < $3)`,
      params: ["renewal", "renewal", "2026-05-01"],
    });
    expect(
      one({ field: "custom", key: "renewal", op: "after", value: "2026-05-01" })
        .sql,
    ).toContain('collate "C" > $3');
  });

  it("compiles custom text matching and presence", () => {
    expect(
      one({ field: "custom", key: "plan", op: "contains", value: "Pro_" }),
    ).toEqual({
      sql: '(lower(("contacts"."fields" ->> $1::text)) like $2)',
      params: ["plan", "%pro\\_%"],
    });
    expect(
      one({ field: "custom", key: "plan", op: "not_contains", value: "x" }),
    ).toEqual({
      sql: '((("contacts"."fields" ->> $1::text) is null or lower(("contacts"."fields" ->> $2::text)) not like $3))',
      params: ["plan", "plan", "%x%"],
    });
    expect(one({ field: "custom", key: "seats", op: "is_set" })).toEqual({
      sql: '(("contacts"."fields" ->> $1::text) is not null)',
      params: ["seats"],
    });
    expect(one({ field: "custom", key: "vip", op: "is_not_set" })).toEqual({
      sql: '(("contacts"."fields" ->> $1::text) is null)',
      params: ["vip"],
    });
  });

  it("matches nothing for a custom field that no longer exists or a mismatched op", () => {
    expect(
      one({ field: "custom", key: "deleted", op: "is", value: "x" }),
    ).toEqual({ sql: "(false)", params: [] });
    expect(one({ field: "custom", key: "plan", op: "gt", value: 3 })).toEqual({
      sql: "(false)",
      params: [],
    });
    expect(one({ field: "custom", key: "plan", op: "is_true" })).toEqual({
      sql: "(false)",
      params: [],
    });
  });

  it("compiles list conditions to exists subqueries", () => {
    const membership =
      'exists (select 1 from "list_members" where "list_members"."list_id" = $1 and "list_members"."contact_id" = "contacts"."id"';
    expect(one({ field: "list", op: "in", listId })).toEqual({
      sql: `(${membership}))`,
      params: [listId],
    });
    expect(one({ field: "list", op: "not_in", listId })).toEqual({
      sql: `(not ${membership}))`,
      params: [listId],
    });
    expect(one({ field: "list", op: "subscribed_to", listId })).toEqual({
      sql: `(${membership} and "list_members"."status" = 'subscribed'))`,
      params: [listId],
    });
    expect(one({ field: "list", op: "unsubscribed_from", listId })).toEqual({
      sql: `(${membership} and "list_members"."status" = 'unsubscribed'))`,
      params: [listId],
    });
  });

  it("compiles tag and suppressed conditions to exists subqueries", () => {
    const tagged =
      'exists (select 1 from "contact_tags" where "contact_tags"."contact_id" = "contacts"."id" and "contact_tags"."tag_id" = $1)';
    expect(one({ field: "tag", op: "has", tagId })).toEqual({
      sql: `(${tagged})`,
      params: [tagId],
    });
    expect(one({ field: "tag", op: "has_not", tagId })).toEqual({
      sql: `(not ${tagged})`,
      params: [tagId],
    });
    const suppressed =
      'exists (select 1 from "suppressions" where "suppressions"."workspace_id" = "contacts"."workspace_id" and "suppressions"."email" = "contacts"."email")';
    expect(one({ field: "suppressed", op: "is_true" })).toEqual({
      sql: `(${suppressed})`,
      params: [],
    });
    expect(one({ field: "suppressed", op: "is_false" })).toEqual({
      sql: `(not ${suppressed})`,
      params: [],
    });
  });

  it("joins groups with and/or and numbers parameters in order", () => {
    expect(
      render({
        match: "all",
        conditions: [
          { field: "company", op: "is", value: "Acme" },
          {
            match: "any",
            conditions: [
              { field: "tag", op: "has", tagId },
              { field: "custom", key: "seats", op: "is", value: 3 },
            ],
          },
          { field: "suppressed", op: "is_false" },
        ],
      }),
    ).toEqual({
      sql: '(lower("contacts"."company") = $1 and (exists (select 1 from "contact_tags" where "contact_tags"."contact_id" = "contacts"."id" and "contact_tags"."tag_id" = $2) or "contacts"."fields" @> $3::jsonb) and not exists (select 1 from "suppressions" where "suppressions"."workspace_id" = "contacts"."workspace_id" and "suppressions"."email" = "contacts"."email"))',
      params: ["acme", tagId, '{"seats":3}'],
    });
  });
});
