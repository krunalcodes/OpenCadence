import { schema, sql } from "@workspace/db";
import {
  type CustomCondition,
  type DateCondition,
  type FilterCondition,
  type FilterFieldDefinition,
  type FilterGroup,
  isFilterGroup,
  type ListCondition,
  type TextCondition,
  type TextField,
} from "./filter.types";

const { contacts, contactTags, listMembers, suppressions } = schema;

export type SqlFragment = ReturnType<typeof sql>;

const textColumns = {
  email: contacts.email,
  firstName: contacts.firstName,
  lastName: contacts.lastName,
  company: contacts.company,
  jobTitle: contacts.jobTitle,
  phone: contacts.phone,
  city: contacts.city,
  country: contacts.country,
  timezone: contacts.timezone,
} satisfies Record<TextField, unknown>;

const dateColumns = {
  createdAt: contacts.createdAt,
  updatedAt: contacts.updatedAt,
};

const comparators = {
  gt: sql.raw(">"),
  gte: sql.raw(">="),
  lt: sql.raw("<"),
  lte: sql.raw("<="),
  before: sql.raw("<"),
  after: sql.raw(">"),
};

const dayInMilliseconds = 86_400_000;

export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function likePattern(op: string, value: string) {
  const escaped = escapeLike(value.toLowerCase());
  if (op === "starts_with") {
    return `${escaped}%`;
  }
  if (op === "ends_with") {
    return `%${escaped}`;
  }
  return `%${escaped}%`;
}

function compileTextOp(
  raw: SqlFragment,
  lowered: SqlFragment,
  op: string,
  value: string,
): SqlFragment {
  switch (op) {
    case "is":
      return sql`${lowered} = ${value.toLowerCase()}`;
    case "is_not":
      return sql`${lowered} is distinct from ${value.toLowerCase()}`;
    case "not_contains":
      return sql`(${raw} is null or ${lowered} not like ${likePattern(op, value)})`;
    default:
      return sql`${lowered} like ${likePattern(op, value)}`;
  }
}

function compileText(condition: TextCondition): SqlFragment {
  const column = textColumns[condition.field];
  if (condition.op === "is_set") {
    return sql`${column} is not null`;
  }
  if (condition.op === "is_not_set") {
    return sql`${column} is null`;
  }
  const lowered =
    condition.field === "email" ? sql`${column}` : sql`lower(${column})`;
  return compileTextOp(
    sql`${column}`,
    lowered,
    condition.op,
    condition.value ?? "",
  );
}

function compileDate(condition: DateCondition): SqlFragment {
  const column = dateColumns[condition.field];
  if (condition.op === "in_last_days") {
    return sql`${column} >= now() - make_interval(days => ${condition.value}::int)`;
  }
  if (condition.op === "not_in_last_days") {
    return sql`${column} < now() - make_interval(days => ${condition.value}::int)`;
  }
  const value = String(condition.value);
  const dateOnly = value.length === 10;
  const start = dateOnly ? `${value}T00:00:00Z` : value;
  if (condition.op === "before") {
    return sql`${column} < ${start}::timestamptz`;
  }
  if (dateOnly) {
    const nextDay = new Date(Date.parse(start) + dayInMilliseconds);
    return sql`${column} >= ${nextDay.toISOString()}::timestamptz`;
  }
  return sql`${column} > ${start}::timestamptz`;
}

function contains(key: string, value: string | number | boolean): SqlFragment {
  return sql`${contacts.fields} @> ${JSON.stringify({ [key]: value })}::jsonb`;
}

function compileCustom(
  condition: CustomCondition,
  fields: Map<string, FilterFieldDefinition>,
): SqlFragment {
  const definition = fields.get(condition.key);
  if (!definition) {
    return sql`false`;
  }
  const { key, op, value } = condition;
  const text = sql`(${contacts.fields} ->> ${key}::text)`;
  if (op === "is_set") {
    return sql`${text} is not null`;
  }
  if (op === "is_not_set") {
    return sql`${text} is null`;
  }
  if (op === "is_true" || op === "is_false") {
    return definition.type === "boolean"
      ? contains(key, op === "is_true")
      : sql`false`;
  }
  if (definition.type === "boolean" || value === undefined) {
    return sql`false`;
  }
  if (op === "is") {
    return contains(key, value);
  }
  if (op === "is_not") {
    return sql`not (${contains(key, value)})`;
  }
  if (definition.type === "number") {
    if (
      typeof value !== "number" ||
      (op !== "gt" && op !== "gte" && op !== "lt" && op !== "lte")
    ) {
      return sql`false`;
    }
    return sql`(case when jsonb_typeof(${contacts.fields} -> ${key}::text) = 'number' then ${text}::numeric end) ${comparators[op]} ${value}::numeric`;
  }
  if (typeof value !== "string") {
    return sql`false`;
  }
  if (definition.type === "date") {
    if (op !== "before" && op !== "after") {
      return sql`false`;
    }
    return sql`(case when ${text} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then ${text} end) collate "C" ${comparators[op]} ${value}`;
  }
  if (op === "gt" || op === "gte" || op === "lt" || op === "lte") {
    return sql`false`;
  }
  if (op === "before" || op === "after") {
    return sql`false`;
  }
  return compileTextOp(text, sql`lower(${text})`, op, value);
}

function compileList(condition: ListCondition): SqlFragment {
  const status =
    condition.op === "subscribed_to"
      ? sql` and ${listMembers.status} = 'subscribed'`
      : condition.op === "unsubscribed_from"
        ? sql` and ${listMembers.status} = 'unsubscribed'`
        : sql``;
  const membership = sql`exists (select 1 from ${listMembers} where ${listMembers.listId} = ${condition.listId} and ${listMembers.contactId} = ${contacts.id}${status})`;
  return condition.op === "not_in" ? sql`not ${membership}` : membership;
}

function compileCondition(
  condition: FilterCondition,
  fields: Map<string, FilterFieldDefinition>,
): SqlFragment {
  switch (condition.field) {
    case "custom":
      return compileCustom(condition, fields);
    case "list":
      return compileList(condition);
    case "tag": {
      const tagged = sql`exists (select 1 from ${contactTags} where ${contactTags.contactId} = ${contacts.id} and ${contactTags.tagId} = ${condition.tagId})`;
      return condition.op === "has_not" ? sql`not ${tagged}` : tagged;
    }
    case "suppressed": {
      const suppressed = sql`exists (select 1 from ${suppressions} where ${suppressions.workspaceId} = ${contacts.workspaceId} and ${suppressions.email} = ${contacts.email})`;
      return condition.op === "is_false" ? sql`not ${suppressed}` : suppressed;
    }
    case "createdAt":
    case "updatedAt":
      return compileDate(condition);
    default:
      return compileText(condition);
  }
}

function compileGroup(
  group: FilterGroup,
  fields: Map<string, FilterFieldDefinition>,
): SqlFragment | undefined {
  const parts: SqlFragment[] = [];
  for (const node of group.conditions) {
    const part = isFilterGroup(node)
      ? compileGroup(node, fields)
      : compileCondition(node, fields);
    if (part) {
      parts.push(part);
    }
  }
  if (parts.length === 0) {
    return undefined;
  }
  return sql`(${sql.join(parts, group.match === "any" ? sql` or ` : sql` and `)})`;
}

export function compileFilter(
  group: FilterGroup,
  fields: Map<string, FilterFieldDefinition>,
): SqlFragment | undefined {
  return compileGroup(group, fields);
}
