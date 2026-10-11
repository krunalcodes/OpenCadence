import {
  isLookupName,
  normalizeLookupName,
  parentDomains,
  parseDomainName,
  parseSelector,
} from "./domain-name";

function domainOf(value: unknown) {
  const result = parseDomainName(value);
  return result.ok ? result.domain : null;
}

describe("parseDomainName", () => {
  it("lower-cases and trims a plain domain", () => {
    expect(domainOf("  Example.COM ")).toBe("example.com");
    expect(domainOf("mail.example.co.uk")).toBe("mail.example.co.uk");
  });

  it("stores international names in punycode", () => {
    expect(domainOf("bücher.example")).toBeNull();
    expect(domainOf("bücher.de")).toBe("xn--bcher-kva.de");
    expect(domainOf("例え.jp")).toBe("xn--r8jz45g.jp");
  });

  it("rejects anything that is not a bare hostname", () => {
    for (const value of [
      "",
      "   ",
      null,
      42,
      "example.com.",
      "*.example.com",
      "https://example.com",
      "example.com/path",
      "me@example.com",
      "example.com:25",
      "exa mple.com",
      "-example.com",
      "example-.com",
      "exam_ple.com",
      ".example.com",
      "example..com",
      "example",
      `${"a".repeat(64)}.com`,
      `${"a.".repeat(130)}com`,
    ]) {
      expect(domainOf(value)).toBeNull();
    }
  });

  it("rejects IP addresses", () => {
    for (const value of [
      "192.168.1.1",
      "8.8.8.8",
      "[::1]",
      "2001:db8::1",
      "::ffff:1.2.3.4",
      "example.123",
    ]) {
      expect(domainOf(value)).toBeNull();
    }
  });

  it("rejects reserved endings and known public suffixes on their own", () => {
    for (const value of [
      "localhost",
      "mail.localhost",
      "server.local",
      "app.internal",
      "site.test",
      "co.uk",
      "com.au",
    ]) {
      expect(domainOf(value)).toBeNull();
    }
    expect(domainOf("shop.co.uk")).toBe("shop.co.uk");
  });

  it("explains what is wrong", () => {
    const result = parseDomainName("me@example.com");
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.message).toContain("after the @");
  });
});

describe("lookup names", () => {
  it("allows underscore labels but nothing that is not a hostname", () => {
    expect(isLookupName("_spf.google.com")).toBe(true);
    expect(normalizeLookupName("Selector1._DomainKey.Example.com.")).toBe(
      "selector1._domainkey.example.com",
    );
    for (const value of [
      "127.0.0.1",
      "localhost",
      "exa mple.com",
      "example.com/x",
      "%{d}.example.com",
      "",
      "a..b.com",
    ]) {
      expect(normalizeLookupName(value)).toBeNull();
    }
  });
});

describe("parseSelector", () => {
  it("accepts simple and dotted selectors", () => {
    expect(parseSelector(" Google ", 63)).toBe("google");
    expect(parseSelector("s1.mail", 63)).toBe("s1.mail");
  });

  it("rejects selectors that could change the looked-up name", () => {
    for (const value of [
      "",
      "a b",
      "a_b",
      "-a",
      "a..b",
      "a/b",
      "*",
      3,
      "a".repeat(64),
    ]) {
      expect(parseSelector(value, 63)).toBeNull();
    }
  });
});

describe("parentDomains", () => {
  it("walks up to the registrable domain and never to a public suffix", () => {
    expect(parentDomains("a.b.example.com", 4)).toEqual([
      "b.example.com",
      "example.com",
    ]);
    expect(parentDomains("example.com", 4)).toEqual([]);
    expect(parentDomains("mail.example.co.uk", 4)).toEqual(["example.co.uk"]);
    expect(parentDomains("a.b.c.d.e.example.com", 2)).toHaveLength(2);
  });
});
