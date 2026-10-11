import { randomUUID } from "node:crypto";
import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { type Db, eq, inArray, schema } from "@workspace/db";
import { AppModule } from "../src/app/app.module";
import { DATABASE } from "../src/infra/database/database.module";
import {
  type SuppressionActor,
  SuppressionService,
} from "../src/modules/suppression/suppression.service";

describe("Suppressions (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let service: SuppressionService;
  let actor: SuppressionActor;
  let other: SuppressionActor;

  async function createWorkspace(label: string) {
    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ name: label, slug: `suppression-e2e-${randomUUID()}` })
      .returning();
    if (!workspace) {
      throw new Error("The test workspace was not created.");
    }
    return workspace.id;
  }

  async function listAll(workspaceId: string, limit = 100) {
    const all = [];
    let cursor: string | undefined;
    do {
      const page = await service.list(workspaceId, { limit, cursor });
      all.push(...page.suppressions);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return all;
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { bodyParser: false },
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = app.get<Db>(DATABASE);
    service = app.get(SuppressionService);
    actor = {
      workspaceId: await createWorkspace("Suppression e2e"),
      userId: null,
      origin: "user",
    };
    other = {
      workspaceId: await createWorkspace("Suppression e2e other"),
      userId: null,
      origin: "api",
    };
  });

  afterAll(async () => {
    await db
      .delete(schema.workspaces)
      .where(
        inArray(schema.workspaces.id, [actor.workspaceId, other.workspaceId]),
      );
    await app.close();
  });

  it("rejects requests without a session or API key", async () => {
    const list = await app.inject({ method: "GET", url: "/v1/suppressions" });
    const add = await app.inject({
      method: "POST",
      url: "/v1/suppressions",
      payload: { emails: ["someone@example.com"] },
    });
    const remove = await app.inject({
      method: "DELETE",
      url: `/v1/suppressions/${randomUUID()}`,
    });
    expect(list.statusCode).toBe(401);
    expect(add.statusCode).toBe(401);
    expect(remove.statusCode).toBe(401);
  });

  it("adds addresses once, ignoring case, spaces and duplicates", async () => {
    const first = await service.add(actor, {
      emails: [
        "Ada@Example.com",
        " ada@example.com ",
        "GRACE@example.com",
        "linus@example.com",
      ],
      note: "  Asked by phone  ",
    });
    expect(first).toEqual({ added: 3, existing: 0 });

    const second = await service.add(actor, {
      emails: ["ADA@example.com", "margaret@example.com"],
    });
    expect(second).toEqual({ added: 1, existing: 1 });

    const rows = await listAll(actor.workspaceId);
    expect(rows.map((row) => row.email).sort()).toEqual([
      "ada@example.com",
      "grace@example.com",
      "linus@example.com",
      "margaret@example.com",
    ]);
    expect(rows.find((row) => row.email === "ada@example.com")).toMatchObject({
      reason: "manual",
      origin: "user",
      sourceId: null,
      note: "Asked by phone",
    });
  });

  it("rejects an invalid address and names it", async () => {
    await expect(
      service.add(actor, { emails: ["fine@example.com", "not-an-email"] }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        code: "validation",
        field: "emails",
        message: expect.stringContaining("not-an-email"),
      },
    });
    const rows = await listAll(actor.workspaceId);
    expect(rows.some((row) => row.email === "fine@example.com")).toBe(false);
  });

  it("rejects an empty list, too many addresses, and a long note", async () => {
    await expect(service.add(actor, { emails: [] })).rejects.toMatchObject({
      response: { code: "validation", field: "emails" },
    });
    await expect(
      service.add(actor, {
        emails: Array.from({ length: 1001 }, (_, i) => `n${i}@example.com`),
      }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "emails" },
    });
    await expect(
      service.add(actor, {
        emails: ["fine@example.com"],
        note: "x".repeat(501),
      }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "note" },
    });
  });

  it("does not let bounces and complaints be added by hand", async () => {
    for (const reason of ["bounced", "complained", "other"]) {
      await expect(
        service.add(actor, { emails: ["fine@example.com"], reason }),
      ).rejects.toMatchObject({
        response: { statusCode: 400, code: "validation", field: "reason" },
      });
    }
  });

  it("records provider outcomes idempotently", async () => {
    const input = {
      workspaceId: actor.workspaceId,
      email: " Bounce@Example.com ",
      reason: "bounced",
      origin: "webhook",
      sourceId: randomUUID(),
      messageId: randomUUID(),
      note: "No such user",
    } as const;
    expect(await service.record(input)).toEqual({ created: true });
    expect(await service.record(input)).toEqual({ created: false });

    const stored = await db
      .select()
      .from(schema.suppressions)
      .where(eq(schema.suppressions.workspaceId, actor.workspaceId));
    const bounces = stored.filter((row) => row.email === "bounce@example.com");
    expect(bounces).toHaveLength(1);
    expect(bounces[0]).toMatchObject({
      reason: "bounced",
      origin: "webhook",
      sourceId: input.sourceId,
      messageId: input.messageId,
      createdByUserId: null,
    });
  });

  it("blocks by message kind", async () => {
    await service.record({
      workspaceId: actor.workspaceId,
      email: "complaint@example.com",
      reason: "complained",
      origin: "webhook",
    });
    await service.add(actor, {
      emails: ["unsub@example.com"],
      reason: "unsubscribed",
    });
    const emails = [
      "Ada@example.com",
      "bounce@example.com",
      "complaint@example.com",
      "unsub@example.com",
      "free@example.com",
    ];

    for (const kind of ["transactional", "test"] as const) {
      const blocked = await service.findBlocked(
        actor.workspaceId,
        emails,
        kind,
      );
      expect(Object.fromEntries(blocked)).toEqual({
        "ada@example.com": "manual",
        "bounce@example.com": "bounced",
        "complaint@example.com": "complained",
      });
    }
    for (const kind of ["campaign", "sequence"] as const) {
      const blocked = await service.findBlocked(
        actor.workspaceId,
        emails,
        kind,
      );
      expect(Object.fromEntries(blocked)).toEqual({
        "ada@example.com": "manual",
        "bounce@example.com": "bounced",
        "complaint@example.com": "complained",
        "unsub@example.com": "unsubscribed",
      });
    }
    expect(
      (await service.findBlocked(actor.workspaceId, [], "campaign")).size,
    ).toBe(0);
  });

  it("returns the most severe reason when an address has several", async () => {
    const record = (email: string, reason: "bounced" | "complained") =>
      service.record({
        workspaceId: actor.workspaceId,
        email,
        reason,
        origin: "webhook",
      });
    await service.add(actor, {
      emails: ["unsub@example.com", "grace@example.com"],
    });
    await service.add(actor, {
      emails: ["grace@example.com"],
      reason: "unsubscribed",
    });
    await record("grace@example.com", "bounced");
    await record("bounce@example.com", "complained");

    const campaign = await service.findBlocked(
      actor.workspaceId,
      ["unsub@example.com", "grace@example.com", "bounce@example.com"],
      "campaign",
    );
    expect(Object.fromEntries(campaign)).toEqual({
      "unsub@example.com": "manual",
      "grace@example.com": "bounced",
      "bounce@example.com": "complained",
    });

    const transactional = await service.findBlocked(
      actor.workspaceId,
      ["unsub@example.com"],
      "transactional",
    );
    expect(transactional.get("unsub@example.com")).toBe("manual");
  });

  it("filters the list by reason", async () => {
    const unsubscribed = await service.list(actor.workspaceId, {
      reason: "unsubscribed",
    });
    expect(unsubscribed.suppressions.map((row) => row.email).sort()).toEqual([
      "grace@example.com",
      "unsub@example.com",
    ]);
    expect(
      unsubscribed.suppressions.every((row) => row.reason === "unsubscribed"),
    ).toBe(true);

    const complained = await service.list(actor.workspaceId, {
      reason: "complained",
    });
    expect(complained.suppressions.map((row) => row.email).sort()).toEqual([
      "bounce@example.com",
      "complaint@example.com",
    ]);

    await expect(
      service.list(actor.workspaceId, { reason: "spam" }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "reason" },
    });
  });

  it("searches by email prefix and treats wildcards literally", async () => {
    await service.add(actor, {
      emails: [
        "a_b@wild.test",
        "axb@wild.test",
        "50%off@wild.test",
        "50xoff@wild.test",
        "back\\slash@wild.test",
      ],
    });
    const search = async (text: string, reason?: string) =>
      (
        await service.list(actor.workspaceId, { search: text, reason })
      ).suppressions
        .map((row) => row.email)
        .sort();

    expect(await search("GRA")).toEqual([
      "grace@example.com",
      "grace@example.com",
      "grace@example.com",
    ]);
    expect(await search("gra", "bounced")).toEqual(["grace@example.com"]);
    expect(await search("example.com")).toEqual([]);
    expect(await search("a_b")).toEqual(["a_b@wild.test"]);
    expect(await search("a_")).toEqual(["a_b@wild.test"]);
    expect(await search("50%")).toEqual(["50%off@wild.test"]);
    expect(await search("%")).toEqual([]);
    expect(await search("_")).toEqual([]);
    expect(await search("back\\")).toEqual(["back\\slash@wild.test"]);
    expect(await search("\\")).toEqual([]);
  });

  it("pages newest first without repeating or skipping a row", async () => {
    for (let index = 0; index < 5; index += 1) {
      await service.record({
        workspaceId: actor.workspaceId,
        email: `page${index}@example.com`,
        reason: "manual",
        origin: "import",
      });
    }
    const stored = await db
      .select({ id: schema.suppressions.id })
      .from(schema.suppressions)
      .where(eq(schema.suppressions.workspaceId, actor.workspaceId));

    const first = await service.list(actor.workspaceId, { limit: 3 });
    expect(first.suppressions).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();

    for (const limit of [1, 3, 4]) {
      const rows = await listAll(actor.workspaceId, limit);
      const ids = rows.map((row) => row.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect([...ids].sort()).toEqual(stored.map((row) => row.id).sort());
      const times = rows.map((row) => Date.parse(row.createdAt));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
    }

    await expect(
      service.list(actor.workspaceId, { cursor: "not-a-cursor" }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "cursor" },
    });
  });

  it("never shows or changes another workspace's rows", async () => {
    expect(
      await service.add(other, {
        emails: ["ada@example.com", "only@other.test"],
      }),
    ).toEqual({ added: 2, existing: 0 });

    const mine = await listAll(actor.workspaceId);
    expect(mine.some((row) => row.email === "only@other.test")).toBe(false);
    expect(mine.filter((row) => row.email === "ada@example.com")).toHaveLength(
      1,
    );

    const theirs = await listAll(other.workspaceId);
    expect(theirs.map((row) => row.email).sort()).toEqual([
      "ada@example.com",
      "only@other.test",
    ]);
    expect(theirs.every((row) => row.origin === "api")).toBe(true);

    const blocked = await service.findBlocked(
      actor.workspaceId,
      ["only@other.test"],
      "campaign",
    );
    expect(blocked.size).toBe(0);

    const theirRow = theirs[0];
    if (!theirRow) {
      throw new Error("The other workspace has no rows.");
    }
    await expect(
      service.remove(actor.workspaceId, theirRow.id),
    ).rejects.toMatchObject({
      response: { statusCode: 404, code: "not_found" },
    });
    expect(await listAll(other.workspaceId)).toHaveLength(2);
  });

  it("removes a suppression once", async () => {
    const rows = await listAll(actor.workspaceId);
    const row = rows.find((entry) => entry.email === "linus@example.com");
    if (!row) {
      throw new Error("The suppression to remove was not listed.");
    }
    await service.remove(actor.workspaceId, row.id);

    const after = await listAll(actor.workspaceId);
    expect(after.some((entry) => entry.id === row.id)).toBe(false);
    const blocked = await service.findBlocked(
      actor.workspaceId,
      ["linus@example.com"],
      "campaign",
    );
    expect(blocked.size).toBe(0);

    await expect(
      service.remove(actor.workspaceId, row.id),
    ).rejects.toMatchObject({
      response: { statusCode: 404, code: "not_found" },
    });
    await expect(
      service.remove(actor.workspaceId, "not-an-id"),
    ).rejects.toMatchObject({ response: { code: "not_found" } });
  });
});
