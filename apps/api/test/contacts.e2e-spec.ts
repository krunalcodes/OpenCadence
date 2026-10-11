import { randomUUID } from "node:crypto";
import {
  type ExecutionContext,
  UnauthorizedException,
  VersioningType,
} from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { and, type Db, eq, inArray, schema, sql } from "@workspace/db";
import { AppModule } from "../src/app/app.module";
import { WorkspaceAuthGuard } from "../src/common/guards/workspace-auth.guard";
import { DATABASE } from "../src/infra/database/database.module";
import { ContactsModule } from "../src/modules/contacts/contacts.module";
import { ContactsRepository } from "../src/modules/contacts/contacts.repository";
import {
  type Contact,
  type ContactInput,
  type ContactListQuery,
  ContactsService,
  type FilterCondition,
  type FilterGroup,
} from "../src/modules/contacts/contacts.service";
import { compileFilter } from "../src/modules/contacts/filters/filter.compiler";
import type { FilterFieldDefinition } from "../src/modules/contacts/filters/filter.types";
import { ListsService } from "../src/modules/lists/lists.service";
import { SuppressionService } from "../src/modules/suppression/suppression.service";
import { TagsService } from "../src/modules/tags/tags.service";

const workspaceHeader = "x-test-workspace";

type PlanNode = {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  Plans?: PlanNode[];
};

function flattenPlan(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flattenPlan)];
}

function all(...conditions: (FilterCondition | FilterGroup)[]): FilterGroup {
  return { match: "all", conditions };
}

function any(...conditions: (FilterCondition | FilterGroup)[]): FilterGroup {
  return { match: "any", conditions };
}

function custom(
  key: string,
  op: Extract<FilterCondition, { field: "custom" }>["op"],
  value?: string | number,
): FilterCondition {
  return value === undefined
    ? { field: "custom", key, op }
    : { field: "custom", key, op, value };
}

describe("Contacts (e2e)", () => {
  let app: NestFastifyApplication;
  let httpApp: NestFastifyApplication;
  let db: Db;
  let contacts: ContactsService;
  let repository: ContactsRepository;
  let lists: ListsService;
  let tags: TagsService;
  let suppression: SuppressionService;

  let main: string;
  let other: string;
  let filtering: string;
  let scale: string;
  const workspaceIds: string[] = [];

  let newsletterId: string;
  let customersId: string;
  let vipTagId: string;
  let leadTagId: string;
  let ada: Contact;

  async function createWorkspace(label: string) {
    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ name: label, slug: `contacts-e2e-${randomUUID()}` })
      .returning();
    if (!workspace) {
      throw new Error("The test workspace was not created.");
    }
    workspaceIds.push(workspace.id);
    return workspace.id;
  }

  async function createList(workspaceId: string, name: string) {
    return (await lists.create(workspaceId, { name })).id;
  }

  async function createTag(workspaceId: string, name: string) {
    return (await tags.create(workspaceId, { name })).id;
  }

  async function listAll(
    workspaceId: string,
    query: ContactListQuery = {},
    limit = 100,
  ) {
    const found: Contact[] = [];
    let cursor: string | undefined;
    do {
      const page = await contacts.list(workspaceId, {
        ...query,
        limit,
        cursor,
      });
      found.push(...page.contacts);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return found;
  }

  async function emailsOf(workspaceId: string, query: ContactListQuery) {
    const found = await listAll(workspaceId, query);
    expect(await contacts.count(workspaceId, query)).toBe(found.length);
    return found.map((contact) => contact.email).sort();
  }

  async function byEmail(workspaceId: string, email: string) {
    const [row] = await db
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.workspaceId, workspaceId),
          eq(schema.contacts.email, email),
        ),
      );
    if (!row) {
      throw new Error(`No contact has the address ${email}.`);
    }
    return contacts.get(workspaceId, row.id);
  }

  async function explain(query: { sql: string; params: unknown[] }) {
    const result = await db.$client.query(
      `explain (format json) ${query.sql}`,
      query.params,
    );
    const nodes = flattenPlan(result.rows[0]["QUERY PLAN"][0].Plan);
    return {
      sequentialOnContacts: nodes.some(
        (node) =>
          node["Node Type"] === "Seq Scan" &&
          node["Relation Name"] === "contacts",
      ),
      indexes: [
        ...new Set(
          nodes
            .map((node) => node["Index Name"])
            .filter((name): name is string => Boolean(name)),
        ),
      ],
      nodeTypes: nodes.map((node) => node["Node Type"]),
    };
  }

  function inject(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    payload?: unknown,
    workspaceId = main,
  ) {
    return httpApp.inject({
      method,
      url,
      headers: { [workspaceHeader]: workspaceId },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule, ContactsModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { bodyParser: false },
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const httpFixture = await Test.createTestingModule({
      imports: [AppModule, ContactsModule],
    })
      .overrideGuard(WorkspaceAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const request = context.switchToHttp().getRequest();
          const workspaceId = request.headers[workspaceHeader];
          if (typeof workspaceId !== "string") {
            throw new UnauthorizedException();
          }
          request.workspaceAuth = {
            method: "apiKey",
            workspaceId,
            apiKeyId: "test",
          };
          return true;
        },
      })
      .compile();
    httpApp = httpFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { bodyParser: false },
    );
    httpApp.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await httpApp.init();
    await httpApp.getHttpAdapter().getInstance().ready();

    db = app.get<Db>(DATABASE);
    contacts = app.get(ContactsService);
    repository = app.get(ContactsRepository);
    lists = app.get(ListsService);
    tags = app.get(TagsService);
    suppression = app.get(SuppressionService);

    main = await createWorkspace("Contacts e2e");
    other = await createWorkspace("Contacts e2e other");
    filtering = await createWorkspace("Contacts e2e filtering");
  }, 60_000);

  afterAll(async () => {
    if (workspaceIds.length > 0) {
      await db
        .delete(schema.workspaces)
        .where(inArray(schema.workspaces.id, workspaceIds));
    }
    await httpApp.close();
    await app.close();
  }, 120_000);

  it("rejects requests without a session or API key", async () => {
    const id = randomUUID();
    const requests: ["GET" | "POST" | "PATCH" | "DELETE", string][] = [
      ["GET", "/v1/contacts"],
      ["POST", "/v1/contacts"],
      ["POST", "/v1/contacts/search"],
      ["POST", "/v1/contacts/count"],
      ["POST", "/v1/contacts/bulk"],
      ["GET", `/v1/contacts/${id}`],
      ["PATCH", `/v1/contacts/${id}`],
      ["DELETE", `/v1/contacts/${id}`],
      ["GET", "/v1/contact-fields"],
      ["POST", "/v1/contact-fields"],
      ["PATCH", `/v1/contact-fields/${id}`],
      ["DELETE", `/v1/contact-fields/${id}`],
    ];
    for (const [method, url] of requests) {
      const response = await app.inject({
        method,
        url,
        ...(method === "POST" || method === "PATCH" ? { payload: {} } : {}),
      });
      expect([method, url, response.statusCode]).toEqual([method, url, 401]);
    }
  });

  describe("custom fields", () => {
    it("creates fields and makes the key from the label", async () => {
      const plan = await contacts.createField(main, {
        label: "  Plan ",
        type: "text",
      });
      expect(plan).toMatchObject({
        key: "plan",
        label: "Plan",
        type: "text",
        options: null,
        position: 0,
      });
      expect(Number.isNaN(Date.parse(plan.createdAt))).toBe(false);

      const seats = await contacts.createField(main, {
        label: "Seats",
        type: "number",
      });
      const renewal = await contacts.createField(main, {
        label: "Renewal date",
        type: "date",
      });
      const vip = await contacts.createField(main, {
        label: "VIP?",
        type: "boolean",
      });
      const tier = await contacts.createField(main, {
        label: "Tier",
        type: "select",
        options: [" Gold ", "Silver"],
      });
      expect([seats.key, renewal.key, vip.key, tier.key]).toEqual([
        "seats",
        "renewal_date",
        "vip",
        "tier",
      ]);
      expect(tier.options).toEqual(["Gold", "Silver"]);
      expect([seats.position, renewal.position, tier.position]).toEqual([
        1, 2, 4,
      ]);

      const builtIn = await contacts.createField(main, {
        label: "Email",
        type: "text",
      });
      const digits = await contacts.createField(main, {
        label: "2nd phone",
        type: "text",
      });
      const repeated = await contacts.createField(main, {
        label: "Plan",
        type: "text",
      });
      const accented = await contacts.createField(main, {
        label: "Région préférée",
        type: "text",
      });
      const symbols = await contacts.createField(main, {
        label: "!!!",
        type: "text",
      });
      const long = await contacts.createField(main, {
        label: "A very long label that keeps going well past forty characters",
        type: "text",
      });
      const explicit = await contacts.createField(main, {
        label: "Lifetime value",
        type: "number",
        key: "ltv",
      });
      expect(builtIn.key).toBe("email_2");
      expect(digits.key).toBe("field_2nd_phone");
      expect(repeated.key).toBe("plan_2");
      expect(accented.key).toBe("region_preferee");
      expect(symbols.key).toBe("field");
      expect(long.key).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
      expect(explicit.key).toBe("ltv");

      const listed = await contacts.listFields(main);
      expect(listed.map((field) => field.key)).toEqual([
        "plan",
        "seats",
        "renewal_date",
        "vip",
        "tier",
        "email_2",
        "field_2nd_phone",
        "plan_2",
        "region_preferee",
        "field",
        long.key,
        "ltv",
      ]);
    });

    it("rejects a taken key, a bad key, and bad options", async () => {
      await expect(
        contacts.createField(main, {
          label: "Plan",
          type: "text",
          key: "plan",
        }),
      ).rejects.toMatchObject({
        response: { statusCode: 409, code: "key_taken", field: "key" },
      });
      for (const key of ["Bad Key", "9lives", "a".repeat(41), "", 7]) {
        await expect(
          contacts.createField(main, { label: "X", type: "text", key }),
        ).rejects.toMatchObject({
          response: { statusCode: 400, code: "validation", field: "key" },
        });
      }
      for (const key of ["email", "first_name", "created_at", "tags"]) {
        await expect(
          contacts.createField(main, { label: "X", type: "text", key }),
        ).rejects.toMatchObject({
          response: { code: "validation", field: "key" },
        });
      }
      for (const options of [
        undefined,
        [],
        ["a", "A"],
        ["ok", ""],
        ["ok", 3],
        Array.from({ length: 51 }, (_, index) => `o${index}`),
        ["x".repeat(101)],
      ]) {
        await expect(
          contacts.createField(main, {
            label: "Size",
            type: "select",
            options,
          }),
        ).rejects.toMatchObject({
          response: { code: "validation", field: "options" },
        });
      }
      await expect(
        contacts.createField(main, {
          label: "Size",
          type: "text",
          options: ["a"],
        }),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "options" },
      });
      await expect(
        contacts.createField(main, { label: "Size", type: "json" }),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "type" },
      });
      for (const label of ["", "   ", "x".repeat(81), 4]) {
        await expect(
          contacts.createField(main, { label, type: "text" }),
        ).rejects.toMatchObject({
          response: { code: "validation", field: "label" },
        });
      }
    });

    it("updates the label, options and position but not the type or key", async () => {
      const fields = await contacts.listFields(main);
      const tier = fields.find((field) => field.key === "tier");
      const plan = fields.find((field) => field.key === "plan");
      const extra = fields.find((field) => field.key === "field");
      if (!tier || !plan || !extra) {
        throw new Error("The fields were not created.");
      }
      const updated = await contacts.updateField(main, tier.id, {
        label: "Customer tier",
        options: ["Gold", "Silver", "Bronze"],
        position: 9,
      });
      expect(updated).toMatchObject({
        id: tier.id,
        key: "tier",
        type: "select",
        label: "Customer tier",
        options: ["Gold", "Silver", "Bronze"],
        position: 9,
      });
      expect(await contacts.updateField(main, plan.id, {})).toMatchObject({
        label: "Plan",
      });
      await expect(
        contacts.updateField(main, plan.id, { type: "number" }),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "type" },
      });
      await expect(
        contacts.updateField(main, plan.id, { key: "plan_new" }),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "key" },
      });
      await expect(
        contacts.updateField(main, plan.id, { options: ["a"] }),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "options" },
      });
      for (const position of [-1, 1.5, "2", 10_001]) {
        await expect(
          contacts.updateField(main, plan.id, { position }),
        ).rejects.toMatchObject({
          response: { code: "validation", field: "position" },
        });
      }

      await contacts.removeField(main, extra.id);
      await expect(contacts.removeField(main, extra.id)).rejects.toMatchObject({
        response: { statusCode: 404, code: "not_found" },
      });
      await expect(
        contacts.updateField(main, "not-an-id", { label: "x" }),
      ).rejects.toMatchObject({ response: { code: "not_found" } });
      const after = await contacts.listFields(main);
      expect(after.some((field) => field.key === "field")).toBe(false);
      expect(after.at(-1)?.key).toBe("ltv");
      expect(after.find((field) => field.key === "tier")?.position).toBe(9);
    });

    it("keeps each workspace's catalog apart", async () => {
      const [plan] = await contacts.listFields(main);
      if (!plan) {
        throw new Error("The plan field is missing.");
      }
      expect(await contacts.listFields(other)).toEqual([]);
      await expect(
        contacts.updateField(other, plan.id, { label: "Hijacked" }),
      ).rejects.toMatchObject({ response: { code: "not_found" } });
      await expect(contacts.removeField(other, plan.id)).rejects.toMatchObject({
        response: { code: "not_found" },
      });
      const theirs = await contacts.createField(other, {
        label: "Plan",
        type: "number",
      });
      expect(theirs.key).toBe("plan");
      expect((await contacts.listFields(main))[0]).toMatchObject({
        id: plan.id,
        label: "Plan",
        type: "text",
      });
    });

    it("stops at 100 fields in a workspace", async () => {
      const workspaceId = await createWorkspace("Contacts e2e limit");
      await db.insert(schema.contactFields).values(
        Array.from({ length: 99 }, (_, index) => ({
          workspaceId,
          key: `field_${index}`,
          label: `Field ${index}`,
          type: "text",
          position: index,
        })),
      );
      const last = await contacts.createField(workspaceId, {
        label: "The hundredth",
        type: "text",
      });
      expect(last.position).toBe(99);
      await expect(
        contacts.createField(workspaceId, { label: "One more", type: "text" }),
      ).rejects.toMatchObject({
        response: { statusCode: 409, code: "limit_reached" },
      });
      await contacts.removeField(workspaceId, last.id);
      expect(
        await contacts.createField(workspaceId, {
          label: "One more",
          type: "text",
        }),
      ).toMatchObject({ key: "one_more" });
    });
  });

  describe("create, read, update", () => {
    it("creates a contact with lists and tags and converts custom values", async () => {
      newsletterId = await createList(main, "Newsletter");
      customersId = await createList(main, "Customers");
      vipTagId = await createTag(main, "vip");
      leadTagId = await createTag(main, "lead");

      ada = await contacts.create(main, "manual", {
        email: "  Ada@Example.COM ",
        firstName: " Ada ",
        lastName: "   ",
        company: "Analytical Engines",
        jobTitle: null,
        timezone: "europe/london",
        fields: {
          plan: " pro ",
          seats: "12",
          renewal_date: "2026-12-01",
          vip: "yes",
          tier: "gold",
          ltv: "",
        },
        listIds: [newsletterId, customersId],
        tagIds: [vipTagId],
      });
      expect(ada).toMatchObject({
        email: "ada@example.com",
        firstName: "Ada",
        lastName: null,
        company: "Analytical Engines",
        jobTitle: null,
        phone: null,
        city: null,
        country: null,
        timezone: "Europe/London",
        fields: {
          plan: "pro",
          seats: 12,
          renewal_date: "2026-12-01",
          vip: true,
          tier: "Gold",
        },
        origin: "manual",
        tags: [{ id: vipTagId, name: "vip" }],
        lists: [
          { id: customersId, name: "Customers", status: "subscribed" },
          { id: newsletterId, name: "Newsletter", status: "subscribed" },
        ],
        suppressed: null,
      });
      expect(Object.keys(ada.fields).sort()).toEqual([
        "plan",
        "renewal_date",
        "seats",
        "tier",
        "vip",
      ]);
      expect(ada.createdAt).toBe(ada.updatedAt);
      expect(await contacts.get(main, ada.id)).toEqual(ada);
    });

    it("converts each custom field type", async () => {
      const created = await contacts.create(main, "api", {
        email: "types@example.com",
        fields: {
          plan: 42,
          seats: " 3.5 ",
          vip: 0,
          ltv: "1e3",
          tier: "Bronze",
        },
      });
      expect(created.origin).toBe("api");
      expect(created.fields).toEqual({
        plan: "42",
        seats: 3.5,
        vip: false,
        ltv: 1000,
        tier: "Bronze",
      });
      const updated = await contacts.update(main, created.id, {
        fields: { vip: "TRUE", seats: -7, plan: true },
      });
      expect(updated.fields).toMatchObject({
        vip: true,
        seats: -7,
        plan: "true",
      });
    });

    it("rejects a duplicate address, ignoring case", async () => {
      await expect(
        contacts.create(main, "manual", { email: "ADA@example.com" }),
      ).rejects.toMatchObject({
        response: {
          statusCode: 409,
          code: "email_taken",
          field: "email",
          message: expect.stringContaining("ada@example.com"),
        },
      });
    });

    it("names the field that failed validation", async () => {
      const cases: [Record<string, unknown>, string][] = [
        [{}, "email"],
        [{ email: "" }, "email"],
        [{ email: "not-an-email" }, "email"],
        [{ email: 5 }, "email"],
        [{ email: "a@b.co", firstName: "x".repeat(256) }, "firstName"],
        [{ email: "a@b.co", lastName: 5 }, "lastName"],
        [{ email: "a@b.co", company: "x".repeat(256) }, "company"],
        [{ email: "a@b.co", jobTitle: "x".repeat(256) }, "jobTitle"],
        [{ email: "a@b.co", phone: "1".repeat(51) }, "phone"],
        [{ email: "a@b.co", city: "x".repeat(256) }, "city"],
        [{ email: "a@b.co", country: "x".repeat(101) }, "country"],
        [{ email: "a@b.co", timezone: "Mars/Olympus" }, "timezone"],
        [{ email: "a@b.co", nickname: "x" }, "nickname"],
        [{ email: "a@b.co", fields: "plan=pro" }, "fields"],
        [{ email: "a@b.co", fields: { nope: 1 } }, "fields.nope"],
        [{ email: "a@b.co", fields: { seats: "many" } }, "fields.seats"],
        [{ email: "a@b.co", fields: { seats: "Infinity" } }, "fields.seats"],
        [{ email: "a@b.co", fields: { seats: true } }, "fields.seats"],
        [
          { email: "a@b.co", fields: { renewal_date: "12/01/2026" } },
          "fields.renewal_date",
        ],
        [
          { email: "a@b.co", fields: { renewal_date: "2026-02-30" } },
          "fields.renewal_date",
        ],
        [{ email: "a@b.co", fields: { vip: "maybe" } }, "fields.vip"],
        [{ email: "a@b.co", fields: { tier: "Platinum" } }, "fields.tier"],
        [
          { email: "a@b.co", fields: { plan: "x".repeat(1001) } },
          "fields.plan",
        ],
        [{ email: "a@b.co", fields: { plan: ["a"] } }, "fields.plan"],
        [{ email: "a@b.co", listIds: "all" }, "listIds"],
        [{ email: "a@b.co", listIds: ["nope"] }, "listIds"],
        [{ email: "a@b.co", listIds: [randomUUID()] }, "listIds"],
        [{ email: "a@b.co", tagIds: [randomUUID()] }, "tagIds"],
      ];
      for (const [input, field] of cases) {
        await expect(
          contacts.create(main, "manual", input),
        ).rejects.toMatchObject({
          response: { statusCode: 400, code: "validation", field },
        });
      }
      expect(await contacts.count(main, { search: "a@b.co" })).toBe(0);
      expect(
        (
          await contacts.create(main, "manual", {
            email: "limits@example.com",
            firstName: "x".repeat(255),
            phone: "1".repeat(50),
            country: "x".repeat(100),
            timezone: "UTC",
            fields: { plan: "x".repeat(1000) },
          })
        ).timezone,
      ).toBe("UTC");
    });

    it("merges custom values on update and removes the ones set to null", async () => {
      const updated = await contacts.update(main, ada.id, {
        firstName: "Augusta",
        company: null,
        city: " London ",
        fields: { seats: 20, plan: null, ltv: 1500.5 },
      });
      expect(updated).toMatchObject({
        id: ada.id,
        email: "ada@example.com",
        firstName: "Augusta",
        company: null,
        city: "London",
        timezone: "Europe/London",
        fields: {
          seats: 20,
          ltv: 1500.5,
          renewal_date: "2026-12-01",
          vip: true,
          tier: "Gold",
        },
      });
      expect("plan" in updated.fields).toBe(false);
      expect(updated.tags).toEqual(ada.tags);
      expect(updated.lists).toEqual(ada.lists);
      expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(
        Date.parse(ada.updatedAt),
      );
      expect(updated.createdAt).toBe(ada.createdAt);

      const [stored] = await db
        .select({ fields: schema.contacts.fields })
        .from(schema.contacts)
        .where(eq(schema.contacts.id, ada.id));
      expect(stored?.fields).toEqual({
        seats: 20,
        ltv: 1500.5,
        renewal_date: "2026-12-01",
        vip: true,
        tier: "Gold",
      });

      const unchanged = await contacts.update(main, ada.id, {});
      expect(unchanged.fields).toEqual(updated.fields);
      const renamed = await contacts.update(main, ada.id, {
        email: "Ada.Lovelace@Example.com",
      });
      expect(renamed.email).toBe("ada.lovelace@example.com");
      ada = await contacts.update(main, ada.id, { email: "ada@example.com" });
    });

    it("rejects bad updates", async () => {
      await expect(
        contacts.update(main, ada.id, { email: "TYPES@example.com" }),
      ).rejects.toMatchObject({
        response: { statusCode: 409, code: "email_taken", field: "email" },
      });
      await expect(
        contacts.update(main, ada.id, { email: "" }),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "email" },
      });
      await expect(
        contacts.update(main, ada.id, { fields: { nope: null } }),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "fields.nope" },
      });
      await expect(
        contacts.update(main, ada.id, { timezone: "Nowhere" }),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "timezone" },
      });
      await expect(
        contacts.update(main, randomUUID(), { firstName: "x" }),
      ).rejects.toMatchObject({
        response: { statusCode: 404, code: "not_found" },
      });
      await expect(contacts.get(main, "not-an-id")).rejects.toMatchObject({
        response: { statusCode: 404, code: "not_found" },
      });
      expect((await contacts.get(main, ada.id)).email).toBe("ada@example.com");
    });

    it("reports the most severe suppression reason", async () => {
      await suppression.add(
        { workspaceId: main, userId: null, origin: "user" },
        { emails: ["ada@example.com"], reason: "unsubscribed" },
      );
      expect((await contacts.get(main, ada.id)).suppressed).toBe(
        "unsubscribed",
      );
      await suppression.record({
        workspaceId: main,
        email: "ada@example.com",
        reason: "bounced",
        origin: "webhook",
      });
      expect((await contacts.get(main, ada.id)).suppressed).toBe("bounced");
      const types = await byEmail(main, "types@example.com");
      expect(types.suppressed).toBeNull();
    });

    it("hides stored values whose field was deleted", async () => {
      const temporary = await contacts.createField(main, {
        label: "Temporary",
        type: "text",
      });
      await contacts.update(main, ada.id, { fields: { temporary: "kept" } });
      expect((await contacts.get(main, ada.id)).fields.temporary).toBe("kept");
      await contacts.removeField(main, temporary.id);
      expect("temporary" in (await contacts.get(main, ada.id)).fields).toBe(
        false,
      );
      const [stored] = await db
        .select({ fields: schema.contacts.fields })
        .from(schema.contacts)
        .where(eq(schema.contacts.id, ada.id));
      expect(stored?.fields.temporary).toBe("kept");
    });
  });

  describe("listing and search", () => {
    it("pages through 250 contacts without repeating or skipping one", async () => {
      const result = await contacts.upsertMany(
        main,
        Array.from({ length: 250 }, (_, index) => ({
          email: `page-${String(index).padStart(3, "0")}@paging.test`,
          firstName: `Page${index}`,
          fields: { seats: index },
        })),
        { origin: "import", updateExisting: true },
      );
      expect(result).toEqual({
        created: 250,
        updated: 0,
        skipped: 0,
        errors: [],
      });

      const stored = await db
        .select({ id: schema.contacts.id })
        .from(schema.contacts)
        .where(eq(schema.contacts.workspaceId, main));
      expect(stored.length).toBe(253);

      const first = await contacts.list(main, {});
      expect(first.contacts).toHaveLength(50);
      expect(first.nextCursor).not.toBeNull();
      expect(
        (await contacts.list(main, { limit: 1000 })).contacts,
      ).toHaveLength(100);

      const orders: string[][] = [];
      for (const limit of [100, 37, 7]) {
        const rows = await listAll(main, {}, limit);
        const ids = rows.map((row) => row.id);
        expect(ids).toHaveLength(253);
        expect(new Set(ids).size).toBe(253);
        expect([...ids].sort()).toEqual(stored.map((row) => row.id).sort());
        const expected = [...rows].sort(
          (a, b) =>
            Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
            (a.id < b.id ? 1 : -1),
        );
        expect(ids).toEqual(expected.map((row) => row.id));
        orders.push(ids);
      }
      expect(orders[1]).toEqual(orders[0]);
      expect(orders[2]).toEqual(orders[0]);
      expect(await contacts.count(main, {})).toBe(253);

      const paging = await listAll(main, { search: "@paging.test" }, 60);
      expect(paging).toHaveLength(250);
      expect(new Set(paging.map((row) => row.id)).size).toBe(250);

      for (const cursor of ["not-a-cursor", "bm9wZXxub3Bl"]) {
        await expect(contacts.list(main, { cursor })).rejects.toMatchObject({
          response: { code: "validation", field: "cursor" },
        });
      }
    });

    it("reads a page with the same number of queries whatever its size", async () => {
      await contacts.bulk(main, {
        ids: (await contacts.list(main, { limit: 100 })).contacts.map(
          (contact) => contact.id,
        ),
        action: "add_tags",
        tagIds: [leadTagId],
      });
      const spy = vi.spyOn(db.$client, "query");
      try {
        const large = await contacts.list(main, { limit: 100 });
        const largeQueries = spy.mock.calls.length;
        spy.mockClear();
        const small = await contacts.list(main, { limit: 2 });
        const smallQueries = spy.mock.calls.length;
        expect(large.contacts).toHaveLength(100);
        expect(small.contacts).toHaveLength(2);
        expect(
          large.contacts.every((contact) =>
            contact.tags.some((tag) => tag.id === leadTagId),
          ),
        ).toBe(true);
        expect(largeQueries).toBe(smallQueries);
        expect(largeQueries).toBe(5);
      } finally {
        spy.mockRestore();
      }
    });

    it("searches by substring, ignoring case, with wildcards taken literally", async () => {
      await contacts.upsertMany(
        main,
        [
          { email: "organic@wild.test", company: "100% Organic" },
          { email: "lookalike@wild.test", company: "100x Organic" },
          { email: "under@wild.test", firstName: "under_score" },
          { email: "underx@wild.test", firstName: "underXscore" },
          { email: "a_b@wild.test" },
          { email: "axb@wild.test" },
          { email: "%off@wild.test" },
          { email: "slash@wild.test", lastName: "back\\slash" },
        ],
        { origin: "import", updateExisting: true },
      );
      const search = (text: string) => emailsOf(main, { search: text });

      expect(await search("nalytical")).toEqual([]);
      await contacts.update(main, ada.id, { company: "Analytical Engines" });
      expect(await search("nalytical")).toEqual(["ada@example.com"]);
      expect(await search("  ANALYTICAL eng ")).toEqual(["ada@example.com"]);
      expect(await search("ugust")).toEqual(["ada@example.com"]);
      expect(await search("ada@example")).toEqual(["ada@example.com"]);
      expect(await search("London")).toEqual([]);
      expect(await search("0% org")).toEqual(["organic@wild.test"]);
      expect(await search("100")).toEqual([
        "lookalike@wild.test",
        "organic@wild.test",
        "page-100@paging.test",
      ]);
      expect(await search("r_sc")).toEqual(["under@wild.test"]);
      expect(await search("%%%")).toEqual([]);
      expect(await search("___")).toEqual([]);
      expect(await search("back\\sl")).toEqual(["slash@wild.test"]);

      expect(await search("AD")).toEqual(["ada@example.com"]);
      expect(await search("a")).toEqual([
        "a_b@wild.test",
        "ada@example.com",
        "axb@wild.test",
      ]);
      expect(await search("a_")).toEqual(["a_b@wild.test"]);
      expect(await search("%")).toEqual(["%off@wild.test"]);
      expect(await search("_")).toEqual([]);
      expect(await search("ge")).toEqual([]);
      expect(await search("   ")).toHaveLength(261);

      await expect(
        contacts.list(main, { search: "x".repeat(256) }),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "search" },
      });
    });

    it("narrows by list and tag", async () => {
      expect(await emailsOf(main, { listId: newsletterId })).toEqual([
        "ada@example.com",
      ]);
      expect(await emailsOf(main, { tagId: vipTagId })).toEqual([
        "ada@example.com",
      ]);
      expect(await emailsOf(main, { tagId: leadTagId })).toHaveLength(100);
      expect(
        await emailsOf(main, { tagId: vipTagId, search: "paging" }),
      ).toEqual([]);
      expect(await emailsOf(main, { listId: randomUUID() })).toEqual([]);
      await expect(
        contacts.list(main, { listId: "not-an-id" }),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "listId" },
      });
      await expect(
        contacts.count(main, { tagId: "not-an-id" }),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "tagId" },
      });
    });
  });

  describe("filters", () => {
    const alice = "alice@acme.test";
    const bob = "bob@acme.test";
    const carol = "carol@globex.test";
    const dave = "dave@initech.test";
    const erin = "erin@initech.test";
    let trialId: string;
    let paidId: string;
    let championId: string;

    const match = (filter: FilterGroup, extra: ContactListQuery = {}) =>
      emailsOf(filtering, { ...extra, filter });
    const only = (condition: FilterCondition) => match(all(condition));

    beforeAll(async () => {
      await contacts.createField(filtering, { label: "Plan", type: "text" });
      await contacts.createField(filtering, { label: "Seats", type: "number" });
      await contacts.createField(filtering, {
        label: "Renewal",
        type: "date",
      });
      await contacts.createField(filtering, { label: "VIP", type: "boolean" });
      await contacts.createField(filtering, {
        label: "Tier",
        type: "select",
        options: ["Gold", "Silver"],
      });
      trialId = await createList(filtering, "Trial");
      paidId = await createList(filtering, "Paid");
      championId = await createTag(filtering, "champion");

      const result = await contacts.upsertMany(
        filtering,
        [
          {
            email: alice,
            firstName: "Alice",
            company: "Acme",
            city: "New York",
            fields: {
              plan: "pro",
              seats: 10,
              renewal: "2026-03-01",
              vip: true,
              tier: "Gold",
            },
          },
          {
            email: bob,
            firstName: "Bob",
            company: "ACME",
            fields: {
              plan: "free",
              seats: 3,
              renewal: "2026-09-15",
              vip: false,
              tier: "Silver",
            },
          },
          {
            email: carol,
            firstName: "Carol",
            company: "Globex",
            city: "York",
            fields: { plan: "Pro Plus", seats: 25 },
          },
          { email: dave },
          { email: erin, firstName: "Erin", company: "Initech" },
        ],
        { origin: "import", updateExisting: true },
      );
      expect(result.created).toBe(5);

      const ids = Object.fromEntries(
        (await listAll(filtering)).map((contact) => [
          contact.email,
          contact.id,
        ]),
      );
      await lists.addMembers(filtering, [trialId], [ids[alice], ids[bob]]);
      await lists.setMemberStatus(filtering, trialId, ids[bob], {
        status: "unsubscribed",
      });
      await lists.addMembers(filtering, [paidId], [ids[carol]]);
      await tags.attach(filtering, [championId], [ids[alice], ids[carol]]);
      await suppression.record({
        workspaceId: filtering,
        email: bob,
        reason: "bounced",
        origin: "webhook",
      });
      await db
        .update(schema.contacts)
        .set({
          fields: { plan: "pro", seats: "lots", renewal: "not a date" },
        })
        .where(eq(schema.contacts.id, ids[erin]));
      await db.execute(
        sql`update contacts set created_at = now() - interval '10 days' where id = ${ids[dave]}`,
      );
    });

    it("filters on built-in text fields", async () => {
      expect(
        await only({ field: "email", op: "is", value: "ALICE@acme.test" }),
      ).toEqual([alice]);
      expect(
        await only({ field: "email", op: "is_not", value: alice }),
      ).toEqual([bob, carol, dave, erin]);
      expect(
        await only({ field: "email", op: "contains", value: "ACME" }),
      ).toEqual([alice, bob]);
      expect(
        await only({ field: "email", op: "not_contains", value: "acme" }),
      ).toEqual([carol, dave, erin]);
      expect(
        await only({ field: "email", op: "starts_with", value: "da" }),
      ).toEqual([dave]);
      expect(
        await only({ field: "email", op: "ends_with", value: "@initech.test" }),
      ).toEqual([dave, erin]);
      expect(await only({ field: "firstName", op: "is_set" })).toEqual([
        alice,
        bob,
        carol,
        erin,
      ]);
      expect(await only({ field: "firstName", op: "is_not_set" })).toEqual([
        dave,
      ]);
      expect(await only({ field: "company", op: "is", value: "acme" })).toEqual(
        [alice, bob],
      );
      expect(
        await only({ field: "company", op: "is_not", value: "acme" }),
      ).toEqual([carol, dave, erin]);
      expect(
        await only({ field: "city", op: "contains", value: "york" }),
      ).toEqual([alice, carol]);
      expect(await only({ field: "city", op: "is", value: "york" })).toEqual([
        carol,
      ]);
      expect(
        await only({ field: "city", op: "not_contains", value: "new" }),
      ).toEqual([bob, carol, dave, erin]);
      expect(
        await only({ field: "company", op: "contains", value: "%" }),
      ).toEqual([]);
      expect(
        await only({ field: "company", op: "contains", value: "_" }),
      ).toEqual([]);
    });

    it("filters on created and updated dates", async () => {
      const day = (offset: number) =>
        new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
      const everyone = [alice, bob, carol, dave, erin];
      expect(
        await only({ field: "createdAt", op: "before", value: day(2) }),
      ).toEqual(everyone);
      expect(
        await only({ field: "createdAt", op: "after", value: day(2) }),
      ).toEqual([]);
      expect(
        await only({ field: "createdAt", op: "after", value: "2000-01-01" }),
      ).toEqual(everyone);
      expect(
        await only({ field: "createdAt", op: "before", value: day(-5) }),
      ).toEqual([dave]);
      expect(
        await only({
          field: "createdAt",
          op: "after",
          value: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        }),
      ).toEqual([alice, bob, carol, erin]);
      expect(
        await only({ field: "createdAt", op: "in_last_days", value: 5 }),
      ).toEqual([alice, bob, carol, erin]);
      expect(
        await only({ field: "createdAt", op: "not_in_last_days", value: 5 }),
      ).toEqual([dave]);
      expect(
        await only({ field: "createdAt", op: "in_last_days", value: 30 }),
      ).toEqual(everyone);
      expect(
        await only({ field: "updatedAt", op: "in_last_days", value: 1 }),
      ).toEqual(everyone);
      expect(
        await only({ field: "updatedAt", op: "not_in_last_days", value: 1 }),
      ).toEqual([]);
    });

    it("filters on custom text and select fields", async () => {
      expect(await only(custom("plan", "is", "pro"))).toEqual([alice, erin]);
      expect(await only(custom("plan", "is_not", "pro"))).toEqual([
        bob,
        carol,
        dave,
      ]);
      expect(await only(custom("plan", "contains", "PRO"))).toEqual([
        alice,
        carol,
        erin,
      ]);
      expect(await only(custom("plan", "not_contains", "pro"))).toEqual([
        bob,
        dave,
      ]);
      expect(await only(custom("plan", "starts_with", "pro p"))).toEqual([
        carol,
      ]);
      expect(await only(custom("plan", "ends_with", "ee"))).toEqual([bob]);
      expect(await only(custom("plan", "is_set"))).toEqual([
        alice,
        bob,
        carol,
        erin,
      ]);
      expect(await only(custom("plan", "is_not_set"))).toEqual([dave]);
      expect(await only(custom("tier", "is", "Gold"))).toEqual([alice]);
      expect(await only(custom("tier", "is_not", "Gold"))).toEqual([
        bob,
        carol,
        dave,
        erin,
      ]);
      expect(await only(custom("tier", "contains", "il"))).toEqual([bob]);
      expect(await only(custom("tier", "is_not_set"))).toEqual([
        carol,
        dave,
        erin,
      ]);
    });

    it("compares custom numbers, and a non-numeric stored value simply does not match", async () => {
      expect(await only(custom("seats", "gt", 5))).toEqual([alice, carol]);
      expect(await only(custom("seats", "gt", 10))).toEqual([carol]);
      expect(await only(custom("seats", "gte", 10))).toEqual([alice, carol]);
      expect(await only(custom("seats", "lt", 10))).toEqual([bob]);
      expect(await only(custom("seats", "lte", 10))).toEqual([alice, bob]);
      expect(await only(custom("seats", "is", 3))).toEqual([bob]);
      expect(await only(custom("seats", "is", 3.0))).toEqual([bob]);
      expect(await only(custom("seats", "is_not", 3))).toEqual([
        alice,
        carol,
        dave,
        erin,
      ]);
      expect(await only(custom("seats", "gt", -1000000))).toEqual([
        alice,
        bob,
        carol,
      ]);
      expect(await only(custom("seats", "lt", 1e12))).toEqual([
        alice,
        bob,
        carol,
      ]);
      expect(await only(custom("seats", "is_not_set"))).toEqual([dave]);
    });

    it("compares custom dates and booleans", async () => {
      expect(await only(custom("renewal", "before", "2026-06-01"))).toEqual([
        alice,
      ]);
      expect(await only(custom("renewal", "after", "2026-06-01"))).toEqual([
        bob,
      ]);
      expect(await only(custom("renewal", "after", "2026-03-01"))).toEqual([
        bob,
      ]);
      expect(await only(custom("renewal", "after", "1900-01-01"))).toEqual([
        alice,
        bob,
      ]);
      expect(await only(custom("renewal", "is", "2026-09-15"))).toEqual([bob]);
      expect(await only(custom("renewal", "is_set"))).toEqual([
        alice,
        bob,
        erin,
      ]);
      expect(await only(custom("vip", "is_true"))).toEqual([alice]);
      expect(await only(custom("vip", "is_false"))).toEqual([bob]);
      expect(await only(custom("vip", "is_set"))).toEqual([alice, bob]);
      expect(await only(custom("vip", "is_not_set"))).toEqual([
        carol,
        dave,
        erin,
      ]);
    });

    it("filters on list membership, tags and suppression", async () => {
      expect(await only({ field: "list", op: "in", listId: trialId })).toEqual([
        alice,
        bob,
      ]);
      expect(
        await only({ field: "list", op: "not_in", listId: trialId }),
      ).toEqual([carol, dave, erin]);
      expect(
        await only({ field: "list", op: "subscribed_to", listId: trialId }),
      ).toEqual([alice]);
      expect(
        await only({ field: "list", op: "unsubscribed_from", listId: trialId }),
      ).toEqual([bob]);
      expect(
        await only({ field: "list", op: "subscribed_to", listId: paidId }),
      ).toEqual([carol]);
      expect(
        await only({ field: "tag", op: "has", tagId: championId }),
      ).toEqual([alice, carol]);
      expect(
        await only({ field: "tag", op: "has_not", tagId: championId }),
      ).toEqual([bob, dave, erin]);
      expect(await only({ field: "suppressed", op: "is_true" })).toEqual([bob]);
      expect(await only({ field: "suppressed", op: "is_false" })).toEqual([
        alice,
        carol,
        dave,
        erin,
      ]);
      const bobContact = await byEmail(filtering, bob);
      expect(bobContact.suppressed).toBe("bounced");
      expect(bobContact.lists).toEqual([
        { id: trialId, name: "Trial", status: "unsubscribed" },
      ]);
    });

    it("combines conditions with nested all and any groups", async () => {
      expect(await match(all())).toEqual([alice, bob, carol, dave, erin]);
      expect(
        await match(
          all(
            { field: "company", op: "is", value: "acme" },
            any(custom("vip", "is_true"), custom("seats", "lt", 5)),
          ),
        ),
      ).toEqual([alice, bob]);
      expect(
        await match(
          any(
            { field: "tag", op: "has", tagId: championId },
            all(custom("plan", "is", "free"), {
              field: "suppressed",
              op: "is_true",
            }),
          ),
        ),
      ).toEqual([alice, bob, carol]);
      expect(
        await match(
          all(
            any(custom("seats", "gte", 10), {
              field: "email",
              op: "starts_with",
              value: "dave",
            }),
            any(
              { field: "list", op: "in", listId: paidId },
              { field: "firstName", op: "is_not_set" },
            ),
          ),
        ),
      ).toEqual([carol, dave]);
      expect(
        await match(
          any(custom("plan", "is", "nobody"), custom("seats", "gt", 1000)),
        ),
      ).toEqual([]);
      expect(
        await match(all(custom("plan", "contains", "pro")), {
          search: "acme",
          tagId: championId,
        }),
      ).toEqual([alice]);
      expect(
        await match(all(custom("plan", "contains", "pro")), { listId: paidId }),
      ).toEqual([carol]);
    });

    it("validates untrusted rules and names the condition", async () => {
      const valid = all(
        { field: "email", op: "is_set" },
        any(custom("seats", "gte", 1), {
          field: "list",
          op: "in",
          listId: trialId,
        }),
      );
      expect(await contacts.validateFilter(filtering, valid)).toEqual(valid);

      const rejected: [unknown, string][] = [
        [
          all(
            { field: "email", op: "is_set" },
            { field: "tag", op: "has", tagId: championId },
            { field: "custom", key: "plan", op: "gt", value: 3 },
          ),
          "Condition 3: 'gt' cannot be used on the text field Plan.",
        ],
        [all(custom("missing", "is", "x")), "Condition 1: 'missing' is not"],
        [
          all({ field: "list", op: "in", listId: newsletterId }),
          "Condition 1: That list was not found.",
        ],
        [
          all({ field: "tag", op: "has", tagId: vipTagId }),
          "Condition 1: That tag was not found.",
        ],
        [
          { match: "all", conditions: [{ field: "nope", op: "is" }] },
          "Condition 1: 'nope' is not a field",
        ],
        [all(any(any())), "Groups can be nested one level deep."],
        [
          {
            match: "all",
            conditions: Array.from({ length: 31 }, () => ({
              field: "email",
              op: "is_set",
            })),
          },
          "A filter can have up to 30 conditions.",
        ],
        ["plan = pro", "The filter must be a group"],
      ];
      for (const [input, message] of rejected) {
        await expect(
          contacts.validateFilter(filtering, input),
        ).rejects.toMatchObject({
          response: {
            statusCode: 400,
            code: "validation",
            field: "rules",
            message: expect.stringContaining(message),
          },
        });
        await expect(
          contacts.search(filtering, { filter: input }),
        ).rejects.toMatchObject({
          response: { code: "validation", field: "filter" },
        });
        await expect(
          contacts.countMatching(filtering, { filter: input }),
        ).rejects.toMatchObject({
          response: { code: "validation", field: "filter" },
        });
      }
      await expect(
        contacts.list(filtering, {
          filter: { match: "all", conditions: [{ field: "x" }] } as never,
        }),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "filter" },
      });

      const page = await contacts.search(filtering, {
        search: "acme",
        filter: all(custom("vip", "is_false")),
        limit: 10,
      });
      expect(page.contacts.map((contact) => contact.email)).toEqual([bob]);
      expect(
        await contacts.countMatching(filtering, {
          filter: all(custom("seats", "gt", 5)),
        }),
      ).toEqual({ count: 2 });
    });

    it("keeps stored rules working after their field, list or tag is deleted", async () => {
      const temporary = await contacts.createField(filtering, {
        label: "Region",
        type: "text",
      });
      const list = await lists.create(filtering, { name: "Short lived" });
      const stored = await contacts.validateFilter(
        filtering,
        any(custom("region", "is", "emea"), {
          field: "list",
          op: "in",
          listId: list.id,
        }),
      );
      await contacts.removeField(filtering, temporary.id);
      await lists.remove(filtering, list.id);
      expect(await match(stored)).toEqual([]);
      expect(
        await match(
          all({ field: "list", op: "not_in", listId: list.id }, stored),
        ),
      ).toEqual([]);
      await expect(
        contacts.validateFilter(filtering, stored),
      ).rejects.toMatchObject({ response: { field: "rules" } });
    });
  });

  describe("upsertMany", () => {
    it("accounts for created, updated, skipped and failed rows", async () => {
      const before = await contacts.get(main, ada.id);
      const rows = [
        { email: "new-one@upsert.test", firstName: "First try" },
        {
          email: "New-Two@Upsert.test",
          company: "Two Co",
          fields: { seats: "8", tier: "silver" },
        },
        { email: "not-an-email", firstName: "Broken" },
        {
          email: "ADA@example.com",
          company: "Upserted Co",
          lastName: "Lovelace",
          fields: { seats: 99, plan: "enterprise" },
        },
        {
          email: " NEW-ONE@upsert.test ",
          firstName: "Last wins",
          city: "Leeds",
        },
        { email: "bad-field@upsert.test", fields: { nope: 1 } },
        { email: "bad-zone@upsert.test", timezone: "Nowhere/City" },
      ] as ContactInput[];
      const result = await contacts.upsertMany(main, rows, {
        origin: "import",
        updateExisting: true,
        listIds: [customersId],
        tagIds: [leadTagId],
      });
      expect(result).toMatchObject({ created: 2, updated: 1, skipped: 1 });
      expect(result.errors.map((error) => error.index)).toEqual([2, 5, 6]);
      expect(result.errors[0]?.message).toContain("not-an-email");
      expect(result.errors[1]?.message).toContain("nope");
      expect(result.errors[2]?.message).toContain("Nowhere/City");

      const one = await byEmail(main, "new-one@upsert.test");
      expect(one).toMatchObject({
        firstName: "Last wins",
        city: "Leeds",
        origin: "import",
        lists: [{ id: customersId, status: "subscribed" }],
        tags: [{ id: leadTagId, name: "lead" }],
      });
      const two = await byEmail(main, "new-two@upsert.test");
      expect(two).toMatchObject({
        company: "Two Co",
        fields: { seats: 8, tier: "Silver" },
        origin: "import",
      });

      const after = await contacts.get(main, ada.id);
      expect(after).toMatchObject({
        id: ada.id,
        firstName: "Augusta",
        lastName: "Lovelace",
        company: "Upserted Co",
        city: "London",
        timezone: "Europe/London",
        origin: "manual",
        createdAt: before.createdAt,
        fields: {
          ...before.fields,
          seats: 99,
          plan: "enterprise",
        },
      });
      expect(after.fields.renewal_date).toBe("2026-12-01");
      expect(after.tags.map((tag) => tag.name)).toEqual(["lead", "vip"]);
      expect(after.lists.map((list) => list.name)).toEqual([
        "Customers",
        "Newsletter",
      ]);
      expect(Date.parse(after.updatedAt)).toBeGreaterThan(
        Date.parse(before.updatedAt),
      );
      expect(
        await db
          .select({ id: schema.contacts.id })
          .from(schema.contacts)
          .where(
            and(
              eq(schema.contacts.workspaceId, main),
              inArray(schema.contacts.email, [
                "not-an-email",
                "bad-field@upsert.test",
                "bad-zone@upsert.test",
              ]),
            ),
          ),
      ).toEqual([]);
    });

    it("keeps stored values when a row leaves a column empty", async () => {
      const result = await contacts.upsertMany(
        main,
        [
          {
            email: "new-one@upsert.test",
            firstName: null,
            city: "",
            company: "Filled in",
            fields: { seats: null },
          },
        ],
        { origin: "api", updateExisting: true },
      );
      expect(result).toEqual({
        created: 0,
        updated: 1,
        skipped: 0,
        errors: [],
      });
      expect(await byEmail(main, "new-one@upsert.test")).toMatchObject({
        firstName: "Last wins",
        city: "Leeds",
        company: "Filled in",
        origin: "import",
      });
    });

    it("leaves existing contacts alone when updateExisting is false", async () => {
      const prospectsId = await createList(main, "Prospects");
      const result = await contacts.upsertMany(
        main,
        [
          { email: "new-one@upsert.test", company: "Should not apply" },
          { email: "new-three@upsert.test", company: "Three Co" },
          { email: "NEW-THREE@upsert.test", company: "Three Co again" },
          { email: "nope" },
        ],
        {
          origin: "form",
          updateExisting: false,
          listIds: [prospectsId],
          tagIds: [vipTagId],
        },
      );
      expect(result).toEqual({
        created: 1,
        updated: 0,
        skipped: 2,
        errors: [{ index: 3, message: expect.stringContaining("nope") }],
      });
      const one = await byEmail(main, "new-one@upsert.test");
      expect(one.company).toBe("Filled in");
      expect(one.lists.some((list) => list.id === prospectsId)).toBe(false);
      expect(one.tags.some((tag) => tag.id === vipTagId)).toBe(false);
      const three = await byEmail(main, "new-three@upsert.test");
      expect(three).toMatchObject({
        company: "Three Co again",
        origin: "form",
        lists: [{ id: prospectsId, status: "subscribed" }],
        tags: [{ id: vipTagId }],
      });
      expect(await emailsOf(main, { listId: prospectsId })).toEqual([
        "new-three@upsert.test",
      ]);
    });

    it("writes a full batch in one statement and checks its limits", async () => {
      const rows = Array.from({ length: 1000 }, (_, index) => ({
        email: `batch-${index}@batch.test`,
        company: `Batch ${index % 10}`,
      }));
      const spy = vi.spyOn(db.$client, "query");
      let statements: string[] = [];
      try {
        expect(
          await contacts.upsertMany(main, rows, {
            origin: "import",
            updateExisting: true,
          }),
        ).toEqual({ created: 1000, updated: 0, skipped: 0, errors: [] });
        statements = spy.mock.calls.map((call) => {
          const [first] = call as unknown[];
          return typeof first === "string"
            ? first
            : String((first as { text?: string }).text);
        });
      } finally {
        spy.mockRestore();
      }
      const inserts = statements.filter((text) =>
        text.includes('insert into "contacts"'),
      );
      expect(inserts).toHaveLength(1);
      expect(inserts[0]).toContain("on conflict");
      expect(statements).toHaveLength(2);

      expect(
        await contacts.upsertMany(main, rows.slice(0, 400), {
          origin: "import",
          updateExisting: true,
        }),
      ).toEqual({ created: 0, updated: 400, skipped: 0, errors: [] });
      expect(await contacts.count(main, { search: "@batch.test" })).toBe(1000);

      await expect(
        contacts.upsertMany(main, [...rows, { email: "extra@batch.test" }], {
          origin: "import",
          updateExisting: true,
        }),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "rows" },
      });
      await expect(
        contacts.upsertMany(main, [{ email: "x@batch.test" }], {
          origin: "import",
          updateExisting: true,
          listIds: [randomUUID()],
        }),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "listIds" },
      });
      await expect(
        contacts.upsertMany(main, [{ email: "x@batch.test" }], {
          origin: "import",
          updateExisting: true,
          tagIds: [randomUUID()],
        }),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "tagIds" },
      });
      expect(await contacts.count(main, { search: "x@batch.test" })).toBe(0);
      expect(
        await contacts.upsertMany(main, [], {
          origin: "import",
          updateExisting: true,
        }),
      ).toEqual({ created: 0, updated: 0, skipped: 0, errors: [] });
    });
  });

  describe("bulk actions and isolation", () => {
    let stranger: Contact;
    let batchIds: string[];

    it("keeps another workspace's contacts invisible and untouched", async () => {
      stranger = await contacts.create(other, "manual", {
        email: "ada@example.com",
        firstName: "Other Ada",
        fields: { plan: 7 },
      });
      expect(stranger.fields).toEqual({ plan: 7 });
      expect(stranger.id).not.toBe(ada.id);
      const theirListId = await createList(other, "Their list");
      const theirTagId = await createTag(other, "theirs");
      await lists.addMembers(other, [theirListId], [stranger.id]);
      await tags.attach(other, [theirTagId], [stranger.id]);

      expect((await listAll(other)).map((contact) => contact.id)).toEqual([
        stranger.id,
      ]);
      expect(await contacts.count(other, {})).toBe(1);
      const mine = await listAll(main);
      expect(mine.some((contact) => contact.id === stranger.id)).toBe(false);
      expect(
        mine.filter((contact) => contact.email === "ada@example.com"),
      ).toHaveLength(1);
      expect((await contacts.get(main, ada.id)).suppressed).toBe("bounced");
      expect((await contacts.get(other, stranger.id)).suppressed).toBeNull();

      for (const attempt of [
        () => contacts.get(main, stranger.id),
        () => contacts.update(main, stranger.id, { firstName: "Hijacked" }),
        () => contacts.remove(main, stranger.id),
      ]) {
        await expect(attempt()).rejects.toMatchObject({
          response: { statusCode: 404, code: "not_found" },
        });
      }
      expect(await emailsOf(main, { listId: theirListId })).toEqual([]);
      expect(await emailsOf(main, { tagId: theirTagId })).toEqual([]);
      expect(await emailsOf(other, { listId: newsletterId })).toEqual([]);
      await expect(
        contacts.validateFilter(
          main,
          all({ field: "list", op: "in", listId: theirListId }),
        ),
      ).rejects.toMatchObject({ response: { field: "rules" } });
      await expect(
        contacts.create(main, "manual", {
          email: "cross@example.com",
          listIds: [theirListId],
        }),
      ).rejects.toMatchObject({ response: { field: "listIds" } });
      await expect(
        contacts.create(other, "manual", {
          email: "cross@example.com",
          fields: { seats: 1 },
        }),
      ).rejects.toMatchObject({ response: { field: "fields.seats" } });
      await expect(
        contacts.bulk(main, {
          ids: [ada.id],
          action: "add_tags",
          tagIds: [theirTagId],
        }),
      ).rejects.toMatchObject({ response: { field: "tagIds" } });

      for (const action of ["delete", "add_tags", "add_to_lists"]) {
        expect(
          await contacts.bulk(main, {
            ids: [stranger.id],
            action,
            tagIds: [vipTagId],
            listIds: [newsletterId],
          }),
        ).toEqual({ affected: 0 });
      }
      expect(await contacts.get(other, stranger.id)).toMatchObject({
        firstName: "Other Ada",
        tags: [{ id: theirTagId, name: "theirs" }],
        lists: [{ id: theirListId, name: "Their list", status: "subscribed" }],
      });
    });

    it("tags and lists many contacts at once", async () => {
      const batch = await listAll(main, { search: "@batch.test" });
      batchIds = batch.slice(0, 300).map((contact) => contact.id);
      const ids = [...batchIds, stranger.id, randomUUID(), batchIds[0]];

      expect(
        await contacts.bulk(main, {
          ids,
          action: "add_tags",
          tagIds: [vipTagId, leadTagId],
        }),
      ).toEqual({ affected: 300 });
      expect(
        await contacts.count(main, { tagId: vipTagId, search: "@batch.test" }),
      ).toBe(300);
      expect(
        await contacts.bulk(main, {
          ids,
          action: "add_tags",
          tagIds: [vipTagId],
        }),
      ).toEqual({ affected: 300 });
      expect(
        await contacts.bulk(main, {
          ids: batchIds.slice(0, 100),
          action: "remove_tags",
          tagIds: [vipTagId],
        }),
      ).toEqual({ affected: 100 });
      expect(
        await contacts.count(main, { tagId: vipTagId, search: "@batch.test" }),
      ).toBe(200);
      expect(
        await contacts.count(main, { tagId: leadTagId, search: "@batch.test" }),
      ).toBe(300);

      expect(
        await contacts.bulk(main, {
          ids,
          action: "add_to_lists",
          listIds: [newsletterId, customersId],
        }),
      ).toEqual({ affected: 300 });
      expect(
        await contacts.count(main, {
          listId: newsletterId,
          search: "@batch.test",
        }),
      ).toBe(300);
      expect(
        await contacts.bulk(main, {
          ids: batchIds.slice(0, 50),
          action: "remove_from_lists",
          listIds: [newsletterId],
        }),
      ).toEqual({ affected: 50 });
      expect(
        await contacts.count(main, {
          listId: newsletterId,
          search: "@batch.test",
        }),
      ).toBe(250);
      expect(
        await contacts.count(main, {
          listId: customersId,
          search: "@batch.test",
        }),
      ).toBe(300);
      expect((await contacts.get(other, stranger.id)).tags).toHaveLength(1);
    });

    it("validates bulk requests", async () => {
      const cases: [Record<string, unknown>, string][] = [
        [{ ids: [ada.id], action: "archive" }, "action"],
        [{ ids: [ada.id] }, "action"],
        [{ ids: [], action: "delete" }, "ids"],
        [{ action: "delete" }, "ids"],
        [{ ids: ["nope"], action: "delete" }, "ids"],
        [
          {
            ids: Array.from({ length: 1001 }, () => randomUUID()),
            action: "delete",
          },
          "ids",
        ],
        [{ ids: [ada.id], action: "add_tags" }, "tagIds"],
        [{ ids: [ada.id], action: "remove_tags", tagIds: [] }, "tagIds"],
        [
          { ids: [ada.id], action: "add_tags", tagIds: [randomUUID()] },
          "tagIds",
        ],
        [{ ids: [ada.id], action: "add_to_lists" }, "listIds"],
        [
          {
            ids: [ada.id],
            action: "remove_from_lists",
            listIds: [randomUUID()],
          },
          "listIds",
        ],
      ];
      for (const [input, field] of cases) {
        await expect(contacts.bulk(main, input)).rejects.toMatchObject({
          response: { statusCode: 400, code: "validation", field },
        });
      }
    });

    it("deletes many contacts with their memberships and leaves suppressions", async () => {
      const victims = batchIds.slice(0, 120);
      const victimRows = await db
        .select({ email: schema.contacts.email })
        .from(schema.contacts)
        .where(inArray(schema.contacts.id, victims.slice(0, 2)));
      await suppression.add(
        { workspaceId: main, userId: null, origin: "user" },
        { emails: victimRows.map((row) => row.email) },
      );
      const suppressionsBefore = await db
        .select({ id: schema.suppressions.id })
        .from(schema.suppressions)
        .where(eq(schema.suppressions.workspaceId, main));

      expect(
        await contacts.bulk(main, {
          ids: [...victims, stranger.id, randomUUID()],
          action: "delete",
        }),
      ).toEqual({ affected: 120 });
      expect(
        await contacts.bulk(main, { ids: victims, action: "delete" }),
      ).toEqual({ affected: 0 });
      expect(await contacts.count(main, { search: "@batch.test" })).toBe(880);
      expect(
        await db
          .select({ id: schema.listMembers.contactId })
          .from(schema.listMembers)
          .where(inArray(schema.listMembers.contactId, victims)),
      ).toEqual([]);
      expect(
        await db
          .select({ id: schema.contactTags.contactId })
          .from(schema.contactTags)
          .where(inArray(schema.contactTags.contactId, victims)),
      ).toEqual([]);
      const suppressionsAfter = await db
        .select({ id: schema.suppressions.id })
        .from(schema.suppressions)
        .where(eq(schema.suppressions.workspaceId, main));
      expect(suppressionsAfter.length).toBe(suppressionsBefore.length);
      expect(await contacts.get(other, stranger.id)).toMatchObject({
        id: stranger.id,
      });
    });

    it("deletes one contact with its memberships and leaves its suppressions", async () => {
      const before = await contacts.get(main, ada.id);
      expect(before.lists.length).toBeGreaterThan(0);
      expect(before.tags.length).toBeGreaterThan(0);
      await contacts.remove(main, ada.id);

      await expect(contacts.get(main, ada.id)).rejects.toMatchObject({
        response: { statusCode: 404 },
      });
      await expect(contacts.remove(main, ada.id)).rejects.toMatchObject({
        response: { statusCode: 404, code: "not_found" },
      });
      expect(
        await db
          .select({ id: schema.listMembers.contactId })
          .from(schema.listMembers)
          .where(eq(schema.listMembers.contactId, ada.id)),
      ).toEqual([]);
      expect(
        await db
          .select({ id: schema.contactTags.contactId })
          .from(schema.contactTags)
          .where(eq(schema.contactTags.contactId, ada.id)),
      ).toEqual([]);
      const suppressed = await db
        .select({ reason: schema.suppressions.reason })
        .from(schema.suppressions)
        .where(
          and(
            eq(schema.suppressions.workspaceId, main),
            eq(schema.suppressions.email, "ada@example.com"),
          ),
        );
      expect(suppressed.map((row) => row.reason).sort()).toEqual([
        "bounced",
        "unsubscribed",
      ]);
      expect((await lists.get(main, newsletterId)).name).toBe("Newsletter");

      const again = await contacts.create(main, "manual", {
        email: "ada@example.com",
      });
      expect(again.suppressed).toBe("bounced");
      expect(again.lists).toEqual([]);
    });
  });

  describe("over HTTP", () => {
    it("serves the contact routes with the contract's status codes and shapes", async () => {
      const unauthenticated = await httpApp.inject({
        method: "GET",
        url: "/v1/contacts",
      });
      expect(unauthenticated.statusCode).toBe(401);

      const created = await inject("POST", "/v1/contacts", {
        email: "Http@Example.com",
        firstName: "Http",
        fields: { seats: "4" },
        tagIds: [vipTagId],
      });
      expect(created.statusCode).toBe(201);
      const contact = created.json() as Contact;
      expect(contact).toMatchObject({
        email: "http@example.com",
        origin: "api",
        fields: { seats: 4 },
        tags: [{ id: vipTagId, name: "vip" }],
        lists: [],
        suppressed: null,
      });

      const duplicate = await inject("POST", "/v1/contacts", {
        email: "http@example.com",
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json()).toEqual({
        statusCode: 409,
        code: "email_taken",
        message: expect.any(String),
        field: "email",
      });
      const invalid = await inject("POST", "/v1/contacts", { email: "nope" });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({
        statusCode: 400,
        code: "validation",
        field: "email",
      });

      const fetched = await inject("GET", `/v1/contacts/${contact.id}`);
      expect(fetched.statusCode).toBe(200);
      expect(fetched.json()).toEqual(contact);
      const missing = await inject("GET", `/v1/contacts/${randomUUID()}`);
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toMatchObject({ code: "not_found" });
      const foreign = await inject(
        "GET",
        `/v1/contacts/${contact.id}`,
        undefined,
        other,
      );
      expect(foreign.statusCode).toBe(404);

      const patched = await inject("PATCH", `/v1/contacts/${contact.id}`, {
        lastName: "Route",
        fields: { seats: null, plan: "pro" },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json()).toMatchObject({
        lastName: "Route",
        fields: { plan: "pro" },
      });

      const firstPage = await inject(
        "GET",
        `/v1/contacts?search=batch.test&limit=2&tagId=${leadTagId}`,
      );
      expect(firstPage.statusCode).toBe(200);
      const first = firstPage.json() as {
        contacts: Contact[];
        nextCursor: string | null;
      };
      expect(first.contacts).toHaveLength(2);
      expect(first.nextCursor).toEqual(expect.any(String));
      const secondPage = await inject(
        "GET",
        `/v1/contacts?search=batch.test&limit=2&tagId=${leadTagId}&cursor=${first.nextCursor}`,
      );
      const second = secondPage.json() as { contacts: Contact[] };
      expect(second.contacts).toHaveLength(2);
      expect(
        new Set([...first.contacts, ...second.contacts].map((row) => row.id))
          .size,
      ).toBe(4);

      const searched = await inject("POST", "/v1/contacts/search", {
        search: "http@",
        filter: all(custom("plan", "is", "pro")),
        limit: 5,
      });
      expect(searched.statusCode).toBe(200);
      expect(
        (searched.json() as { contacts: Contact[] }).contacts.map(
          (row) => row.email,
        ),
      ).toEqual(["http@example.com"]);
      const badFilter = await inject("POST", "/v1/contacts/search", {
        filter: all(custom("plan", "gt", 3)),
      });
      expect(badFilter.statusCode).toBe(400);
      expect(badFilter.json()).toMatchObject({
        code: "validation",
        field: "filter",
        message: expect.stringContaining(
          "Condition 1: 'gt' cannot be used on the text field Plan.",
        ),
      });

      const counted = await inject("POST", "/v1/contacts/count", {
        filter: all(custom("plan", "is", "pro")),
        search: "http@",
      });
      expect(counted.statusCode).toBe(200);
      expect(counted.json()).toEqual({ count: 1 });

      const bulk = await inject("POST", "/v1/contacts/bulk", {
        ids: [contact.id, randomUUID()],
        action: "add_to_lists",
        listIds: [newsletterId],
      });
      expect(bulk.statusCode).toBe(200);
      expect(bulk.json()).toEqual({ affected: 1 });

      const removed = await inject("DELETE", `/v1/contacts/${contact.id}`);
      expect(removed.statusCode).toBe(204);
      expect(removed.body).toBe("");
      expect(
        (await inject("DELETE", `/v1/contacts/${contact.id}`)).statusCode,
      ).toBe(404);
    });

    it("serves the custom field routes", async () => {
      const listed = await inject("GET", "/v1/contact-fields");
      expect(listed.statusCode).toBe(200);
      const { fields } = listed.json() as {
        fields: { key: string; position: number }[];
      };
      expect(fields[0]?.key).toBe("plan");
      expect(fields.map((field) => field.position)).toEqual(
        [...fields.map((field) => field.position)].sort((a, b) => a - b),
      );

      const created = await inject("POST", "/v1/contact-fields", {
        label: "Signup source",
        type: "select",
        options: ["Web", "Event"],
      });
      expect(created.statusCode).toBe(201);
      const field = created.json() as { id: string; key: string };
      expect(field).toMatchObject({
        key: "signup_source",
        type: "select",
        options: ["Web", "Event"],
      });
      const taken = await inject("POST", "/v1/contact-fields", {
        label: "Signup source",
        type: "text",
        key: "signup_source",
      });
      expect(taken.statusCode).toBe(409);
      expect(taken.json()).toMatchObject({ code: "key_taken", field: "key" });

      const patched = await inject("PATCH", `/v1/contact-fields/${field.id}`, {
        label: "Source",
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json()).toMatchObject({ label: "Source" });
      const removed = await inject("DELETE", `/v1/contact-fields/${field.id}`);
      expect(removed.statusCode).toBe(204);
      expect(
        (await inject("DELETE", `/v1/contact-fields/${field.id}`)).statusCode,
      ).toBe(404);
    });
  });

  describe("at scale", () => {
    it("serves the hot queries from indexes with 50,000 contacts in a workspace", async () => {
      scale = await createWorkspace("Contacts e2e scale");
      await contacts.createField(scale, { label: "Plan", type: "text" });
      await contacts.createField(scale, { label: "Seats", type: "number" });
      const catalog = new Map<string, FilterFieldDefinition>(
        (await contacts.listFields(scale)).map((field) => [field.key, field]),
      );
      await db.execute(sql`
        insert into contacts (workspace_id, email, first_name, last_name, company, fields, created_at, updated_at)
        select
          ${scale}::uuid,
          'user' || g || '@scale' || (g % 500) || '.test',
          'First' || g,
          'Last' || g,
          'Company ' || (g % 1000),
          jsonb_build_object(
            'plan', case when g % 1000 = 0 then 'enterprise' else 'free' end,
            'seats', g % 50
          ),
          now() - make_interval(secs => g),
          now()
        from generate_series(1, 50000) as g
      `);
      await db.execute(sql`vacuum analyze contacts`);
      expect(await contacts.count(scale, {})).toBe(50_000);

      const plans: Record<string, Awaited<ReturnType<typeof explain>>> = {};
      const page = await contacts.list(scale, { limit: 50 });
      const last = page.contacts.at(-1);
      if (!last || !page.nextCursor) {
        throw new Error("The first page was not full.");
      }
      expect(page.contacts[0]?.email).toBe("user1@scale1.test");

      plans.firstPage = await explain(
        repository.pageQuery({ workspaceId: scale, limit: 51 }).toSQL(),
      );
      plans.nextPage = await explain(
        repository
          .pageQuery({
            workspaceId: scale,
            limit: 51,
            cursor: {
              createdAt: new Date(last.createdAt)
                .toISOString()
                .replace("Z", "000Z"),
              id: last.id,
            },
          })
          .toSQL(),
      );
      plans.substringSearch = await explain(
        repository
          .pageQuery({ workspaceId: scale, search: "ser49999@", limit: 51 })
          .toSQL(),
      );
      plans.substringCount = await explain(
        repository
          .countQuery({ workspaceId: scale, search: "company 777" })
          .toSQL(),
      );
      plans.prefixSearch = await explain(
        repository
          .pageQuery({ workspaceId: scale, search: "zz", limit: 51 })
          .toSQL(),
      );
      plans.emailLookup = await explain(
        repository
          .pageQuery({
            workspaceId: scale,
            filter: compileFilter(
              all({
                field: "email",
                op: "is",
                value: "user123@scale123.test",
              }),
              catalog,
            ),
            limit: 51,
          })
          .toSQL(),
      );
      plans.customEquality = await explain(
        repository
          .pageQuery({
            workspaceId: scale,
            filter: compileFilter(
              all(custom("plan", "is", "enterprise")),
              catalog,
            ),
            limit: 51,
          })
          .toSQL(),
      );
      plans.customEqualityCount = await explain(
        repository
          .countQuery({
            workspaceId: scale,
            filter: compileFilter(
              all(custom("plan", "is", "enterprise")),
              catalog,
            ),
          })
          .toSQL(),
      );
      console.info(
        "EXPLAIN findings",
        JSON.stringify(
          Object.fromEntries(
            Object.entries(plans).map(([name, plan]) => [
              name,
              { nodes: plan.nodeTypes, indexes: plan.indexes },
            ]),
          ),
          null,
          1,
        ),
      );

      for (const [name, plan] of Object.entries(plans)) {
        expect([name, plan.sequentialOnContacts]).toEqual([name, false]);
        expect([name, plan.indexes.length > 0]).toEqual([name, true]);
      }
      expect(plans.firstPage?.indexes).toEqual([
        "contacts_workspace_id_created_at_id_idx",
      ]);
      expect(plans.nextPage?.indexes).toEqual([
        "contacts_workspace_id_created_at_id_idx",
      ]);
      expect(plans.substringSearch?.indexes).toContain(
        "contacts_search_text_idx",
      );
      expect(plans.substringCount?.indexes).toContain(
        "contacts_search_text_idx",
      );
      expect(plans.prefixSearch?.indexes).toEqual([
        "contacts_workspace_id_email_uidx",
      ]);
      expect(plans.emailLookup?.indexes).toEqual([
        "contacts_workspace_id_email_uidx",
      ]);
      expect(plans.customEquality?.indexes).toContain("contacts_fields_idx");
      expect(plans.customEqualityCount?.indexes).toContain(
        "contacts_fields_idx",
      );

      expect(
        (await contacts.list(scale, { search: "ser49999@" })).contacts.map(
          (contact) => contact.email,
        ),
      ).toEqual(["user49999@scale499.test"]);
      expect(await contacts.count(scale, { search: "company 777" })).toBe(50);
      expect(
        await contacts.count(scale, {
          filter: all(custom("plan", "is", "enterprise")),
        }),
      ).toBe(50);
      expect(
        await contacts.count(scale, {
          filter: all(custom("seats", "gte", 49)),
        }),
      ).toBe(1000);
      const second = await contacts.list(scale, {
        limit: 50,
        cursor: page.nextCursor,
      });
      expect(second.contacts[0]?.email).toBe("user51@scale51.test");

      await db.delete(schema.workspaces).where(eq(schema.workspaces.id, scale));
      workspaceIds.splice(workspaceIds.indexOf(scale), 1);
    }, 180_000);
  });
});
