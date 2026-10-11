import { randomInt, randomUUID } from "node:crypto";
import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { and, type Db, eq, inArray, schema } from "@workspace/db";
import {
  clickSignature,
  messageToken,
  prepareEmail,
  signToken,
} from "@workspace/email-renderer";
import { AppModule } from "../src/app/app.module";
import { uuidv7, uuidv7Date } from "../src/common/uuid";
import { DATABASE } from "../src/infra/database/database.module";
import { REDIS, type Redis } from "../src/infra/redis/redis.module";
import { TrackingKeys } from "../src/infra/tracking-keys/tracking-keys";
import { DispatchService } from "../src/modules/dispatch/dispatch.service";
import {
  TrackingRateLimiter,
  trackingRateLimits,
} from "../src/modules/tracking/tracking.rate-limiter";

const browser =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const imageProxy =
  "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)";
const target = "https://example.com/pricing?plan=pro&ref=email#top";

type MessageOptions = {
  email?: string;
  contactId?: string | null;
  listId?: string | null;
  sentSecondsAgo?: number | null;
  fromName?: string | null;
};

describe("Tracking and unsubscribe (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let redis: Redis;
  let dispatch: DispatchService;
  let secret: Buffer;
  let workspaceId: string;
  let sourceId: string;
  const network = `10.${randomInt(1, 250)}.${randomInt(1, 250)}`;
  let host = 0;

  function freshIp() {
    host += 1;
    return `${network}.${host}`;
  }

  function request(
    method: "GET" | "POST" | "HEAD",
    url: string,
    options: {
      userAgent?: string | null;
      ip?: string;
      payload?: string | object;
      contentType?: string;
    } = {},
  ) {
    const headers: Record<string, string> = {
      "x-forwarded-for": options.ip ?? freshIp(),
    };
    headers["user-agent"] =
      options.userAgent === null ? "" : (options.userAgent ?? browser);
    if (options.contentType) {
      headers["content-type"] = options.contentType;
    }
    return app.inject({ method, url, headers, payload: options.payload });
  }

  async function createContact(email: string) {
    const [contact] = await db
      .insert(schema.contacts)
      .values({ workspaceId, email })
      .returning({ id: schema.contacts.id });
    if (!contact) {
      throw new Error("The test contact was not created.");
    }
    return contact.id;
  }

  async function createList(name: string, contactIds: string[]) {
    const [list] = await db
      .insert(schema.lists)
      .values({ workspaceId, name: `${name} ${randomUUID()}` })
      .returning({ id: schema.lists.id, name: schema.lists.name });
    if (!list) {
      throw new Error("The test list was not created.");
    }
    if (contactIds.length > 0) {
      await db.insert(schema.listMembers).values(
        contactIds.map((contactId) => ({
          workspaceId,
          listId: list.id,
          contactId,
          status: "subscribed",
          subscribedAt: new Date(),
        })),
      );
    }
    return list;
  }

  async function createMessage(options: MessageOptions = {}) {
    const createdAt = new Date(Date.now() - 60_000);
    const id = uuidv7(createdAt);
    const seconds =
      options.sentSecondsAgo === undefined ? 30 : options.sentSecondsAgo;
    await db.insert(schema.messages).values({
      id,
      createdAt: uuidv7Date(id) ?? createdAt,
      workspaceId,
      sourceId,
      kind: "campaign",
      status: seconds === null ? "queued" : "sent",
      fromEmail: "hello@northwind.example",
      fromName: options.fromName === undefined ? "Northwind" : options.fromName,
      toEmails: [options.email ?? `reader-${randomUUID()}@example.com`],
      subject: "News",
      sentAt: seconds === null ? null : new Date(Date.now() - seconds * 1000),
      contactId: options.contactId ?? null,
      unsubscribeListId: options.listId ?? null,
      trackOpens: true,
      trackClicks: true,
    });
    return { id, token: messageToken(id, secret) };
  }

  async function subscriber(listName = "Weekly news") {
    const email = `reader-${randomUUID()}@example.com`;
    const contactId = await createContact(email);
    const list = await createList(listName, [contactId]);
    const message = await createMessage({
      email,
      contactId,
      listId: list.id,
    });
    return { email, contactId, list, ...message };
  }

  function clickUrl(token: string, messageId: string, url = target) {
    const u = Buffer.from(url, "utf8").toString("base64url");
    return `/v1/t/c/${token}?u=${u}&s=${clickSignature(messageId, url, secret)}`;
  }

  async function events(messageId: string) {
    return dispatch.listEvents(workspaceId, messageId);
  }

  async function eventually(messageId: string, type: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const found = (await events(messageId)).filter(
        (event) => event.type === type,
      );
      if (found.length > 0) {
        return found;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`No ${type} event was recorded in time.`);
  }

  async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 250));
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

  async function suppressionsFor(email: string) {
    return db
      .select({
        reason: schema.suppressions.reason,
        origin: schema.suppressions.origin,
        messageId: schema.suppressions.messageId,
      })
      .from(schema.suppressions)
      .where(
        and(
          eq(schema.suppressions.workspaceId, workspaceId),
          eq(schema.suppressions.email, email),
        ),
      );
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
    redis = app.get<Redis>(REDIS);
    dispatch = app.get(DispatchService);
    secret = app.get(TrackingKeys).secret;

    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ name: "Tracking e2e", slug: `tracking-e2e-${randomUUID()}` })
      .returning({ id: schema.workspaces.id });
    if (!workspace) {
      throw new Error("The test workspace was not created.");
    }
    workspaceId = workspace.id;
    const [source] = await db
      .insert(schema.sendingSources)
      .values({
        workspaceId,
        integrationType: "resend",
        name: "Tracking e2e source",
      })
      .returning({ id: schema.sendingSources.id });
    if (!source) {
      throw new Error("The test source was not created.");
    }
    sourceId = source.id;
  });

  afterAll(async () => {
    await db
      .delete(schema.workspaces)
      .where(inArray(schema.workspaces.id, [workspaceId]));
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("configuration", () => {
    it("derives the public address and a 32 byte key", () => {
      const keys = app.get(TrackingKeys);
      expect(keys.baseUrl).toBe("http://localhost:3000/api/v1");
      expect(keys.secret).toHaveLength(32);
      expect(keys.secret.toString("utf8")).not.toContain("test-only-secret");
    });
  });

  describe("links written by prepareEmail", () => {
    it("reach the pixel, the redirect and the unsubscribe page", async () => {
      const keys = app.get(TrackingKeys);
      const message = await createMessage();
      const prepared = prepareEmail({
        html: '<body><a href="https://example.com/a?b=1&amp;c=2">Read</a></body>',
        text: null,
        variables: {},
        messageToken: message.token,
        baseUrl: keys.baseUrl,
        secret: keys.secret,
        trackOpens: true,
        trackClicks: true,
        unsubscribe: true,
      });
      const path = (url: string) =>
        url.replaceAll("&amp;", "&").replace(keys.baseUrl, "/v1");
      const link = /<a href="([^"]+)">Read/.exec(prepared.html ?? "")?.[1];
      const image = /<img src="([^"]+)"/.exec(prepared.html ?? "")?.[1];
      const header = /^<(.+)>$/.exec(
        prepared.headers["List-Unsubscribe"] ?? "",
      )?.[1];
      const click = await request("GET", path(link ?? ""));
      expect(click.statusCode).toBe(302);
      expect(click.headers.location).toBe("https://example.com/a?b=1&c=2");
      const open = await request("GET", path(image ?? ""));
      expect(open.headers["content-type"]).toBe("image/gif");
      const page = await request("GET", path(header ?? ""));
      expect(page.statusCode).toBe(302);
      const oneClick = await request("POST", path(header ?? ""), {
        payload: prepared.headers["List-Unsubscribe-Post"],
        contentType: "application/x-www-form-urlencoded",
      });
      expect(oneClick.statusCode).toBe(200);
      await eventually(message.id, "clicked");
      await eventually(message.id, "unsubscribed");
    });
  });

  describe("open pixel", () => {
    it("serves a gif without a session and records the open", async () => {
      const message = await createMessage();
      const response = await request("GET", `/v1/t/o/${message.token}.gif`, {
        userAgent: imageProxy,
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("image/gif");
      expect(response.headers["cache-control"]).toContain("no-store");
      expect(response.rawPayload.subarray(0, 6).toString("latin1")).toBe(
        "GIF89a",
      );
      const [opened] = await eventually(message.id, "opened");
      expect(opened?.userAgent).toBe(imageProxy);
      const stored = await dispatch.get(workspaceId, message.id);
      expect(stored.openCount).toBe(1);
      expect(stored.openedAt).not.toBeNull();
    });

    it("counts a second open without a second first open", async () => {
      const message = await createMessage();
      await request("GET", `/v1/t/o/${message.token}.gif`);
      await eventually(message.id, "opened");
      await request("GET", `/v1/t/o/${message.token}.gif`);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((await dispatch.get(workspaceId, message.id)).openCount === 2) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const stored = await dispatch.get(workspaceId, message.id);
      expect(stored.openCount).toBe(2);
    });

    it("serves the gif for a bad token and records nothing", async () => {
      const message = await createMessage();
      const changed = `${message.token.slice(0, -2)}${
        message.token.endsWith("AA") ? "BB" : "AA"
      }`;
      for (const token of [
        changed,
        "nope",
        signToken("not a message", secret),
        messageToken(message.id, Buffer.alloc(32, 1)),
      ]) {
        const response = await request("GET", `/v1/t/o/${token}.gif`);
        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toBe("image/gif");
      }
      await settle();
      expect(await events(message.id)).toEqual([]);
    });

    it("serves the gif for a message that does not exist", async () => {
      const token = messageToken(uuidv7(), secret);
      const response = await request("GET", `/v1/t/o/${token}.gif`);
      expect(response.statusCode).toBe(200);
    });

    it("does not record scanners, missing user agents or HEAD requests", async () => {
      const message = await createMessage();
      for (const userAgent of [
        "Mozilla/5.0 (compatible; Proofpoint Essentials)",
        "python-requests/2.31",
        "Mozilla/5.0 (compatible; SomeBot/1.0)",
        "curl/8.4.0",
        null,
      ]) {
        const response = await request("GET", `/v1/t/o/${message.token}.gif`, {
          userAgent,
        });
        expect(response.statusCode).toBe(200);
      }
      const head = await request("HEAD", `/v1/t/o/${message.token}.gif`);
      expect(head.statusCode).toBe(200);
      await settle();
      expect(await events(message.id)).toEqual([]);
    });

    it("does not record a hit right after the send, or before it", async () => {
      const justSent = await createMessage({ sentSecondsAgo: 0 });
      const notSent = await createMessage({ sentSecondsAgo: null });
      for (const message of [justSent, notSent]) {
        const response = await request("GET", `/v1/t/o/${message.token}.gif`);
        expect(response.statusCode).toBe(200);
      }
      await settle();
      expect(await events(justSent.id)).toEqual([]);
      expect(await events(notSent.id)).toEqual([]);
    });

    it("still serves the gif when recording fails", async () => {
      const message = await createMessage();
      vi.spyOn(dispatch, "recordEvent").mockRejectedValue(new Error("down"));
      const response = await request("GET", `/v1/t/o/${message.token}.gif`);
      expect(response.statusCode).toBe(200);
      await settle();
    });
  });

  describe("tracked links", () => {
    it("redirects to the signed address and records the click", async () => {
      const message = await createMessage();
      const response = await request(
        "GET",
        clickUrl(message.token, message.id),
      );
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(target);
      expect(response.headers["cache-control"]).toContain("no-store");
      const [clicked] = await eventually(message.id, "clicked");
      expect(clicked?.url).toBe(target);
      const stored = await dispatch.get(workspaceId, message.id);
      expect(stored.clickCount).toBe(1);
      expect(stored.openedAt).not.toBeNull();
    });

    it("sends a non ASCII address in a form a header can carry", async () => {
      const message = await createMessage();
      const url = "https://example.com/café?q=a b";
      const response = await request(
        "GET",
        clickUrl(message.token, message.id, url),
      );
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(new URL(url).href);
    });

    it("answers 404 and never redirects for a bad signature", async () => {
      const message = await createMessage();
      const other = await createMessage();
      const good = clickUrl(message.token, message.id);
      const evil = Buffer.from("https://evil.example/", "utf8").toString(
        "base64url",
      );
      const signature = clickSignature(message.id, target, secret);
      const attempts = [
        `/v1/t/c/${message.token}?u=${evil}&s=${signature}`,
        `/v1/t/c/${message.token}?u=${evil}`,
        `/v1/t/c/${message.token}?s=${signature}`,
        `/v1/t/c/${message.token}`,
        `/v1/t/c/${message.token}?u=${evil}&s=`,
        `/v1/t/c/${message.token}?u=${evil}&s=${"A".repeat(22)}`,
        `/v1/t/c/${message.token}?u=${evil}&s=${message.token}`,
        `/v1/t/c/${message.token}?u=${evil}&u=${evil}&s=${signature}&s=x`,
        `${good}x`,
        good.replace(message.token, other.token),
        good.replace(message.token, "nope"),
        good.replace(
          message.token,
          messageToken(message.id, Buffer.alloc(32, 1)),
        ),
        `/v1/t/c/${message.token}?u=https://evil.example/&s=${signature}`,
        `/v1/t/c/${message.token}?u=${evil}&s=${clickSignature(other.id, "https://evil.example/", secret)}`,
      ];
      for (const url of attempts) {
        const response = await request("GET", url);
        expect(response.statusCode, url).toBe(404);
        expect(response.headers.location, url).toBeUndefined();
      }
      await settle();
      expect(await events(message.id)).toEqual([]);
    });

    it("never redirects to an address that is not http or https", async () => {
      const message = await createMessage();
      for (const url of [
        "javascript:alert(1)",
        "data:text/html,hi",
        "ftp://example.com/x",
        "//evil.example/",
        "/relative",
        "not a url",
        "",
      ]) {
        const response = await request(
          "GET",
          clickUrl(message.token, message.id, url),
        );
        expect(response.statusCode, url).toBe(404);
        expect(response.headers.location, url).toBeUndefined();
      }
    });

    it("redirects a scanner without recording a click", async () => {
      const message = await createMessage();
      for (const userAgent of [
        "Mozilla/5.0 (compatible; Barracuda Sentinel)",
        "Mimecast-URL-Scanner",
        null,
      ]) {
        const response = await request(
          "GET",
          clickUrl(message.token, message.id),
          { userAgent },
        );
        expect(response.statusCode).toBe(302);
        expect(response.headers.location).toBe(target);
      }
      const head = await request("HEAD", clickUrl(message.token, message.id));
      expect(head.statusCode).toBe(302);
      await settle();
      expect(await events(message.id)).toEqual([]);
    });

    it("redirects but does not record within two seconds of the send", async () => {
      const message = await createMessage({ sentSecondsAgo: 0 });
      const response = await request(
        "GET",
        clickUrl(message.token, message.id),
      );
      expect(response.statusCode).toBe(302);
      await settle();
      expect(await events(message.id)).toEqual([]);
    });

    it("still redirects when recording fails", async () => {
      const message = await createMessage();
      vi.spyOn(dispatch, "recordEvent").mockRejectedValue(new Error("down"));
      const response = await request(
        "GET",
        clickUrl(message.token, message.id),
      );
      expect(response.statusCode).toBe(302);
      await settle();
    });
  });

  describe("unsubscribe link", () => {
    it("redirects to the web page and changes nothing", async () => {
      const reader = await subscriber();
      const response = await request("GET", `/v1/t/u/${reader.token}`);
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(
        `http://localhost:3000/unsubscribe/${reader.token}`,
      );
      expect(await memberStatus(reader.list.id, reader.contactId)).toBe(
        "subscribed",
      );
      expect(await suppressionsFor(reader.email)).toEqual([]);
    });

    it("answers 404 for a token that is not valid", async () => {
      for (const token of ["nope", signToken("x", secret), "..%2f..%2fapp"]) {
        const response = await request("GET", `/v1/t/u/${token}`);
        expect(response.statusCode).toBe(404);
        expect(response.headers.location).toBeUndefined();
      }
    });
  });

  describe("unsubscribe details", () => {
    it("shows the masked address, the sender and the list", async () => {
      const reader = await subscriber("Product news");
      const response = await request("GET", `/v1/t/u/${reader.token}/details`);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        email: `r***@example.com`,
        brandName: "Northwind",
        listName: reader.list.name,
        alreadyUnsubscribed: false,
      });
      expect(response.body).not.toContain(reader.email);
    });

    it("prefers the brand name from the brand settings", async () => {
      const reader = await subscriber();
      await db
        .insert(schema.workspaceBrandSettings)
        .values({ workspaceId, brandName: "Northwind Traders" });
      try {
        const response = await request(
          "GET",
          `/v1/t/u/${reader.token}/details`,
        );
        expect(response.json().brandName).toBe("Northwind Traders");
      } finally {
        await db
          .delete(schema.workspaceBrandSettings)
          .where(eq(schema.workspaceBrandSettings.workspaceId, workspaceId));
      }
    });

    it("has no list for a message sent without one", async () => {
      const message = await createMessage({ fromName: null });
      const response = await request("GET", `/v1/t/u/${message.token}/details`);
      expect(response.json()).toMatchObject({
        brandName: "",
        listName: null,
        alreadyUnsubscribed: false,
      });
    });

    it("answers 404 for a bad token or a message that is gone", async () => {
      for (const token of ["nope", messageToken(uuidv7(), secret)]) {
        const details = await request("GET", `/v1/t/u/${token}/details`);
        expect(details.statusCode).toBe(404);
        expect(details.json()).toMatchObject({ code: "not_found" });
        const confirm = await request("POST", `/v1/t/u/${token}/confirm`, {
          payload: { scope: "all" },
        });
        expect(confirm.statusCode).toBe(404);
        const undo = await request("POST", `/v1/t/u/${token}/resubscribe`);
        expect(undo.statusCode).toBe(404);
        const oneClick = await request("POST", `/v1/t/u/${token}`, {
          payload: "List-Unsubscribe=One-Click",
          contentType: "application/x-www-form-urlencoded",
        });
        expect(oneClick.statusCode).toBe(404);
      }
    });
  });

  describe("one-click unsubscribe", () => {
    it("takes the form post mail clients send and leaves the list", async () => {
      const reader = await subscriber();
      const response = await request("POST", `/v1/t/u/${reader.token}`, {
        payload: "List-Unsubscribe=One-Click",
        contentType: "application/x-www-form-urlencoded",
        userAgent: null,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({});
      expect(await memberStatus(reader.list.id, reader.contactId)).toBe(
        "unsubscribed",
      );
      expect(await suppressionsFor(reader.email)).toEqual([]);
      const recorded = await eventually(reader.id, "unsubscribed");
      expect(recorded).toHaveLength(1);
      expect(recorded[0]?.metadata).toEqual({ scope: "list" });
      const stored = await dispatch.get(workspaceId, reader.id);
      expect(stored.unsubscribedAt).not.toBeNull();
    });

    it("accepts multipart, json and empty bodies", async () => {
      const bodies = [
        {
          payload:
            '--x\r\nContent-Disposition: form-data; name="List-Unsubscribe"\r\n\r\nOne-Click\r\n--x--\r\n',
          contentType: "multipart/form-data; boundary=x",
        },
        { payload: "{not json", contentType: "application/json" },
        {},
      ];
      for (const body of bodies) {
        const reader = await subscriber();
        const response = await request("POST", `/v1/t/u/${reader.token}`, body);
        expect(response.statusCode).toBe(200);
        expect(await memberStatus(reader.list.id, reader.contactId)).toBe(
          "unsubscribed",
        );
      }
    });

    it("is safe to repeat", async () => {
      const reader = await subscriber();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await request("POST", `/v1/t/u/${reader.token}`, {
          payload: "List-Unsubscribe=One-Click",
          contentType: "application/x-www-form-urlencoded",
        });
        expect(response.statusCode).toBe(200);
      }
      expect(await eventually(reader.id, "unsubscribed")).toHaveLength(1);
    });

    it("suppresses the address when the message had no list", async () => {
      const email = `reader-${randomUUID()}@example.com`;
      const message = await createMessage({ email });
      const response = await request("POST", `/v1/t/u/${message.token}`, {
        payload: "List-Unsubscribe=One-Click",
        contentType: "application/x-www-form-urlencoded",
      });
      expect(response.statusCode).toBe(200);
      expect(await suppressionsFor(email)).toEqual([
        { reason: "unsubscribed", origin: "user", messageId: message.id },
      ]);
      const [recorded] = await eventually(message.id, "unsubscribed");
      expect(recorded?.metadata).toEqual({ scope: "all" });
    });

    it("rejects a body that is too large", async () => {
      const reader = await subscriber();
      const response = await request("POST", `/v1/t/u/${reader.token}`, {
        payload: "a".repeat(64 * 1024),
        contentType: "application/x-www-form-urlencoded",
      });
      expect(response.statusCode).toBe(413);
      expect(await memberStatus(reader.list.id, reader.contactId)).toBe(
        "subscribed",
      );
    });
  });

  describe("confirm and resubscribe", () => {
    it("leaves only the list for scope list", async () => {
      const reader = await subscriber();
      const response = await request(
        "POST",
        `/v1/t/u/${reader.token}/confirm`,
        {
          payload: { scope: "list" },
        },
      );
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      expect(await memberStatus(reader.list.id, reader.contactId)).toBe(
        "unsubscribed",
      );
      expect(await suppressionsFor(reader.email)).toEqual([]);
      const details = await request("GET", `/v1/t/u/${reader.token}/details`);
      expect(details.json().alreadyUnsubscribed).toBe(true);
    });

    it("uses the list when no scope is given", async () => {
      const reader = await subscriber();
      const response = await request("POST", `/v1/t/u/${reader.token}/confirm`);
      expect(response.statusCode).toBe(200);
      expect(await memberStatus(reader.list.id, reader.contactId)).toBe(
        "unsubscribed",
      );
      expect(await suppressionsFor(reader.email)).toEqual([]);
    });

    it("suppresses the address for scope all and keeps the list membership", async () => {
      const reader = await subscriber();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await request(
          "POST",
          `/v1/t/u/${reader.token}/confirm`,
          { payload: { scope: "all" } },
        );
        expect(response.statusCode).toBe(200);
      }
      expect(await suppressionsFor(reader.email)).toEqual([
        { reason: "unsubscribed", origin: "user", messageId: reader.id },
      ]);
      expect(await memberStatus(reader.list.id, reader.contactId)).toBe(
        "subscribed",
      );
      const [recorded] = await eventually(reader.id, "unsubscribed");
      expect(recorded?.metadata).toEqual({ scope: "all" });
      const details = await request("GET", `/v1/t/u/${reader.token}/details`);
      expect(details.json().alreadyUnsubscribed).toBe(true);
    });

    it("rejects a scope it does not know", async () => {
      const reader = await subscriber();
      const response = await request(
        "POST",
        `/v1/t/u/${reader.token}/confirm`,
        {
          payload: { scope: "everything" },
        },
      );
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: "validation",
        field: "scope",
      });
      expect(await memberStatus(reader.list.id, reader.contactId)).toBe(
        "subscribed",
      );
    });

    it("falls back to the address when the list was deleted", async () => {
      const reader = await subscriber();
      await db.delete(schema.lists).where(eq(schema.lists.id, reader.list.id));
      const details = await request("GET", `/v1/t/u/${reader.token}/details`);
      expect(details.json()).toMatchObject({
        listName: null,
        alreadyUnsubscribed: false,
      });
      const response = await request(
        "POST",
        `/v1/t/u/${reader.token}/confirm`,
        {
          payload: { scope: "list" },
        },
      );
      expect(response.statusCode).toBe(200);
      expect(await suppressionsFor(reader.email)).toEqual([
        { reason: "unsubscribed", origin: "user", messageId: reader.id },
      ]);
    });

    it("works when the contact no longer exists", async () => {
      const reader = await subscriber();
      await db
        .delete(schema.contacts)
        .where(eq(schema.contacts.id, reader.contactId));
      const details = await request("GET", `/v1/t/u/${reader.token}/details`);
      expect(details.statusCode).toBe(200);
      expect(details.json().listName).toBeNull();
      const oneClick = await request("POST", `/v1/t/u/${reader.token}`, {
        payload: "List-Unsubscribe=One-Click",
        contentType: "application/x-www-form-urlencoded",
      });
      expect(oneClick.statusCode).toBe(200);
      expect(await suppressionsFor(reader.email)).toEqual([
        { reason: "unsubscribed", origin: "user", messageId: reader.id },
      ]);
      const undo = await request("POST", `/v1/t/u/${reader.token}/resubscribe`);
      expect(undo.statusCode).toBe(200);
      expect(await suppressionsFor(reader.email)).toEqual([]);
    });

    it("undoes a list unsubscribe and an address unsubscribe", async () => {
      const reader = await subscriber();
      await request("POST", `/v1/t/u/${reader.token}/confirm`, {
        payload: { scope: "list" },
      });
      await request("POST", `/v1/t/u/${reader.token}/confirm`, {
        payload: { scope: "all" },
      });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await request(
          "POST",
          `/v1/t/u/${reader.token}/resubscribe`,
        );
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ ok: true });
      }
      expect(await memberStatus(reader.list.id, reader.contactId)).toBe(
        "subscribed",
      );
      expect(await suppressionsFor(reader.email)).toEqual([]);
      const details = await request("GET", `/v1/t/u/${reader.token}/details`);
      expect(details.json().alreadyUnsubscribed).toBe(false);
    });

    it("never lifts a bounce, a complaint or a manual block", async () => {
      const reader = await subscriber();
      await db.insert(schema.suppressions).values(
        ["bounced", "complained", "manual"].map((reason) => ({
          workspaceId,
          email: reader.email,
          reason,
          origin: "webhook",
        })),
      );
      await request("POST", `/v1/t/u/${reader.token}/confirm`, {
        payload: { scope: "all" },
      });
      const response = await request(
        "POST",
        `/v1/t/u/${reader.token}/resubscribe`,
      );
      expect(response.statusCode).toBe(200);
      const left = (await suppressionsFor(reader.email)).map(
        (row) => row.reason,
      );
      expect(left.sort()).toEqual(["bounced", "complained", "manual"]);
    });

    it("does not touch another address that starts the same way", async () => {
      const reader = await subscriber();
      const longer = `${reader.email}.uk`;
      await db.insert(schema.suppressions).values({
        workspaceId,
        email: longer,
        reason: "unsubscribed",
        origin: "user",
      });
      await request("POST", `/v1/t/u/${reader.token}/confirm`, {
        payload: { scope: "all" },
      });
      await request("POST", `/v1/t/u/${reader.token}/resubscribe`);
      expect(await suppressionsFor(reader.email)).toEqual([]);
      expect(await suppressionsFor(longer)).toHaveLength(1);
    });
  });

  describe("rate limiting", () => {
    it("limits the unsubscribe page endpoints per address", async () => {
      const reader = await subscriber();
      const ip = freshIp();
      const statuses: number[] = [];
      for (
        let attempt = 0;
        attempt < trackingRateLimits.page + 2;
        attempt += 1
      ) {
        const response = await request(
          "GET",
          `/v1/t/u/${reader.token}/details`,
          { ip },
        );
        statuses.push(response.statusCode);
      }
      expect(statuses.slice(0, trackingRateLimits.page)).toEqual(
        new Array(trackingRateLimits.page).fill(200),
      );
      expect(statuses.slice(trackingRateLimits.page)).toEqual([429, 429]);
      const blocked = await request("POST", `/v1/t/u/${reader.token}/confirm`, {
        ip,
        payload: { scope: "all" },
      });
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json()).toMatchObject({ code: "rate_limited" });
      expect(await suppressionsFor(reader.email)).toEqual([]);
      const elsewhere = await request("GET", `/v1/t/u/${reader.token}/details`);
      expect(elsewhere.statusCode).toBe(200);
    });

    it("uses the nearest forwarded address, not one the caller claims", async () => {
      const reader = await subscriber();
      const real = freshIp();
      const limiter = app.get(TrackingRateLimiter);
      const take = vi.spyOn(limiter, "take");
      await request("GET", `/v1/t/u/${reader.token}/details`, {
        ip: `203.0.113.7, ${real}`,
      });
      expect(take).toHaveBeenCalledWith("page", real);
    });

    it("limits one-click posts with their own, larger allowance", async () => {
      const reader = await subscriber();
      const limiter = app.get(TrackingRateLimiter);
      vi.spyOn(limiter, "take").mockImplementation(
        async (group) => group !== "one-click",
      );
      const response = await request("POST", `/v1/t/u/${reader.token}`, {
        payload: "List-Unsubscribe=One-Click",
        contentType: "application/x-www-form-urlencoded",
      });
      expect(response.statusCode).toBe(429);
      expect(await memberStatus(reader.list.id, reader.contactId)).toBe(
        "subscribed",
      );
      expect(trackingRateLimits["one-click"]).toBeGreaterThan(
        trackingRateLimits.page,
      );
    });

    it("keeps serving pixels and redirects over the limit, without recording", async () => {
      const message = await createMessage();
      const limiter = app.get(TrackingRateLimiter);
      vi.spyOn(limiter, "take").mockResolvedValue(false);
      const open = await request("GET", `/v1/t/o/${message.token}.gif`);
      expect(open.statusCode).toBe(200);
      const click = await request("GET", clickUrl(message.token, message.id));
      expect(click.statusCode).toBe(302);
      await settle();
      expect(await events(message.id)).toEqual([]);
    });

    it("counts event hits in redis without storing the address", async () => {
      const message = await createMessage();
      const ip = freshIp();
      await request("GET", `/v1/t/o/${message.token}.gif`, { ip });
      await eventually(message.id, "opened");
      const keys = await redis.keys("opencadence:tracking-rate:*");
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.some((key) => key.includes(ip))).toBe(false);
      const [opened] = await events(message.id);
      expect(JSON.stringify(opened)).not.toContain(ip);
    });
  });
});
