import { randomUUID } from "node:crypto";
import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { and, type Db, eq, inArray, schema } from "@workspace/db";
import { AppModule } from "../src/app/app.module";
import { DATABASE } from "../src/infra/database/database.module";
import { ListsModule } from "../src/modules/lists/lists.module";
import { ListsService } from "../src/modules/lists/lists.service";
import { TagsModule } from "../src/modules/tags/tags.module";
import { TagsService } from "../src/modules/tags/tags.service";

describe("Lists and tags (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let lists: ListsService;
  let tags: TagsService;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let contactIds: string[];
  let otherContactId: string;

  async function createWorkspace(label: string) {
    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ name: label, slug: `lists-tags-e2e-${randomUUID()}` })
      .returning();
    if (!workspace) {
      throw new Error("The test workspace was not created.");
    }
    return workspace.id;
  }

  async function createContacts(workspace: string, count: number) {
    const rows = await db
      .insert(schema.contacts)
      .values(
        Array.from({ length: count }, (_, index) => ({
          workspaceId: workspace,
          email: `contact${index}-${randomUUID()}@example.com`,
        })),
      )
      .returning({ id: schema.contacts.id });
    return rows.map((row) => row.id);
  }

  function contact(index: number) {
    const id = contactIds[index];
    if (!id) {
      throw new Error("The test contact was not created.");
    }
    return id;
  }

  function memberships(listId: string) {
    return db
      .select()
      .from(schema.listMembers)
      .where(eq(schema.listMembers.listId, listId));
  }

  async function membership(listId: string, contactId: string) {
    const [row] = await db
      .select()
      .from(schema.listMembers)
      .where(
        and(
          eq(schema.listMembers.listId, listId),
          eq(schema.listMembers.contactId, contactId),
        ),
      );
    if (!row) {
      throw new Error("The membership was not found.");
    }
    return row;
  }

  function taggings(tagId: string) {
    return db
      .select()
      .from(schema.contactTags)
      .where(eq(schema.contactTags.tagId, tagId));
  }

  async function contactCount(workspace: string) {
    const rows = await db
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(eq(schema.contacts.workspaceId, workspace));
    return rows.length;
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule, ListsModule, TagsModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { bodyParser: false },
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = app.get<Db>(DATABASE);
    lists = app.get(ListsService);
    tags = app.get(TagsService);
    workspaceId = await createWorkspace("Lists and tags e2e");
    otherWorkspaceId = await createWorkspace("Lists and tags e2e other");
    contactIds = await createContacts(workspaceId, 4);
    const [other] = await createContacts(otherWorkspaceId, 1);
    if (!other) {
      throw new Error("The other workspace contact was not created.");
    }
    otherContactId = other;
  });

  afterAll(async () => {
    await db
      .delete(schema.workspaces)
      .where(inArray(schema.workspaces.id, [workspaceId, otherWorkspaceId]));
    await app.close();
  });

  it("rejects requests without a session or API key", async () => {
    const id = randomUUID();
    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/v1/lists" }),
      app.inject({
        method: "POST",
        url: "/v1/lists",
        payload: { name: "Nope" },
      }),
      app.inject({
        method: "POST",
        url: `/v1/lists/${id}/members`,
        payload: { contactIds: [id] },
      }),
      app.inject({
        method: "PATCH",
        url: `/v1/lists/${id}/members/${id}`,
        payload: { status: "unsubscribed" },
      }),
      app.inject({ method: "GET", url: "/v1/tags" }),
      app.inject({
        method: "POST",
        url: "/v1/tags",
        payload: { name: "Nope" },
      }),
      app.inject({ method: "DELETE", url: `/v1/tags/${id}` }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([
      401, 401, 401, 401, 401, 401, 401,
    ]);
  });

  describe("lists", () => {
    let newsletterId: string;
    let customersId: string;

    it("creates a list with a trimmed name and zero counts", async () => {
      const created = await lists.create(workspaceId, {
        name: "  Newsletter  ",
        description: "  Weekly notes  ",
      });
      expect(created).toMatchObject({
        name: "Newsletter",
        description: "Weekly notes",
        subscribedCount: 0,
        unsubscribedCount: 0,
      });
      expect(Date.parse(created.createdAt)).not.toBeNaN();
      newsletterId = created.id;

      const customers = await lists.create(workspaceId, { name: "customers" });
      expect(customers.description).toBeNull();
      customersId = customers.id;

      expect(await lists.get(workspaceId, newsletterId)).toEqual(created);
    });

    it("rejects a missing, empty or long name", async () => {
      for (const name of [undefined, "", "   ", 7, "x".repeat(81)]) {
        await expect(lists.create(workspaceId, { name })).rejects.toMatchObject(
          {
            response: { statusCode: 400, code: "validation", field: "name" },
          },
        );
      }
      await expect(
        lists.create(workspaceId, { name: "x".repeat(80) }),
      ).resolves.toMatchObject({ name: "x".repeat(80) });
      await expect(
        lists.create(workspaceId, { name: "Fine", description: 5 }),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "description" },
      });
    });

    it("rejects a duplicate name ignoring case, on create and rename", async () => {
      await expect(
        lists.create(workspaceId, { name: " NEWSLETTER " }),
      ).rejects.toMatchObject({
        response: { statusCode: 409, code: "name_taken", field: "name" },
      });
      await expect(
        lists.update(workspaceId, customersId, { name: "newsletter" }),
      ).rejects.toMatchObject({
        response: { statusCode: 409, code: "name_taken", field: "name" },
      });
      await expect(
        lists.create(otherWorkspaceId, { name: "Newsletter" }),
      ).resolves.toMatchObject({ name: "Newsletter" });
    });

    it("renames and updates only the fields that were sent", async () => {
      const renamed = await lists.update(workspaceId, customersId, {
        name: "Customers",
      });
      expect(renamed).toMatchObject({ name: "Customers", description: null });

      const described = await lists.update(workspaceId, customersId, {
        description: "People who bought",
      });
      expect(described).toMatchObject({
        name: "Customers",
        description: "People who bought",
      });

      const cleared = await lists.update(workspaceId, customersId, {
        description: null,
      });
      expect(cleared.description).toBeNull();

      const sameName = await lists.update(workspaceId, newsletterId, {
        name: "newsletter",
      });
      expect(sameName.name).toBe("newsletter");
      await lists.update(workspaceId, newsletterId, { name: "Newsletter" });
    });

    it("adds members once and reports added and existing", async () => {
      const first = await lists.addListMembers(workspaceId, newsletterId, {
        contactIds: [contact(0), contact(1), contact(0)],
      });
      expect(first).toEqual({ added: 2, existing: 0 });

      const second = await lists.addListMembers(workspaceId, newsletterId, {
        contactIds: [contact(0), contact(1), contact(2)],
      });
      expect(second).toEqual({ added: 1, existing: 2 });

      const rows = await memberships(newsletterId);
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row).toMatchObject({
          workspaceId,
          status: "subscribed",
          unsubscribedAt: null,
        });
        expect(row.subscribedAt).toBeInstanceOf(Date);
      }
    });

    it("adds contacts to several lists in one call", async () => {
      const result = await lists.addMembers(
        workspaceId,
        [newsletterId, customersId],
        [contact(0), contact(3)],
      );
      expect(result).toEqual({ added: 3, existing: 1 });
      expect(await lists.addMembers(workspaceId, [], [contact(0)])).toEqual({
        added: 0,
        existing: 0,
      });
      expect(await lists.addMembers(workspaceId, [customersId], [])).toEqual({
        added: 0,
        existing: 0,
      });
    });

    it("sets the timestamps when a member's status changes", async () => {
      const before = await membership(newsletterId, contact(1));

      await lists.setMemberStatus(workspaceId, newsletterId, contact(1), {
        status: "unsubscribed",
      });
      const unsubscribed = await membership(newsletterId, contact(1));
      expect(unsubscribed.status).toBe("unsubscribed");
      expect(unsubscribed.unsubscribedAt).toBeInstanceOf(Date);
      expect(unsubscribed.subscribedAt).toEqual(before.subscribedAt);

      await lists.setMemberStatus(workspaceId, newsletterId, contact(1), {
        status: "unsubscribed",
      });
      expect(
        (await membership(newsletterId, contact(1))).unsubscribedAt,
      ).toEqual(unsubscribed.unsubscribedAt);

      await lists.setMemberStatus(workspaceId, newsletterId, contact(1), {
        status: "subscribed",
      });
      const resubscribed = await membership(newsletterId, contact(1));
      expect(resubscribed.status).toBe("subscribed");
      expect(resubscribed.unsubscribedAt).toBeNull();
      expect(resubscribed.subscribedAt?.getTime()).toBeGreaterThan(
        before.subscribedAt?.getTime() ?? Number.POSITIVE_INFINITY,
      );

      await lists.setMemberStatus(workspaceId, newsletterId, contact(1), {
        status: "unsubscribed",
      });
    });

    it("rejects a bad status and a contact that is not a member", async () => {
      await expect(
        lists.setMemberStatus(workspaceId, newsletterId, contact(1), {
          status: "paused",
        }),
      ).rejects.toMatchObject({
        response: { statusCode: 400, code: "validation", field: "status" },
      });
      await expect(
        lists.setMemberStatus(workspaceId, customersId, contact(1), {
          status: "unsubscribed",
        }),
      ).rejects.toMatchObject({
        response: { statusCode: 404, code: "not_found" },
      });
      await expect(
        lists.setMemberStatus(otherWorkspaceId, newsletterId, contact(1), {
          status: "subscribed",
        }),
      ).rejects.toMatchObject({
        response: { statusCode: 404, code: "not_found" },
      });
      expect((await membership(newsletterId, contact(1))).status).toBe(
        "unsubscribed",
      );
    });

    it("does not re-subscribe an unsubscribed member", async () => {
      const before = await membership(newsletterId, contact(1));
      const result = await lists.addListMembers(workspaceId, newsletterId, {
        contactIds: [contact(1)],
      });
      expect(result).toEqual({ added: 0, existing: 1 });
      expect(await membership(newsletterId, contact(1))).toEqual(before);

      await lists.addMembers(workspaceId, [newsletterId], [contact(1)]);
      expect((await membership(newsletterId, contact(1))).status).toBe(
        "unsubscribed",
      );
    });

    it("counts subscribed and unsubscribed members on the list endpoints", async () => {
      const all = await lists.list(workspaceId);
      expect(
        all.lists
          .filter((list) => [newsletterId, customersId].includes(list.id))
          .map((list) => [
            list.name,
            list.subscribedCount,
            list.unsubscribedCount,
          ]),
      ).toEqual([
        ["Customers", 2, 0],
        ["Newsletter", 3, 1],
      ]);
      const names = all.lists.map((list) => list.name.toLowerCase());
      expect([...names].sort()).toEqual(names);

      expect(await lists.get(workspaceId, newsletterId)).toMatchObject({
        subscribedCount: 3,
        unsubscribedCount: 1,
      });
      const theirs = await lists.list(otherWorkspaceId);
      expect(theirs.lists.map((list) => list.name)).toEqual(["Newsletter"]);
      expect(theirs.lists[0]).toMatchObject({
        subscribedCount: 0,
        unsubscribedCount: 0,
      });
    });

    it("validates the contact ids", async () => {
      for (const value of [
        undefined,
        [],
        "nope",
        ["not-an-id"],
        [contact(0), 5],
        Array.from({ length: 1001 }, () => randomUUID()),
      ]) {
        await expect(
          lists.addListMembers(workspaceId, newsletterId, {
            contactIds: value,
          }),
        ).rejects.toMatchObject({
          response: {
            statusCode: 400,
            code: "validation",
            field: "contactIds",
          },
        });
        await expect(
          lists.removeListMembers(workspaceId, newsletterId, {
            contactIds: value,
          }),
        ).rejects.toMatchObject({
          response: { code: "validation", field: "contactIds" },
        });
      }
    });

    it("accepts 1000 contacts in one call", async () => {
      const bulk = await lists.create(workspaceId, { name: "Bulk" });
      const many = await createContacts(workspaceId, 1000);
      expect(
        await lists.addListMembers(workspaceId, bulk.id, { contactIds: many }),
      ).toEqual({ added: 1000, existing: 0 });
      expect(
        await lists.addMembers(workspaceId, [bulk.id, customersId], many),
      ).toEqual({ added: 1000, existing: 1000 });
      expect(await lists.get(workspaceId, bulk.id)).toMatchObject({
        subscribedCount: 1000,
      });
      expect(
        await lists.removeMembers(workspaceId, [bulk.id, customersId], many),
      ).toEqual({ removed: 2000 });
      await db.delete(schema.contacts).where(inArray(schema.contacts.id, many));
      await lists.remove(workspaceId, bulk.id);
    });

    it("rejects ids from another workspace and writes nothing", async () => {
      const before = await memberships(customersId);

      await expect(
        lists.addListMembers(workspaceId, customersId, {
          contactIds: [contact(2), otherContactId],
        }),
      ).rejects.toMatchObject({
        response: { statusCode: 400, code: "validation", field: "contactIds" },
      });
      await expect(
        lists.addMembers(workspaceId, [customersId], [randomUUID()]),
      ).rejects.toMatchObject({
        response: { statusCode: 400, code: "validation", field: "contactIds" },
      });
      expect(await memberships(customersId)).toEqual(before);

      const [theirList] = (await lists.list(otherWorkspaceId)).lists;
      if (!theirList) {
        throw new Error("The other workspace has no list.");
      }
      await expect(
        lists.addMembers(
          workspaceId,
          [customersId, theirList.id],
          [contact(2)],
        ),
      ).rejects.toMatchObject({
        response: { statusCode: 400, code: "validation", field: "listIds" },
      });
      await expect(
        lists.addListMembers(workspaceId, theirList.id, {
          contactIds: [contact(2)],
        }),
      ).rejects.toMatchObject({
        response: { statusCode: 404, code: "not_found" },
      });
      await expect(
        lists.addMembers(workspaceId, ["not-an-id"], [contact(2)]),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "listIds" },
      });
      expect(await memberships(customersId)).toEqual(before);
      expect(await memberships(theirList.id)).toHaveLength(0);

      expect(
        await lists.removeMembers(
          otherWorkspaceId,
          [customersId],
          [contact(0)],
        ),
      ).toEqual({ removed: 0 });
      await expect(
        lists.get(otherWorkspaceId, customersId),
      ).rejects.toMatchObject({ response: { code: "not_found" } });
      await expect(
        lists.update(otherWorkspaceId, customersId, { name: "Taken over" }),
      ).rejects.toMatchObject({ response: { code: "not_found" } });
      await expect(
        lists.remove(otherWorkspaceId, customersId),
      ).rejects.toMatchObject({ response: { code: "not_found" } });
      expect(await memberships(customersId)).toEqual(before);
    });

    it("asserts that lists exist in the workspace", async () => {
      await expect(lists.assertExist(workspaceId, [])).resolves.toBeUndefined();
      await expect(
        lists.assertExist(workspaceId, [
          newsletterId,
          customersId,
          newsletterId,
        ]),
      ).resolves.toBeUndefined();
      for (const ids of [
        [newsletterId, randomUUID()],
        ["not-an-id"],
        [newsletterId, customersId],
      ]) {
        const workspace = ids.includes(customersId)
          ? otherWorkspaceId
          : workspaceId;
        await expect(lists.assertExist(workspace, ids)).rejects.toMatchObject({
          response: { statusCode: 400, code: "validation", field: "listIds" },
        });
      }
    });

    it("removes members and keeps the contacts", async () => {
      const removed = await lists.removeListMembers(workspaceId, newsletterId, {
        contactIds: [contact(0), contact(1), randomUUID()],
      });
      expect(removed).toEqual({ removed: 2 });
      expect(
        await lists.removeListMembers(workspaceId, newsletterId, {
          contactIds: [contact(0)],
        }),
      ).toEqual({ removed: 0 });
      expect(await lists.get(workspaceId, newsletterId)).toMatchObject({
        subscribedCount: 2,
        unsubscribedCount: 0,
      });
      expect(await lists.get(workspaceId, customersId)).toMatchObject({
        subscribedCount: 2,
      });
      expect(await contactCount(workspaceId)).toBe(4);
    });

    it("deletes a list with its memberships and keeps the contacts", async () => {
      await lists.remove(workspaceId, customersId);
      expect(await memberships(customersId)).toHaveLength(0);
      expect(await memberships(newsletterId)).toHaveLength(2);
      expect(await contactCount(workspaceId)).toBe(4);

      await expect(
        lists.remove(workspaceId, customersId),
      ).rejects.toMatchObject({
        response: { statusCode: 404, code: "not_found" },
      });
      await expect(lists.get(workspaceId, "not-an-id")).rejects.toMatchObject({
        response: { statusCode: 404, code: "not_found" },
      });
      await expect(
        lists.create(workspaceId, { name: "customers" }),
      ).resolves.toMatchObject({ name: "customers" });
    });
  });

  describe("tags", () => {
    let vipId: string;
    let leadId: string;

    it("creates tags with trimmed names", async () => {
      const vip = await tags.create(workspaceId, { name: "  VIP " });
      expect(vip).toMatchObject({ name: "VIP", contactCount: 0 });
      expect(Date.parse(vip.createdAt)).not.toBeNaN();
      vipId = vip.id;
      leadId = (await tags.create(workspaceId, { name: "lead" })).id;
    });

    it("rejects a missing, empty or long name", async () => {
      for (const name of [undefined, "", "  ", 3, "x".repeat(51)]) {
        await expect(tags.create(workspaceId, { name })).rejects.toMatchObject({
          response: { statusCode: 400, code: "validation", field: "name" },
        });
        await expect(
          tags.rename(workspaceId, vipId, { name }),
        ).rejects.toMatchObject({
          response: { statusCode: 400, code: "validation", field: "name" },
        });
      }
    });

    it("rejects a duplicate name ignoring case, on create and rename", async () => {
      await expect(
        tags.create(workspaceId, { name: "vip" }),
      ).rejects.toMatchObject({
        response: { statusCode: 409, code: "name_taken", field: "name" },
      });
      await expect(
        tags.rename(workspaceId, leadId, { name: " Vip " }),
      ).rejects.toMatchObject({
        response: { statusCode: 409, code: "name_taken", field: "name" },
      });
      await expect(
        tags.create(otherWorkspaceId, { name: "VIP" }),
      ).resolves.toMatchObject({ name: "VIP" });
    });

    it("renames a tag", async () => {
      expect(
        await tags.rename(workspaceId, leadId, { name: "Lead" }),
      ).toMatchObject({ id: leadId, name: "Lead", contactCount: 0 });
      expect(
        await tags.rename(workspaceId, vipId, { name: "vip" }),
      ).toMatchObject({ name: "vip" });
      await tags.rename(workspaceId, vipId, { name: "VIP" });
      await expect(
        tags.rename(workspaceId, randomUUID(), { name: "Ghost" }),
      ).rejects.toMatchObject({
        response: { statusCode: 404, code: "not_found" },
      });
      await expect(
        tags.rename(otherWorkspaceId, leadId, { name: "Taken over" }),
      ).rejects.toMatchObject({ response: { code: "not_found" } });
    });

    it("attaches idempotently and counts contacts", async () => {
      expect(
        await tags.attach(
          workspaceId,
          [vipId, leadId],
          [contact(0), contact(1), contact(0)],
        ),
      ).toEqual({ added: 4 });
      expect(
        await tags.attach(
          workspaceId,
          [vipId],
          [contact(0), contact(1), contact(2)],
        ),
      ).toEqual({ added: 1 });
      expect(await tags.attach(workspaceId, [vipId], [contact(0)])).toEqual({
        added: 0,
      });
      expect(await tags.attach(workspaceId, [], [contact(0)])).toEqual({
        added: 0,
      });

      const all = await tags.list(workspaceId);
      expect(all.tags.map((tag) => [tag.name, tag.contactCount])).toEqual([
        ["Lead", 2],
        ["VIP", 3],
      ]);
      const theirs = await tags.list(otherWorkspaceId);
      expect(theirs.tags.map((tag) => [tag.name, tag.contactCount])).toEqual([
        ["VIP", 0],
      ]);
    });

    it("rejects ids from another workspace and writes nothing", async () => {
      const before = await taggings(leadId);

      await expect(
        tags.attach(workspaceId, [leadId], [contact(2), otherContactId]),
      ).rejects.toMatchObject({
        response: { statusCode: 400, code: "validation", field: "contactIds" },
      });
      const [theirTag] = (await tags.list(otherWorkspaceId)).tags;
      if (!theirTag) {
        throw new Error("The other workspace has no tag.");
      }
      await expect(
        tags.attach(workspaceId, [leadId, theirTag.id], [contact(2)]),
      ).rejects.toMatchObject({
        response: { statusCode: 400, code: "validation", field: "tagIds" },
      });
      await expect(
        tags.attach(workspaceId, ["not-an-id"], [contact(2)]),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "tagIds" },
      });
      await expect(
        tags.attach(workspaceId, [leadId], ["not-an-id"]),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "contactIds" },
      });
      expect(await taggings(leadId)).toEqual(before);
      expect(await taggings(theirTag.id)).toHaveLength(0);

      expect(
        await tags.detach(otherWorkspaceId, [leadId], [contact(0)]),
      ).toEqual({ removed: 0 });
      await expect(tags.remove(otherWorkspaceId, leadId)).rejects.toMatchObject(
        { response: { code: "not_found" } },
      );
      expect(await taggings(leadId)).toEqual(before);
    });

    it("asserts that tags exist in the workspace", async () => {
      await expect(tags.assertExist(workspaceId, [])).resolves.toBeUndefined();
      await expect(
        tags.assertExist(workspaceId, [vipId, leadId, vipId]),
      ).resolves.toBeUndefined();
      await expect(
        tags.assertExist(workspaceId, [vipId, randomUUID()]),
      ).rejects.toMatchObject({
        response: { statusCode: 400, code: "validation", field: "tagIds" },
      });
      await expect(
        tags.assertExist(workspaceId, ["not-an-id"]),
      ).rejects.toMatchObject({
        response: { statusCode: 400, code: "validation", field: "tagIds" },
      });
      await expect(
        tags.assertExist(otherWorkspaceId, [vipId]),
      ).rejects.toMatchObject({
        response: { statusCode: 400, code: "validation", field: "tagIds" },
      });
    });

    it("detaches idempotently", async () => {
      expect(
        await tags.detach(
          workspaceId,
          [vipId, leadId],
          [contact(0), contact(3)],
        ),
      ).toEqual({ removed: 2 });
      expect(
        await tags.detach(workspaceId, [vipId, leadId], [contact(0)]),
      ).toEqual({ removed: 0 });
      expect(await tags.detach(workspaceId, [vipId], [])).toEqual({
        removed: 0,
      });
      const all = await tags.list(workspaceId);
      expect(all.tags.map((tag) => [tag.name, tag.contactCount])).toEqual([
        ["Lead", 1],
        ["VIP", 2],
      ]);
    });

    it("deletes a tag with its attachments and keeps the contacts", async () => {
      await tags.remove(workspaceId, vipId);
      expect(await taggings(vipId)).toHaveLength(0);
      expect(await taggings(leadId)).toHaveLength(1);
      expect(await contactCount(workspaceId)).toBe(4);
      expect(
        (await tags.list(workspaceId)).tags.map((tag) => tag.name),
      ).toEqual(["Lead"]);
      await expect(tags.remove(workspaceId, vipId)).rejects.toMatchObject({
        response: { statusCode: 404, code: "not_found" },
      });
      await expect(tags.remove(workspaceId, "not-an-id")).rejects.toMatchObject(
        { response: { statusCode: 404, code: "not_found" } },
      );
    });
  });
});
