import { generateKeyPairSync } from "node:crypto";
import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { type Db, eq, schema } from "@workspace/db";
import { AppModule } from "../src/app/app.module";
import { DATABASE } from "../src/infra/database/database.module";
import { REDIS, type Redis } from "../src/infra/redis/redis.module";
import type {
  DnsAnswer,
  DnsResolver,
  MxRecord,
} from "../src/modules/domains/dns-resolver";
import { DNS_RESOLVER } from "../src/modules/domains/domains.constants";
import {
  type DomainDto,
  DomainsService,
} from "../src/modules/domains/domains.service";
import {
  createApiKey,
  createWorkspaceSessions,
  type TestMember,
  type TestWorkspace,
} from "./support/workspace-session";

type Records<T> = Record<string, T[] | "error">;

const hourMs = 60 * 60 * 1000;
const minuteMs = 60 * 1000;

function rsaKey() {
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return publicKey.export({ format: "der", type: "spki" }).toString("base64");
}

describe("Domains (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let redis: Redis;
  let sessions: ReturnType<typeof createWorkspaceSessions>;
  let workspace: TestWorkspace;
  let other: TestWorkspace;
  let txt: Records<string> = {};
  let mx: Records<MxRecord> = {};
  let asked: string[] = [];
  let down = false;
  const key = rsaKey();
  const domain = "domains-e2e.example.com";

  function answer<T>(
    type: string,
    name: string,
    records: T[] | "error" | undefined,
  ): Promise<DnsAnswer<T>> {
    asked.push(`${type} ${name}`);
    if (down || records === "error") {
      return Promise.resolve({ kind: "error" });
    }
    return Promise.resolve(
      records && records.length > 0
        ? { kind: "records", records }
        : { kind: "missing" },
    );
  }

  const resolver: DnsResolver = {
    txt: (name) => answer("TXT", name, txt[name]),
    cname: (name) => answer<string>("CNAME", name, undefined),
    mx: (name) => answer("MX", name, mx[name]),
  };

  function healthyZone(name: string) {
    txt = {
      ...txt,
      [name]: ["v=spf1 ip4:192.0.2.0/24 ~all"],
      [`s1._domainkey.${name}`]: [`v=DKIM1; k=rsa; p=${key}`],
      [`_dmarc.${name}`]: [`v=DMARC1; p=reject; rua=mailto:dmarc@${name}`],
    };
    mx = { ...mx, [name]: [{ priority: 10, exchange: `mx.${name}` }] };
  }

  function call(
    who: TestMember,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    payload?: Record<string, unknown>,
  ) {
    return app.inject({
      method,
      url: `/v1/domains${path}`,
      headers: { cookie: who.cookie },
      ...(payload ? { payload } : {}),
    });
  }

  async function allowCheck(id: string) {
    await redis.del(`opencadence:domain-check:${id}`);
  }

  async function checkNow(id: string) {
    await allowCheck(id);
    const response = await call(workspace.owner, "POST", `/${id}/check`);
    expect(response.statusCode).toBe(200);
    return response.json() as DomainDto;
  }

  async function row(id: string) {
    const [found] = await db
      .select()
      .from(schema.sendingDomains)
      .where(eq(schema.sendingDomains.id, id));
    if (!found) {
      throw new Error("The domain row is missing.");
    }
    return found;
  }

  async function add(name: string, dkimSelectors?: string[]) {
    const response = await call(workspace.owner, "POST", "", {
      domain: name,
      ...(dkimSelectors ? { dkimSelectors } : {}),
    });
    expect(response.statusCode).toBe(201);
    return response.json() as DomainDto;
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DNS_RESOLVER)
      .useValue(resolver)
      .compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = app.get<Db>(DATABASE);
    redis = app.get<Redis>(REDIS);
    sessions = createWorkspaceSessions(app, "domains-e2e");
    workspace = await sessions.workspace();
    other = await sessions.workspace();
  });

  beforeEach(() => {
    down = false;
    asked = [];
  });

  afterAll(async () => {
    const rows = await db
      .select({ id: schema.sendingDomains.id })
      .from(schema.sendingDomains)
      .where(eq(schema.sendingDomains.workspaceId, workspace.workspaceId));
    for (const { id } of rows) {
      await allowCheck(id);
    }
    await sessions.cleanup();
    await app.close();
  });

  it("needs a session or an API key", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/v1/domains" });
    expect(anonymous.statusCode).toBe(401);

    const apiKey = await createApiKey(app, other.owner, other.workspaceId);
    const withKey = await app.inject({
      method: "GET",
      url: "/v1/domains",
      headers: { "x-api-key": apiKey },
    });
    expect(withKey.statusCode).toBe(200);
    expect(withKey.json()).toEqual({ domains: [] });
  });

  it("rejects anything that is not a registrable hostname", async () => {
    for (const value of [
      "",
      "example",
      "192.168.0.1",
      "*.example.com",
      "example.com.",
      "https://example.com",
      "me@example.com",
      "co.uk",
      "mail.localhost",
    ]) {
      const response = await call(workspace.owner, "POST", "", {
        domain: value,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: "validation",
        field: "domain",
      });
    }
    const selectors = await call(workspace.owner, "POST", "", {
      domain: "selectors.example.com",
      dkimSelectors: ["ok", "not ok"],
    });
    expect(selectors.statusCode).toBe(400);
    expect(selectors.json()).toMatchObject({ field: "dkimSelectors" });
    expect(asked).toEqual([]);
  });

  it("adds a domain, checks it at once and reports every record", async () => {
    healthyZone(domain);
    const created = await add(`  ${domain.toUpperCase()} `, ["S1"]);
    expect(created).toMatchObject({
      domain,
      status: "verified",
      dkimSelectors: ["s1"],
      inconclusive: [],
      suggestedSelectors: [],
      sources: [],
    });
    expect(created.checks?.spf).toMatchObject({
      status: "pass",
      host: domain,
      found: ["v=spf1 ip4:192.0.2.0/24 ~all"],
      expected: null,
      code: null,
    });
    expect(created.checks?.spf?.message).toEqual(expect.any(String));
    expect(created.checks?.dkim).toEqual([
      expect.objectContaining({
        selector: "s1",
        status: "pass",
        host: `s1._domainkey.${domain}`,
      }),
    ]);
    expect(created.checks?.dmarc).toMatchObject({
      status: "pass",
      policy: "reject",
    });
    expect(created.checks?.mx).toMatchObject({ status: "pass" });
    expect(created.lastCheckedAt).toEqual(expect.any(String));
    expect(created.statusChangedAt).toEqual(expect.any(String));
    expect(
      asked.every((line) => /^(TXT|CNAME|MX) [a-z0-9._-]+$/.test(line)),
    ).toBe(true);

    const listed = await call(workspace.owner, "GET", "");
    expect(listed.json().domains).toEqual([created]);
    const fetched = await call(workspace.owner, "GET", `/${created.id}`);
    expect(fetched.json()).toEqual(created);

    const again = await call(workspace.owner, "POST", "", { domain });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: "domain_taken" });
  });

  it("keeps domains inside their workspace", async () => {
    const { domains } = (await call(workspace.owner, "GET", "")).json() as {
      domains: DomainDto[];
    };
    const id = domains[0]?.id ?? "";
    expect((await call(other.owner, "GET", "")).json()).toEqual({
      domains: [],
    });
    expect((await call(other.owner, "GET", `/${id}`)).statusCode).toBe(404);
    expect(
      (await call(other.owner, "PATCH", `/${id}`, { dkimSelectors: [] }))
        .statusCode,
    ).toBe(404);
    expect((await call(other.owner, "POST", `/${id}/check`)).statusCode).toBe(
      404,
    );
    expect((await call(other.owner, "DELETE", `/${id}`)).statusCode).toBe(404);
    expect((await call(workspace.owner, "GET", "/not-an-id")).statusCode).toBe(
      404,
    );
    const sameName = await call(other.owner, "POST", "", { domain });
    expect(sameName.statusCode).toBe(201);
  });

  it("limits manual checks to one per domain every 30 seconds", async () => {
    const { domains } = (await call(workspace.owner, "GET", "")).json() as {
      domains: DomainDto[];
    };
    const id = domains[0]?.id ?? "";
    await allowCheck(id);
    const first = await call(workspace.owner, "POST", `/${id}/check`);
    expect(first.statusCode).toBe(200);
    asked = [];
    const second = await call(workspace.owner, "POST", `/${id}/check`);
    expect(second.statusCode).toBe(429);
    expect(second.json()).toMatchObject({ code: "rate_limited" });
    expect(second.json().message).toMatch(/try again in \d+ seconds?/);
    expect(asked).toEqual([]);
  });

  it("keeps a verified domain verified when DNS does not answer", async () => {
    const { domains } = (await call(workspace.owner, "GET", "")).json() as {
      domains: DomainDto[];
    };
    const before = domains[0];
    if (!before) {
      throw new Error("The domain is missing.");
    }
    down = true;
    const startedAt = Date.now();
    const after = await checkNow(before.id);
    expect(after.status).toBe("verified");
    expect(after.checks).toEqual(before.checks);
    expect(after.statusChangedAt).toBe(before.statusChangedAt);
    expect(after.inconclusive.sort()).toEqual(["dkim", "dmarc", "mx", "spf"]);
    const stored = await row(before.id);
    const wait = (stored.nextCheckAt?.getTime() ?? 0) - startedAt;
    expect(wait).toBeGreaterThan(5 * minuteMs);
    expect(wait).toBeLessThan(20 * minuteMs);

    down = false;
    const recovered = await checkNow(before.id);
    expect(recovered.inconclusive).toEqual([]);
    expect(recovered.status).toBe("verified");
    const healthy = await row(before.id);
    expect((healthy.nextCheckAt?.getTime() ?? 0) - Date.now()).toBeGreaterThan(
      23 * hourMs,
    );
  });

  it("turns failing when a record is really gone, and changes the status date once", async () => {
    const { domains } = (await call(workspace.owner, "GET", "")).json() as {
      domains: DomainDto[];
    };
    const before = domains[0];
    if (!before) {
      throw new Error("The domain is missing.");
    }
    const dmarcHost = `_dmarc.${domain}`;
    const dmarc = txt[dmarcHost];
    txt = { ...txt, [dmarcHost]: [] };
    const failing = await checkNow(before.id);
    expect(failing.status).toBe("failing");
    expect(failing.checks?.dmarc).toMatchObject({
      status: "missing",
      code: "dmarc_missing",
      host: dmarcHost,
    });
    expect(failing.checks?.dmarc?.expected).toMatch(
      /^v=DMARC1; p=none; rua=mailto:domains-e2e-[^@\s]+@example\.com$/,
    );
    expect(failing.statusChangedAt).not.toBe(before.statusChangedAt);
    const stored = await row(before.id);
    const wait = (stored.nextCheckAt?.getTime() ?? 0) - Date.now();
    expect(wait).toBeGreaterThan(50 * minuteMs);
    expect(wait).toBeLessThan(61 * minuteMs);

    const still = await checkNow(before.id);
    expect(still.status).toBe("failing");
    expect(still.statusChangedAt).toBe(failing.statusChangedAt);

    txt = { ...txt, [dmarcHost]: dmarc ?? [] };
    expect((await checkNow(before.id)).status).toBe("verified");
  });

  it("replaces the DKIM selectors and checks them", async () => {
    const { domains } = (await call(workspace.owner, "GET", "")).json() as {
      domains: DomainDto[];
    };
    const id = domains[0]?.id ?? "";
    await allowCheck(id);
    const patched = await call(workspace.owner, "PATCH", `/${id}`, {
      dkimSelectors: ["s1", "Missing", "s1"],
    });
    expect(patched.statusCode).toBe(200);
    const body = patched.json() as DomainDto;
    expect(body.dkimSelectors).toEqual(["s1", "missing"]);
    expect(
      body.checks?.dkim.map((item) => [item.selector, item.status]),
    ).toEqual([
      ["s1", "pass"],
      ["missing", "missing"],
    ]);
    expect(body.status).toBe("failing");

    asked = [];
    const limited = await call(workspace.owner, "PATCH", `/${id}`, {
      dkimSelectors: ["s1"],
    });
    expect(limited.statusCode).toBe(200);
    expect(asked).toEqual([]);
    expect(limited.json()).toMatchObject({
      dkimSelectors: ["s1"],
      status: "verified",
    });
    expect((limited.json() as DomainDto).checks?.dkim).toHaveLength(1);
    expect((await row(id)).nextCheckAt?.getTime()).toBeLessThanOrEqual(
      Date.now(),
    );

    const invalid = await call(workspace.owner, "PATCH", `/${id}`, {
      dkimSelectors: "s1",
    });
    expect(invalid.statusCode).toBe(400);
    const missing = await call(workspace.owner, "PATCH", `/${id}`, {});
    expect(missing.statusCode).toBe(400);
  });

  it("offers the selectors it finds when none is configured", async () => {
    const name = "probe.domains-e2e.example.com";
    healthyZone(name);
    txt = {
      ...txt,
      [`google._domainkey.${name}`]: [`v=DKIM1; p=${key}`],
    };
    const created = await add(name);
    expect(created.dkimSelectors).toEqual([]);
    expect(created.suggestedSelectors).toEqual(["google", "s1"]);
    expect(created.checks?.dkim).toEqual([]);
    expect(created.status).toBe("warning");
  });

  it("stays pending when the first check cannot reach DNS", async () => {
    down = true;
    const created = await add("pending.domains-e2e.example.com", ["s1"]);
    expect(created).toMatchObject({
      status: "pending",
      checks: { spf: null, dkim: [], dmarc: null, mx: null },
    });
    expect(created.inconclusive.sort()).toEqual(["dkim", "dmarc", "mx", "spf"]);
  });

  it("suggests the domains that sources send from and links them", async () => {
    const { workspaceId } = workspace;
    await db.insert(schema.sendingSources).values([
      {
        workspaceId,
        integrationType: "gmail",
        name: "Team mailbox",
        email: `Hello@${domain}`,
      },
      {
        workspaceId,
        integrationType: "gmail",
        name: "Personal mailbox",
        email: "someone@gmail.com",
      },
      {
        workspaceId,
        integrationType: "imap-smtp",
        name: "Sales mailbox",
        email: "sales@suggested-mailbox.example.com",
      },
      {
        workspaceId,
        integrationType: "resend",
        name: "Provider",
        settings: {
          domains: [
            { name: "Suggested-Provider.example.com", status: "verified" },
            { name: "not a domain", status: "verified" },
          ],
        },
      },
    ]);
    const response = await call(workspace.owner, "GET", "/suggestions");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      domains: [
        "suggested-mailbox.example.com",
        "suggested-provider.example.com",
      ],
    });
    expect((await call(other.owner, "GET", "/suggestions")).json()).toEqual({
      domains: [],
    });

    const { domains } = (await call(workspace.owner, "GET", "")).json() as {
      domains: DomainDto[];
    };
    const linked = domains.find((item) => item.domain === domain);
    expect(linked?.sources).toEqual([
      expect.objectContaining({
        name: "Team mailbox",
        integrationType: "gmail",
      }),
    ]);

    const checked = await checkNow(linked?.id ?? "");
    expect(checked.checks?.spf).toMatchObject({
      status: "warning",
      code: "spf_provider_not_included",
      expected: "v=spf1 ip4:192.0.2.0/24 include:_spf.google.com ~all",
    });
  });

  it("re-checks only the domains that are due", async () => {
    const service = app.get(DomainsService);
    const scope = { workspaceIds: [workspace.workspaceId] };
    const { domains } = (await call(workspace.owner, "GET", "")).json() as {
      domains: DomainDto[];
    };
    const due = domains.find((item) => item.domain === domain);
    const later = domains.find((item) => item.domain.startsWith("probe."));
    if (!due || !later) {
      throw new Error("The domains are missing.");
    }
    const now = new Date();
    await db
      .update(schema.sendingDomains)
      .set({ nextCheckAt: new Date(now.getTime() + hourMs) })
      .where(eq(schema.sendingDomains.workspaceId, workspace.workspaceId));
    await db
      .update(schema.sendingDomains)
      .set({ nextCheckAt: new Date(now.getTime() - minuteMs) })
      .where(eq(schema.sendingDomains.id, due.id));
    const laterBefore = await row(later.id);

    txt = { ...txt, [domain]: [] };
    asked = [];
    expect(await service.runDue(now, scope)).toEqual({ checked: 1, failed: 0 });
    const checked = await row(due.id);
    expect(checked.status).toBe("failing");
    expect(checked.lastCheckedAt?.getTime()).toBe(now.getTime());
    expect(checked.nextCheckAt?.getTime()).toBe(now.getTime() + hourMs);
    expect(asked.some((line) => line.includes("probe."))).toBe(false);
    expect((await row(later.id)).lastCheckedAt).toEqual(
      laterBefore.lastCheckedAt,
    );

    expect(await service.runDue(now, scope)).toEqual({ checked: 0, failed: 0 });
    expect(await service.failing(workspace.workspaceId)).toEqual([
      { id: due.id, name: domain },
    ]);
    expect(await service.failing(other.workspaceId)).toEqual([]);
  });

  it("removes a domain", async () => {
    const { domains } = (await call(workspace.owner, "GET", "")).json() as {
      domains: DomainDto[];
    };
    const target = domains.find((item) => item.domain.startsWith("pending."));
    const id = target?.id ?? "";
    expect((await call(workspace.owner, "DELETE", `/${id}`)).statusCode).toBe(
      204,
    );
    expect((await call(workspace.owner, "DELETE", `/${id}`)).statusCode).toBe(
      404,
    );
    expect((await call(workspace.owner, "GET", `/${id}`)).statusCode).toBe(404);
  });
});
