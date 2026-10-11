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
import { SegmentsModule } from "../src/modules/segments/segments.module";
import {
  type SegmentActor,
  SegmentsService,
} from "../src/modules/segments/segments.service";

type Person = {
  email: string;
  company: string;
  list?: boolean;
  tag?: boolean;
};

const people: Person[] = [
  { email: "ada@acme.test", company: "Acme", list: true, tag: true },
  { email: "grace@acme.test", company: "Acme", list: true, tag: true },
  { email: "linus@acme.test", company: "Acme", list: true },
  { email: "margaret@acme.test", company: "Acme", tag: true },
  { email: "alan@globex.test", company: "Globex", list: true, tag: true },
  ...Array.from({ length: 6 }, (_, index) => ({
    email: `bulk${index}@initech.test`,
    company: "Initech",
  })),
];

describe("Segments (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let service: SegmentsService;
  let actor: SegmentActor;
  let apiActor: SegmentActor;
  let other: SegmentActor;
  let full: SegmentActor;
  let userId: string;
  let listId: string;
  let doomedListId: string;
  let tagId: string;
  let otherListId: string;
  let segmentId: string;

  const acme = {
    match: "all",
    conditions: [{ field: "company", op: "is", value: "Acme" }],
  };

  async function createWorkspace(label: string) {
    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ name: label, slug: `segments-e2e-${randomUUID()}` })
      .returning();
    if (!workspace) {
      throw new Error("The test workspace was not created.");
    }
    return workspace.id;
  }

  async function createList(workspaceId: string, name: string) {
    const [list] = await db
      .insert(schema.lists)
      .values({ workspaceId, name })
      .returning();
    if (!list) {
      throw new Error("The test list was not created.");
    }
    return list.id;
  }

  async function emailsOf(id: string, limit?: number) {
    const emails: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.listContacts(actor.workspaceId, id, {
        cursor,
        limit,
      });
      if (limit) {
        expect(page.contacts.length).toBeLessThanOrEqual(limit);
      }
      emails.push(...page.contacts.map((contact) => contact.email));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return emails;
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
    service = app.get(SegmentsService);

    const [user] = await db
      .insert(schema.users)
      .values({
        name: "Segments e2e",
        email: `segments-e2e-${randomUUID()}@example.test`,
      })
      .returning();
    if (!user) {
      throw new Error("The test user was not created.");
    }
    userId = user.id;

    const workspaceId = await createWorkspace("Segments e2e");
    actor = { workspaceId, userId };
    apiActor = { workspaceId, userId: null };
    other = {
      workspaceId: await createWorkspace("Segments e2e other"),
      userId: null,
    };
    full = {
      workspaceId: await createWorkspace("Segments e2e full"),
      userId: null,
    };

    listId = await createList(workspaceId, "Newsletter");
    doomedListId = await createList(workspaceId, "Short lived");
    otherListId = await createList(other.workspaceId, "Newsletter");
    const [tag] = await db
      .insert(schema.tags)
      .values({ workspaceId, name: "VIP" })
      .returning();
    if (!tag) {
      throw new Error("The test tag was not created.");
    }
    tagId = tag.id;

    const start = Date.now() - people.length * 1000;
    const created = await db
      .insert(schema.contacts)
      .values(
        people.map((person, index) => ({
          workspaceId,
          email: person.email,
          company: person.company,
          createdAt: new Date(start + index * 1000),
        })),
      )
      .returning({ id: schema.contacts.id, email: schema.contacts.email });
    const idOf = new Map(created.map((row) => [row.email, row.id]));
    const idsWhere = (pick: (person: Person) => boolean | undefined) =>
      people.filter(pick).map((person) => {
        const id = idOf.get(person.email);
        if (!id) {
          throw new Error("A test contact was not created.");
        }
        return id;
      });

    await db.insert(schema.listMembers).values(
      idsWhere((person) => person.list).flatMap((contactId) =>
        [listId, doomedListId].map((list) => ({
          listId: list,
          contactId,
          workspaceId,
          status: "subscribed",
          subscribedAt: new Date(),
        })),
      ),
    );
    await db.insert(schema.contactTags).values(
      idsWhere((person) => person.tag).map((contactId) => ({
        contactId,
        tagId,
        workspaceId,
      })),
    );
    await db.insert(schema.contacts).values({
      workspaceId: other.workspaceId,
      email: "stranger@acme.test",
      company: "Acme",
    });
  });

  afterAll(async () => {
    await db
      .delete(schema.workspaces)
      .where(
        inArray(schema.workspaces.id, [
          actor.workspaceId,
          other.workspaceId,
          full.workspaceId,
        ]),
      );
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await app.close();
  });

  it("rejects requests without a session or API key", async () => {
    const id = randomUUID();
    const requests = [
      { method: "GET", url: "/v1/segments" },
      { method: "POST", url: "/v1/segments", payload: { name: "x" } },
      { method: "POST", url: "/v1/segments/preview", payload: {} },
      { method: "GET", url: `/v1/segments/${id}` },
      { method: "PATCH", url: `/v1/segments/${id}`, payload: { name: "x" } },
      { method: "DELETE", url: `/v1/segments/${id}` },
      { method: "GET", url: `/v1/segments/${id}/contacts` },
      { method: "GET", url: `/v1/segments/${id}/count` },
    ] as const;
    for (const request of requests) {
      const response = await app.inject(request);
      expect(response.statusCode).toBe(401);
    }
  });

  it("creates a segment and reads it back", async () => {
    const created = await service.create(actor, {
      name: "  Acme people  ",
      description: "  Everyone at Acme  ",
      rules: acme,
    });
    segmentId = created.id;
    expect(created).toMatchObject({
      name: "Acme people",
      description: "Everyone at Acme",
      rules: { match: "all" },
    });
    expect(created.rules.conditions).toHaveLength(1);
    expect(created.rules.conditions[0]).toMatchObject({
      field: "company",
      op: "is",
      value: "Acme",
    });
    expect(Date.parse(created.createdAt)).not.toBeNaN();

    expect(await service.get(actor.workspaceId, created.id)).toEqual(created);
    const listed = await service.list(actor.workspaceId);
    expect(listed.segments).toEqual([created]);
  });

  it("records who created a segment for sessions only", async () => {
    const viaKey = await service.create(apiActor, {
      name: "From a key",
      rules: acme,
    });
    const rows = await db
      .select()
      .from(schema.segments)
      .where(inArray(schema.segments.id, [segmentId, viaKey.id]));
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(segmentId)?.createdByUserId).toBe(userId);
    expect(byId.get(viaKey.id)?.createdByUserId).toBeNull();
    expect(byId.get(viaKey.id)?.description).toBeNull();
  });

  it("lists segments by name, ignoring case", async () => {
    await service.create(actor, { name: "zebra", rules: acme });
    await service.create(actor, { name: "Beta", rules: acme });
    const listed = await service.list(actor.workspaceId);
    expect(listed.segments.map((segment) => segment.name)).toEqual([
      "Acme people",
      "Beta",
      "From a key",
      "zebra",
    ]);
  });

  it("rejects a duplicate name, ignoring case", async () => {
    await expect(
      service.create(actor, { name: " ACME PEOPLE ", rules: acme }),
    ).rejects.toMatchObject({
      response: { statusCode: 409, code: "name_taken", field: "name" },
    });
    const listed = await service.list(actor.workspaceId);
    const beta = listed.segments.find((segment) => segment.name === "Beta");
    if (!beta) {
      throw new Error("The Beta segment was not listed.");
    }
    await expect(
      service.update(actor.workspaceId, beta.id, { name: "acme people" }),
    ).rejects.toMatchObject({
      response: { statusCode: 409, code: "name_taken", field: "name" },
    });
    expect(
      await service.update(actor.workspaceId, beta.id, { name: "BETA" }),
    ).toMatchObject({ name: "BETA" });
  });

  it("rejects bad names and descriptions", async () => {
    for (const name of [undefined, "", "   ", 7, "x".repeat(81)]) {
      await expect(
        service.create(actor, { name, rules: acme }),
      ).rejects.toMatchObject({
        response: { statusCode: 400, code: "validation", field: "name" },
      });
    }
    for (const description of [7, "x".repeat(501)]) {
      await expect(
        service.create(actor, { name: "Described", description, rules: acme }),
      ).rejects.toMatchObject({
        response: { statusCode: 400, code: "validation", field: "description" },
      });
    }
    expect(
      await service.create(actor, { name: "x".repeat(80), rules: acme }),
    ).toMatchObject({ name: "x".repeat(80) });
  });

  it("rejects invalid rules with the rules field", async () => {
    const invalid = [
      undefined,
      "everyone",
      { match: "some", conditions: [] },
      { match: "all", conditions: [{ field: "company", op: "sounds_like" }] },
      { match: "all", conditions: [{ field: "shoe_size", op: "is" }] },
      {
        match: "all",
        conditions: [{ field: "list", op: "in", listId: otherListId }],
      },
      {
        match: "all",
        conditions: [{ field: "tag", op: "has", tagId: randomUUID() }],
      },
    ];
    for (const rules of invalid) {
      await expect(
        service.create(actor, { name: "Never saved", rules }),
      ).rejects.toMatchObject({
        response: { statusCode: 400, code: "validation", field: "rules" },
      });
      await expect(
        service.preview(actor.workspaceId, { rules }),
      ).rejects.toMatchObject({
        response: { statusCode: 400, code: "validation", field: "rules" },
      });
    }
    await expect(
      service.update(actor.workspaceId, segmentId, { rules: invalid[3] }),
    ).rejects.toMatchObject({
      response: { statusCode: 400, code: "validation", field: "rules" },
    });
    const listed = await service.list(actor.workspaceId);
    expect(
      listed.segments.some((segment) => segment.name === "Never saved"),
    ).toBe(false);
  });

  it("renames a segment and changes its description and rules", async () => {
    const before = await service.get(actor.workspaceId, segmentId);
    const renamed = await service.update(actor.workspaceId, segmentId, {
      name: " Acme staff ",
    });
    expect(renamed).toMatchObject({
      id: segmentId,
      name: "Acme staff",
      description: "Everyone at Acme",
      rules: before.rules,
    });

    const cleared = await service.update(actor.workspaceId, segmentId, {
      description: null,
    });
    expect(cleared).toMatchObject({ name: "Acme staff", description: null });

    const changed = await service.update(actor.workspaceId, segmentId, {
      description: "Globex only",
      rules: {
        match: "any",
        conditions: [{ field: "company", op: "is", value: "Globex" }],
      },
    });
    expect(changed).toMatchObject({
      name: "Acme staff",
      description: "Globex only",
      rules: { match: "any" },
    });
    expect(changed.rules.conditions[0]).toMatchObject({ value: "Globex" });
    expect(await emailsOf(segmentId)).toEqual(["alan@globex.test"]);

    await service.update(actor.workspaceId, segmentId, { rules: acme });
    expect(await service.update(actor.workspaceId, segmentId, {})).toEqual(
      await service.get(actor.workspaceId, segmentId),
    );
  });

  it("previews a count and at most five contacts without saving", async () => {
    const before = await service.list(actor.workspaceId);
    const small = await service.preview(actor.workspaceId, { rules: acme });
    expect(small.count).toBe(4);
    expect(small.sample.map((contact) => contact.email).sort()).toEqual([
      "ada@acme.test",
      "grace@acme.test",
      "linus@acme.test",
      "margaret@acme.test",
    ]);

    const large = await service.preview(actor.workspaceId, {
      rules: {
        match: "all",
        conditions: [
          { field: "email", op: "ends_with", value: "initech.test" },
        ],
      },
    });
    expect(large.count).toBe(6);
    expect(large.sample).toHaveLength(5);
    expect(
      large.sample.every((contact) => contact.email.endsWith("@initech.test")),
    ).toBe(true);

    const none = await service.preview(actor.workspaceId, {
      rules: {
        match: "all",
        conditions: [{ field: "company", op: "is", value: "Nobody" }],
      },
    });
    expect(none).toEqual({ count: 0, sample: [] });
    expect(await service.list(actor.workspaceId)).toEqual(before);
  });

  it("matches contacts by text, list and tag conditions together", async () => {
    const mixed = await service.create(actor, {
      name: "Acme VIP subscribers",
      rules: {
        match: "all",
        conditions: [
          { field: "company", op: "is", value: "Acme" },
          { field: "list", op: "in", listId },
          { field: "tag", op: "has", tagId },
        ],
      },
    });
    const page = await service.listContacts(actor.workspaceId, mixed.id, {});
    expect(page.nextCursor).toBeNull();
    expect(page.contacts.map((contact) => contact.email)).toEqual([
      "grace@acme.test",
      "ada@acme.test",
    ]);
    expect(page.contacts[0]).toMatchObject({
      company: "Acme",
      tags: [{ id: tagId, name: "VIP" }],
    });
    expect(
      page.contacts[0]?.lists.find((list) => list.id === listId),
    ).toMatchObject({ name: "Newsletter", status: "subscribed" });
    expect(await service.countContacts(actor.workspaceId, mixed.id)).toEqual({
      count: 2,
    });

    const either = await service.create(actor, {
      name: "Globex or untagged list members",
      rules: {
        match: "any",
        conditions: [
          { field: "company", op: "is", value: "Globex" },
          {
            match: "all",
            conditions: [
              { field: "list", op: "in", listId },
              { field: "tag", op: "has_not", tagId },
            ],
          },
        ],
      },
    });
    expect((await emailsOf(either.id)).sort()).toEqual([
      "alan@globex.test",
      "linus@acme.test",
    ]);
    expect(await service.countContacts(actor.workspaceId, either.id)).toEqual({
      count: 2,
    });
  });

  it("pages through a segment's contacts without repeats or gaps", async () => {
    const everyone = await service.create(actor, {
      name: "Has a company",
      rules: {
        match: "all",
        conditions: [{ field: "company", op: "is_set" }],
      },
    });
    const newestFirst = [...people].reverse().map((person) => person.email);
    expect(await service.countContacts(actor.workspaceId, everyone.id)).toEqual(
      { count: people.length },
    );

    const first = await service.listContacts(actor.workspaceId, everyone.id, {
      limit: 4,
    });
    expect(first.contacts).toHaveLength(4);
    expect(first.nextCursor).not.toBeNull();

    for (const limit of [1, 4, 5, 11]) {
      expect(await emailsOf(everyone.id, limit)).toEqual(newestFirst);
    }
    expect(await emailsOf(segmentId, 3)).toEqual([
      "margaret@acme.test",
      "linus@acme.test",
      "grace@acme.test",
      "ada@acme.test",
    ]);
  });

  it("reports a segment whose list was deleted as invalid", async () => {
    const doomed = await service.create(actor, {
      name: "Short lived members",
      rules: {
        match: "all",
        conditions: [
          { field: "company", op: "is", value: "Acme" },
          { field: "list", op: "subscribed_to", listId: doomedListId },
        ],
      },
    });
    expect(await service.countContacts(actor.workspaceId, doomed.id)).toEqual({
      count: 3,
    });

    await db.delete(schema.lists).where(eq(schema.lists.id, doomedListId));

    const invalid = {
      response: {
        statusCode: 409,
        code: "segment_invalid",
        message: expect.stringContaining("no longer applies"),
      },
    };
    await expect(
      service.listContacts(actor.workspaceId, doomed.id, {}),
    ).rejects.toMatchObject(invalid);
    await expect(
      service.countContacts(actor.workspaceId, doomed.id),
    ).rejects.toMatchObject(invalid);

    const stored = await service.get(actor.workspaceId, doomed.id);
    expect(stored.rules.conditions).toHaveLength(2);
    const listed = await service.list(actor.workspaceId);
    expect(listed.segments.some((segment) => segment.id === doomed.id)).toBe(
      true,
    );

    await service.update(actor.workspaceId, doomed.id, { rules: acme });
    expect(await service.countContacts(actor.workspaceId, doomed.id)).toEqual({
      count: 4,
    });
  });

  it("never shows or changes another workspace's segments", async () => {
    const theirs = await service.create(other, {
      name: "Acme people",
      rules: acme,
    });
    expect(await service.countContacts(other.workspaceId, theirs.id)).toEqual({
      count: 1,
    });
    expect(await service.countContacts(actor.workspaceId, segmentId)).toEqual({
      count: 4,
    });

    const mine = await service.list(actor.workspaceId);
    expect(mine.segments.some((segment) => segment.id === theirs.id)).toBe(
      false,
    );
    expect((await service.list(other.workspaceId)).segments).toEqual([theirs]);

    const missing = { response: { statusCode: 404, code: "not_found" } };
    await expect(
      service.get(actor.workspaceId, theirs.id),
    ).rejects.toMatchObject(missing);
    await expect(
      service.update(actor.workspaceId, theirs.id, { name: "Taken over" }),
    ).rejects.toMatchObject(missing);
    await expect(
      service.remove(actor.workspaceId, theirs.id),
    ).rejects.toMatchObject(missing);
    await expect(
      service.listContacts(actor.workspaceId, theirs.id, {}),
    ).rejects.toMatchObject(missing);
    await expect(
      service.countContacts(actor.workspaceId, theirs.id),
    ).rejects.toMatchObject(missing);
    expect(await service.get(other.workspaceId, theirs.id)).toEqual(theirs);
  });

  it("deletes a segment once and leaves its contacts alone", async () => {
    await service.remove(actor.workspaceId, segmentId);
    const missing = { response: { statusCode: 404, code: "not_found" } };
    await expect(
      service.get(actor.workspaceId, segmentId),
    ).rejects.toMatchObject(missing);
    await expect(
      service.remove(actor.workspaceId, segmentId),
    ).rejects.toMatchObject(missing);
    await expect(
      service.remove(actor.workspaceId, "not-an-id"),
    ).rejects.toMatchObject(missing);
    await expect(
      service.get(actor.workspaceId, "not-an-id"),
    ).rejects.toMatchObject(missing);

    const preview = await service.preview(actor.workspaceId, { rules: acme });
    expect(preview.count).toBe(4);
  });

  it("stops at 500 segments per workspace", async () => {
    const rules = { match: "all", conditions: [] };
    await db.insert(schema.segments).values(
      Array.from({ length: 499 }, (_, index) => ({
        workspaceId: full.workspaceId,
        name: `Filler ${index}`,
        rules,
      })),
    );
    const last = await service.create(full, {
      name: "Number 500",
      rules: acme,
    });
    await expect(
      service.create(full, { name: "Number 501", rules: acme }),
    ).rejects.toMatchObject({
      response: { statusCode: 409, code: "limit_reached" },
    });
    expect((await service.list(full.workspaceId)).segments).toHaveLength(500);

    await service.remove(full.workspaceId, last.id);
    expect(
      await service.create(full, { name: "Number 500 again", rules: acme }),
    ).toMatchObject({ name: "Number 500 again" });
    expect(
      await service.create(other, { name: "Still has room", rules: acme }),
    ).toMatchObject({ name: "Still has room" });
  });
});
