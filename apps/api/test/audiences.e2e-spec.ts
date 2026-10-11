import { randomUUID } from "node:crypto";
import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { type Db, eq, schema } from "@workspace/db";
import { AppModule } from "../src/app/app.module";
import { DATABASE } from "../src/infra/database/database.module";
import {
  type Audience,
  AudienceService,
} from "../src/modules/segments/audience.service";
import { SegmentsModule } from "../src/modules/segments/segments.module";
import { SegmentsService } from "../src/modules/segments/segments.service";
import {
  createApiKey,
  createWorkspaceSessions,
  type TestWorkspace,
} from "./support/workspace-session";

type Membership = "subscribed" | "unsubscribed";

type Person = {
  email: string;
  company: string;
  news?: Membership;
  customers?: Membership;
  suppressed?: "bounced" | "complained" | "manual" | "unsubscribed";
};

const people: Person[] = [
  { email: "ada@acme.test", company: "Acme", news: "subscribed" },
  {
    email: "grace@acme.test",
    company: "Acme",
    news: "subscribed",
    customers: "subscribed",
  },
  {
    email: "linus@acme.test",
    company: "Acme",
    news: "unsubscribed",
    customers: "subscribed",
  },
  { email: "margaret@acme.test", company: "Acme", news: "unsubscribed" },
  {
    email: "bounced@acme.test",
    company: "Acme",
    news: "subscribed",
    customers: "subscribed",
    suppressed: "bounced",
  },
  {
    email: "complained@acme.test",
    company: "Acme",
    customers: "subscribed",
    suppressed: "complained",
  },
  {
    email: "blocked@globex.test",
    company: "Globex",
    news: "subscribed",
    suppressed: "manual",
  },
  {
    email: "optedout@globex.test",
    company: "Globex",
    suppressed: "unsubscribed",
  },
  { email: "alan@globex.test", company: "Globex", customers: "subscribed" },
  { email: "shared@globex.test", company: "Globex", news: "subscribed" },
  ...Array.from({ length: 9 }, (_, index) => ({
    email: `bulk${index}@initech.test`,
    company: "Initech",
    news: index % 2 === 0 ? ("subscribed" as const) : undefined,
    customers: index % 3 === 0 ? ("subscribed" as const) : undefined,
  })),
];

const reachable = people.filter((person) => !person.suppressed);

function emails(pick: (person: Person) => boolean) {
  return reachable
    .filter(pick)
    .map((person) => person.email)
    .sort();
}

const inNews = (person: Person) => person.news === "subscribed";
const inCustomers = (person: Person) => person.customers === "subscribed";

describe("Audiences (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let service: AudienceService;
  let segments: SegmentsService;
  let sessions: ReturnType<typeof createWorkspaceSessions>;
  let workspace: TestWorkspace;
  let other: TestWorkspace;
  let workspaceId: string;
  let apiKey: string;
  let newsId: string;
  let customersId: string;
  let emptyListId: string;
  let otherListId: string;
  let segmentId: string;
  let otherSegmentId: string;

  async function createList(owner: string, name: string) {
    const [list] = await db
      .insert(schema.lists)
      .values({ workspaceId: owner, name })
      .returning();
    if (!list) {
      throw new Error("The test list was not created.");
    }
    return list.id;
  }

  async function everyPage(audience: Audience, limit: number) {
    const contacts: Awaited<ReturnType<AudienceService["page"]>> = [];
    let after: string | null = null;
    for (;;) {
      const page = await service.page(workspaceId, audience, after, limit);
      expect(page.length).toBeLessThanOrEqual(limit);
      contacts.push(...page);
      const last = page.at(-1);
      if (page.length < limit || !last) {
        break;
      }
      after = last.id;
    }
    const ids = contacts.map((contact) => contact.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
    return contacts;
  }

  async function emailsOf(audience: Audience, limit: number) {
    const contacts = await everyPage(audience, limit);
    return contacts.map((contact) => contact.email).sort();
  }

  function count(audience: unknown, headers: Record<string, string>) {
    return app.inject({
      method: "POST",
      url: "/v1/audiences/count",
      headers,
      payload: { audience },
    });
  }

  function countAsOwner(audience: unknown) {
    return count(audience, { cookie: workspace.owner.cookie });
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule, SegmentsModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { bodyParser: false },
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = app.get<Db>(DATABASE);
    service = app.get(AudienceService);
    segments = app.get(SegmentsService);
    sessions = createWorkspaceSessions(app, "audiences-e2e");
    workspace = await sessions.workspace();
    other = await sessions.workspace();
    workspaceId = workspace.workspaceId;
    apiKey = await createApiKey(app, workspace.owner, workspaceId);

    newsId = await createList(workspaceId, "Newsletter");
    customersId = await createList(workspaceId, "Customers");
    emptyListId = await createList(workspaceId, "Empty");
    otherListId = await createList(other.workspaceId, "Newsletter");

    const created = await db
      .insert(schema.contacts)
      .values(
        people.map((person, index) => ({
          workspaceId,
          email: person.email,
          firstName: `First ${index}`,
          company: person.company,
          fields: { plan: index % 2 === 0 ? "pro" : "free", seats: index },
        })),
      )
      .returning({ id: schema.contacts.id, email: schema.contacts.email });
    const idOf = new Map(created.map((row) => [row.email, row.id]));
    const memberships = people.flatMap((person) => {
      const contactId = idOf.get(person.email);
      if (!contactId) {
        throw new Error("A test contact was not created.");
      }
      return [
        { listId: newsId, status: person.news },
        { listId: customersId, status: person.customers },
      ].flatMap(({ listId, status }) =>
        status ? [{ listId, contactId, workspaceId, status }] : [],
      );
    });
    await db.insert(schema.listMembers).values(memberships);
    await db.insert(schema.suppressions).values([
      ...people.flatMap((person) =>
        person.suppressed
          ? [
              {
                workspaceId,
                email: person.email,
                reason: person.suppressed,
                origin: "user",
              },
            ]
          : [],
      ),
      {
        workspaceId,
        email: "bounced@acme.test",
        reason: "complained",
        origin: "user",
      },
      {
        workspaceId: other.workspaceId,
        email: "shared@globex.test",
        reason: "bounced",
        origin: "user",
      },
    ]);

    const strangers = await db
      .insert(schema.contacts)
      .values(
        ["shared@globex.test", "stranger@acme.test"].map((email) => ({
          workspaceId: other.workspaceId,
          email,
          company: "Acme",
        })),
      )
      .returning({ id: schema.contacts.id });
    await db.insert(schema.listMembers).values(
      strangers.map((stranger) => ({
        listId: otherListId,
        contactId: stranger.id,
        workspaceId: other.workspaceId,
        status: "subscribed",
      })),
    );

    const acme = {
      match: "all",
      conditions: [{ field: "company", op: "is", value: "Acme" }],
    };
    segmentId = (
      await segments.create(
        { workspaceId, userId: null },
        { name: "Acme people", rules: acme },
      )
    ).id;
    otherSegmentId = (
      await segments.create(
        { workspaceId: other.workspaceId, userId: null },
        { name: "Acme people", rules: acme },
      )
    ).id;
  });

  afterAll(async () => {
    await sessions.cleanup();
    await app.close();
  });

  it("rejects a count without a session or API key", async () => {
    const response = await count({ type: "all" }, {});
    expect(response.statusCode).toBe(401);
  });

  it("counts every contact that is not suppressed", async () => {
    const response = await countAsOwner({ type: "all" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ count: reachable.length });
    expect(reachable.length).toBe(people.length - 4);
  });

  it("accepts a workspace API key", async () => {
    const response = await count({ type: "all" }, { "x-api-key": apiKey });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ count: reachable.length });
  });

  it("counts the subscribed members of one list", async () => {
    const response = await countAsOwner({ type: "lists", listIds: [newsId] });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ count: emails(inNews).length });
    const empty = await countAsOwner({ type: "lists", listIds: [emptyListId] });
    expect(empty.json()).toEqual({ count: 0 });
  });

  it("counts a contact once across several lists", async () => {
    const expected = emails((person) => inNews(person) || inCustomers(person));
    expect(expected.length).toBeLessThan(
      emails(inNews).length + emails(inCustomers).length,
    );
    const response = await countAsOwner({
      type: "lists",
      listIds: [newsId, customersId, emptyListId, newsId.toUpperCase()],
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ count: expected.length });
  });

  it("counts the contacts matching a segment", async () => {
    const response = await countAsOwner({ type: "segment", segmentId });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      count: emails((person) => person.company === "Acme").length,
    });
  });

  it("rejects malformed audiences", async () => {
    const invalid: [unknown, string][] = [
      [undefined, "audience"],
      ["all", "audience"],
      [{}, "audience.type"],
      [{ type: "everyone" }, "audience.type"],
      [{ type: "lists" }, "audience.listIds"],
      [{ type: "lists", listIds: [] }, "audience.listIds"],
      [{ type: "lists", listIds: ["nope"] }, "audience.listIds"],
      [{ type: "segment" }, "audience.segmentId"],
      [{ type: "segment", segmentId: "nope" }, "audience.segmentId"],
    ];
    for (const [audience, field] of invalid) {
      const response = await countAsOwner(audience);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "validation", field });
    }
    const noBody = await app.inject({
      method: "POST",
      url: "/v1/audiences/count",
      headers: { cookie: workspace.owner.cookie },
    });
    expect(noBody.statusCode).toBe(400);
  });

  it("returns 404 for a list or segment that is missing or in another workspace", async () => {
    const missing = [
      { type: "lists", listIds: [randomUUID()] },
      { type: "lists", listIds: [newsId, randomUUID()] },
      { type: "lists", listIds: [newsId, otherListId] },
      { type: "segment", segmentId: randomUUID() },
      { type: "segment", segmentId: otherSegmentId },
    ];
    for (const audience of missing) {
      const response = await countAsOwner(audience);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "not_found" });
    }
  });

  it("validates through the service and returns the normalised audience", async () => {
    expect(
      await service.validate(workspaceId, {
        type: "lists",
        listIds: [newsId.toUpperCase(), customersId, newsId],
        extra: true,
      }),
    ).toEqual({ type: "lists", listIds: [newsId, customersId] });
    expect(
      await service.validate(workspaceId, { type: "segment", segmentId }),
    ).toEqual({ type: "segment", segmentId });
    expect(await service.validate(workspaceId, { type: "all" })).toEqual({
      type: "all",
    });
    await expect(
      service.validate(other.workspaceId, { type: "lists", listIds: [newsId] }),
    ).rejects.toMatchObject({ response: { statusCode: 404 } });
  });

  it("pages every contact by id with no gaps or repeats", async () => {
    const expected = emails(() => true);
    for (const limit of [1, 4, expected.length, 1000]) {
      expect(await emailsOf({ type: "all" }, limit)).toEqual(expected);
    }
    expect(await service.count(workspaceId, { type: "all" })).toBe(
      expected.length,
    );
  });

  it("returns the fields a merge needs", async () => {
    const [first] = await service.page(workspaceId, { type: "all" }, null, 1);
    expect(first).toEqual({
      id: expect.any(String),
      email: "ada@acme.test",
      firstName: "First 0",
      lastName: null,
      company: "Acme",
      jobTitle: null,
      phone: null,
      city: null,
      country: null,
      fields: { plan: "pro", seats: 0 },
    });
  });

  it("pages list members once each, leaving out unsubscribed and suppressed ones", async () => {
    const news = emails(inNews);
    expect(news).not.toContain("margaret@acme.test");
    expect(news).not.toContain("linus@acme.test");
    expect(news).not.toContain("bounced@acme.test");
    expect(news).not.toContain("blocked@globex.test");
    for (const limit of [1, 3, news.length, 1000]) {
      expect(
        await emailsOf({ type: "lists", listIds: [newsId] }, limit),
      ).toEqual(news);
    }

    const both = emails((person) => inNews(person) || inCustomers(person));
    expect(both).toContain("linus@acme.test");
    expect(both).not.toContain("complained@acme.test");
    const audience: Audience = {
      type: "lists",
      listIds: [newsId, customersId, emptyListId],
    };
    for (const limit of [1, 2, 3, 5, both.length, 1000]) {
      expect(await emailsOf(audience, limit)).toEqual(both);
    }
    expect(await service.count(workspaceId, audience)).toBe(both.length);
    expect(
      await service.page(
        workspaceId,
        { type: "lists", listIds: [emptyListId] },
        null,
        10,
      ),
    ).toEqual([]);
  });

  it("fills each page even when suppressed members sit inside it", async () => {
    const both = emails((person) => inNews(person) || inCustomers(person));
    const audience: Audience = {
      type: "lists",
      listIds: [newsId, customersId],
    };
    const pages = Math.floor(both.length / 2);
    let after: string | null = null;
    for (let index = 0; index < pages; index += 1) {
      const page = await service.page(workspaceId, audience, after, 2);
      expect(page).toHaveLength(2);
      after = page.at(-1)?.id ?? null;
    }
  });

  it("pages a segment through its rules", async () => {
    const acme = emails((person) => person.company === "Acme");
    for (const limit of [1, 2, 1000]) {
      expect(await emailsOf({ type: "segment", segmentId }, limit)).toEqual(
        acme,
      );
    }
  });

  it("never returns suppressed contacts even when a segment asks for them", async () => {
    const suppressedOnly = await segments.create(
      { workspaceId, userId: null },
      {
        name: "Suppressed",
        rules: {
          match: "all",
          conditions: [{ field: "suppressed", op: "is_true" }],
        },
      },
    );
    const audience: Audience = {
      type: "segment",
      segmentId: suppressedOnly.id,
    };
    expect(await service.count(workspaceId, audience)).toBe(0);
    expect(await service.page(workspaceId, audience, null, 100)).toEqual([]);
  });

  it("keeps workspaces apart", async () => {
    const mine = await emailsOf({ type: "all" }, 1000);
    expect(mine).toContain("shared@globex.test");
    expect(mine).not.toContain("stranger@acme.test");

    expect(await service.count(other.workspaceId, { type: "all" })).toBe(1);
    const theirs = await service.page(
      other.workspaceId,
      { type: "all" },
      null,
      1000,
    );
    expect(theirs.map((contact) => contact.email)).toEqual([
      "stranger@acme.test",
    ]);
    const theirList: Audience = { type: "lists", listIds: [otherListId] };
    expect(await service.count(other.workspaceId, theirList)).toBe(1);
    expect(await service.count(workspaceId, theirList)).toBe(0);
    expect(await service.page(workspaceId, theirList, null, 1000)).toEqual([]);
    expect(
      await service.count(other.workspaceId, {
        type: "lists",
        listIds: [newsId, customersId],
      }),
    ).toBe(0);
    await expect(
      service.count(workspaceId, {
        type: "segment",
        segmentId: otherSegmentId,
      }),
    ).rejects.toMatchObject({ response: { statusCode: 404 } });
  });

  it("rejects a bad cursor or page size", async () => {
    const all: Audience = { type: "all" };
    await expect(
      service.page(workspaceId, all, "nope", 10),
    ).rejects.toMatchObject({
      response: { statusCode: 400, field: "afterContactId" },
    });
    for (const limit of [0, -1, 1.5, 1001, Number.NaN]) {
      await expect(
        service.page(workspaceId, all, null, limit),
      ).rejects.toMatchObject({
        response: { statusCode: 400, field: "limit" },
      });
    }
    expect(await service.page(workspaceId, all, null, 1000)).toHaveLength(
      reachable.length,
    );
  });

  it("describes an audience", async () => {
    expect(await service.describe(workspaceId, { type: "all" })).toEqual({
      label: "All contacts",
      listIds: [],
    });
    expect(
      await service.describe(workspaceId, {
        type: "lists",
        listIds: [newsId, customersId],
      }),
    ).toEqual({
      label: "Customers, Newsletter",
      listIds: [customersId, newsId],
    });
    expect(
      await service.describe(workspaceId, { type: "segment", segmentId }),
    ).toEqual({ label: "Acme people", listIds: [] });
    await expect(
      service.describe(workspaceId, {
        type: "segment",
        segmentId: otherSegmentId,
      }),
    ).rejects.toMatchObject({ response: { statusCode: 404 } });
  });

  it("reports a segment whose rules no longer apply", async () => {
    const doomedListId = await createList(workspaceId, "Short lived");
    const broken = await segments.create(
      { workspaceId, userId: null },
      {
        name: "On a doomed list",
        rules: {
          match: "all",
          conditions: [{ field: "list", op: "in", listId: doomedListId }],
        },
      },
    );
    await db.delete(schema.lists).where(eq(schema.lists.id, doomedListId));
    const response = await countAsOwner({
      type: "segment",
      segmentId: broken.id,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "segment_invalid" });
  });

  it("drops a deleted list from a stored audience", async () => {
    const goneId = await createList(workspaceId, "Gone soon");
    await db.delete(schema.lists).where(eq(schema.lists.id, goneId));
    const audience: Audience = { type: "lists", listIds: [newsId, goneId] };
    expect(await service.count(workspaceId, audience)).toBe(
      emails(inNews).length,
    );
    expect(await service.describe(workspaceId, audience)).toEqual({
      label: "Newsletter",
      listIds: [newsId],
    });
  });
});
