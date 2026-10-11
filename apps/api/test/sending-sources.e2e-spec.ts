import { createHmac, randomUUID } from "node:crypto";
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
import { AdapterRegistry } from "../src/modules/integrations/adapter-registry";
import {
  type Actor,
  SendingSourcesService,
} from "../src/modules/integrations/sending-sources.service";

const signingSecret = `whsec_${Buffer.from("test-signing-secret").toString("base64")}`;
const goodKey = "re_test_full_access_1234";

function fakeResend() {
  const real = createResendAdapter();
  const sent: string[] = [];
  const adapter: IntegrationAdapter = {
    ...real,
    async verify(credentials: Credentials) {
      if (credentials.kind !== "api_key" || credentials.apiKey !== goodKey) {
        throw new IntegrationError(
          "invalid_credentials",
          "Resend rejected the API key.",
        );
      }
      return {
        account: {},
        settings: {
          permission: "full",
          domains: [{ id: "d1", name: "example.com", status: "verified" }],
        },
      };
    },
    async send(_credentials, message) {
      if (message.from.email.endsWith("@unverified.test")) {
        throw new IntegrationError(
          "domain_not_verified",
          "The sending domain is not verified in this Resend account.",
        );
      }
      sent.push(message.to[0] ?? "");
      return { providerMessageId: `email_${sent.length}` };
    },
    webhooks: {
      register: async () => ({ externalId: "wh_1", signingSecret }),
      unregister: async () => undefined,
      parse: (request) => {
        if (!real.webhooks) {
          throw new Error("The adapter has no webhook support.");
        }
        return real.webhooks.parse(request);
      },
    },
  };
  return { adapter, sent };
}

function signedWebhook(id: string, payload: object) {
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac(
    "sha256",
    Buffer.from(signingSecret.slice("whsec_".length), "base64"),
  )
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return {
    rawBody,
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
  };
}

describe("Sending sources (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let service: SendingSourcesService;
  let actor: Actor;
  const fake = fakeResend();

  beforeAll(async () => {
    process.env.WEBHOOK_BASE_URL = "https://mail.example.com";
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AdapterRegistry)
      .useValue({
        find: (type: string) => (type === "resend" ? fake.adapter : null),
        has: (type: string) => type === "resend",
      })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { bodyParser: false },
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = app.get<Db>(DATABASE);
    service = app.get(SendingSourcesService);
    const [workspace] = await db
      .insert(schema.workspaces)
      .values({
        name: "Sending sources e2e",
        slug: `sending-sources-e2e-${randomUUID()}`,
      })
      .returning();
    if (!workspace) {
      throw new Error("The test workspace was not created.");
    }
    actor = { workspaceId: workspace.id, userId: null };
  });

  afterAll(async () => {
    await db
      .delete(schema.workspaces)
      .where(eq(schema.workspaces.id, actor.workspaceId));
    await app.close();
  });

  it("rejects requests without a session or API key", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/sending-sources",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a key the provider does not accept", async () => {
    await expect(
      service.connectResend(actor, { name: "Marketing", apiKey: "re_wrong" }),
    ).rejects.toMatchObject({
      response: { code: "invalid_credentials", field: "apiKey" },
    });
  });

  it("connects two accounts of the same provider under different names", async () => {
    const marketing = await service.connectResend(actor, {
      name: "Marketing",
      apiKey: goodKey,
    });
    const product = await service.connectResend(actor, {
      name: "Product emails",
      apiKey: goodKey,
    });

    expect(marketing).toMatchObject({
      integrationType: "resend",
      name: "Marketing",
      status: "active",
      sentToday: 0,
      details: { permission: "full", webhook: "registered" },
    });
    expect(marketing.health).toHaveLength(14);
    expect(product.id).not.toBe(marketing.id);

    const { sources, connectable } = await service.list(actor.workspaceId);
    expect(sources.map((source) => source.name)).toEqual([
      "Marketing",
      "Product emails",
    ]);
    expect(connectable.gmail).toBe(false);
  });

  it("refuses a name that is already used, ignoring case", async () => {
    await expect(
      service.connectResend(actor, { name: "marketing", apiKey: goodKey }),
    ).rejects.toMatchObject({
      response: { code: "name_taken", field: "name" },
    });
  });

  it("stores the API key encrypted and never returns it", async () => {
    const { sources } = await service.list(actor.workspaceId);
    const source = sources[0];
    if (!source) {
      throw new Error("No source was listed.");
    }
    const [row] = await db
      .select()
      .from(schema.sendingSourceCredentials)
      .where(eq(schema.sendingSourceCredentials.sourceId, source.id));

    expect(row?.secretHint).toBe("1234");
    expect(row?.secretCiphertext.toString("utf8")).not.toContain(goodKey);
    expect(row?.webhookExternalId).toBe("wh_1");
    expect(JSON.stringify(sources)).not.toContain(goodKey);
  });

  it("renames, limits, pauses and resumes a source", async () => {
    const { sources } = await service.list(actor.workspaceId);
    const id = sources[0]?.id ?? "";

    const limited = await service.update(actor, id, {
      name: "Newsletter",
      dailySendLimit: 2,
    });
    expect(limited).toMatchObject({ name: "Newsletter", dailySendLimit: 2 });

    const paused = await service.update(actor, id, { paused: true });
    expect(paused.status).toBe("paused");
    await expect(
      service.sendTestEmail(actor, id, {
        to: "someone@example.com",
        from: "hello@example.com",
      }),
    ).rejects.toMatchObject({ response: { code: "paused" } });

    const resumed = await service.update(actor, id, { paused: false });
    expect(resumed.status).toBe("active");
  });

  it("sends test emails, counts them, and stops at the daily limit", async () => {
    const { sources } = await service.list(actor.workspaceId);
    const id = sources.find((source) => source.name === "Newsletter")?.id ?? "";
    const input = { to: "someone@example.com", from: "hello@example.com" };

    await expect(
      service.sendTestEmail(actor, id, { to: "someone@example.com" }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "from" },
    });
    await expect(
      service.sendTestEmail(actor, id, {
        to: "someone@example.com",
        from: "hello@unverified.test",
      }),
    ).rejects.toMatchObject({
      response: { code: "domain_not_verified", field: "from" },
    });

    await service.sendTestEmail(actor, id, input);
    await service.sendTestEmail(actor, id, input);
    await expect(service.sendTestEmail(actor, id, input)).rejects.toMatchObject(
      { response: { code: "daily_limit_reached" } },
    );

    expect(fake.sent).toHaveLength(2);
    const after = await service.list(actor.workspaceId);
    expect(after.sources.find((source) => source.id === id)?.sentToday).toBe(2);
  });

  it("accepts a signed provider webhook once and rejects a bad signature", async () => {
    const { sources } = await service.list(actor.workspaceId);
    const id = sources.find((source) => source.name === "Newsletter")?.id ?? "";
    const url = `/v1/provider-webhooks/resend/${id}`;
    const webhook = signedWebhook("msg_e2e_1", {
      type: "email.bounced",
      created_at: new Date().toISOString(),
      data: {
        email_id: "email_1",
        to: ["someone@example.com"],
        bounce: {
          type: "Permanent",
          subType: "General",
          message: "No such user",
        },
      },
    });

    const first = await app.inject({
      method: "POST",
      url,
      headers: webhook.headers,
      payload: webhook.rawBody,
    });
    const replay = await app.inject({
      method: "POST",
      url,
      headers: webhook.headers,
      payload: webhook.rawBody,
    });
    const forged = await app.inject({
      method: "POST",
      url,
      headers: { ...webhook.headers, "svix-signature": "v1,AAAA" },
      payload: webhook.rawBody,
    });

    expect(first.statusCode).toBe(204);
    expect(replay.statusCode).toBe(204);
    expect(forged.statusCode).toBe(401);

    const { events } = await service.events(actor.workspaceId, {
      sourceId: id,
      severity: "warning",
    });
    const bounces = events.filter((event) => event.code === "bounced");
    expect(bounces).toHaveLength(1);
    expect(bounces[0]).toMatchObject({
      type: "provider_event",
      severity: "warning",
      message: "No such user",
      sourceName: "Newsletter",
    });
  });

  it("pages through the activity log newest first", async () => {
    const first = await service.events(actor.workspaceId, { limit: 3 });
    expect(first.events).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();

    const second = await service.events(actor.workspaceId, {
      limit: 3,
      cursor: first.nextCursor ?? undefined,
    });
    const ids = [...first.events, ...second.events].map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
    const times = [...first.events, ...second.events].map((event) =>
      Date.parse(event.createdAt),
    );
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("marks health for the day after a failure", async () => {
    const { sources } = await service.list(actor.workspaceId);
    const newsletter = sources.find((source) => source.name === "Newsletter");
    expect(newsletter?.health.at(-1)?.health).toBe("failing");
  });

  it("disconnects a source, deletes its credentials, and frees the name", async () => {
    const { sources } = await service.list(actor.workspaceId);
    const id = sources.find((source) => source.name === "Newsletter")?.id ?? "";
    await service.disconnect(actor, id);

    const credentials = await db
      .select()
      .from(schema.sendingSourceCredentials)
      .where(eq(schema.sendingSourceCredentials.sourceId, id));
    expect(credentials).toHaveLength(0);

    const after = await service.list(actor.workspaceId);
    expect(after.sources.map((source) => source.name)).toEqual([
      "Product emails",
    ]);
    await expect(service.test(actor, id)).rejects.toMatchObject({
      response: { code: "not_found" },
    });

    const again = await service.connectResend(actor, {
      name: "Newsletter",
      apiKey: goodKey,
    });
    expect(again.status).toBe("active");
  });
});
