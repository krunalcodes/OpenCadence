import { createHmac, randomUUID } from "node:crypto";
import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { type Db, eq, schema, sql } from "@workspace/db";
import {
  type Credentials,
  type IntegrationAdapter,
  IntegrationError,
  type OutboundMessage,
} from "@workspace/integration-core";
import { createResendAdapter } from "@workspace/integration-resend";
import { AppModule } from "../src/app/app.module";
import { uuidv7 } from "../src/common/uuid";
import { DATABASE } from "../src/infra/database/database.module";
import { ContentArchive } from "../src/modules/dispatch/content-archive";
import { DispatchService } from "../src/modules/dispatch/dispatch.service";
import { DispatchWorkerModule } from "../src/modules/dispatch/dispatch.worker.module";
import { DispatchMaintenanceProcessor } from "../src/modules/dispatch/jobs/dispatch-maintenance.processor";
import { AdapterRegistry } from "../src/modules/integrations/adapter-registry";
import {
  type Actor,
  SendingSourcesService,
} from "../src/modules/integrations/sending-sources.service";
import { SuppressionService } from "../src/modules/suppression/suppression.service";
import { TransactionalService } from "../src/modules/transactional/transactional.service";

const signingSecret = `whsec_${Buffer.from("dispatch-signing-secret").toString("base64")}`;
const apiKey = "re_test_dispatch_key_9876";

function fakeResend() {
  const real = createResendAdapter();
  const sent: OutboundMessage[] = [];
  const adapter: IntegrationAdapter = {
    ...real,
    async verify(credentials: Credentials) {
      if (credentials.kind !== "api_key") {
        throw new IntegrationError("invalid_credentials", "Wrong credentials.");
      }
      return { account: {}, settings: { permission: "full", domains: [] } };
    },
    async send(_credentials, message) {
      if (message.from.email.endsWith("@unverified.test")) {
        throw new IntegrationError(
          "domain_not_verified",
          "The sending domain is not verified in this Resend account.",
        );
      }
      sent.push(message);
      return { providerMessageId: `email_${randomUUID()}` };
    },
    webhooks: {
      register: async () => ({ externalId: "wh_dispatch", signingSecret }),
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

describe("Dispatch and transactional email (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let sources: SendingSourcesService;
  let transactional: TransactionalService;
  let dispatch: DispatchService;
  let suppression: SuppressionService;
  let actor: Actor;
  let sourceId: string;
  const fake = fakeResend();

  const email = (overrides: Record<string, unknown> = {}) => ({
    from: "Northwind <hello@example.com>",
    to: "ada@example.com",
    subject: "Your receipt",
    html: "<p>Thanks for your order.</p>",
    text: "Thanks for your order.",
    ...overrides,
  });

  async function settled(id: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const message = await dispatch.get(actor.workspaceId, id);
      if (message.status !== "queued") {
        return message;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("The email was not processed in time.");
  }

  beforeAll(async () => {
    process.env.WEBHOOK_BASE_URL = "https://mail.example.com";
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule, DispatchWorkerModule],
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
    sources = app.get(SendingSourcesService);
    transactional = app.get(TransactionalService);
    dispatch = app.get(DispatchService);
    suppression = app.get(SuppressionService);

    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ name: "Dispatch e2e", slug: `dispatch-e2e-${randomUUID()}` })
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

  it("rejects sending without a session or API key", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/emails",
      payload: email(),
    });
    expect(response.statusCode).toBe(401);
  });

  it("needs a sending source", async () => {
    await expect(
      transactional.send(actor.workspaceId, email()),
    ).rejects.toMatchObject({ response: { code: "no_default_source" } });
  });

  it("uses the only source, then requires a default once there are two", async () => {
    const first = await sources.connectResend(actor, {
      name: "Product emails",
      apiKey,
    });
    sourceId = first.id;

    const accepted = await transactional.send(actor.workspaceId, email());
    expect(accepted.status).toBe("queued");
    const message = await settled(accepted.id);
    expect(message).toMatchObject({
      status: "sent",
      sourceId,
      sourceName: "Product emails",
      from: { email: "hello@example.com", name: "Northwind" },
      to: ["ada@example.com"],
      attempts: 1,
      content: { html: "<p>Thanks for your order.</p>" },
    });
    expect(fake.sent.at(-1)).toMatchObject({
      to: ["ada@example.com"],
      subject: "Your receipt",
      idempotencyKey: accepted.id,
    });

    const second = await sources.connectResend(actor, {
      name: "Marketing",
      apiKey,
    });
    await expect(
      transactional.send(actor.workspaceId, email()),
    ).rejects.toMatchObject({ response: { code: "no_default_source" } });

    const withDefault = await sources.update(actor, sourceId, {
      isDefault: true,
    });
    expect(withDefault.isDefault).toBe(true);
    const moved = await sources.update(actor, second.id, { isDefault: true });
    expect(moved.isDefault).toBe(true);
    const listed = await sources.list(actor.workspaceId);
    expect(listed.sources.filter((source) => source.isDefault)).toHaveLength(1);
    await sources.update(actor, sourceId, { isDefault: true });
  });

  it("validates the request", async () => {
    const send = (overrides: Record<string, unknown>) =>
      transactional.send(actor.workspaceId, email(overrides));
    await expect(send({ to: "not-an-address" })).rejects.toMatchObject({
      response: { code: "validation", field: "to" },
    });
    await expect(
      send({ html: undefined, text: undefined }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "html" },
    });
    await expect(send({ subject: "a\nb" })).rejects.toMatchObject({
      response: { code: "validation", field: "subject" },
    });
    await expect(
      send({ headers: { "Message-ID": "<x@y>" } }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "headers" },
    });
  });

  it("does not send twice for the same Idempotency-Key", async () => {
    const before = fake.sent.length;
    const first = await transactional.send(actor.workspaceId, email(), "key-1");
    const again = await transactional.send(actor.workspaceId, email(), "key-1");
    expect(again.id).toBe(first.id);
    await settled(first.id);
    expect(fake.sent.length).toBe(before + 1);

    await expect(
      transactional.send(
        actor.workspaceId,
        email({ subject: "Other" }),
        "key-1",
      ),
    ).rejects.toMatchObject({ response: { code: "idempotency_conflict" } });
  });

  it("removes suppressed recipients and skips when none remain", async () => {
    await suppression.record({
      workspaceId: actor.workspaceId,
      email: "bounced@example.com",
      reason: "bounced",
      origin: "webhook",
    });
    await suppression.record({
      workspaceId: actor.workspaceId,
      email: "left@example.com",
      reason: "unsubscribed",
      origin: "user",
    });

    const mixed = await transactional.send(
      actor.workspaceId,
      email({ to: ["Bounced@example.com", "grace@example.com"] }),
    );
    expect(mixed.suppressed).toEqual(["bounced@example.com"]);
    const sent = await settled(mixed.id);
    expect(sent.status).toBe("sent");
    expect(sent.to).toEqual(["grace@example.com"]);
    expect(fake.sent.at(-1)?.to).toEqual(["grace@example.com"]);

    const before = fake.sent.length;
    const skipped = await transactional.send(
      actor.workspaceId,
      email({ to: "bounced@example.com" }),
    );
    expect(skipped.status).toBe("skipped");
    const record = await dispatch.get(actor.workspaceId, skipped.id);
    expect(record.error?.code).toBe("suppressed");
    expect(fake.sent.length).toBe(before);

    const unsubscribed = await transactional.send(
      actor.workspaceId,
      email({ to: "left@example.com" }),
    );
    expect((await settled(unsubscribed.id)).status).toBe("sent");
  });

  it("marks a send that the provider refuses as failed", async () => {
    const accepted = await transactional.send(
      actor.workspaceId,
      email({ from: "hello@unverified.test" }),
    );
    const message = await settled(accepted.id);
    expect(message.status).toBe("failed");
    expect(message.error?.code).toBe("domain_not_verified");
  });

  it("stops at the source's daily limit", async () => {
    const current = (await sources.list(actor.workspaceId)).sources.find(
      (source) => source.id === sourceId,
    );
    await sources.update(actor, sourceId, {
      dailySendLimit: Math.max(current?.sentToday ?? 0, 1),
    });
    const accepted = await transactional.send(actor.workspaceId, email());
    const message = await settled(accepted.id);
    expect(message.status).toBe("failed");
    expect(message.error?.code).toBe("daily_limit_reached");
    await sources.update(actor, sourceId, { dailySendLimit: null });
  });

  it("applies a bounce webhook to the email and the suppression list", async () => {
    const accepted = await transactional.send(
      actor.workspaceId,
      email({ to: "nobody@example.com" }),
    );
    await settled(accepted.id);
    const [row] = await db
      .select({ providerMessageId: schema.messages.providerMessageId })
      .from(schema.messages)
      .where(eq(schema.messages.id, accepted.id));
    const webhook = signedWebhook(`msg_${randomUUID()}`, {
      type: "email.bounced",
      created_at: new Date().toISOString(),
      data: {
        email_id: row?.providerMessageId,
        to: ["nobody@example.com"],
        bounce: {
          type: "Permanent",
          subType: "General",
          message: "No such user",
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/provider-webhooks/resend/${sourceId}`,
      headers: webhook.headers,
      payload: webhook.rawBody,
    });
    expect(response.statusCode).toBe(204);

    const message = await dispatch.get(actor.workspaceId, accepted.id);
    expect(message.status).toBe("bounced");
    expect(message.error).toMatchObject({
      code: "bounced",
      message: "No such user",
    });

    const blocked = await suppression.findBlocked(
      actor.workspaceId,
      ["nobody@example.com"],
      "transactional",
    );
    expect(blocked.get("nobody@example.com")).toBe("bounced");

    const next = await transactional.send(
      actor.workspaceId,
      email({ to: "nobody@example.com" }),
    );
    expect(next.status).toBe("skipped");
  });

  it("lists emails newest first and filters by status", async () => {
    const first = await dispatch.list(actor.workspaceId, { limit: 3 });
    expect(first.emails).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();
    const second = await dispatch.list(actor.workspaceId, {
      limit: 3,
      cursor: first.nextCursor ?? undefined,
    });
    const ids = [...first.emails, ...second.emails].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    const skipped = await dispatch.list(actor.workspaceId, {
      status: "skipped",
    });
    expect(skipped.emails.length).toBeGreaterThan(0);
    expect(skipped.emails.every((item) => item.status === "skipped")).toBe(
      true,
    );
  });

  it("moves old content to object storage and still serves it", async () => {
    const createdAt = new Date(Date.UTC(2026, 0, 15, 12));
    const id = uuidv7(createdAt);
    await db.execute(sql`
      create table if not exists "message_contents_2026_01"
      partition of "message_contents"
      for values from ('2026-01-01T00:00:00Z') to ('2026-02-01T00:00:00Z')
    `);
    await db.insert(schema.messages).values({
      id,
      createdAt,
      workspaceId: actor.workspaceId,
      sourceId,
      kind: "transactional",
      status: "sent",
      fromEmail: "hello@example.com",
      toEmails: ["ada@example.com"],
      subject: "Old receipt",
    });
    await db.insert(schema.messageContents).values({
      messageId: id,
      createdAt,
      workspaceId: actor.workspaceId,
      html: "<p>Old</p>",
      text: "Old",
      headers: { "X-Order": "42" },
    });

    const result = await app
      .get(DispatchMaintenanceProcessor)
      .archiveContents();
    expect(result.archived.message_contents_2026_01).toBeGreaterThanOrEqual(1);

    const partitions = await db.execute<{ name: string }>(sql`
      select child.relname as name from pg_inherits
      join pg_class child on child.oid = pg_inherits.inhrelid
      where inhparent = 'message_contents'::regclass
    `);
    expect(partitions.rows.map((row) => row.name)).not.toContain(
      "message_contents_2026_01",
    );

    const message = await dispatch.get(actor.workspaceId, id);
    expect(message.content).toEqual({
      html: "<p>Old</p>",
      text: "Old",
      headers: { "X-Order": "42" },
    });
    expect(
      await app.get(ContentArchive).get(actor.workspaceId, id, createdAt),
    ).not.toBeNull();
  });
});
