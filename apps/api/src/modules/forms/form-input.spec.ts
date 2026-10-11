import { describe, expect, it } from "vitest";
import {
  type CatalogField,
  defaultSettings,
  type FormField,
  FormInputError,
  flattenBody,
  isHoneypotFilled,
  parseFields,
  parseFormBody,
  parseName,
  parseSettings,
  parseSubmission,
  resolveFields,
  resolveSettings,
  safeRedirectUrl,
  submissionContact,
} from "./form-input";
import { honeypotField } from "./forms.constants";

const catalog = new Map<string, CatalogField>([
  [
    "plan",
    { key: "plan", label: "Plan", type: "select", options: ["Free", "Pro"] },
  ],
  ["seats", { key: "seats", label: "Seats", type: "number", options: null }],
  [
    "birthday",
    { key: "birthday", label: "Birthday", type: "date", options: null },
  ],
  ["terms", { key: "terms", label: "Terms", type: "boolean", options: null }],
  ["notes", { key: "notes", label: "Notes", type: "text", options: null }],
]);

function failure(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof FormInputError) {
      return { message: error.message, field: error.field };
    }
    throw error;
  }
  throw new Error("Expected a FormInputError.");
}

function values(entries: Record<string, string>) {
  return new Map(Object.entries(entries));
}

const fields: FormField[] = resolveFields(
  [
    { key: "email", label: "Work email", required: true },
    { key: "first_name", label: "First name", required: true },
    { key: "phone", label: "Phone", required: false },
    { key: "fields.plan", label: "Plan", required: false },
    { key: "fields.seats", label: "Seats", required: false },
    { key: "fields.birthday", label: "Birthday", required: false },
    { key: "fields.terms", label: "Terms", required: true },
    { key: "fields.notes", label: "Notes", required: false },
  ],
  catalog,
);

describe("parseName", () => {
  it("trims, collapses spaces and caps the length", () => {
    expect(parseName("  Weekly \n news ")).toBe("Weekly news");
    expect(failure(() => parseName(" ")).field).toBe("name");
    expect(failure(() => parseName(12)).field).toBe("name");
    expect(failure(() => parseName("x".repeat(121))).field).toBe("name");
  });
});

describe("parseFields", () => {
  it("puts email first and required whatever was sent", () => {
    expect(
      parseFields(
        [
          { key: "first_name", label: " Name ", required: true },
          { key: "email", label: "Your email", required: false },
          { key: "fields.plan" },
        ],
        catalog,
      ),
    ).toEqual([
      { key: "email", label: "Your email", required: true },
      { key: "first_name", label: "Name", required: true },
      { key: "fields.plan", label: "Plan", required: false },
    ]);
    expect(parseFields([], catalog)).toEqual([
      { key: "email", label: "Email", required: true },
    ]);
  });

  it("refuses unknown keys, duplicates, long labels and too many fields", () => {
    for (const bad of [
      "nope",
      [{ key: "timezone" }],
      [{ key: "fields.unknown" }],
      [{ key: "__proto__" }],
      [{ key: "constructor" }],
      [{ key: "first_name" }, { key: "first_name" }],
      [{ key: "first_name", label: "x".repeat(81) }],
      [{ key: "first_name", required: "yes" }],
      [{ key: "first_name", label: 4 }],
      [{}],
    ]) {
      expect(failure(() => parseFields(bad, catalog)).field).toBe("fields");
    }
    const twelve = [
      "first_name",
      "last_name",
      "company",
      "job_title",
      "phone",
      "city",
      "country",
      "fields.plan",
      "fields.seats",
      "fields.birthday",
      "fields.terms",
      "fields.notes",
    ].map((key) => ({ key }));
    expect(failure(() => parseFields(twelve, catalog)).field).toBe("fields");
    expect(parseFields(twelve.slice(0, 11), catalog)).toHaveLength(12);
  });
});

describe("resolveFields", () => {
  it("drops custom fields that left the catalog and describes the rest", () => {
    const resolved = resolveFields(
      [
        { key: "fields.gone", label: "Gone", required: true },
        { key: "fields.plan", label: "Your plan", required: true },
        { key: "phone", label: "", required: false },
      ],
      catalog,
    );
    expect(resolved).toEqual([
      {
        key: "email",
        label: "Email",
        required: true,
        type: "email",
        options: null,
      },
      {
        key: "fields.plan",
        label: "Your plan",
        required: true,
        type: "select",
        options: ["Free", "Pro"],
      },
      {
        key: "phone",
        label: "Phone",
        required: false,
        type: "tel",
        options: null,
      },
    ]);
  });
});

describe("settings", () => {
  it("fills every text with a default that follows double opt-in", () => {
    const on = resolveSettings({}, true);
    const off = resolveSettings({}, false);
    expect(on).toEqual({
      ...defaultSettings(true),
      redirectUrl: null,
      fromEmail: null,
    });
    expect(on.successTitle).not.toBe(off.successTitle);
    expect(off.successMessage).toBe("Thank you for subscribing.");
  });

  it("stores only what differs from a default", () => {
    const stored = parseSettings(
      {
        title: "  Join \n us ",
        buttonLabel: defaultSettings(true).buttonLabel,
        successTitle: defaultSettings(false).successTitle,
        description: "Line one\r\nLine two",
        redirectUrl: " https://example.com/thanks ",
        fromEmail: " News@Example.com ",
      },
      { successMessage: "Old", confirmSubject: "Keep" },
    );
    expect(stored).toEqual({
      title: "Join us",
      description: "Line one\nLine two",
      successMessage: "Old",
      confirmSubject: "Keep",
      redirectUrl: "https://example.com/thanks",
      fromEmail: "news@example.com",
    });
    expect(
      parseSettings({ title: "", redirectUrl: null, fromEmail: "" }, stored),
    ).toEqual({
      description: "Line one\nLine two",
      successMessage: "Old",
      confirmSubject: "Keep",
    });
  });

  it("caps lengths and refuses values of the wrong type", () => {
    expect(failure(() => parseSettings("x", {})).field).toBe("settings");
    expect(
      failure(() => parseSettings({ title: "x".repeat(121) }, {})).field,
    ).toBe("settings.title");
    expect(
      failure(() => parseSettings({ buttonLabel: "x".repeat(41) }, {})).field,
    ).toBe("settings.buttonLabel");
    expect(
      failure(() => parseSettings({ consentText: "x".repeat(501) }, {})).field,
    ).toBe("settings.consentText");
    expect(
      failure(() => parseSettings({ confirmSubject: "x".repeat(151) }, {}))
        .field,
    ).toBe("settings.confirmSubject");
    expect(failure(() => parseSettings({ description: 5 }, {})).field).toBe(
      "settings.description",
    );
    expect(failure(() => parseSettings({ fromEmail: "nope" }, {})).field).toBe(
      "settings.fromEmail",
    );
  });

  it("accepts only http and https redirect addresses", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,x",
      "//example.com",
      "/relative",
      "ftp://example.com",
      `https://example.com/${"x".repeat(2000)}`,
      7,
    ]) {
      expect(failure(() => parseSettings({ redirectUrl: bad }, {})).field).toBe(
        "settings.redirectUrl",
      );
      expect(safeRedirectUrl(bad)).toBeNull();
    }
    expect(
      resolveSettings({ redirectUrl: "javascript:alert(1)" }, true).redirectUrl,
    ).toBeNull();
    expect(safeRedirectUrl("http://example.com")).toBe("http://example.com/");
  });
});

describe("request bodies", () => {
  it("reads JSON, with nested fields and camel case names", () => {
    const body = parseFormBody(
      Buffer.from(
        JSON.stringify({
          email: "a@example.com",
          firstName: "Ada",
          fields: { plan: "Pro", seats: 3 },
          data: { phone: "123" },
          renderToken: "tok",
          nested: { deep: true },
          list: ["x"],
        }),
      ),
      "application/json; charset=utf-8",
    );
    expect(body.json).toBe(true);
    expect(Object.fromEntries(body.values)).toEqual({
      email: "a@example.com",
      first_name: "Ada",
      "fields.plan": "Pro",
      "fields.seats": "3",
      phone: "123",
      render_token: "tok",
    });
  });

  it("reads a plain form post and keeps the first value of a repeated field", () => {
    const body = parseFormBody(
      Buffer.from(
        "email=a%40example.com&first_name=Ada+L&email=b%40example.com&fields.plan=Pro",
      ),
      "application/x-www-form-urlencoded",
    );
    expect(body.json).toBe(false);
    expect(Object.fromEntries(body.values)).toEqual({
      email: "a@example.com",
      first_name: "Ada L",
      "fields.plan": "Pro",
    });
  });

  it("treats broken JSON, arrays and scalars as an empty body", () => {
    expect(
      parseFormBody(Buffer.from("{nope"), "application/json").values.size,
    ).toBe(0);
    expect(flattenBody([1, 2]).size).toBe(0);
    expect(flattenBody("x").size).toBe(0);
    expect(flattenBody(null).size).toBe(0);
  });

  it("caps how many entries and how long a key it keeps", () => {
    const many = Object.fromEntries(
      Array.from({ length: 500 }, (_, index) => [`k${index}`, "v"]),
    );
    expect(flattenBody(many).size).toBe(64);
    expect(flattenBody({ ["k".repeat(81)]: "v" }).size).toBe(0);
    const query = Array.from({ length: 500 }, (_, index) => `k${index}=v`).join(
      "&",
    );
    expect(parseFormBody(Buffer.from(query), undefined).values.size).toBe(64);
  });

  it("spots a filled honeypot", () => {
    expect(isHoneypotFilled(values({ [honeypotField]: " " }))).toBe(false);
    expect(isHoneypotFilled(values({}))).toBe(false);
    expect(isHoneypotFilled(values({ [honeypotField]: "555" }))).toBe(true);
  });
});

describe("parseSubmission", () => {
  const valid = {
    email: " Ada@Example.COM ",
    first_name: " Ada ",
    "fields.terms": "on",
  };

  it("normalises the address and every value, and ignores unknown fields", () => {
    expect(
      parseSubmission(
        values({
          ...valid,
          phone: "+1 555 0100",
          "fields.plan": "pro",
          "fields.seats": "007.50",
          "fields.birthday": "2000-02-29",
          "fields.notes": "hi\u0000 there\u0007",
          last_name: "ignored: not on the form",
          "fields.secret": "ignored",
          admin: "true",
        }),
        fields,
      ),
    ).toEqual({
      email: "ada@example.com",
      data: {
        first_name: "Ada",
        phone: "+1 555 0100",
        "fields.plan": "Pro",
        "fields.seats": "7.5",
        "fields.birthday": "2000-02-29",
        "fields.terms": "true",
        "fields.notes": "hi there",
      },
    });
  });

  it("needs a valid address", () => {
    for (const email of [
      "",
      "   ",
      "nope",
      "a@b",
      "a b@example.com",
      `${"a".repeat(320)}@example.com`,
    ]) {
      expect(
        failure(() => parseSubmission(values({ ...valid, email }), fields))
          .field,
      ).toBe("email");
    }
    expect(failure(() => parseSubmission(values({}), fields)).field).toBe(
      "email",
    );
  });

  it("needs every required field, and a required checkbox ticked", () => {
    expect(
      failure(() =>
        parseSubmission(values({ ...valid, first_name: "  " }), fields),
      ),
    ).toEqual({ message: "First name is required.", field: "first_name" });
    const { "fields.terms": _terms, ...unticked } = valid;
    expect(failure(() => parseSubmission(values(unticked), fields)).field).toBe(
      "fields.terms",
    );
    expect(
      failure(() =>
        parseSubmission(values({ ...valid, "fields.terms": "no" }), fields),
      ).field,
    ).toBe("fields.terms");
  });

  it("caps the length of every value", () => {
    expect(
      failure(() =>
        parseSubmission(
          values({ ...valid, first_name: "x".repeat(256) }),
          fields,
        ),
      ).field,
    ).toBe("first_name");
    expect(
      failure(() =>
        parseSubmission(values({ ...valid, phone: "1".repeat(51) }), fields),
      ).field,
    ).toBe("phone");
    expect(
      failure(() =>
        parseSubmission(
          values({ ...valid, "fields.notes": "x".repeat(501) }),
          fields,
        ),
      ).field,
    ).toBe("fields.notes");
  });

  it("checks numbers, dates, choices and yes or no", () => {
    const bad: Record<string, string> = {
      "fields.seats": "1e9999",
      "fields.birthday": "2001-02-29",
      "fields.plan": "Enterprise",
      "fields.terms": "maybe",
    };
    for (const [key, value] of Object.entries(bad)) {
      expect(
        failure(() =>
          parseSubmission(values({ ...valid, [key]: value }), fields),
        ).field,
      ).toBe(key);
    }
    expect(
      failure(() =>
        parseSubmission(values({ ...valid, "fields.seats": "12abc" }), fields),
      ).field,
    ).toBe("fields.seats");
  });
});

describe("submissionContact", () => {
  const data = {
    first_name: "Ada",
    phone: "123",
    "fields.plan": "Pro",
    "fields.seats": "7.5",
    "fields.terms": "true",
    "fields.gone": "x",
    last_name: "not on the form",
  };

  it("maps values onto contact properties and typed custom fields", () => {
    expect(submissionContact("a@example.com", data, fields)).toEqual({
      email: "a@example.com",
      firstName: "Ada",
      phone: "123",
      fields: { plan: "Pro", seats: 7.5, terms: true },
    });
  });

  it("can leave out custom fields, or everything but the address", () => {
    expect(submissionContact("a@example.com", data, fields, "columns")).toEqual(
      {
        email: "a@example.com",
        firstName: "Ada",
        phone: "123",
      },
    );
    expect(submissionContact("a@example.com", data, fields, "email")).toEqual({
      email: "a@example.com",
    });
  });
});
