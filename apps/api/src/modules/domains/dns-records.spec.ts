import { generateKeyPairSync } from "node:crypto";
import {
  cleanText,
  isDmarcRecord,
  isSpfRecord,
  parseDkim,
  parseDmarc,
  parseSpf,
  parseTagList,
} from "./dns-records";
import { joinTxtChunks } from "./dns-resolver";

function rsaKey(bits: number) {
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: bits });
  return publicKey.export({ format: "der", type: "spki" }).toString("base64");
}

const malformed = [
  "",
  " ",
  ";;;;",
  "=",
  "v=",
  "v=spf1 ::::: ////",
  "v=DMARC1; p",
  "v=DKIM1; p=%%%",
  "\u0000\u0001\u0002",
  "a".repeat(5000),
  "v=spf1 include:",
  "v=spf1 +",
  "p=;p=;p=",
];

describe("joinTxtChunks", () => {
  it("joins the 255 byte chunks of each record without a separator", () => {
    expect(
      joinTxtChunks([
        ["v=DKIM1; k=rsa; p=AAAA", "BBBB", "CCCC"],
        ["v=spf1 -all"],
      ]),
    ).toEqual(["v=DKIM1; k=rsa; p=AAAABBBBCCCC", "v=spf1 -all"]);
  });

  it("survives answers of the wrong shape", () => {
    expect(joinTxtChunks(null)).toEqual([]);
    expect(joinTxtChunks("text")).toEqual([]);
    expect(joinTxtChunks(["plain", [1, 2]])).toEqual(["plain", "12"]);
  });
});

describe("parseSpf", () => {
  it("recognises only records that start with v=spf1", () => {
    expect(isSpfRecord("v=spf1 -all")).toBe(true);
    expect(isSpfRecord("V=SPF1")).toBe(true);
    expect(isSpfRecord("v=spf10 -all")).toBe(false);
    expect(isSpfRecord("spf2.0/pra -all")).toBe(false);
    expect(parseSpf("google-site-verification=abc")).toBeNull();
  });

  it("reads mechanisms, qualifiers and modifiers", () => {
    expect(
      parseSpf(
        "v=spf1 ip4:192.0.2.0/24 ip6:2001:db8::/32 a mx:mail.example.com/24 include:_spf.example.net ?exists:%{i}.bl.example ptr redirect=_spf.example.org exp=explain.example.com ~all",
      )?.terms,
    ).toEqual([
      { kind: "mechanism", name: "ip4", qualifier: "+", value: "192.0.2.0/24" },
      {
        kind: "mechanism",
        name: "ip6",
        qualifier: "+",
        value: "2001:db8::/32",
      },
      { kind: "mechanism", name: "a", qualifier: "+", value: null },
      {
        kind: "mechanism",
        name: "mx",
        qualifier: "+",
        value: "mail.example.com/24",
      },
      {
        kind: "mechanism",
        name: "include",
        qualifier: "+",
        value: "_spf.example.net",
      },
      {
        kind: "mechanism",
        name: "exists",
        qualifier: "?",
        value: "%{i}.bl.example",
      },
      { kind: "mechanism", name: "ptr", qualifier: "+", value: null },
      { kind: "redirect", value: "_spf.example.org" },
      { kind: "modifier", name: "exp", value: "explain.example.com" },
      { kind: "all", qualifier: "~" },
    ]);
  });

  it("marks what it cannot read as unknown", () => {
    expect(parseSpf("v=spf1 inlcude:example.com include -all")?.terms).toEqual([
      { kind: "unknown", text: "inlcude:example.com" },
      { kind: "unknown", text: "include" },
      { kind: "all", qualifier: "-" },
    ]);
  });
});

describe("parseTagList", () => {
  it("trims names and values and keeps the first of a repeated tag", () => {
    const tags = parseTagList(
      " v = DMARC1 ;p= reject; p=none;;rua=mailto:a@example.com ",
    );
    expect(tags.get("v")).toBe("DMARC1");
    expect(tags.get("p")).toBe("reject");
    expect(tags.get("rua")).toBe("mailto:a@example.com");
  });
});

describe("parseDkim", () => {
  it("reads the length of an RSA key, including one split by whitespace", () => {
    const key = rsaKey(2048);
    expect(parseDkim(`v=DKIM1; k=rsa; p=${key}`)).toEqual({
      ok: true,
      keyType: "rsa",
      bits: 2048,
      readable: true,
      testing: false,
    });
    expect(
      parseDkim(`v=DKIM1; p=${key.slice(0, 100)} ${key.slice(100)}`),
    ).toMatchObject({ ok: true, bits: 2048 });
    expect(parseDkim(`p=${rsaKey(1024)}; t=y:s`)).toMatchObject({
      ok: true,
      bits: 1024,
      testing: true,
    });
  });

  it("treats an empty p as a revoked key", () => {
    expect(parseDkim("v=DKIM1; p=")).toEqual({ ok: false, reason: "revoked" });
    expect(parseDkim("v=DKIM1; k=rsa; p= ;")).toEqual({
      ok: false,
      reason: "revoked",
    });
  });

  it("tells a cut-off or broken key from a record that is not DKIM", () => {
    const key = rsaKey(2048);
    expect(parseDkim(`v=DKIM1; p=${key.slice(0, 120)}`)).toMatchObject({
      ok: true,
      readable: false,
      bits: null,
    });
    expect(parseDkim("v=DKIM1; p=not base64!")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(parseDkim("v=spf1 -all")).toEqual({ ok: false, reason: "not_dkim" });
    expect(parseDkim("v=DKIM2; p=AAAA")).toEqual({
      ok: false,
      reason: "not_dkim",
    });
  });

  it("accepts an Ed25519 key of the right size", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    expect(parseDkim(`v=DKIM1; k=ed25519; p=${key}`)).toMatchObject({
      ok: true,
      keyType: "ed25519",
      bits: 256,
    });
    expect(parseDkim("v=DKIM1; k=ed25519; p=AAAA")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("parseDmarc", () => {
  it("recognises only records that start with v=DMARC1", () => {
    expect(isDmarcRecord("v=DMARC1; p=none")).toBe(true);
    expect(isDmarcRecord("v = DMARC1;p=none")).toBe(true);
    expect(isDmarcRecord("p=none; v=DMARC1")).toBe(false);
    expect(isDmarcRecord("v=DMARC12; p=none")).toBe(false);
  });

  it("reads the policy, the subdomain policy and the report addresses", () => {
    expect(
      parseDmarc(
        "v=DMARC1; p=Quarantine; sp=reject; rua=mailto:a@example.com!10m, mailto:b@example.org, https://example.com/report",
      ),
    ).toEqual({
      ok: true,
      policy: "quarantine",
      subdomainPolicy: "reject",
      rua: ["mailto:a@example.com!10m", "mailto:b@example.org"],
      publicSuffix: false,
    });
    expect(parseDmarc("v=DMARC1; p=reject; psd=y")).toMatchObject({
      publicSuffix: true,
      rua: [],
    });
  });

  it("is not valid without a known policy", () => {
    expect(parseDmarc("v=DMARC1; rua=mailto:a@example.com")).toEqual({
      ok: false,
    });
    expect(parseDmarc("v=DMARC1; p=block")).toEqual({ ok: false });
  });
});

describe("malformed records", () => {
  it("never make a parser throw", () => {
    for (const text of malformed) {
      expect(() => parseSpf(text)).not.toThrow();
      expect(() => parseDkim(text)).not.toThrow();
      expect(() => parseDmarc(text)).not.toThrow();
      expect(() => parseTagList(text)).not.toThrow();
    }
    for (const value of [null, undefined, 5, {}, []]) {
      expect(() => parseSpf(value as unknown as string)).not.toThrow();
      expect(() => parseDkim(value as unknown as string)).not.toThrow();
      expect(() => parseDmarc(value as unknown as string)).not.toThrow();
    }
  });

  it("are shown without control characters and capped in length", () => {
    expect(cleanText("v=spf1\u0000\n-all", 100)).toBe("v=spf1  -all");
    expect(cleanText("a".repeat(5000), 1200)).toHaveLength(1200);
  });
});
