import { randomUUID } from "node:crypto";
import { getQueueToken } from "@nestjs/bullmq";
import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { type Db, eq, schema } from "@workspace/db";
import {
  type Credentials,
  type IntegrationAdapter,
  IntegrationError,
} from "@workspace/integration-core";
import { createResendAdapter } from "@workspace/integration-resend";
import { AppModule } from "../src/app/app.module";
import { DATABASE } from "../src/infra/database/database.module";
import { BrandService } from "../src/modules/brand/brand.service";
import { SEND_QUEUE } from "../src/modules/dispatch/dispatch.constants";
import { DispatchService } from "../src/modules/dispatch/dispatch.service";
import { AdapterRegistry } from "../src/modules/integrations/adapter-registry";
import { SendingSourcesService } from "../src/modules/integrations/sending-sources.service";
import { SuppressionService } from "../src/modules/suppression/suppression.service";
import {
  createApiKey,
  createWorkspaceSessions,
  type TestMember,
  type TestWorkspace,
} from "./support/workspace-session";

type Summary = {
  id: string;
  name: string;
  subject: string;
  previewText: string;
  createdAt: string;
  updatedAt: string;
};

type Template = Summary & {
  document: Record<string, unknown> | null;
  html: string;
  text: string;
};

type Page = { items: Summary[]; nextCursor: string | null };

function fakeResend(): IntegrationAdapter {
  return {
    ...createResendAdapter(),
    async verify(credentials: Credentials) {
      if (credentials.kind !== "api_key") {
        throw new IntegrationError("invalid_credentials", "Wrong credentials.");
      }
      return { account: {}, settings: { permission: "full", domains: [] } };
    },
    async send() {
      throw new IntegrationError("unknown", "Nothing is sent in this spec.");
    },
    webhooks: undefined,
  };
}

describe("Templates (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let dispatch: DispatchService;
  let sessions: ReturnType<typeof createWorkspaceSessions>;
  let workspace: TestWorkspace;
  let other: TestWorkspace;
  let member: TestMember;
  const adapter = fakeResend();
  const queued: string[] = [];

  function call(
    who: TestMember,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    payload?: Record<string, unknown>,
  ) {
    return app.inject({
      method,
      url: `/v1/templates${path}`,
      headers: { cookie: who.cookie },
      ...(payload ? { payload } : {}),
    });
  }

  async function create(
    who: TestMember,
    payload: Record<string, unknown>,
  ): Promise<Template> {
    const response = await call(who, "POST", "", payload);
    expect([payload.name, response.statusCode]).toEqual([payload.name, 201]);
    return response.json();
  }

  async function page(who: TestMember, query = ""): Promise<Page> {
    const response = await call(who, "GET", query);
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AdapterRegistry)
      .useValue({
        find: (type: string) => (type === "resend" ? adapter : null),
        has: (type: string) => type === "resend",
      })
      .compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ bodyLimit: 4 * 1024 * 1024 }),
      { bodyParser: false },
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = app.get<Db>(DATABASE);
    dispatch = app.get(DispatchService);
    vi.spyOn(
      app.get<{ add: (...args: unknown[]) => Promise<unknown> }>(
        getQueueToken(SEND_QUEUE),
      ),
      "add",
    ).mockImplementation(async (_name, data) => {
      queued.push((data as { messageId: string }).messageId);
      return {};
    });
    sessions = createWorkspaceSessions(app, "templates-e2e");
    workspace = await sessions.workspace();
    other = await sessions.workspace();
    member = await workspace.addMember("member");
  });

  afterAll(async () => {
    await sessions.cleanup();
    await app.close();
  });

  it("rejects requests without a session or API key", async () => {
    const id = randomUUID();
    const key = { "x-api-key": `oc_${"a".repeat(64)}` };
    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/v1/templates" }),
      app.inject({
        method: "POST",
        url: "/v1/templates",
        payload: { name: "Nope" },
      }),
      app.inject({ method: "GET", url: `/v1/templates/${id}` }),
      app.inject({
        method: "PATCH",
        url: `/v1/templates/${id}`,
        payload: { name: "Nope" },
      }),
      app.inject({ method: "POST", url: `/v1/templates/${id}/duplicate` }),
      app.inject({ method: "DELETE", url: `/v1/templates/${id}` }),
      app.inject({
        method: "POST",
        url: "/v1/templates/test",
        payload: { to: "ada@example.com", subject: "Hi", html: "<p>Hi</p>" },
      }),
      app.inject({ method: "GET", url: "/v1/templates", headers: key }),
      app.inject({
        method: "POST",
        url: "/v1/templates/test",
        headers: key,
        payload: { to: "ada@example.com", subject: "Hi", html: "<p>Hi</p>" },
      }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual(
      Array.from({ length: 9 }, () => 401),
    );
  });

  it("creates, reads, updates and deletes a template", async () => {
    const created = await create(member, {
      name: "  Welcome  ",
      subject: "Hello {{ first_name | there }}",
      previewText: "A short hello",
      document: { type: "doc", content: [{ type: "paragraph" }] },
      html: "<p>Hello {{first_name}}</p>",
      text: "Hello {{first_name}}",
    });
    expect(created).toMatchObject({
      name: "Welcome",
      subject: "Hello {{ first_name | there }}",
      previewText: "A short hello",
      document: { type: "doc", content: [{ type: "paragraph" }] },
      html: "<p>Hello {{first_name}}</p>",
      text: "Hello {{first_name}}",
    });
    expect(created.createdAt).toBe(created.updatedAt);

    const [row] = await db
      .select()
      .from(schema.templates)
      .where(eq(schema.templates.id, created.id));
    expect(row).toMatchObject({
      workspaceId: workspace.workspaceId,
      createdByUserId: member.userId,
      updatedByUserId: member.userId,
    });

    const read = await call(workspace.owner, "GET", `/${created.id}`);
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual(created);

    const patched = await call(workspace.owner, "PATCH", `/${created.id}`, {
      subject: "Welcome aboard",
      document: null,
    });
    expect(patched.statusCode).toBe(200);
    const updated = patched.json() as Template;
    expect(updated).toMatchObject({
      name: "Welcome",
      subject: "Welcome aboard",
      previewText: "A short hello",
      document: null,
      html: "<p>Hello {{first_name}}</p>",
    });
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(created.updatedAt),
    );
    const [after] = await db
      .select()
      .from(schema.templates)
      .where(eq(schema.templates.id, created.id));
    expect(after?.updatedByUserId).toBe(workspace.owner.userId);

    const untouched = await call(member, "PATCH", `/${created.id}`, {});
    expect(untouched.statusCode).toBe(200);
    expect(untouched.json()).toEqual(updated);

    const minimal = await create(member, { name: "Only a name" });
    expect(minimal).toMatchObject({
      subject: "",
      previewText: "",
      document: null,
      html: "",
      text: "",
    });

    expect((await call(member, "DELETE", `/${minimal.id}`)).statusCode).toBe(
      204,
    );
    expect((await call(member, "GET", `/${minimal.id}`)).statusCode).toBe(404);
    const again = await call(member, "DELETE", `/${minimal.id}`);
    expect(again.statusCode).toBe(404);
    expect(again.json()).toMatchObject({ code: "not_found" });
    expect((await call(member, "GET", "/not-an-id")).statusCode).toBe(404);
    expect(
      (await call(member, "PATCH", "/not-an-id", { name: "x" })).statusCode,
    ).toBe(404);
  });

  it("validates the fields on create and update", async () => {
    const existing = await create(member, { name: "Validation target" });
    const cases: [Record<string, unknown>, string][] = [
      [{ name: "" }, "name"],
      [{ name: "   " }, "name"],
      [{ name: 7 }, "name"],
      [{ name: "a".repeat(121) }, "name"],
      [{ name: "ok", subject: "a".repeat(999) }, "subject"],
      [{ name: "ok", subject: "two\nlines" }, "subject"],
      [{ name: "ok", subject: null }, "subject"],
      [{ name: "ok", previewText: "a".repeat(301) }, "previewText"],
      [{ name: "ok", document: [] }, "document"],
      [{ name: "ok", document: "text" }, "document"],
      [{ name: "ok", document: { text: "a\u0000b" } }, "document"],
      [{ name: "ok", html: 5 }, "html"],
      [{ name: "ok", html: "a".repeat(1_000_001) }, "html"],
      [{ name: "ok", text: "a".repeat(500_001) }, "text"],
      [{ name: "ok", text: "a\u0000b" }, "text"],
    ];
    for (const [payload, field] of cases) {
      const created = await call(member, "POST", "", payload);
      expect([field, created.statusCode]).toEqual([field, 400]);
      expect(created.json()).toMatchObject({ code: "validation", field });
      const patched = await call(member, "PATCH", `/${existing.id}`, payload);
      expect([field, patched.statusCode]).toEqual([field, 400]);
      expect(patched.json()).toMatchObject({ code: "validation", field });
    }
    const missing = await call(member, "POST", "", { subject: "No name" });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ code: "validation", field: "name" });

    const largest = await create(member, {
      name: "a".repeat(120),
      subject: "s".repeat(998),
      previewText: "p".repeat(300),
      html: "h".repeat(1_000_000),
      text: "t".repeat(500_000),
    });
    expect(largest.html).toHaveLength(1_000_000);
    await call(member, "DELETE", `/${largest.id}`);
    await call(member, "DELETE", `/${existing.id}`);
  });

  it("keeps names unique in a workspace, ignoring case", async () => {
    const first = await create(member, { name: "Monthly update" });
    const second = await create(member, { name: "Product news" });

    const taken = await call(member, "POST", "", { name: "monthly UPDATE" });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toMatchObject({ code: "name_taken", field: "name" });

    const renamed = await call(member, "PATCH", `/${second.id}`, {
      name: " MONTHLY update ",
    });
    expect(renamed.statusCode).toBe(409);
    expect(renamed.json()).toMatchObject({ code: "name_taken" });

    const sameName = await call(member, "PATCH", `/${first.id}`, {
      name: "Monthly Update",
    });
    expect(sameName.statusCode).toBe(200);
    expect(sameName.json().name).toBe("Monthly Update");

    const elsewhere = await create(other.owner, { name: "Monthly update" });
    expect(elsewhere.name).toBe("Monthly update");
  });

  it("names duplicates copy, copy 2, copy 3", async () => {
    const source = await create(member, {
      name: "Launch",
      subject: "We are live",
      previewText: "Take a look",
      document: { type: "doc" },
      html: "<h1>Live</h1>",
      text: "Live",
    });
    const names: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const response = await call(member, "POST", `/${source.id}/duplicate`);
      expect(response.statusCode).toBe(201);
      const copy = response.json() as Template;
      expect(copy.id).not.toBe(source.id);
      expect(copy).toMatchObject({
        subject: "We are live",
        previewText: "Take a look",
        document: { type: "doc" },
        html: "<h1>Live</h1>",
        text: "Live",
      });
      names.push(copy.name);
    }
    expect(names).toEqual(["Launch copy", "Launch copy 2", "Launch copy 3"]);

    await create(member, { name: "LAUNCH COPY 4" });
    const fifth = await call(member, "POST", `/${source.id}/duplicate`);
    expect(fifth.json().name).toBe("Launch copy 5");

    const ofCopy = await call(
      workspace.owner,
      "POST",
      `/${(await page(member, "?search=Launch%20copy%202")).items[0]?.id}/duplicate`,
    );
    expect(ofCopy.json().name).toBe("Launch copy 2 copy");

    const long = await create(member, { name: "n".repeat(120) });
    const longCopy = await call(member, "POST", `/${long.id}/duplicate`);
    expect(longCopy.statusCode).toBe(201);
    expect(longCopy.json().name).toBe(`${"n".repeat(115)} copy`);
    const longCopy2 = await call(member, "POST", `/${long.id}/duplicate`);
    expect(longCopy2.json().name).toBe(`${"n".repeat(113)} copy 2`);

    const missing = await call(member, "POST", `/${randomUUID()}/duplicate`);
    expect(missing.statusCode).toBe(404);
  });

  it("lists summaries, most recently changed first, a page at a time", async () => {
    const solo = await sessions.workspace();
    const created: Template[] = [];
    for (let index = 0; index < 7; index += 1) {
      created.push(
        await create(solo.owner, {
          name: `Page ${index}`,
          subject: index % 2 === 0 ? "Even issue" : "Odd issue",
          html: "<p>Body</p>",
        }),
      );
    }
    const bumped = created[2];
    if (!bumped) {
      throw new Error("The template was not created.");
    }
    await call(solo.owner, "PATCH", `/${bumped.id}`, { previewText: "Bumped" });

    const everything = await page(solo.owner);
    expect(everything.nextCursor).toBeNull();
    const expected = [
      "Page 2",
      "Page 6",
      "Page 5",
      "Page 4",
      "Page 3",
      "Page 1",
      "Page 0",
    ];
    expect(everything.items.map((item) => item.name)).toEqual(expected);
    expect(everything.items[0]).toEqual({
      id: bumped.id,
      name: "Page 2",
      subject: "Even issue",
      previewText: "Bumped",
      createdAt: bumped.createdAt,
      updatedAt: everything.items[0]?.updatedAt,
    });

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = cursor
        ? `?limit=3&cursor=${encodeURIComponent(cursor)}`
        : "?limit=3";
      const body = await page(solo.owner, query);
      expect(body.items.length).toBeLessThanOrEqual(3);
      seen.push(...body.items.map((item) => item.name));
      cursor = body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(seen).toEqual(expected);
    expect(pages).toBe(3);

    const exact = await page(solo.owner, "?limit=7");
    expect(exact.items).toHaveLength(7);
    expect(exact.nextCursor).toBeNull();
    expect((await page(solo.owner, "?limit=0")).items).toHaveLength(7);
    expect((await page(solo.owner, "?limit=1000")).items).toHaveLength(7);

    const invalid = await call(solo.owner, "GET", "?cursor=nonsense");
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      code: "validation",
      field: "cursor",
    });
  });

  it("searches the name and the subject, ignoring case", async () => {
    const solo = await sessions.workspace();
    await create(solo.owner, { name: "Spring Sale", subject: "20% off" });
    await create(solo.owner, { name: "Receipt", subject: "Your SPRING order" });
    await create(solo.owner, { name: "Under_score", subject: "Nothing" });
    await create(solo.owner, { name: "Underxscore", subject: "Nothing" });

    const names = async (search: string) =>
      (await page(solo.owner, `?search=${encodeURIComponent(search)}`)).items
        .map((item) => item.name)
        .sort();
    expect(await names("spring")).toEqual(["Receipt", "Spring Sale"]);
    expect(await names("  SALE ")).toEqual(["Spring Sale"]);
    expect(await names("20%")).toEqual(["Spring Sale"]);
    expect(await names("%")).toEqual(["Spring Sale"]);
    expect(await names("under_")).toEqual(["Under_score"]);
    expect(await names("no match")).toEqual([]);

    const paged = await page(solo.owner, "?search=nothing&limit=1");
    expect(paged.items).toHaveLength(1);
    expect(paged.nextCursor).not.toBeNull();
    const next = await page(
      solo.owner,
      `?search=nothing&limit=1&cursor=${encodeURIComponent(paged.nextCursor ?? "")}`,
    );
    expect(next.items).toHaveLength(1);
    expect(next.items[0]?.id).not.toBe(paged.items[0]?.id);
    expect(next.nextCursor).toBeNull();
  });

  it("keeps each workspace's templates apart", async () => {
    const mine = await create(member, {
      name: "Private",
      html: "<p>Secret</p>",
    });
    const outsider = other.owner;

    expect(
      (await page(outsider)).items.some((item) => item.id === mine.id),
    ).toBe(false);
    expect((await call(outsider, "GET", `/${mine.id}`)).statusCode).toBe(404);
    expect(
      (await call(outsider, "PATCH", `/${mine.id}`, { name: "Taken over" }))
        .statusCode,
    ).toBe(404);
    expect(
      (await call(outsider, "POST", `/${mine.id}/duplicate`)).statusCode,
    ).toBe(404);
    expect((await call(outsider, "DELETE", `/${mine.id}`)).statusCode).toBe(
      404,
    );

    const still = await call(member, "GET", `/${mine.id}`);
    expect(still.statusCode).toBe(200);
    expect(still.json()).toMatchObject({
      name: "Private",
      html: "<p>Secret</p>",
    });
  });

  it("accepts a workspace API key everywhere but the test send", async () => {
    const key = await createApiKey(app, workspace.owner, workspace.workspaceId);
    const headers = { "x-api-key": key };
    const created = await app.inject({
      method: "POST",
      url: "/v1/templates",
      headers,
      payload: { name: "Made with a key", html: "<p>Key</p>" },
    });
    expect(created.statusCode).toBe(201);
    const template = created.json() as Template;
    const [row] = await db
      .select()
      .from(schema.templates)
      .where(eq(schema.templates.id, template.id));
    expect(row).toMatchObject({
      workspaceId: workspace.workspaceId,
      createdByUserId: null,
    });

    const url = `/v1/templates/${template.id}`;
    const responses = [
      await app.inject({ method: "GET", url: "/v1/templates", headers }),
      await app.inject({ method: "GET", url, headers }),
      await app.inject({
        method: "PATCH",
        url,
        headers,
        payload: { subject: "By key" },
      }),
      await app.inject({ method: "POST", url: `${url}/duplicate`, headers }),
      await app.inject({ method: "DELETE", url, headers }),
      await app.inject({
        method: "POST",
        url: "/v1/templates/test",
        headers,
        payload: { to: "ada@example.com", subject: "Hi", html: "<p>Hi</p>" },
      }),
    ];
    expect(responses.map((response) => response.statusCode)).toEqual([
      200, 200, 200, 201, 204, 401,
    ]);
  });

  describe("test send", () => {
    const body = (overrides: Record<string, unknown> = {}) => ({
      to: "reviewer@example.com",
      from: "hello@northwind.example",
      subject: "Hi {{ first_name | there }} from {{brand.name}}",
      html: '<p>Hi {{first_name}} at {{ company }}, plan {{ fields.plan | free <b> }}{{fields.seats}}.</p><p>{{brand.address}} {{ brand.website }}</p><a href="{{unsubscribe_url}}">Unsubscribe</a>',
      text: "Hi {{first_name}}. {{brand.name | us}}. {{unsubscribe_url}}",
      ...overrides,
    });
    const send = (who: TestMember, payload: Record<string, unknown>) =>
      call(who, "POST", "/test", payload);

    it("needs a sending source", async () => {
      const response = await send(member, body());
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "no_default_source" });
    });

    it("validates the request", async () => {
      const cases: [Record<string, unknown>, string][] = [
        [{ to: "not-an-address" }, "to"],
        [{ to: ["a@example.com", "b@example.com"] }, "to"],
        [{ to: undefined }, "to"],
        [{ subject: "two\nlines" }, "subject"],
        [{ html: undefined }, "html"],
        [{ html: "   " }, "html"],
        [{ text: 5 }, "text"],
        [{ sourceId: "not-an-id" }, "sourceId"],
      ];
      for (const [overrides, field] of cases) {
        const response = await send(member, body(overrides));
        expect([field, response.statusCode]).toEqual([field, 400]);
        expect(response.json()).toMatchObject({ code: "validation", field });
      }
    });

    it("hands one rendered message to dispatch", async () => {
      const source = await app
        .get(SendingSourcesService)
        .connectResend(
          { workspaceId: workspace.workspaceId, userId: null },
          { name: "Templates e2e", apiKey: "re_test_templates_key_1234" },
        );

      const noFrom = await send(member, body({ from: undefined }));
      expect(noFrom.statusCode).toBe(400);
      expect(noFrom.json()).toMatchObject({
        code: "validation",
        field: "from",
      });

      const before = queued.length;
      const response = await send(member, body());
      expect(response.statusCode).toBe(202);
      const accepted = response.json() as {
        messageId: string;
        status: string;
        suppressed: string[];
      };
      expect(accepted).toMatchObject({ status: "queued", suppressed: [] });

      const message = await dispatch.get(
        workspace.workspaceId,
        accepted.messageId,
      );
      expect(message).toMatchObject({
        status: "queued",
        kind: "transactional",
        sourceId: source.id,
        from: { email: "hello@northwind.example", name: null },
        to: ["reviewer@example.com"],
        subject: "[Test] Hi Ada from",
        tags: { purpose: "template_test" },
        content: {
          html: '<p>Hi Ada at Northwind, plan free &lt;b&gt;.</p><p> </p><a href="#">Unsubscribe</a>',
          text: "Hi Ada. us. #",
        },
      });
      expect(queued.slice(before)).toEqual([accepted.messageId]);
    });

    it("fills brand tags from the workspace brand", async () => {
      const owner = workspace.owner;
      const saved = await app.inject({
        method: "PUT",
        url: "/v1/brand",
        headers: { cookie: owner.cookie },
        payload: {
          brandName: "Northwind & Co",
          postalAddress: "1 Harbour Street",
          websiteUrl: "https://northwind.example",
        },
      });
      expect(saved.statusCode).toBe(200);
      expect(
        (await app.get(BrandService).get(workspace.workspaceId)).brandName,
      ).toBe("Northwind & Co");

      const response = await send(owner, body({ text: undefined }));
      expect(response.statusCode).toBe(202);
      const message = await dispatch.get(
        workspace.workspaceId,
        response.json().messageId,
      );
      expect(message).toMatchObject({
        status: "queued",
        from: { email: "hello@northwind.example", name: "Northwind & Co" },
        subject: "[Test] Hi Ada from Northwind & Co",
        content: {
          html: '<p>Hi Ada at Northwind, plan free &lt;b&gt;.</p><p>1 Harbour Street https://northwind.example</p><a href="#">Unsubscribe</a>',
          text: null,
        },
      });
    });

    it("sends with no subject as a bare test subject", async () => {
      const response = await send(member, body({ subject: undefined }));
      expect(response.statusCode).toBe(202);
      const message = await dispatch.get(
        workspace.workspaceId,
        response.json().messageId,
      );
      expect(message.subject).toBe("[Test]");
    });

    it("still applies the suppression list", async () => {
      await app.get(SuppressionService).record({
        workspaceId: workspace.workspaceId,
        email: "bounced@example.com",
        reason: "bounced",
        origin: "webhook",
      });
      const before = queued.length;
      const response = await send(member, body({ to: "Bounced@example.com" }));
      expect(response.statusCode).toBe(202);
      expect(response.json()).toMatchObject({
        status: "skipped",
        suppressed: ["bounced@example.com"],
      });
      const message = await dispatch.get(
        workspace.workspaceId,
        response.json().messageId,
      );
      expect(message.error?.code).toBe("suppressed");
      expect(queued).toHaveLength(before);
    });

    it("cannot send through another workspace's source", async () => {
      const [source] = await db
        .select({ id: schema.sendingSources.id })
        .from(schema.sendingSources)
        .where(eq(schema.sendingSources.workspaceId, workspace.workspaceId));
      const before = queued.length;
      const response = await send(other.owner, body({ sourceId: source?.id }));
      expect(response.statusCode).toBe(404);
      const none = await send(other.owner, body());
      expect(none.json()).toMatchObject({ code: "no_default_source" });
      expect(queued).toHaveLength(before);
    });
  });
});
