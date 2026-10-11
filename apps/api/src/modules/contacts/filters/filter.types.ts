export type TextOp =
  | "is"
  | "is_not"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "is_set"
  | "is_not_set";

export type TextField =
  | "email"
  | "firstName"
  | "lastName"
  | "company"
  | "jobTitle"
  | "phone"
  | "city"
  | "country"
  | "timezone";

export type DateField = "createdAt" | "updatedAt";

export type CustomOp =
  | TextOp
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "before"
  | "after"
  | "is_true"
  | "is_false";

export type TextCondition = { field: TextField; op: TextOp; value?: string };

export type DateCondition =
  | { field: DateField; op: "before" | "after"; value: string }
  | {
      field: DateField;
      op: "in_last_days" | "not_in_last_days";
      value: number;
    };

export type CustomCondition = {
  field: "custom";
  key: string;
  op: CustomOp;
  value?: string | number;
};

export type ListCondition = {
  field: "list";
  op: "in" | "not_in" | "subscribed_to" | "unsubscribed_from";
  listId: string;
};

export type TagCondition = {
  field: "tag";
  op: "has" | "has_not";
  tagId: string;
};

export type SuppressedCondition = {
  field: "suppressed";
  op: "is_true" | "is_false";
};

export type FilterCondition =
  | TextCondition
  | DateCondition
  | CustomCondition
  | ListCondition
  | TagCondition
  | SuppressedCondition;

export type FilterGroup = {
  match: "all" | "any";
  conditions: (FilterCondition | FilterGroup)[];
};

export type FilterFieldType = "text" | "number" | "date" | "boolean" | "select";

export type FilterFieldDefinition = {
  key: string;
  label: string;
  type: FilterFieldType;
};

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

export const textOps: TextOp[] = [
  "is",
  "is_not",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "is_set",
  "is_not_set",
];

export const customOpsByType: Record<FilterFieldType, CustomOp[]> = {
  text: textOps,
  select: textOps,
  number: ["is", "is_not", "gt", "gte", "lt", "lte", "is_set", "is_not_set"],
  date: ["is", "before", "after", "is_set", "is_not_set"],
  boolean: ["is_true", "is_false", "is_set", "is_not_set"],
};

export const maxFilterConditions = 30;
export const maxFilterDepth = 2;

export function isFilterGroup(
  node: FilterCondition | FilterGroup,
): node is FilterGroup {
  return "conditions" in node;
}
