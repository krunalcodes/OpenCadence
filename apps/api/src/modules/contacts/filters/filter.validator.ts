import { isUuid } from "../../../common/uuid";
import {
  type CustomCondition,
  type CustomOp,
  customOpsByType,
  type DateCondition,
  type DateField,
  dateFields,
  type FilterCondition,
  type FilterFieldDefinition,
  type FilterGroup,
  type ListCondition,
  maxFilterConditions,
  maxFilterDepth,
  type SuppressedCondition,
  type TagCondition,
  type TextCondition,
  type TextField,
  type TextOp,
  textFields,
  textOps,
} from "./filter.types";

export class FilterValidationError extends Error {}

export type FilterContext = {
  fields: Map<string, FilterFieldDefinition>;
  listIds: Set<string>;
  tagIds: Set<string>;
  references: "strict" | "lenient";
};

export type FilterReferences = { listIds: string[]; tagIds: string[] };

const maxTextValueLength = 255;
const maxCustomTextValueLength = 1000;
const maxDays = 3650;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dateTimePattern =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2}))?$/;
const valuelessOps = ["is_set", "is_not_set", "is_true", "is_false"];
const allCustomOps = [...new Set(Object.values(customOpsByType).flat())];
const listOps: ListCondition["op"][] = [
  "in",
  "not_in",
  "subscribed_to",
  "unsubscribed_from",
];
const tagOps: TagCondition["op"][] = ["has", "has_not"];
const suppressedOps: SuppressedCondition["op"][] = ["is_true", "is_false"];
const dateOps: DateCondition["op"][] = [
  "before",
  "after",
  "in_last_days",
  "not_in_last_days",
];
const fieldNames = [
  ...textFields,
  ...dateFields,
  "custom",
  "list",
  "tag",
  "suppressed",
];

type State = { conditions: number; context: FilterContext };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shown(value: unknown) {
  return typeof value === "string" ? `'${value.slice(0, 40)}'` : "that value";
}

function quoted(values: readonly string[]) {
  return values.join(", ");
}

export function isIsoDate(value: string) {
  if (!datePattern.test(value)) {
    return false;
  }
  const time = Date.parse(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value
  );
}

function isIsoDateTime(value: string) {
  if (!dateTimePattern.test(value)) {
    return false;
  }
  return datePattern.test(value)
    ? isIsoDate(value)
    : isIsoDate(value.slice(0, 10)) && !Number.isNaN(Date.parse(value));
}

function fail(position: number, message: string): never {
  throw new FilterValidationError(`Condition ${position}: ${message}`);
}

function assertKeys(
  node: Record<string, unknown>,
  allowed: string[],
  position: number,
) {
  for (const key of Object.keys(node)) {
    if (!allowed.includes(key)) {
      fail(
        position,
        `'${key.slice(0, 40)}' is not a known property. Use ${quoted(allowed)}.`,
      );
    }
  }
}

function assertOp<T extends string>(
  op: unknown,
  allowed: readonly T[],
  position: number,
  subject: string,
): T {
  if (typeof op !== "string" || !allowed.includes(op as T)) {
    fail(
      position,
      `${shown(op)} cannot be used on ${subject}. Use one of ${quoted(allowed)}.`,
    );
  }
  return op as T;
}

function textValue(
  value: unknown,
  position: number,
  op: string,
  maxLength: number,
) {
  if (typeof value !== "string" || value.length === 0) {
    fail(position, `'${op}' needs a text value.`);
  }
  if (value.length > maxLength) {
    fail(position, `Keep the value to ${maxLength} characters or fewer.`);
  }
  return value;
}

function validateText(
  node: Record<string, unknown>,
  position: number,
): TextCondition {
  assertKeys(node, ["field", "op", "value"], position);
  const field = node.field as TextField;
  const op = assertOp<TextOp>(node.op, textOps, position, `the ${field} field`);
  if (valuelessOps.includes(op)) {
    return { field, op };
  }
  return {
    field,
    op,
    value: textValue(node.value, position, op, maxTextValueLength),
  };
}

function validateDate(
  node: Record<string, unknown>,
  position: number,
): DateCondition {
  assertKeys(node, ["field", "op", "value"], position);
  const field = node.field as DateField;
  const op = assertOp(node.op, dateOps, position, `the ${field} field`);
  if (op === "before" || op === "after") {
    if (typeof node.value !== "string" || !isIsoDateTime(node.value)) {
      fail(position, `'${op}' needs a date such as 2026-01-31.`);
    }
    return { field, op, value: node.value };
  }
  if (
    typeof node.value !== "number" ||
    !Number.isInteger(node.value) ||
    node.value < 1 ||
    node.value > maxDays
  ) {
    fail(
      position,
      `'${op}' needs a whole number of days from 1 to ${maxDays}.`,
    );
  }
  return { field, op, value: node.value };
}

function validateCustom(
  node: Record<string, unknown>,
  position: number,
  context: FilterContext,
): CustomCondition {
  assertKeys(node, ["field", "key", "op", "value"], position);
  if (typeof node.key !== "string" || node.key.length === 0) {
    fail(position, "A custom field condition needs the key of the field.");
  }
  const key = node.key;
  const definition = context.fields.get(key);
  if (!definition) {
    if (context.references === "strict") {
      fail(
        position,
        `${shown(key)} is not a custom field in this workspace. It may have been deleted.`,
      );
    }
    const op = assertOp<CustomOp>(
      node.op,
      allCustomOps,
      position,
      "a custom field",
    );
    if (valuelessOps.includes(op)) {
      return { field: "custom", key, op };
    }
    if (
      (typeof node.value !== "string" && typeof node.value !== "number") ||
      (typeof node.value === "number" && !Number.isFinite(node.value)) ||
      (typeof node.value === "string" &&
        node.value.length > maxCustomTextValueLength)
    ) {
      fail(position, `'${op}' needs a value.`);
    }
    return { field: "custom", key, op, value: node.value };
  }

  const allowed = customOpsByType[definition.type];
  if (typeof node.op !== "string" || !allowed.includes(node.op as CustomOp)) {
    fail(
      position,
      `${shown(node.op)} cannot be used on the ${definition.type} field ${definition.label}. Use one of ${quoted(allowed)}.`,
    );
  }
  const op = node.op as CustomOp;
  if (valuelessOps.includes(op)) {
    return { field: "custom", key, op };
  }
  if (definition.type === "number") {
    if (typeof node.value !== "number" || !Number.isFinite(node.value)) {
      fail(
        position,
        `'${op}' on the number field ${definition.label} needs a number.`,
      );
    }
    return { field: "custom", key, op, value: node.value };
  }
  if (definition.type === "date") {
    if (typeof node.value !== "string" || !isIsoDate(node.value)) {
      fail(
        position,
        `'${op}' on the date field ${definition.label} needs a date such as 2026-01-31.`,
      );
    }
    return { field: "custom", key, op, value: node.value };
  }
  return {
    field: "custom",
    key,
    op,
    value: textValue(node.value, position, op, maxCustomTextValueLength),
  };
}

function validateList(
  node: Record<string, unknown>,
  position: number,
  context: FilterContext,
): ListCondition {
  assertKeys(node, ["field", "op", "listId"], position);
  const op = assertOp(node.op, listOps, position, "a list");
  if (typeof node.listId !== "string" || !isUuid(node.listId)) {
    fail(position, "A list condition needs the id of a list.");
  }
  const listId = node.listId.toLowerCase();
  if (context.references === "strict" && !context.listIds.has(listId)) {
    fail(position, "That list was not found. It may have been deleted.");
  }
  return { field: "list", op, listId };
}

function validateTag(
  node: Record<string, unknown>,
  position: number,
  context: FilterContext,
): TagCondition {
  assertKeys(node, ["field", "op", "tagId"], position);
  const op = assertOp(node.op, tagOps, position, "a tag");
  if (typeof node.tagId !== "string" || !isUuid(node.tagId)) {
    fail(position, "A tag condition needs the id of a tag.");
  }
  const tagId = node.tagId.toLowerCase();
  if (context.references === "strict" && !context.tagIds.has(tagId)) {
    fail(position, "That tag was not found. It may have been deleted.");
  }
  return { field: "tag", op, tagId };
}

function validateCondition(node: unknown, state: State): FilterCondition {
  state.conditions += 1;
  const position = state.conditions;
  if (position > maxFilterConditions) {
    throw new FilterValidationError(
      `A filter can have up to ${maxFilterConditions} conditions.`,
    );
  }
  if (!isRecord(node)) {
    fail(position, "It must be an object with a field and an op.");
  }
  const field = node.field;
  if (typeof field !== "string" || !fieldNames.includes(field)) {
    fail(
      position,
      `${shown(field)} is not a field that can be filtered. Use one of ${quoted(fieldNames)}.`,
    );
  }
  if (textFields.includes(field as TextField)) {
    return validateText(node, position);
  }
  if (dateFields.includes(field as DateField)) {
    return validateDate(node, position);
  }
  if (field === "custom") {
    return validateCustom(node, position, state.context);
  }
  if (field === "list") {
    return validateList(node, position, state.context);
  }
  if (field === "tag") {
    return validateTag(node, position, state.context);
  }
  assertKeys(node, ["field", "op"], position);
  return {
    field: "suppressed",
    op: assertOp(node.op, suppressedOps, position, "the suppressed state"),
  };
}

function looksLikeGroup(node: unknown): node is Record<string, unknown> {
  return isRecord(node) && ("conditions" in node || "match" in node);
}

function validateGroup(
  node: Record<string, unknown>,
  depth: number,
  state: State,
): FilterGroup {
  for (const key of Object.keys(node)) {
    if (key !== "match" && key !== "conditions") {
      throw new FilterValidationError(
        `'${key.slice(0, 40)}' is not a known property of a group. Use match and conditions.`,
      );
    }
  }
  if (node.match !== "all" && node.match !== "any") {
    throw new FilterValidationError("A group's match must be all or any.");
  }
  if (!Array.isArray(node.conditions)) {
    throw new FilterValidationError("A group's conditions must be a list.");
  }
  if (depth > 1 && node.conditions.length === 0) {
    throw new FilterValidationError(
      "A nested group needs at least one condition.",
    );
  }
  const conditions = node.conditions.map((child) => {
    if (!looksLikeGroup(child)) {
      return validateCondition(child, state);
    }
    if (depth >= maxFilterDepth) {
      throw new FilterValidationError(
        "Groups can be nested one level deep. A nested group can hold only conditions.",
      );
    }
    return validateGroup(child, depth + 1, state);
  });
  return { match: node.match, conditions };
}

export function validateFilterGroup(
  input: unknown,
  context: FilterContext,
): FilterGroup {
  if (!isRecord(input)) {
    throw new FilterValidationError(
      "The filter must be a group with match and conditions.",
    );
  }
  return validateGroup(input, 1, { conditions: 0, context });
}

export function collectFilterReferences(input: unknown): FilterReferences {
  const listIds = new Set<string>();
  const tagIds = new Set<string>();
  let visited = 0;
  const visit = (node: unknown, depth: number) => {
    visited += 1;
    if (!isRecord(node) || depth > maxFilterDepth + 1 || visited > 200) {
      return;
    }
    if (Array.isArray(node.conditions)) {
      for (const child of node.conditions) {
        visit(child, depth + 1);
      }
    }
    if (typeof node.listId === "string" && isUuid(node.listId)) {
      listIds.add(node.listId.toLowerCase());
    }
    if (typeof node.tagId === "string" && isUuid(node.tagId)) {
      tagIds.add(node.tagId.toLowerCase());
    }
  };
  visit(input, 1);
  return { listIds: [...listIds], tagIds: [...tagIds] };
}
