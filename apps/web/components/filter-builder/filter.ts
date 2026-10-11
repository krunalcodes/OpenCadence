import { copy } from "@/components/filter-builder/copy";
import type {
  CustomCondition,
  CustomFieldType,
  CustomOp,
  DateField,
  DateOp,
  DaysOp,
  FilterCondition,
  FilterContext,
  FilterField,
  FilterGroup,
  FilterMatch,
  FilterOp,
  ListOp,
  SuppressedOp,
  TagOp,
  TextCondition,
  TextField,
  TextOp,
} from "@/components/filter-builder/types";
import { isRow, type Row } from "@/lib/api";

export const maxFilterConditions = 30;
export const maxFilterDays = 3650;
export const defaultFilterDays = 30;

export const textFields: TextField[] = [
  "email",
  "firstName",
  "lastName",
  "company",
  "jobTitle",
  "phone",
  "city",
  "country",
  "timezone",
];

export const dateFields: DateField[] = ["createdAt", "updatedAt"];

const textOps: TextOp[] = [
  "is",
  "is_not",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "is_set",
  "is_not_set",
];

const dateOps: DateOp[] = ["before", "after"];
const daysOps: DaysOp[] = ["in_last_days", "not_in_last_days"];
const listOps: ListOp[] = [
  "in",
  "not_in",
  "subscribed_to",
  "unsubscribed_from",
];
const tagOps: TagOp[] = ["has", "has_not"];
const suppressedOps: SuppressedOp[] = ["is_true", "is_false"];

export const customOpsByType: Record<CustomFieldType, CustomOp[]> = {
  text: textOps,
  select: textOps,
  number: ["is", "is_not", "gt", "gte", "lt", "lte", "is_set", "is_not_set"],
  date: ["is", "before", "after", "is_set", "is_not_set"],
  boolean: ["is_true", "is_false", "is_set", "is_not_set"],
};

const allCustomOps: CustomOp[] = [
  ...new Set(Object.values(customOpsByType).flat()),
];

const valuelessOps: FilterOp[] = [
  "is_set",
  "is_not_set",
  "is_true",
  "is_false",
];

const customPrefix = "custom:";
const datePattern = /^\d{4}-\d{2}-\d{2}/;

const summaryDate = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export type ValueKind =
  | "none"
  | "text"
  | "number"
  | "date"
  | "days"
  | "option"
  | "list"
  | "tag";

function pick<T extends string>(allowed: readonly T[], value: unknown) {
  return allowed.find((item) => item === value) ?? null;
}

function isTextField(field: string): field is TextField {
  return pick(textFields, field) !== null;
}

function isDateField(field: string): field is DateField {
  return pick(dateFields, field) !== null;
}

function isValueless(op: FilterOp) {
  return valuelessOps.includes(op);
}

export function isFilterGroup(
  node: FilterCondition | FilterGroup,
): node is FilterGroup {
  return "conditions" in node;
}

export function isTextCondition(
  condition: FilterCondition,
): condition is TextCondition {
  return isTextField(condition.field);
}

export function emptyFilterGroup(): FilterGroup {
  return { match: "all", conditions: [] };
}

export function emptyCondition(): FilterCondition {
  return { field: "email", op: "contains", value: "" };
}

export function countConditions(group: FilterGroup): number {
  return group.conditions.reduce(
    (total, node) => total + (isFilterGroup(node) ? countConditions(node) : 1),
    0,
  );
}

export function customFieldId(key: string) {
  return `${customPrefix}${key}`;
}

export function fieldIdOf(condition: FilterCondition) {
  return condition.field === "custom"
    ? customFieldId(condition.key)
    : condition.field;
}

export function findCustomField(fields: FilterField[], key: string) {
  return fields.find((field) => field.key === key) ?? null;
}

export function operatorsFor(
  condition: FilterCondition,
  fields: FilterField[],
): FilterOp[] {
  if (condition.field === "custom") {
    const field = findCustomField(fields, condition.key);
    return field ? customOpsByType[field.type] : allCustomOps;
  }
  if (condition.field === "list") {
    return listOps;
  }
  if (condition.field === "tag") {
    return tagOps;
  }
  if (condition.field === "suppressed") {
    return suppressedOps;
  }
  return isDateField(condition.field) ? [...dateOps, ...daysOps] : textOps;
}

export function valueKindOf(
  condition: FilterCondition,
  fields: FilterField[],
): ValueKind {
  if (condition.field === "list") {
    return "list";
  }
  if (condition.field === "tag") {
    return "tag";
  }
  if (condition.field === "suppressed" || isValueless(condition.op)) {
    return "none";
  }
  if (condition.field !== "custom") {
    if (!isDateField(condition.field)) {
      return "text";
    }
    return pick(dateOps, condition.op) ? "date" : "days";
  }
  const field = findCustomField(fields, condition.key);
  if (!field) {
    return typeof condition.value === "number" ? "number" : "text";
  }
  if (field.type === "number") {
    return "number";
  }
  if (field.type === "date") {
    return "date";
  }
  if (field.type === "select") {
    return condition.op === "is" || condition.op === "is_not"
      ? "option"
      : "text";
  }
  return "text";
}

const customDefaults: Record<CustomFieldType, CustomOp> = {
  text: "contains",
  select: "is",
  number: "is",
  date: "is",
  boolean: "is_true",
};

export function conditionForField(
  fieldId: string,
  fields: FilterField[],
): FilterCondition {
  if (fieldId.startsWith(customPrefix)) {
    const key = fieldId.slice(customPrefix.length);
    const field = findCustomField(fields, key);
    const op = customDefaults[field?.type ?? "text"];
    if (field?.type === "boolean" || field?.type === "number") {
      return { field: "custom", key, op };
    }
    return { field: "custom", key, op, value: "" };
  }
  if (fieldId === "list") {
    return { field: "list", op: "subscribed_to", listId: "" };
  }
  if (fieldId === "tag") {
    return { field: "tag", op: "has", tagId: "" };
  }
  if (fieldId === "suppressed") {
    return { field: "suppressed", op: "is_true" };
  }
  if (isDateField(fieldId)) {
    return { field: fieldId, op: "in_last_days", value: defaultFilterDays };
  }
  return isTextField(fieldId)
    ? { field: fieldId, op: "contains", value: "" }
    : emptyCondition();
}

function withCustomOperator(
  condition: CustomCondition,
  op: CustomOp,
  fields: FilterField[],
): CustomCondition {
  const base = { field: "custom" as const, key: condition.key, op };
  if (isValueless(op)) {
    return base;
  }
  const next = { ...base, value: condition.value };
  const kind = valueKindOf(next, fields);
  if (kind === "number") {
    return typeof condition.value === "number" ? next : base;
  }
  if (typeof condition.value !== "string") {
    return { ...base, value: "" };
  }
  if (kind === "option") {
    const options = findCustomField(fields, condition.key)?.options ?? [];
    return options.includes(condition.value) ? next : { ...base, value: "" };
  }
  return next;
}

export function withOperator(
  condition: FilterCondition,
  operator: string,
  fields: FilterField[],
): FilterCondition {
  if (condition.field === "custom") {
    const op = pick(operatorsFor(condition, fields), operator);
    const custom = pick(allCustomOps, op);
    return custom ? withCustomOperator(condition, custom, fields) : condition;
  }
  if (condition.field === "list") {
    const op = pick(listOps, operator);
    return op ? { ...condition, op } : condition;
  }
  if (condition.field === "tag") {
    const op = pick(tagOps, operator);
    return op ? { ...condition, op } : condition;
  }
  if (condition.field === "suppressed") {
    const op = pick(suppressedOps, operator);
    return op ? { ...condition, op } : condition;
  }
  if (isDateField(condition.field)) {
    const dateOp = pick(dateOps, operator);
    if (dateOp) {
      return {
        field: condition.field,
        op: dateOp,
        value: typeof condition.value === "string" ? condition.value : "",
      };
    }
    const daysOp = pick(daysOps, operator);
    return daysOp
      ? {
          field: condition.field,
          op: daysOp,
          value:
            typeof condition.value === "number"
              ? condition.value
              : defaultFilterDays,
        }
      : condition;
  }
  const op = pick(textOps, operator);
  if (!op || !isTextField(condition.field)) {
    return condition;
  }
  if (isValueless(op)) {
    return { field: condition.field, op };
  }
  return {
    field: condition.field,
    op,
    value: typeof condition.value === "string" ? condition.value : "",
  };
}

export function isFilterDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    datePattern.test(value) &&
    !Number.isNaN(Date.parse(`${value.slice(0, 10)}T00:00:00Z`))
  );
}

export function isFilterDays(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= maxFilterDays
  );
}

function hasText(value: unknown) {
  return typeof value === "string" && value.length > 0;
}

function isCustomComplete(
  condition: CustomCondition,
  context: FilterContext | undefined,
) {
  if (condition.key === "") {
    return false;
  }
  const field = context ? findCustomField(context.fields, condition.key) : null;
  if (context && !field) {
    return false;
  }
  const allowed = field ? customOpsByType[field.type] : allCustomOps;
  if (!allowed.includes(condition.op)) {
    return false;
  }
  if (isValueless(condition.op)) {
    return true;
  }
  if (!field) {
    return (
      hasText(condition.value) ||
      (typeof condition.value === "number" && Number.isFinite(condition.value))
    );
  }
  if (field.type === "number") {
    return (
      typeof condition.value === "number" && Number.isFinite(condition.value)
    );
  }
  if (field.type === "date") {
    return isFilterDate(condition.value);
  }
  return hasText(condition.value);
}

export function isConditionComplete(
  condition: FilterCondition,
  context?: FilterContext,
) {
  if (condition.field === "custom") {
    return isCustomComplete(condition, context);
  }
  if (condition.field === "list") {
    return (
      pick(listOps, condition.op) !== null &&
      condition.listId !== "" &&
      (!context || context.lists.some((list) => list.id === condition.listId))
    );
  }
  if (condition.field === "tag") {
    return (
      pick(tagOps, condition.op) !== null &&
      condition.tagId !== "" &&
      (!context || context.tags.some((tag) => tag.id === condition.tagId))
    );
  }
  if (condition.field === "suppressed") {
    return pick(suppressedOps, condition.op) !== null;
  }
  if (isDateField(condition.field)) {
    if (pick(dateOps, condition.op)) {
      return isFilterDate(condition.value);
    }
    return (
      pick(daysOps, condition.op) !== null && isFilterDays(condition.value)
    );
  }
  if (!isTextField(condition.field) || !pick(textOps, condition.op)) {
    return false;
  }
  return isValueless(condition.op) || hasText(condition.value);
}

export function isFilterComplete(
  group: FilterGroup,
  context?: FilterContext,
): boolean {
  return (
    (group.match === "all" || group.match === "any") &&
    countConditions(group) <= maxFilterConditions &&
    group.conditions.every((node) =>
      isFilterGroup(node)
        ? node.conditions.length > 0 &&
          node.conditions.every(
            (child) =>
              !isFilterGroup(child) && isConditionComplete(child, context),
          ) &&
          (node.match === "all" || node.match === "any")
        : isConditionComplete(node, context),
    )
  );
}

function describeDate(value: string) {
  return isFilterDate(value)
    ? summaryDate.format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
    : copy.summary.missingValue;
}

function describeValue(
  condition: FilterCondition,
  context: FilterContext,
): string {
  const kind = valueKindOf(condition, context.fields);
  const value = "value" in condition ? condition.value : undefined;
  if (kind === "none") {
    return "";
  }
  if (kind === "days") {
    return typeof value === "number" && value > 0
      ? copy.summary.days(value)
      : copy.summary.missingValue;
  }
  if (kind === "date") {
    return describeDate(typeof value === "string" ? value : "");
  }
  if (typeof value === "number") {
    return copy.summary.number(value);
  }
  return typeof value === "string" && value !== ""
    ? copy.summary.quoted(value)
    : copy.summary.missingValue;
}

export function describeCondition(
  condition: FilterCondition,
  context: FilterContext,
): string {
  if (condition.field === "suppressed") {
    return condition.op === "is_false"
      ? copy.summary.notSuppressed
      : copy.summary.suppressed;
  }
  if (condition.field === "list") {
    const list = context.lists.find((item) => item.id === condition.listId);
    return `${copy.operators[condition.op]} ${list?.name ?? copy.summary.missingList}`;
  }
  if (condition.field === "tag") {
    const tag = context.tags.find((item) => item.id === condition.tagId);
    return `${copy.operators[condition.op]} ${tag?.name ?? copy.summary.missingTag}`;
  }
  const label =
    condition.field === "custom"
      ? (findCustomField(context.fields, condition.key)?.label ??
        copy.summary.missingField(condition.key))
      : copy.builtInFields[condition.field];
  const value = describeValue(condition, context);
  const phrase = `${label} ${copy.operators[condition.op]}`;
  return value === "" ? phrase : `${phrase} ${value}`;
}

function joinerOf(match: FilterMatch) {
  return match === "any" ? copy.summary.or : copy.summary.and;
}

export function describeFilter(
  group: FilterGroup,
  context: FilterContext,
): string {
  const parts = group.conditions.flatMap((node) => {
    if (!isFilterGroup(node)) {
      return [describeCondition(node, context)];
    }
    const inner = node.conditions.flatMap((child) =>
      isFilterGroup(child) ? [] : [describeCondition(child, context)],
    );
    if (inner.length === 0) {
      return [];
    }
    return [
      inner.length === 1
        ? inner.join("")
        : `(${inner.join(joinerOf(node.match))})`,
    ];
  });
  if (parts.length === 0) {
    return copy.summary.empty;
  }
  const summary = parts.join(joinerOf(group.match));
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}

function toCondition(row: Row): FilterCondition | null {
  const field = typeof row.field === "string" ? row.field : "";
  if (field === "custom") {
    const op = pick(allCustomOps, row.op);
    if (!op || typeof row.key !== "string" || row.key === "") {
      return null;
    }
    const base = { field: "custom" as const, key: row.key, op };
    return typeof row.value === "string" || typeof row.value === "number"
      ? { ...base, value: row.value }
      : base;
  }
  if (field === "list") {
    const op = pick(listOps, row.op);
    return op && typeof row.listId === "string"
      ? { field, op, listId: row.listId }
      : null;
  }
  if (field === "tag") {
    const op = pick(tagOps, row.op);
    return op && typeof row.tagId === "string"
      ? { field, op, tagId: row.tagId }
      : null;
  }
  if (field === "suppressed") {
    const op = pick(suppressedOps, row.op);
    return op ? { field, op } : null;
  }
  if (isDateField(field)) {
    const dateOp = pick(dateOps, row.op);
    if (dateOp) {
      return typeof row.value === "string"
        ? { field, op: dateOp, value: row.value }
        : null;
    }
    const daysOp = pick(daysOps, row.op);
    return daysOp && typeof row.value === "number"
      ? { field, op: daysOp, value: row.value }
      : null;
  }
  if (!isTextField(field)) {
    return null;
  }
  const op = pick(textOps, row.op);
  if (!op) {
    return null;
  }
  return typeof row.value === "string"
    ? { field, op, value: row.value }
    : { field, op };
}

function toGroup(value: unknown, nested: boolean): FilterGroup | null {
  if (!isRow(value) || !Array.isArray(value.conditions)) {
    return null;
  }
  const match = pick<FilterMatch>(["all", "any"], value.match);
  if (!match) {
    return null;
  }
  const conditions: (FilterCondition | FilterGroup)[] = [];
  for (const node of value.conditions) {
    if (!isRow(node)) {
      return null;
    }
    const isGroup = "conditions" in node;
    if (isGroup && nested) {
      return null;
    }
    const parsed = isGroup ? toGroup(node, true) : toCondition(node);
    if (!parsed) {
      return null;
    }
    conditions.push(parsed);
  }
  return { match, conditions };
}

export function toFilterGroup(value: unknown): FilterGroup | null {
  return toGroup(value, false);
}
