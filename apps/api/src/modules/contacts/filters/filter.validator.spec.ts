import type { FilterFieldDefinition } from "./filter.types";
import {
  collectFilterReferences,
  type FilterContext,
  FilterValidationError,
  isIsoDate,
  validateFilterGroup,
} from "./filter.validator";

const listId = "0198c0de-0000-7000-8000-000000000001";
const tagId = "0198c0de-0000-7000-8000-000000000002";
const strangerId = "0198c0de-0000-7000-8000-00000000ffff";

const context: FilterContext = {
  fields: new Map<string, FilterFieldDefinition>(
    (
      [
        { key: "plan", label: "Plan", type: "text" },
        { key: "seats", label: "Seats", type: "number" },
        { key: "renewal", label: "Renewal", type: "date" },
        { key: "vip", label: "VIP", type: "boolean" },
        { key: "tier", label: "Tier", type: "select" },
      ] as FilterFieldDefinition[]
    ).map((field) => [field.key, field]),
  ),
  listIds: new Set([listId]),
  tagIds: new Set([tagId]),
  references: "strict",
};

function all(...conditions: unknown[]) {
  return { match: "all", conditions };
}

function messageOf(input: unknown, using = context) {
  try {
    validateFilterGroup(input, using);
  } catch (error) {
    if (error instanceof FilterValidationError) {
      return error.message;
    }
    throw error;
  }
  return null;
}

describe("validateFilterGroup", () => {
  it("accepts every kind of condition and returns a clean copy", () => {
    const input = {
      match: "all",
      conditions: [
        { field: "email", op: "ends_with", value: "@example.com" },
        { field: "firstName", op: "is_set", value: "ignored" },
        { field: "createdAt", op: "after", value: "2026-01-31" },
        { field: "updatedAt", op: "before", value: "2026-01-31T10:00:00Z" },
        { field: "createdAt", op: "in_last_days", value: 30 },
        {
          match: "any",
          conditions: [
            { field: "custom", key: "plan", op: "contains", value: "pro" },
            { field: "custom", key: "seats", op: "gte", value: 5 },
            {
              field: "custom",
              key: "renewal",
              op: "before",
              value: "2026-06-01",
            },
            { field: "custom", key: "vip", op: "is_true" },
            { field: "custom", key: "tier", op: "is", value: "Gold" },
          ],
        },
        { field: "list", op: "subscribed_to", listId: listId.toUpperCase() },
        { field: "tag", op: "has_not", tagId },
        { field: "suppressed", op: "is_false" },
      ],
    };
    const result = validateFilterGroup(input, context);
    expect(result.conditions).toHaveLength(9);
    expect(result.conditions[1]).toEqual({ field: "firstName", op: "is_set" });
    expect(result.conditions[6]).toEqual({
      field: "list",
      op: "subscribed_to",
      listId,
    });
    expect(result).not.toBe(input);
    expect(validateFilterGroup(all(), context)).toEqual(all());
  });

  it("rejects input that is not a group", () => {
    for (const input of [null, "x", 3, [], undefined]) {
      expect(messageOf(input)).toBe(
        "The filter must be a group with match and conditions.",
      );
    }
    expect(messageOf({ match: "some", conditions: [] })).toBe(
      "A group's match must be all or any.",
    );
    expect(messageOf({ match: "all" })).toBe(
      "A group's conditions must be a list.",
    );
    expect(messageOf({ match: "all", conditions: [], extra: 1 })).toContain(
      "'extra' is not a known property of a group",
    );
  });

  it("names the condition with an unknown field, op or property", () => {
    expect(
      messageOf(
        all(
          { field: "email", op: "is", value: "a@b.co" },
          { field: "password", op: "is", value: "x" },
        ),
      ),
    ).toMatch(/^Condition 2: 'password' is not a field that can be filtered\./);
    expect(
      messageOf(all({ field: "email", op: "matches", value: "x" })),
    ).toMatch(/^Condition 1: 'matches' cannot be used on the email field\./);
    expect(
      messageOf(all({ field: "email", op: "is", value: "x", sql: "1=1" })),
    ).toMatch(/^Condition 1: 'sql' is not a known property\./);
    expect(messageOf(all("email is x"))).toBe(
      "Condition 1: It must be an object with a field and an op.",
    );
    expect(messageOf(all({ field: "suppressed", op: "is" }))).toMatch(
      /^Condition 1: 'is' cannot be used on the suppressed state\./,
    );
    expect(
      messageOf(all({ field: "createdAt", op: "is", value: "2026-01-01" })),
    ).toMatch(/^Condition 1: 'is' cannot be used on the createdAt field\./);
  });

  it("rejects values of the wrong type", () => {
    expect(messageOf(all({ field: "email", op: "is", value: 5 }))).toBe(
      "Condition 1: 'is' needs a text value.",
    );
    expect(messageOf(all({ field: "email", op: "contains" }))).toBe(
      "Condition 1: 'contains' needs a text value.",
    );
    expect(
      messageOf(all({ field: "company", op: "is", value: "x".repeat(256) })),
    ).toBe("Condition 1: Keep the value to 255 characters or fewer.");
    expect(
      messageOf(all({ field: "createdAt", op: "before", value: "yesterday" })),
    ).toBe("Condition 1: 'before' needs a date such as 2026-01-31.");
    expect(
      messageOf(all({ field: "createdAt", op: "after", value: "2026-02-30" })),
    ).toBe("Condition 1: 'after' needs a date such as 2026-01-31.");
    for (const value of [0, 3651, 1.5, "30", null]) {
      expect(
        messageOf(all({ field: "createdAt", op: "in_last_days", value })),
      ).toBe(
        "Condition 1: 'in_last_days' needs a whole number of days from 1 to 3650.",
      );
    }
    expect(
      messageOf(all({ field: "custom", key: "seats", op: "gt", value: "5" })),
    ).toBe("Condition 1: 'gt' on the number field Seats needs a number.");
    expect(
      messageOf(
        all({ field: "custom", key: "seats", op: "is", value: Number.NaN }),
      ),
    ).toBe("Condition 1: 'is' on the number field Seats needs a number.");
    expect(
      messageOf(
        all({ field: "custom", key: "renewal", op: "after", value: "soon" }),
      ),
    ).toBe(
      "Condition 1: 'after' on the date field Renewal needs a date such as 2026-01-31.",
    );
    expect(
      messageOf(all({ field: "custom", key: "plan", op: "is", value: 5 })),
    ).toBe("Condition 1: 'is' needs a text value.");
  });

  it("rejects ops that the type of a custom field does not allow", () => {
    expect(
      messageOf(
        all(
          { field: "email", op: "is_set" },
          { field: "tag", op: "has", tagId },
          { field: "custom", key: "plan", op: "gt", value: 3 },
        ),
      ),
    ).toMatch(/^Condition 3: 'gt' cannot be used on the text field Plan\./);
    expect(
      messageOf(
        all({ field: "custom", key: "seats", op: "contains", value: "1" }),
      ),
    ).toMatch(
      /^Condition 1: 'contains' cannot be used on the number field Seats\./,
    );
    expect(
      messageOf(all({ field: "custom", key: "renewal", op: "gt", value: 1 })),
    ).toMatch(/^Condition 1: 'gt' cannot be used on the date field Renewal\./);
    expect(
      messageOf(all({ field: "custom", key: "vip", op: "is", value: "true" })),
    ).toMatch(/^Condition 1: 'is' cannot be used on the boolean field VIP\./);
    expect(
      messageOf(all({ field: "custom", key: "tier", op: "is_true" })),
    ).toMatch(
      /^Condition 1: 'is_true' cannot be used on the select field Tier\./,
    );
  });

  it("rejects custom keys, lists and tags that are not in the workspace", () => {
    expect(
      messageOf(all({ field: "custom", key: "missing", op: "is", value: "x" })),
    ).toBe(
      "Condition 1: 'missing' is not a custom field in this workspace. It may have been deleted.",
    );
    expect(messageOf(all({ field: "custom", op: "is", value: "x" }))).toBe(
      "Condition 1: A custom field condition needs the key of the field.",
    );
    expect(
      messageOf(all({ field: "list", op: "in", listId: strangerId })),
    ).toBe("Condition 1: That list was not found. It may have been deleted.");
    expect(messageOf(all({ field: "list", op: "in", listId: "abc" }))).toBe(
      "Condition 1: A list condition needs the id of a list.",
    );
    expect(
      messageOf(
        all(
          { field: "email", op: "is_set" },
          { field: "tag", op: "has", tagId: strangerId },
        ),
      ),
    ).toBe("Condition 2: That tag was not found. It may have been deleted.");
    expect(messageOf(all({ field: "tag", op: "in", tagId }))).toMatch(
      /^Condition 1: 'in' cannot be used on a tag\./,
    );
  });

  it("counts conditions across nested groups when naming one", () => {
    expect(
      messageOf(
        all(
          { field: "email", op: "is_set" },
          {
            match: "any",
            conditions: [
              { field: "phone", op: "is_set" },
              { field: "city", op: "is" },
            ],
          },
        ),
      ),
    ).toBe("Condition 3: 'is' needs a text value.");
  });

  it("limits nesting to two levels", () => {
    const leaf = { field: "email", op: "is_set" };
    expect(
      messageOf(all({ match: "any", conditions: [leaf, leaf] })),
    ).toBeNull();
    expect(
      messageOf(
        all({
          match: "any",
          conditions: [{ match: "all", conditions: [leaf] }],
        }),
      ),
    ).toBe(
      "Groups can be nested one level deep. A nested group can hold only conditions.",
    );
    expect(messageOf(all({ match: "any", conditions: [] }))).toBe(
      "A nested group needs at least one condition.",
    );
  });

  it("limits a filter to 30 conditions in total", () => {
    const leaf = { field: "email", op: "is_set" };
    const thirty = all(...Array.from({ length: 20 }, () => leaf), {
      match: "any",
      conditions: Array.from({ length: 10 }, () => leaf),
    });
    expect(messageOf(thirty)).toBeNull();
    const thirtyOne = all(...Array.from({ length: 20 }, () => leaf), {
      match: "any",
      conditions: Array.from({ length: 11 }, () => leaf),
    });
    expect(messageOf(thirtyOne)).toBe("A filter can have up to 30 conditions.");
  });

  it("keeps stored rules usable in lenient mode after a field, list or tag is deleted", () => {
    const lenient: FilterContext = { ...context, references: "lenient" };
    const stored = all(
      { field: "custom", key: "missing", op: "gt", value: 3 },
      { field: "list", op: "in", listId: strangerId },
      { field: "tag", op: "has", tagId: strangerId },
    );
    expect(validateFilterGroup(stored, lenient)).toEqual(stored);
    expect(
      messageOf(all({ field: "custom", key: "missing", op: "nope" }), lenient),
    ).toMatch(/^Condition 1: 'nope' cannot be used on a custom field\./);
    expect(
      messageOf(
        all({ field: "custom", key: "plan", op: "gt", value: 3 }),
        lenient,
      ),
    ).toMatch(/^Condition 1: 'gt' cannot be used on the text field Plan\./);
  });
});

describe("collectFilterReferences", () => {
  it("collects valid list and tag ids from any depth, once each", () => {
    expect(
      collectFilterReferences(
        all(
          { field: "list", op: "in", listId: listId.toUpperCase() },
          { field: "list", op: "not_in", listId },
          { field: "list", op: "in", listId: "not-an-id" },
          { match: "any", conditions: [{ field: "tag", op: "has", tagId }] },
        ),
      ),
    ).toEqual({ listIds: [listId], tagIds: [tagId] });
    expect(collectFilterReferences("nonsense")).toEqual({
      listIds: [],
      tagIds: [],
    });
  });
});

describe("isIsoDate", () => {
  it("accepts real calendar dates only", () => {
    expect(isIsoDate("2026-01-31")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-1-31")).toBe(false);
    expect(isIsoDate("2026-01-31T00:00:00Z")).toBe(false);
  });
});
