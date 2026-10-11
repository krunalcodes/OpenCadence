import { randomInt, randomUUID } from "node:crypto";
import { getQueueToken } from "@nestjs/bullmq";
import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { and, type Db, eq, inArray, schema } from "@workspace/db";
import { messageToken } from "@workspace/email-renderer";
import { AppModule } from "../src/app/app.module";
import { uuidv7, uuidv7Date } from "../src/common/uuid";
import { DATABASE } from "../src/infra/database/database.module";
import { TrackingKeys } from "../src/infra/tracking-keys/tracking-keys";
import { SEND_QUEUE } from "../src/modules/dispatch/dispatch.constants";
import { DispatchService } from "../src/modules/dispatch/dispatch.service";
import { prepareContent } from "../src/modules/dispatch/prepare-content";
import { confirmToken } from "../src/modules/forms/form-tokens";
import { preferencesRateLimit } from "../src/modules/preferences/preferences.rate-limiter";
import type { Preferences } from "../src/modules/preferences/preferences.service";
import {
  createWorkspaceSessions,
  type TestWorkspace,
} from "./support/workspace-session";

type StubbedQueue = {
  add: (...args: unknown[]) => Promise<unknown>;
  addBulk: (...args: unknown[]) => Promise<unknown>;
};

type ListOptions = {
  isPublic?: boolean;
  publicName?: string | null;
  publicDescription?: string | null;
};

const appUrl = "http://localhost:3000";

describe("Preferences (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let secret: Buffer;
  let dispatch: DispatchService;
  let sessions: ReturnType<typeof createWorkspaceSessions>;
  let workspace: TestWorkspace;
  let other: TestWorkspace;
  let sourceId: string;
  const network = `10.${randomInt(1, 250)}.${randomInt(1, 250)}`;
  let host = 0;

  function freshIp() {
    host += 1;
    return `${network}.${host}`;
  }

  function visit(
    method: "GET" | "POST",
    url: string,
    options: { ip?: string; payload?: object } = {},
  ) {
    return app.inject({
      method,
      url,
      headers: { "x-forwarded-for": options.ip ?? freshIp() },
      payload: options.payload,
    });
  }

  async function read(token: string) {
    const response = await visit("GET", `/v1/public/preferences/${token}`);
    expect(response.statusCode).toBe(200);
    return response.json() as Preferences;
  }

  async function save(token: string, payload: object) {
    const response = await visit("POST", `/v1/public/preferences/${token}`, {
      payload,
    });
    expect(response.statusCode).toBe(200);
    return response.json() as Preferences;
  }

  async function createContact(email: string, target = workspace) {
    const [contact] = await db
      .insert(schema.contacts)
      .values({ workspaceId: target.workspaceId, email })
      .returning({ id: schema.contacts.id });
    if (!contact) {
      throw new Error("The test contact was not created.");
    }
    return contact.id;
  }

  async function createList(
    name: string,
    options: ListOptions = {},
    target = workspace,
  ) {
    const [list] = await db
      .insert(schema.lists)
      .values({
        workspaceId: target.workspaceId,
        name: `${name} ${randomUUID()}`,
        ...options,
      })
      .returning({ id: schema.lists.id, name: schema.lists.name });
    if (!list) {
      throw new Error("The test list was not created.");
    }
    return list;
  }

  async function join(
    listId: string,
    contactId: string,
    status: "subscribed" | "unsubscribed" = "subscribed",
    target = workspace,
  ) {
    await db.insert(schema.listMembers).values({
      workspaceId: target.workspaceId,
      listId,
      contactId,
      status,
      subscribedAt: new Date(),
    });
  }

  async function createMessage(
    email: string,
    contactId: string | null,
    target = workspace,
    source = sourceId,
  ) {
    const createdAt = new Date(Date.now() - 60_000);
    const id = uuidv7(createdAt);
    await db.insert(schema.messages).values({
      id,
      createdAt: uuidv7Date(id) ?? createdAt,
      workspaceId: target.workspaceId,
      sourceId: source,
      kind: "campaign",
      status: "sent",
      fromEmail: "hello@northwind.example",
      fromName: "Northwind",
      toEmails: [email],
      subject: "News",
      sentAt: new Date(Date.now() - 30_000),
      contactId,
    });
    return { id, token: messageToken(id, secret) };
  }

  async function memberStatus(listId: string, contactId: string) {
    const [row] = await db
      .select({ status: schema.listMembers.status })
      .from(schema.listMembers)
      .where(
        and(
          eq(schema.listMembers.listId, listId),
          eq(schema.listMembers.contactId, contactId),
        ),
      );
    return row?.status ?? null;
  }

  function suppressionsFor(email: string, target = workspace) {
    return db
      .select({
        reason: schema.suppressions.reason,
        origin: schema.suppressions.origin,
      })
      .from(schema.suppressions)
      .where(
        and(
          eq(schema.suppressions.workspaceId, target.workspaceId),
          eq(schema.suppressions.email, email),
        ),
      );
  }

  async function createSource(target: TestWorkspace) {
    const [source] = await db
      .insert(schema.sendingSources)
      .values({
        workspaceId: target.workspaceId,
        integrationType: "resend",
        name: `Preferences source ${randomUUID()}`,
        isDefault: true,
      })
      .returning({ id: schema.sendingSources.id });
    if (!source) {
      throw new Error("The test source was not created.");
    }
    return source.id;
  }

  async function reader() {
    const email = `reader-${randomUUID()}@example.com`;
    const contactId = await createContact(email);
    const message = await createMessage(email, contactId);
    return { email, contactId, ...message };
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
    secret = app.get(TrackingKeys).secret;
    dispatch = app.get(DispatchService);
    const sendQueue = app.get<StubbedQueue>(getQueueToken(SEND_QUEUE));
    vi.spyOn(sendQueue, "add").mockImplementation(async () => ({}));
    vi.spyOn(sendQueue, "addBulk").mockImplementation(async () => []);

    sessions = createWorkspaceSessions(app, "preferences-e2e");
    workspace = await sessions.workspace();
    other = await sessions.workspace();
    sourceId = await createSource(workspace);
    await db.insert(schema.workspaceBrandSettings).values({
      workspaceId: workspace.workspaceId,
      brandName: "Northwind Traders",
    });
  });

  afterAll(async () => {
    await sessions.cleanup();
    await app.close();
  });

  describe("the list fields that feed the page", () => {
    it("creates, updates and returns the public fields of a list", async () => {
      const headers = { cookie: workspace.owner.cookie };
      const name = `Digest ${randomUUID()}`;
      const created = await app.inject({
        method: "POST",
        url: "/v1/lists",
        headers,
        payload: {
          name,
          isPublic: true,
          publicName: "  Weekly   digest ",
          publicDescription: " One email every Friday. ",
        },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        name,
        isPublic: true,
        publicName: "Weekly digest",
        publicDescription: "One email every Friday.",
      });
      const id = created.json().id as string;

      const plain = await app.inject({
        method: "POST",
        url: "/v1/lists",
        headers,
        payload: { name: `Plain ${randomUUID()}` },
      });
      expect(plain.json()).toMatchObject({
        isPublic: false,
        publicName: null,
        publicDescription: null,
      });

      const updated = await app.inject({
        method: "PATCH",
        url: `/v1/lists/${id}`,
        headers,
        payload: { isPublic: false, publicName: "", publicDescription: null },
      });
      expect(updated.json()).toMatchObject({
        name,
        isPublic: false,
        publicName: null,
        publicDescription: null,
      });
      const listed = await app.inject({
        method: "GET",
        url: "/v1/lists",
        headers,
      });
      expect(
        (listed.json().lists as { id: string; isPublic: boolean }[]).find(
          (list) => list.id === id,
        ),
      ).toMatchObject({ isPublic: false });

      for (const [payload, field] of [
        [{ isPublic: "yes" }, "isPublic"],
        [{ publicName: "x".repeat(81) }, "publicName"],
        [{ publicName: 4 }, "publicName"],
        [{ publicDescription: "x".repeat(501) }, "publicDescription"],
      ] as const) {
        const response = await app.inject({
          method: "PATCH",
          url: `/v1/lists/${id}`,
          headers,
          payload,
        });
        expect(response.statusCode).toBe(400);
        expect(response.json().field).toBe(field);
      }
    });
  });

  describe("the preferences_url merge tag", () => {
    it("reaches a prepared email, is not click tracked and opens the page", async () => {
      const email = `reader-${randomUUID()}@example.com`;
      const contactId = await createContact(email);
      const list = await createList("Tagged", { isPublic: true });
      await join(list.id, contactId);
      const queued = await dispatch.enqueue({
        workspaceId: workspace.workspaceId,
        kind: "campaign",
        sourceId,
        from: { email: "hello@northwind.example", name: "Northwind" },
        to: [email],
        subject: "News",
        html: '<body><a href="https://example.com/read">Read</a> <a href="{{preferences_url}}">Preferences</a> <a href="{{ unsubscribe_url }}">Unsubscribe</a></body>',
        text: "Preferences: {{preferences_url}}",
        contactId,
        tracking: { opens: true, clicks: true },
        unsubscribe: { listId: list.id },
      });
      const [message] = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.id, queued.id));
      const [stored] = await db
        .select()
        .from(schema.messageContents)
        .where(eq(schema.messageContents.messageId, queued.id));
      if (!message || !stored) {
        throw new Error("The message was not stored.");
      }
      const keys = app.get(TrackingKeys);
      const prepared = prepareContent({
        message,
        content: {
          html: stored.html,
          text: stored.text,
          headers: stored.headers ?? {},
          snapshotId: stored.snapshotId,
          variables: stored.variables,
        },
        snapshot: null,
        keys,
      });
      const token = messageToken(queued.id, secret);
      const link = `${keys.baseUrl}/t/p/${token}`;
      expect(prepared.html).toContain(`<a href="${link}">Preferences</a>`);
      expect(prepared.html).toContain(`${keys.baseUrl}/t/c/${token}?u=`);
      expect(prepared.text).toContain(`Preferences: ${link}`);

      const redirect = await visit("GET", `/v1/t/p/${token}`);
      expect(redirect.statusCode).toBe(302);
      expect(redirect.headers.location).toBe(`${appUrl}/preferences/${token}`);
      expect((await visit("GET", "/v1/t/p/forged")).statusCode).toBe(404);
      expect(await memberStatus(list.id, contactId)).toBe("subscribed");

      const page = await read(token);
      expect(page.lists).toEqual([
        { id: list.id, name: list.name, description: null, subscribed: true },
      ]);
    });
  });

  describe("reading", () => {
    it("shows a masked address, public lists and the contact's own subscriptions", async () => {
      const { email, contactId, token } = await reader();
      const weekly = await createList("Weekly", {
        isPublic: true,
        publicName: "Weekly news",
        publicDescription: "Every Friday",
      });
      const product = await createList("Product", { isPublic: true });
      const left = await createList("Left", { isPublic: true });
      const internal = await createList("Internal VIP");
      const hidden = await createList("Hidden");
      const hiddenLeft = await createList("Hidden left");
      const foreign = await createList("Foreign", { isPublic: true }, other);
      await join(weekly.id, contactId);
      await join(left.id, contactId, "unsubscribed");
      await join(internal.id, contactId);
      await join(hiddenLeft.id, contactId, "unsubscribed");

      const page = await read(token);
      expect(page.email).toBe("r***@example.com");
      expect(JSON.stringify(page)).not.toContain(email);
      expect(JSON.stringify(page)).not.toContain(contactId);
      expect(page.brandName).toBe("Northwind Traders");
      expect(page.unsubscribedFromAll).toBe(false);
      expect(page.contactFound).toBe(true);
      const mine = page.lists.filter((list) =>
        [
          weekly.id,
          product.id,
          left.id,
          internal.id,
          hidden.id,
          hiddenLeft.id,
          foreign.id,
        ].includes(list.id),
      );
      expect(mine.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
        [
          {
            id: weekly.id,
            name: "Weekly news",
            description: "Every Friday",
            subscribed: true,
          },
          {
            id: product.id,
            name: product.name,
            description: null,
            subscribed: false,
          },
          {
            id: left.id,
            name: left.name,
            description: null,
            subscribed: false,
          },
          {
            id: internal.id,
            name: internal.name,
            description: null,
            subscribed: true,
          },
        ].sort((a, b) => a.id.localeCompare(b.id)),
      );
    });

    it("refuses tokens that are forged or made for something else", async () => {
      const { token, id } = await reader();
      for (const bad of [
        "nope",
        `${token.slice(0, -2)}AA`,
        messageToken(randomUUID(), secret),
        messageToken(id, Buffer.alloc(32, 2)),
        confirmToken(id, new Date(Date.now() + 60_000), secret),
      ]) {
        const url = `/v1/public/preferences/${bad}`;
        expect((await visit("GET", url)).statusCode).toBe(404);
        expect(
          (await visit("POST", url, { payload: { unsubscribeAll: true } }))
            .statusCode,
        ).toBe(404);
      }
    });

    it("limits how often one network can use the page", async () => {
      const { token } = await reader();
      const ip = freshIp();
      let last = 0;
      for (let attempt = 0; attempt < preferencesRateLimit + 1; attempt += 1) {
        const response = await visit(
          "GET",
          `/v1/public/preferences/${attempt % 2 === 0 ? token : "nope"}`,
          { ip },
        );
        last = response.statusCode;
      }
      expect(last).toBe(429);
      const blocked = await visit("POST", `/v1/public/preferences/${token}`, {
        ip,
        payload: { unsubscribeAll: true },
      });
      expect(blocked.statusCode).toBe(429);
    });
  });

  describe("saving", () => {
    it("sets each shown list and ignores every other id", async () => {
      const { email, contactId, token } = await reader();
      const stay = await createList("Stay", { isPublic: true });
      const leave = await createList("Leave", { isPublic: true });
      const joinNew = await createList("Join", { isPublic: true });
      const rejoin = await createList("Rejoin", { isPublic: true });
      const internal = await createList("Internal");
      const hidden = await createList("Hidden");
      const hiddenLeft = await createList("Hidden left");
      const foreign = await createList("Foreign", { isPublic: true }, other);
      await join(stay.id, contactId);
      await join(leave.id, contactId);
      await join(rejoin.id, contactId, "unsubscribed");
      await join(internal.id, contactId);
      await join(hiddenLeft.id, contactId, "unsubscribed");

      const saved = await save(token, {
        listIds: [
          stay.id,
          joinNew.id,
          rejoin.id.toUpperCase(),
          hidden.id,
          hiddenLeft.id,
          foreign.id,
          randomUUID(),
        ],
      });
      expect(await memberStatus(stay.id, contactId)).toBe("subscribed");
      expect(await memberStatus(leave.id, contactId)).toBe("unsubscribed");
      expect(await memberStatus(joinNew.id, contactId)).toBe("subscribed");
      expect(await memberStatus(rejoin.id, contactId)).toBe("subscribed");
      expect(await memberStatus(internal.id, contactId)).toBe("unsubscribed");
      expect(await memberStatus(hidden.id, contactId)).toBeNull();
      expect(await memberStatus(hiddenLeft.id, contactId)).toBe("unsubscribed");
      expect(await memberStatus(foreign.id, contactId)).toBeNull();
      const state = new Map(saved.lists.map((list) => [list.id, list]));
      expect(state.get(stay.id)?.subscribed).toBe(true);
      expect(state.get(leave.id)?.subscribed).toBe(false);
      expect(state.get(joinNew.id)?.subscribed).toBe(true);
      expect(state.has(internal.id)).toBe(false);
      expect(state.has(hidden.id)).toBe(false);
      expect(saved.unsubscribedFromAll).toBe(false);
      expect(await suppressionsFor(email)).toEqual([]);

      const repeated = await save(token, { listIds: [stay.id] });
      expect(repeated.lists.find((list) => list.id === stay.id)).toMatchObject({
        subscribed: true,
      });
      expect(await memberStatus(joinNew.id, contactId)).toBe("unsubscribed");
    });

    it("never lets one token change another contact", async () => {
      const mine = await reader();
      const theirs = await reader();
      const shared = await createList("Shared", { isPublic: true });
      await join(shared.id, mine.contactId);
      await join(shared.id, theirs.contactId);

      await save(mine.token, { listIds: [], contactId: theirs.contactId });
      expect(await memberStatus(shared.id, mine.contactId)).toBe(
        "unsubscribed",
      );
      expect(await memberStatus(shared.id, theirs.contactId)).toBe(
        "subscribed",
      );
      await save(mine.token, {
        unsubscribeAll: true,
        email: theirs.email,
      });
      expect(await suppressionsFor(theirs.email)).toEqual([]);
      expect(await suppressionsFor(mine.email)).toHaveLength(1);
      expect((await read(theirs.token)).unsubscribedFromAll).toBe(false);
    });

    it("keeps workspaces apart", async () => {
      const email = `shared-${randomUUID()}@example.com`;
      const here = await createContact(email);
      const there = await createContact(email, other);
      const hereList = await createList("Here", { isPublic: true });
      const thereList = await createList("There", { isPublic: true }, other);
      await join(thereList.id, there, "subscribed", other);
      const { token } = await createMessage(email, here);

      const page = await read(token);
      expect(page.lists.some((list) => list.id === thereList.id)).toBe(false);
      await save(token, { listIds: [hereList.id, thereList.id] });
      expect(await memberStatus(hereList.id, here)).toBe("subscribed");
      expect(await memberStatus(hereList.id, there)).toBeNull();
      await save(token, { unsubscribeAll: true });
      expect(await memberStatus(thereList.id, there)).toBe("subscribed");
      expect(await suppressionsFor(email, other)).toEqual([]);
      expect(await suppressionsFor(email)).toHaveLength(1);
    });

    it("unsubscribes from everything, and subscribing to a list again lifts it", async () => {
      const { email, contactId, token, id } = await reader();
      const list = await createList("News", { isPublic: true });
      await join(list.id, contactId);

      const stopped = await save(token, {
        unsubscribeAll: true,
        listIds: [list.id],
      });
      expect(stopped.unsubscribedFromAll).toBe(true);
      expect(await suppressionsFor(email)).toEqual([
        { reason: "unsubscribed", origin: "user" },
      ]);
      expect(await memberStatus(list.id, contactId)).toBe("subscribed");
      const events = await dispatch.listEvents(workspace.workspaceId, id);
      expect(
        events.filter((event) => event.type === "unsubscribed"),
      ).toHaveLength(1);
      await save(token, { unsubscribeAll: true });
      expect(await suppressionsFor(email)).toHaveLength(1);

      const none = await save(token, { listIds: [] });
      expect(none.unsubscribedFromAll).toBe(true);

      const back = await save(token, { listIds: [list.id] });
      expect(back.unsubscribedFromAll).toBe(false);
      expect(await suppressionsFor(email)).toEqual([]);
      expect(await memberStatus(list.id, contactId)).toBe("subscribed");
    });

    it("never lifts a bounce, a complaint or a manual block", async () => {
      for (const reason of ["bounced", "complained", "manual"]) {
        const { email, contactId, token } = await reader();
        const list = await createList("Blocked", { isPublic: true });
        await db.insert(schema.suppressions).values({
          workspaceId: workspace.workspaceId,
          email,
          reason,
          origin: "webhook",
        });
        const saved = await save(token, { listIds: [list.id] });
        expect(saved.unsubscribedFromAll).toBe(true);
        expect(await memberStatus(list.id, contactId)).toBe("subscribed");
        expect((await suppressionsFor(email)).map((row) => row.reason)).toEqual(
          [reason],
        );
      }
    });

    it("validates the body", async () => {
      const { token } = await reader();
      for (const payload of [
        { listIds: "all" },
        { listIds: ["nope"] },
        { listIds: [7] },
        { unsubscribeAll: "yes" },
        { listIds: Array.from({ length: 201 }, () => randomUUID()) },
      ]) {
        const response = await visit(
          "POST",
          `/v1/public/preferences/${token}`,
          { payload },
        );
        expect(response.statusCode).toBe(400);
        expect(response.json().code).toBe("validation");
      }
    });
  });

  describe("a contact that is gone", () => {
    it("shows a neutral page and can still unsubscribe the address", async () => {
      const { email, contactId, token } = await reader();
      const list = await createList("Public", { isPublic: true });
      await join(list.id, contactId);
      await db
        .delete(schema.contacts)
        .where(inArray(schema.contacts.id, [contactId]));

      const page = await read(token);
      expect(page).toEqual({
        email: "r***@example.com",
        brandName: "Northwind Traders",
        lists: [],
        unsubscribedFromAll: false,
        contactFound: false,
      });
      const ignored = await save(token, { listIds: [list.id] });
      expect(ignored.lists).toEqual([]);
      expect(await memberStatus(list.id, contactId)).toBeNull();

      const stopped = await save(token, { unsubscribeAll: true });
      expect(stopped).toMatchObject({
        unsubscribedFromAll: true,
        contactFound: false,
      });
      expect(await suppressionsFor(email)).toHaveLength(1);
    });

    it("does not act on a contact whose address changed, or on a message with no contact", async () => {
      const { contactId, token } = await reader();
      const list = await createList("Moved", { isPublic: true });
      await join(list.id, contactId);
      await db
        .update(schema.contacts)
        .set({ email: `moved-${randomUUID()}@example.com` })
        .where(eq(schema.contacts.id, contactId));
      const page = await read(token);
      expect(page).toMatchObject({ lists: [], contactFound: false });
      await save(token, { listIds: [] });
      expect(await memberStatus(list.id, contactId)).toBe("subscribed");

      const loose = await createMessage(
        `nobody-${randomUUID()}@example.com`,
        null,
      );
      expect(await read(loose.token)).toMatchObject({
        lists: [],
        contactFound: false,
      });
    });
  });
});
