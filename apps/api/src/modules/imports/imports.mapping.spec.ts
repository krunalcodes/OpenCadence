import {
  errorReportRow,
  headerColumns,
  mappingPlan,
  toContact,
  validateMapping,
} from "./imports.mapping";

const columns = ["Email", "First", "Last", "Plan", "Notes"];

describe("headerColumns", () => {
  it("trims names, names empty columns and numbers duplicates", () => {
    expect(
      headerColumns([" Email ", "", "Name", "Name", "name", "Name"]),
    ).toEqual(["Email", "Column 2", "Name", "Name (2)", "name", "Name (3)"]);
  });
});

describe("validateMapping", () => {
  it("accepts a mapping and fills unmapped columns with skip", () => {
    const result = validateMapping(
      {
        Email: "email",
        First: "firstName",
        Plan: "custom:plan",
        Notes: "skip",
      },
      columns,
    );
    expect(result).toEqual({
      ok: true,
      mapping: {
        Email: "email",
        First: "firstName",
        Last: "skip",
        Plan: "custom:plan",
        Notes: "skip",
      },
      customKeys: ["plan"],
    });
  });

  it.each([
    ["not an object", "nope"],
    ["an array", ["email"]],
    ["null", null],
    ["an unknown column", { Email: "email", Phone: "phone" }],
    ["an unknown target", { Email: "email", First: "nickname" }],
    ["a target that is not text", { Email: "email", First: 3 }],
    ["an empty custom key", { Email: "email", First: "custom:" }],
    ["no email column", { First: "firstName" }],
    ["two email columns", { Email: "email", First: "email" }],
    [
      "two columns on one target",
      { Email: "email", First: "city", Last: "city" },
    ],
    [
      "two columns on one custom field",
      { Email: "email", First: "custom:plan", Last: "custom:plan" },
    ],
  ])("rejects %s", (_name, input) => {
    const result = validateMapping(input, columns);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("lets several columns be skipped", () => {
    expect(
      validateMapping({ Email: "email", First: "skip", Last: "skip" }, columns)
        .ok,
    ).toBe(true);
  });

  it("does not treat inherited names as columns", () => {
    expect(
      validateMapping({ Email: "email", toString: "city" }, columns).ok,
    ).toBe(false);
  });
});

describe("toContact", () => {
  const plan = mappingPlan(columns, {
    Email: "email",
    First: "firstName",
    Last: "skip",
    Plan: "custom:plan",
    Notes: "custom:notes",
  });

  it("builds a contact, trimming cells and leaving empty ones out", () => {
    expect(
      toContact(plan, [" Ada@Example.com ", "  Ada ", "Lovelace", "pro", "  "]),
    ).toEqual({
      email: "Ada@Example.com",
      firstName: "Ada",
      fields: { plan: "pro" },
    });
    expect(toContact(plan, ["a@example.com", "", "", "", ""])).toEqual({
      email: "a@example.com",
    });
  });

  it("copes with a row that is shorter than the header", () => {
    expect(toContact(plan, ["a@example.com"])).toEqual({
      email: "a@example.com",
    });
  });

  it("returns null when the email cell is empty", () => {
    expect(toContact(plan, ["  ", "Ada", "", "", ""])).toBeNull();
    expect(toContact(plan, [])).toBeNull();
  });
});

describe("errorReportRow", () => {
  it("leads with the error and fits the cells to the header", () => {
    expect(errorReportRow("Bad", ["a"], 3)).toEqual(["Bad", "a", "", ""]);
    expect(errorReportRow("Bad", ["a", "b", "c", "d"], 3)).toEqual([
      "Bad",
      "a",
      "b",
      "c",
    ]);
  });
});
