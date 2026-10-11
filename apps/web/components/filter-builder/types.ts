export type FilterMatch = "all" | "any";

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

export type DateOp = "before" | "after";

export type DaysOp = "in_last_days" | "not_in_last_days";

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

export type ListOp = "in" | "not_in" | "subscribed_to" | "unsubscribed_from";

export type TagOp = "has" | "has_not";

export type SuppressedOp = "is_true" | "is_false";

export type FilterOp = CustomOp | DaysOp | ListOp | TagOp;

export type TextCondition = { field: TextField; op: TextOp; value?: string };

export type DateCondition =
  | { field: DateField; op: DateOp; value: string }
  | { field: DateField; op: DaysOp; value: number };

export type CustomCondition = {
  field: "custom";
  key: string;
  op: CustomOp;
  value?: string | number;
};

export type ListCondition = { field: "list"; op: ListOp; listId: string };

export type TagCondition = { field: "tag"; op: TagOp; tagId: string };

export type SuppressedCondition = { field: "suppressed"; op: SuppressedOp };

export type FilterCondition =
  | TextCondition
  | DateCondition
  | CustomCondition
  | ListCondition
  | TagCondition
  | SuppressedCondition;

export type FilterGroup = {
  match: FilterMatch;
  conditions: (FilterCondition | FilterGroup)[];
};

export type CustomFieldType = "text" | "number" | "date" | "boolean" | "select";

export type FilterField = {
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[] | null;
};

export type FilterOption = { id: string; name: string };

export type FilterContext = {
  fields: FilterField[];
  lists: FilterOption[];
  tags: FilterOption[];
};
