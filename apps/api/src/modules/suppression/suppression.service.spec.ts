import { isValidEmail, normalizeEmail } from "./suppression.service";

describe("suppression email helpers", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail("  Ada.Lovelace@Example.COM ")).toBe(
      "ada.lovelace@example.com",
    );
  });

  it("accepts ordinary addresses", () => {
    expect(isValidEmail("ada@example.com")).toBe(true);
    expect(isValidEmail(" Ada+news@mail.Example.co.uk ")).toBe(true);
  });

  it("rejects malformed and oversized addresses", () => {
    for (const value of [
      "",
      "ada",
      "ada@",
      "@example.com",
      "ada@example",
      "ada @example.com",
      "ada@@example.com",
      "Ada <ada@example.com>",
      `${"a".repeat(320)}@example.com`,
    ]) {
      expect(isValidEmail(value)).toBe(false);
    }
  });
});
