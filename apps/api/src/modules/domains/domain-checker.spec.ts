import { generateKeyPairSync } from "node:crypto";
import {
  type DnsAnswer,
  type DnsResolver,
  LookupSession,
  type MxRecord,
} from "./dns-resolver";
import {
  type CheckContext,
  type DomainCheckResult,
  reportAddress,
  rollUpStatus,
  runDomainChecks,
  withSpfInclude,
} from "./domain-checker";

type Zone = {
  txt?: Record<string, string[] | "error">;
  cname?: Record<string, string[] | "error">;
  mx?: Record<string, MxRecord[] | "error">;
};

function fakeDns(zone: Zone) {
  const asked: string[] = [];
  function answer<T>(
    type: string,
    name: string,
    records: T[] | "error" | undefined,
  ): Promise<DnsAnswer<T>> {
    asked.push(`${type} ${name}`);
    if (records === "error") {
      return Promise.resolve({ kind: "error" });
    }
    return Promise.resolve(
      records && records.length > 0
        ? { kind: "records", records }
        : { kind: "missing" },
    );
  }
  const resolver: DnsResolver = {
    txt: (name) => answer("TXT", name, zone.txt?.[name]),
    cname: (name) => answer("CNAME", name, zone.cname?.[name]),
    mx: (name) => answer("MX", name, zone.mx?.[name]),
  };
  return { resolver, asked };
}

function rsaKey(bits: number) {
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: bits });
  return publicKey.export({ format: "der", type: "spki" }).toString("base64");
}

const strongKey = rsaKey(2048);
const weakKey = rsaKey(1024);
const domain = "example.com";
const noContext: CheckContext = { integrationTypes: [], reportEmail: null };
const mail = [{ priority: 10, exchange: "mx.example.com" }];

const healthy: Zone = {
  txt: {
    [domain]: ["unrelated=1", "v=spf1 include:_spf.example.net ~all"],
    "_spf.example.net": ["v=spf1 ip4:192.0.2.0/24 -all"],
    "s1._domainkey.example.com": [`v=DKIM1; k=rsa; p=${strongKey}`],
    "_dmarc.example.com": [
      "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com",
    ],
  },
  mx: { [domain]: mail },
};

function check(
  zone: Zone,
  options: {
    selectors?: string[];
    previous?: DomainCheckResult | null;
    context?: CheckContext;
    domain?: string;
  } = {},
) {
  return runDomainChecks(fakeDns(zone).resolver, {
    domain: options.domain ?? domain,
    selectors: options.selectors ?? ["s1"],
    previous: options.previous ?? null,
    context: options.context ?? noContext,
  });
}

function withTxt(extra: Record<string, string[] | "error">): Zone {
  return { ...healthy, txt: { ...healthy.txt, ...extra } };
}

describe("a healthy domain", () => {
  it("passes every record and rolls up to verified", async () => {
    const result = await check(healthy);
    expect(result.spf).toMatchObject({
      status: "pass",
      host: domain,
      found: ["v=spf1 include:_spf.example.net ~all"],
      expected: null,
      code: null,
    });
    expect(result.dkim).toHaveLength(1);
    expect(result.dkim[0]).toMatchObject({
      selector: "s1",
      status: "pass",
      host: "s1._domainkey.example.com",
    });
    expect(result.dmarc).toMatchObject({
      status: "pass",
      policy: "quarantine",
      host: "_dmarc.example.com",
    });
    expect(result.mx).toMatchObject({
      status: "pass",
      found: ["10 mx.example.com"],
    });
    expect(result.inconclusive).toEqual([]);
    expect(rollUpStatus(result, ["s1"])).toBe("verified");
    for (const record of [
      result.spf,
      result.dmarc,
      result.mx,
      ...result.dkim,
    ]) {
      expect(record?.message).not.toBe("");
    }
  });

  it("only asks for TXT, CNAME and MX", async () => {
    const dns = fakeDns(healthy);
    await runDomainChecks(dns.resolver, {
      domain,
      selectors: ["s1"],
      previous: null,
      context: noContext,
    });
    expect(dns.asked.sort()).toEqual([
      "MX example.com",
      "TXT _dmarc.example.com",
      "TXT _spf.example.net",
      "TXT example.com",
      "TXT s1._domainkey.example.com",
    ]);
  });
});

describe("SPF", () => {
  it("is missing when no TXT record starts with v=spf1", async () => {
    const result = await check(withTxt({ [domain]: ["site-verification=1"] }));
    expect(result.spf).toMatchObject({
      status: "missing",
      code: "spf_missing",
      found: [],
      expected: null,
    });
    expect(rollUpStatus(result, ["s1"])).toBe("failing");
  });

  it("fails when there are two SPF records", async () => {
    const result = await check(
      withTxt({
        [domain]: ["v=spf1 -all", "v=spf1 include:x.example.net -all"],
      }),
    );
    expect(result.spf).toMatchObject({ status: "fail", code: "spf_multiple" });
    expect(result.spf?.found).toHaveLength(2);
  });

  it("fails on +all and warns on ?all or no all term", async () => {
    const ending = async (record: string) =>
      (await check(withTxt({ [domain]: [record] }))).spf;
    expect(await ending("v=spf1 ip4:192.0.2.1 +all")).toMatchObject({
      status: "fail",
      code: "spf_allows_all",
    });
    expect(await ending("v=spf1 ip4:192.0.2.1 all")).toMatchObject({
      status: "fail",
      code: "spf_allows_all",
    });
    expect(await ending("v=spf1 ip4:192.0.2.1 ?all")).toMatchObject({
      status: "warning",
      code: "spf_neutral_all",
    });
    expect(await ending("v=spf1 ip4:192.0.2.1")).toMatchObject({
      status: "warning",
      code: "spf_no_all",
    });
    expect(await ending("v=spf1 ip4:192.0.2.1 -all")).toMatchObject({
      status: "pass",
    });
  });

  it("takes the ending from a redirect", async () => {
    const result = await check(
      withTxt({
        [domain]: ["v=spf1 redirect=_spf.example.org"],
        "_spf.example.org": ["v=spf1 ip4:192.0.2.1 -all"],
      }),
    );
    expect(result.spf).toMatchObject({ status: "pass" });
    expect(result.spf?.message).toContain("1 of the 10");
  });

  it("fails on a typo instead of throwing", async () => {
    const result = await check(
      withTxt({ [domain]: ["v=spf1 inlcude:_spf.example.net -all"] }),
    );
    expect(result.spf).toMatchObject({ status: "fail", code: "spf_invalid" });
  });

  it("stops at an include loop", async () => {
    const dns = fakeDns(
      withTxt({
        [domain]: ["v=spf1 include:a.example.net -all"],
        "a.example.net": ["v=spf1 include:b.example.net -all"],
        "b.example.net": ["v=spf1 include:a.example.net -all"],
      }),
    );
    const result = await runDomainChecks(dns.resolver, {
      domain,
      selectors: [],
      previous: null,
      context: noContext,
    });
    expect(result.spf).toMatchObject({
      status: "fail",
      code: "spf_include_loop",
    });
    expect(
      dns.asked.filter((line) => line.endsWith(".example.net")),
    ).toHaveLength(2);
  });

  it("fails when an include has no SPF record of its own", async () => {
    const result = await check(
      withTxt({ [domain]: ["v=spf1 include:gone.example.net -all"] }),
    );
    expect(result.spf).toMatchObject({
      status: "fail",
      code: "spf_include_missing",
    });
  });

  it("counts lookups across includes and fails past ten", async () => {
    const chain: Record<string, string[]> = {
      [domain]: ["v=spf1 include:i1.example.net -all"],
    };
    for (let index = 1; index <= 30; index += 1) {
      chain[`i${index}.example.net`] = [
        `v=spf1 a mx include:i${index + 1}.example.net -all`,
      ];
    }
    const dns = fakeDns(withTxt(chain));
    const result = await runDomainChecks(dns.resolver, {
      domain,
      selectors: [],
      previous: null,
      context: noContext,
    });
    expect(result.spf).toMatchObject({
      status: "fail",
      code: "spf_too_many_lookups",
    });
    expect(
      dns.asked.filter((line) => /^TXT i\d+\.example\.net$/.test(line)).length,
    ).toBeLessThanOrEqual(10);
  });

  it("passes at exactly ten lookups", async () => {
    const result = await check(
      withTxt({
        [domain]: [
          "v=spf1 a mx a:a.example.com mx:b.example.com exists:c.example.com ptr a:d.example.com a:e.example.com a:f.example.com include:_spf.example.net -all",
        ],
      }),
    );
    expect(result.spf).toMatchObject({ status: "pass" });
    expect(result.spf?.message).toContain("10 of the 10");
  });

  it("does a bounded amount of work for a hostile record", async () => {
    const wide = Array.from(
      { length: 200 },
      (_, index) => `include:w${index}.example.net`,
    ).join(" ");
    const zone: Record<string, string[]> = {
      [domain]: [`v=spf1 ${wide} -all`],
    };
    for (let index = 0; index < 200; index += 1) {
      zone[`w${index}.example.net`] = [
        `v=spf1 include:deep${index}.example.net -all`,
      ];
      zone[`deep${index}.example.net`] = ["v=spf1 a mx -all"];
    }
    const dns = fakeDns(withTxt(zone));
    const session = new LookupSession(dns.resolver);
    const result = await runDomainChecks(session, {
      domain,
      selectors: ["s1"],
      previous: null,
      context: noContext,
    });
    expect(result.spf).toMatchObject({ code: "spf_too_many_lookups" });
    expect(dns.asked.length).toBeLessThan(30);
    expect(session.lookups).toBe(dns.asked.length);
  });

  it("never looks up an include that is not a hostname", async () => {
    const dns = fakeDns(
      withTxt({
        [domain]: [
          "v=spf1 include:127.0.0.1 include:%{d}._spf.example.net -all",
        ],
      }),
    );
    const result = await runDomainChecks(dns.resolver, {
      domain,
      selectors: [],
      previous: null,
      context: noContext,
    });
    expect(result.spf).toMatchObject({ status: "fail", code: "spf_invalid" });
    expect(dns.asked).not.toContain("TXT 127.0.0.1");
    expect(dns.asked.some((line) => line.includes("%"))).toBe(false);
  });

  it("suggests the Google include only when Google is the known sender", async () => {
    const gmail: CheckContext = {
      integrationTypes: ["gmail"],
      reportEmail: null,
    };
    const missing = await check(withTxt({ [domain]: [] }), { context: gmail });
    expect(missing.spf).toMatchObject({
      status: "missing",
      expected: "v=spf1 include:_spf.google.com ~all",
    });
    const mixed = await check(withTxt({ [domain]: [] }), {
      context: { integrationTypes: ["gmail", "imap-smtp"], reportEmail: null },
    });
    expect(mixed.spf?.expected).toBeNull();
    const lacking = await check(healthy, { context: gmail });
    expect(lacking.spf).toMatchObject({
      status: "warning",
      code: "spf_provider_not_included",
      expected: "v=spf1 include:_spf.example.net include:_spf.google.com ~all",
    });
    const included = await check(
      withTxt({
        [domain]: ["v=spf1 include:_spf.google.com ~all"],
        "_spf.google.com": ["v=spf1 ip4:192.0.2.0/24 ~all"],
      }),
      { context: gmail },
    );
    expect(included.spf).toMatchObject({ status: "pass" });
  });

  it("inserts an include before the all term or a redirect", () => {
    expect(withSpfInclude("v=spf1 -all", "x.example")).toBe(
      "v=spf1 include:x.example -all",
    );
    expect(withSpfInclude("v=spf1 a redirect=y.example", "x.example")).toBe(
      "v=spf1 a include:x.example redirect=y.example",
    );
    expect(withSpfInclude("v=spf1 a", "x.example")).toBe(
      "v=spf1 a include:x.example",
    );
  });
});

describe("DKIM", () => {
  const dkimHost = "s1._domainkey.example.com";

  it("is missing when the selector has no record", async () => {
    const result = await check(withTxt({ [dkimHost]: [] }));
    expect(result.dkim[0]).toMatchObject({
      selector: "s1",
      status: "missing",
      code: "dkim_missing",
      expected: null,
    });
    expect(rollUpStatus(result, ["s1"])).toBe("failing");
  });

  it("follows a CNAME to the TXT record", async () => {
    const result = await check({
      ...withTxt({
        [dkimHost]: [],
        "s1.keys.provider.example.net": [`v=DKIM1; p=${strongKey}`],
      }),
      cname: { [dkimHost]: ["s1.keys.provider.example.net."] },
    });
    expect(result.dkim[0]).toMatchObject({ status: "pass" });
    expect(result.dkim[0]?.found[0]).toBe("CNAME s1.keys.provider.example.net");
    expect(result.dkim[0]?.found[1]).toContain("v=DKIM1");
  });

  it("explains a CNAME that leads nowhere", async () => {
    const result = await check({
      ...withTxt({ [dkimHost]: [] }),
      cname: { [dkimHost]: ["s1.keys.provider.example.net"] },
    });
    expect(result.dkim[0]).toMatchObject({
      status: "missing",
      code: "dkim_alias_empty",
      found: ["CNAME s1.keys.provider.example.net"],
    });
  });

  it("fails a revoked key", async () => {
    const result = await check(withTxt({ [dkimHost]: ["v=DKIM1; p="] }));
    expect(result.dkim[0]).toMatchObject({
      status: "fail",
      code: "dkim_revoked",
    });
    expect(rollUpStatus(result, ["s1"])).toBe("failing");
  });

  it("fails a key that was cut off", async () => {
    const result = await check(
      withTxt({ [dkimHost]: [`v=DKIM1; p=${strongKey.slice(0, 200)}`] }),
    );
    expect(result.dkim[0]).toMatchObject({
      status: "fail",
      code: "dkim_key_invalid",
    });
  });

  it("warns on a 1024 bit key and on a testing flag", async () => {
    const weak = await check(
      withTxt({ [dkimHost]: [`v=DKIM1; k=rsa; p=${weakKey}`] }),
    );
    expect(weak.dkim[0]).toMatchObject({
      status: "warning",
      code: "dkim_key_weak",
    });
    expect(rollUpStatus(weak, ["s1"])).toBe("warning");
    const testing = await check(
      withTxt({ [dkimHost]: [`v=DKIM1; t=y; p=${strongKey}`] }),
    );
    expect(testing.dkim[0]).toMatchObject({ code: "dkim_testing" });
  });

  it("checks every selector and keeps their order", async () => {
    const result = await check(
      withTxt({ "s2._domainkey.example.com": [`p=${strongKey}`] }),
      { selectors: ["s2", "s1", "s3"] },
    );
    expect(result.dkim.map((item) => [item.selector, item.status])).toEqual([
      ["s2", "pass"],
      ["s1", "pass"],
      ["s3", "missing"],
    ]);
  });

  it("probes common selectors when none is configured", async () => {
    const result = await check(
      withTxt({
        "google._domainkey.example.com": [`v=DKIM1; p=${strongKey}`],
        "default._domainkey.example.com": ["v=DKIM1; p="],
        "k1._domainkey.example.com": ["v=spf1 -all"],
      }),
      { selectors: [] },
    );
    expect(result.dkim).toEqual([]);
    expect(result.suggestedSelectors).toEqual(["google", "s1"]);
    expect(rollUpStatus(result, [])).toBe("warning");
  });
});

describe("DMARC", () => {
  it("is missing with a safe starter record to add", async () => {
    const result = await check(withTxt({ "_dmarc.example.com": [] }), {
      context: { integrationTypes: [], reportEmail: "Ana@Example.com" },
    });
    expect(result.dmarc).toMatchObject({
      status: "missing",
      code: "dmarc_missing",
      host: "_dmarc.example.com",
      policy: null,
      expected: "v=DMARC1; p=none; rua=mailto:ana@example.com",
    });
    expect(rollUpStatus(result, ["s1"])).toBe("failing");
  });

  it("never suggests a report address on another domain", () => {
    expect(reportAddress("example.com", "ana@gmail.com")).toBe(
      "dmarc@example.com",
    );
    expect(reportAddress("example.com", "ana@com")).toBe("dmarc@example.com");
    expect(reportAddress("example.com", null)).toBe("dmarc@example.com");
    expect(reportAddress("mail.example.com", "ana@example.com")).toBe(
      "ana@example.com",
    );
    expect(reportAddress("example.com", "ana@team.example.com")).toBe(
      "ana@team.example.com",
    );
  });

  it("warns on p=none and on a missing rua", async () => {
    const none = await check(
      withTxt({
        "_dmarc.example.com": ["v=DMARC1; p=none; rua=mailto:a@example.com"],
      }),
    );
    expect(none.dmarc).toMatchObject({
      status: "warning",
      code: "dmarc_policy_none",
      policy: "none",
      expected: null,
    });
    const quiet = await check(
      withTxt({ "_dmarc.example.com": ["v=DMARC1; p=reject;"] }),
    );
    expect(quiet.dmarc).toMatchObject({
      status: "warning",
      code: "dmarc_no_rua",
      policy: "reject",
      expected: "v=DMARC1; p=reject; rua=mailto:dmarc@example.com",
    });
    expect(rollUpStatus(quiet, ["s1"])).toBe("warning");
  });

  it("fails on two records or no valid policy", async () => {
    const two = await check(
      withTxt({
        "_dmarc.example.com": ["v=DMARC1; p=none", "v=DMARC1; p=reject"],
      }),
    );
    expect(two.dmarc).toMatchObject({ status: "fail", code: "dmarc_multiple" });
    const broken = await check(
      withTxt({ "_dmarc.example.com": ["v=DMARC1; rua=mailto:a@example.com"] }),
    );
    expect(broken.dmarc).toMatchObject({
      status: "fail",
      code: "dmarc_invalid",
    });
  });

  it("falls back to the organisational domain and its subdomain policy", async () => {
    const zone: Zone = {
      txt: {
        "mail.example.com": ["v=spf1 ip4:192.0.2.1 -all"],
        "_dmarc.example.com": [
          "v=DMARC1; p=none; sp=reject; rua=mailto:a@example.com",
        ],
      },
      mx: { "mail.example.com": mail },
    };
    const result = await check(zone, {
      domain: "mail.example.com",
      selectors: [],
    });
    expect(result.dmarc).toMatchObject({
      status: "pass",
      host: "_dmarc.example.com",
      policy: "reject",
    });
    expect(result.dmarc?.message).toContain("example.com");
  });

  it("does not inherit from a public suffix", async () => {
    const dns = fakeDns({
      txt: {
        "_dmarc.co.uk": ["v=DMARC1; p=reject; rua=mailto:a@co.uk"],
        "_dmarc.example.net": ["v=DMARC1; p=reject; psd=y"],
      },
    });
    const first = await runDomainChecks(dns.resolver, {
      domain: "shop.co.uk",
      selectors: [],
      previous: null,
      context: noContext,
    });
    expect(first.dmarc).toMatchObject({ status: "missing" });
    expect(dns.asked).not.toContain("TXT _dmarc.co.uk");
    const second = await runDomainChecks(dns.resolver, {
      domain: "a.example.net",
      selectors: [],
      previous: null,
      context: noContext,
    });
    expect(second.dmarc).toMatchObject({ status: "missing" });
  });
});

describe("MX", () => {
  it("warns when the domain cannot receive mail", async () => {
    const none = await check({ ...healthy, mx: {} });
    expect(none.mx).toMatchObject({ status: "warning", code: "mx_missing" });
    expect(rollUpStatus(none, ["s1"])).toBe("warning");
    const nullMx = await check({
      ...healthy,
      mx: { [domain]: [{ priority: 0, exchange: "" }] },
    });
    expect(nullMx.mx).toMatchObject({ status: "warning", code: "mx_null" });
  });
});

describe("lookups that time out", () => {
  it("keep the previous result and name the record as inconclusive", async () => {
    const previous = await check(healthy);
    const result = await check(
      {
        txt: {
          ...healthy.txt,
          [domain]: "error",
          "s1._domainkey.example.com": "error",
          "_dmarc.example.com": "error",
        },
        mx: { [domain]: "error" },
      },
      { previous },
    );
    expect(result.spf).toEqual(previous.spf);
    expect(result.dkim).toEqual(previous.dkim);
    expect(result.dmarc).toEqual(previous.dmarc);
    expect(result.mx).toEqual(previous.mx);
    expect(result.inconclusive.sort()).toEqual(["dkim", "dmarc", "mx", "spf"]);
    expect(rollUpStatus(result, ["s1"])).toBe("verified");
  });

  it("do not turn a failing include lookup into a failing record", async () => {
    const previous = await check(healthy);
    const result = await check(withTxt({ "_spf.example.net": "error" }), {
      previous,
    });
    expect(result.spf).toEqual(previous.spf);
    expect(result.inconclusive).toEqual(["spf"]);
    expect(result.dmarc?.status).toBe("pass");
    expect(rollUpStatus(result, ["s1"])).toBe("verified");
  });

  it("leave a never-checked domain pending instead of failing", async () => {
    const result = await check({
      txt: {
        [domain]: "error",
        "s1._domainkey.example.com": "error",
        "_dmarc.example.com": "error",
      },
      mx: { [domain]: "error" },
    });
    expect(result).toMatchObject({
      spf: null,
      dkim: [],
      dmarc: null,
      mx: null,
    });
    expect(rollUpStatus(result, ["s1"])).toBe("pending");
  });

  it("still report a real failure found in the same check", async () => {
    const result = await check(
      withTxt({ [domain]: "error", "_dmarc.example.com": [] }),
    );
    expect(result.inconclusive).toEqual(["spf"]);
    expect(rollUpStatus(result, ["s1"])).toBe("failing");
  });

  it("treat a resolver that throws as inconclusive", async () => {
    const resolver: DnsResolver = {
      txt: () => Promise.reject(new Error("socket closed")),
      cname: () => Promise.reject(new Error("socket closed")),
      mx: () => Promise.reject(new Error("socket closed")),
    };
    const result = await runDomainChecks(new LookupSession(resolver), {
      domain,
      selectors: ["s1"],
      previous: null,
      context: noContext,
    });
    expect(result.inconclusive.sort()).toEqual(["dkim", "dmarc", "mx", "spf"]);
  });
});

describe("LookupSession", () => {
  it("answers repeated questions once and stops at its limit", async () => {
    const dns = fakeDns(healthy);
    const session = new LookupSession(dns.resolver, 2);
    await session.txt(domain);
    await session.txt(domain);
    await session.mx(domain);
    expect(dns.asked).toEqual(["TXT example.com", "MX example.com"]);
    expect(await session.txt("_dmarc.example.com")).toEqual({ kind: "error" });
    expect(dns.asked).toHaveLength(2);
  });

  it("stops asking after its deadline", async () => {
    const dns = fakeDns(healthy);
    let now = 0;
    const session = new LookupSession(dns.resolver, 50, 1000, () => now);
    expect((await session.txt(domain)).kind).toBe("records");
    now = 1000;
    expect(await session.mx(domain)).toEqual({ kind: "error" });
    expect(dns.asked).toEqual(["TXT example.com"]);
  });
});

describe("rollUpStatus", () => {
  it("ignores results for selectors that are no longer configured", async () => {
    const result = await check(healthy, { selectors: ["s1", "s9"] });
    expect(rollUpStatus(result, ["s1", "s9"])).toBe("failing");
    expect(rollUpStatus(result, ["s1"])).toBe("verified");
  });

  it("is pending while a configured selector has no result yet", async () => {
    const result = await check(healthy);
    expect(rollUpStatus(result, ["s1", "new"])).toBe("pending");
  });
});
