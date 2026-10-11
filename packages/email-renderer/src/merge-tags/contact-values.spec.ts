import { describe, expect, it } from "vitest";
import { contactMergeValues } from "./contact-values";
import { renderMergeTags } from "./merge-tags";

const brand = {
  name: "Acme",
  address: "1 Main St, Springfield",
  website: "https://acme.example",
};

describe("contactMergeValues", () => {
  it("maps contact, custom field and brand values to merge keys", () => {
    expect(
      contactMergeValues({
        contact: {
          email: "ada@example.com",
          firstName: "Ada",
          lastName: "Lovelace",
          company: "Analytical",
          jobTitle: "Engineer",
          phone: "+44 20 7946 0000",
          city: "London",
          country: "GB",
          fields: { plan: "pro", seats: 12, active: true, score: 0 },
        },
        brand,
      }),
    ).toEqual({
      email: "ada@example.com",
      first_name: "Ada",
      last_name: "Lovelace",
      company: "Analytical",
      job_title: "Engineer",
      phone: "+44 20 7946 0000",
      city: "London",
      country: "GB",
      "fields.plan": "pro",
      "fields.seats": "12",
      "fields.active": "true",
      "fields.score": "0",
      "brand.name": "Acme",
      "brand.address": "1 Main St, Springfield",
      "brand.website": "https://acme.example",
    });
  });

  it("leaves out empty values so fallbacks apply", () => {
    const values = contactMergeValues({
      contact: {
        email: "ada@example.com",
        firstName: null,
        lastName: "  ",
        fields: { plan: null, note: "" },
      },
      brand: { name: "Acme", address: null, website: null },
    });
    expect(values).toEqual({ email: "ada@example.com", "brand.name": "Acme" });
    expect(renderMergeTags("Hi {{first_name|there}}", values)).toBe("Hi there");
  });

  it("skips custom field keys that no merge tag can address", () => {
    const values = contactMergeValues({
      contact: {
        email: "ada@example.com",
        fields: { "Bad Key": "x", __proto__: "y", ok_1: "z" } as Record<
          string,
          string
        >,
      },
      brand,
    });
    expect(values["fields.ok_1"]).toBe("z");
    expect(
      Object.keys(values).filter((key) => key.startsWith("fields.")),
    ).toEqual(["fields.ok_1"]);
  });

  it("works without custom fields", () => {
    expect(
      contactMergeValues({ contact: { email: "a@example.com" }, brand }).email,
    ).toBe("a@example.com");
  });
});
