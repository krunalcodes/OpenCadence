import { randomUUID } from "node:crypto";
import { getQueueToken } from "@nestjs/bullmq";
import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { and, asc, type Db, eq, inArray, schema, sql } from "@workspace/db";
import {
  type Credentials,
  type InboxMessage,
  type IntegrationAdapter,
  IntegrationError,
  type OutboundMessage,
} from "@workspace/integration-core";
import { createResendAdapter } from "@workspace/integration-resend";
import type { Queue } from "bullmq";
import { AppModule } from "../src/app/app.module";
import { uuidv7 } from "../src/common/uuid";
import { DATABASE } from "../src/infra/database/database.module";
import { REDIS, type Redis } from "../src/infra/redis/redis.module";
import { AdapterRegistry } from "../src/modules/integrations/adapter-registry";
import {
  type Actor,
  SendingSourcesService,
} from "../src/modules/integrations/sending-sources.service";
import { WarmupProcessor } from "../src/modules/warmup/jobs/warmup.processor";
import {
  WARMUP_QUEUE,
  WARMUP_RANDOM,
  warmupFolderName,
} from "../src/modules/warmup/warmup.constants";
import { WarmupService } from "../src/modules/warmup/warmup.service";
import { WarmupWorkerModule } from "../src/modules/warmup/warmup.worker.module";

const { warmupMailboxes, warmupMessages } = schema;

const minuteMs = 60 * 1000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

type StoredMail = {
  message: OutboundMessage;
  folder: "inbox" | "spam";
  unread: boolean;
  important: boolean;
  filedUnder: string | null;
};

function usernameOf(credentials: Credentials) {
  if (credentials.kind !== "password") {
    throw new IntegrationError("invalid_credentials", "Wrong credentials.");
  }
  return credentials.username;
}

function fakeMail() {
  const boxes = new Map<string, StoredMail[]>();
  const sent: OutboundMessage[] = [];
  const attempts: OutboundMessage[] = [];
  const spamFrom = new Set<string>();
  const failFrom = new Set<string>();
  const lockedOut = new Set<string>();
  const folderCalls = new Map<string, number>();

  const deliver = (message: OutboundMessage) => {
    for (const address of message.to) {
      const box = boxes.get(address) ?? [];
      box.push({
        message,
        folder: spamFrom.has(message.from.email) ? "spam" : "inbox",
        unread: true,
        important: false,
        filedUnder: null,
      });
      boxes.set(address, box);
    }
  };

  const open = (credentials: Credentials) => {
    const username = usernameOf(credentials);
    if (lockedOut.has(username)) {
      throw new IntegrationError(
        "invalid_credentials",
        "The mail server rejected the password.",
      );
    }
    return boxes.get(username) ?? [];
  };

  const adapter: IntegrationAdapter = {
    type: "imap-smtp",
    name: "IMAP and SMTP",
    auth: "password",
    capabilities: ["send", "replies", "warmup"],
    async verify(credentials) {
      return { account: { email: usernameOf(credentials) }, settings: {} };
    },
    async send(_credentials, message) {
      attempts.push(message);
      if (failFrom.has(message.from.email)) {
        throw new IntegrationError("unknown", "The server refused the email.");
      }
      sent.push(message);
      deliver(message);
      return {
        providerMessageId: message.messageId ?? randomUUID(),
        messageId: message.messageId,
      };
    },
    inbox: {
      async search(credentials, query) {
        const stored = open(credentials).find(
          (mail) => mail.message.messageId === query.messageId,
        );
        if (!stored || (stored.folder === "spam" && !query.includeSpam)) {
          return null;
        }
        const found: InboxMessage = {
          providerMessageId: query.messageId,
          folder: stored.folder,
          messageId: stored.message.messageId,
          references: stored.message.thread?.references ?? [],
          to: [],
          receivedAt: new Date(),
          flags: {
            isSpam: stored.folder === "spam",
            isUnread: stored.unread,
            isInInbox: stored.folder === "inbox",
            isStarred: false,
            isImportant: stored.important,
          },
        };
        return found;
      },
      async applyActions(credentials, ref, actions) {
        const stored = open(credentials).find(
          (mail) => mail.message.messageId === ref.providerMessageId,
        );
        for (const action of stored ? actions : []) {
          if (!stored) {
            continue;
          }
          if (action.type === "notSpam") {
            stored.folder = "inbox";
          }
          if (action.type === "markRead") {
            stored.unread = false;
          }
          if (action.type === "markImportant") {
            stored.important = true;
          }
          if (action.type === "fileUnder") {
            stored.filedUnder = `${action.folder.providerFolderId}|${action.folder.name}`;
          }
        }
        return { ref, unsupported: [] };
      },
      async ensureFolder(credentials, name) {
        const username = usernameOf(credentials);
        folderCalls.set(username, (folderCalls.get(username) ?? 0) + 1);
        return { providerFolderId: `folder:${username}`, name };
      },
    },
  };

  return {
    adapter,
    boxes,
    sent,
    attempts,
    spamFrom,
    failFrom,
    lockedOut,
    folderCalls,
    deliver,
  };
}

function fakeResend(): IntegrationAdapter {
  return {
    ...createResendAdapter(),
    webhooks: undefined,
    async verify() {
      return { account: {}, settings: { permission: "sending", domains: [] } };
    },
    async send() {
      return { providerMessageId: `email_${randomUUID()}` };
    },
  };
}

describe("Inbox warm-up (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let redis: Redis;
  let sources: SendingSourcesService;
  let warmup: WarmupService;
  let processor: WarmupProcessor;
  let alpha: Actor;
  let beta: Actor;
  let scope: { workspaceIds: string[] };
  let random: () => number = Math.random;
  const fake = fakeMail();
  const sourceIds: string[] = [];
  const ids: Record<string, string> = {};

  const base = new Date(Math.floor(Date.now() / dayMs) * dayMs + 6 * hourMs);
  const at = (ms: number) => new Date(base.getTime() + ms);
  const today = base.toISOString().slice(0, 10);
  const planAt = at(10 * minuteMs);
  const sendAt = at(14 * hourMs);
  const syncAt = at(14 * hourMs + 3 * minuteMs);
  const replySendAt = at(15 * hourMs + 4 * minuteMs);
  const replySyncAt = at(15 * hourMs + 7 * minuteMs);
  const lateSendAt = at(15 * hourMs + 10 * minuteMs);
  const lateSyncAt = at(15 * hourMs + 20 * minuteMs);
  const tomorrow = at(dayMs);

  async function connect(actor: Actor, key: string, email: string) {
    const source = await sources.connectImapSmtp(actor, {
      email,
      password: "warmup-e2e-password",
      smtpHost: "smtp.mail.test",
      smtpPort: 465,
      smtpSecurity: "tls",
      imapHost: "imap.mail.test",
      imapPort: 993,
      imapSecurity: "tls",
    });
    ids[key] = source.id;
    sourceIds.push(source.id);
    return source.id;
  }

  const id = (key: string) => ids[key] ?? "";

  function messagesFrom(sourceId: string, kind?: string) {
    return db
      .select()
      .from(warmupMessages)
      .where(
        and(
          eq(warmupMessages.senderSourceId, sourceId),
          kind ? eq(warmupMessages.kind, kind) : undefined,
        ),
      )
      .orderBy(asc(warmupMessages.sendAt), asc(warmupMessages.id));
  }

  async function mailboxRow(sourceId: string) {
    const [row] = await db
      .select()
      .from(warmupMailboxes)
      .where(eq(warmupMailboxes.sourceId, sourceId));
    if (!row) {
      throw new Error("The warm-up mailbox row is missing.");
    }
    return row;
  }

  async function listed(actor: Actor, sourceId: string, now = planAt) {
    const { mailboxes } = await warmup.list(actor.workspaceId, now);
    const mailbox = mailboxes.find((item) => item.sourceId === sourceId);
    if (!mailbox) {
      throw new Error("The mailbox was not listed.");
    }
    return mailbox;
  }

  function insertSent(
    sender: string,
    senderWorkspaceId: string,
    recipient: string,
    recipientWorkspaceId: string,
    values: { sentAt: Date; createdAt?: Date },
  ) {
    const messageId = uuidv7();
    return db
      .insert(warmupMessages)
      .values({
        id: messageId,
        threadId: messageId,
        kind: "opener",
        senderSourceId: sender,
        senderWorkspaceId,
        recipientSourceId: recipient,
        recipientWorkspaceId,
        rfcMessageId: `<${messageId}@inserted.test>`,
        subject: "Inserted by the test",
        status: "sent",
        sendAt: values.sentAt,
        sentAt: values.sentAt,
        createdAt: values.createdAt,
      })
      .returning()
      .then((rows) => {
        const row = rows[0];
        if (!row) {
          throw new Error("The test message was not inserted.");
        }
        return row;
      });
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule, WarmupWorkerModule],
    })
      .overrideProvider(AdapterRegistry)
      .useValue({
        find: (type: string) =>
          type === "imap-smtp"
            ? fake.adapter
            : type === "resend"
              ? fakeResend()
              : null,
        has: (type: string) => type === "imap-smtp" || type === "resend",
      })
      .overrideProvider(WARMUP_RANDOM)
      .useValue(() => random())
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { bodyParser: false },
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    processor = app.get(WarmupProcessor);
    await processor.worker.close();

    db = app.get<Db>(DATABASE);
    redis = app.get<Redis>(REDIS);
    sources = app.get(SendingSourcesService);
    warmup = app.get(WarmupService);

    const created = await db
      .insert(schema.workspaces)
      .values([
        { name: "Warm-up e2e alpha", slug: `warmup-e2e-a-${randomUUID()}` },
        { name: "Warm-up e2e beta", slug: `warmup-e2e-b-${randomUUID()}` },
      ])
      .returning();
    const [first, second] = created;
    if (!first || !second) {
      throw new Error("The test workspaces were not created.");
    }
    alpha = { workspaceId: first.id, userId: null };
    beta = { workspaceId: second.id, userId: null };
    scope = { workspaceIds: [first.id, second.id] };

    await connect(alpha, "ada", "ada@alpha.test");
    await connect(alpha, "grace", "grace@alpha.test");
    await connect(beta, "linus", "linus@beta.test");
    const resend = await sources.connectResend(alpha, {
      name: "Product emails",
      apiKey: "re_test_warmup_key_1234",
    });
    ids.resend = resend.id;
    sourceIds.push(resend.id);
  });

  afterAll(async () => {
    await db
      .delete(schema.workspaces)
      .where(inArray(schema.workspaces.id, scope.workspaceIds));
    for (const sourceId of sourceIds) {
      for (const day of [today, tomorrow.toISOString().slice(0, 10)]) {
        await redis.del(`opencadence:sent:${sourceId}:${day}`);
        for (const workspaceId of scope.workspaceIds) {
          await redis.srem(
            "opencadence:sent:dirty",
            `${workspaceId}:${sourceId}:${day}`,
          );
        }
      }
    }
    await app
      .get<Queue>(getQueueToken(WARMUP_QUEUE))
      .obliterate({ force: true });
    await app.close();
  });

  it("rejects requests without a session or API key", async () => {
    const list = await app.inject({ method: "GET", url: "/v1/warmup" });
    expect(list.statusCode).toBe(401);
    const update = await app.inject({
      method: "PUT",
      url: `/v1/warmup/${id("ada")}`,
      payload: { enabled: true },
    });
    expect(update.statusCode).toBe(401);
  });

  it("lists every source with defaults before warm-up is turned on", async () => {
    const { mailboxes } = await warmup.list(alpha.workspaceId, planAt);
    expect(mailboxes.map((mailbox) => mailbox.sourceId).sort()).toEqual(
      [id("ada"), id("grace"), id("resend")].sort(),
    );
    expect(await listed(alpha, id("ada"))).toMatchObject({
      email: "ada@alpha.test",
      integrationType: "imap-smtp",
      capable: true,
      enabled: false,
      status: "off",
      pausedReason: null,
      day: null,
      readyAfterDays: 14,
      todayTarget: 0,
      todaySent: 0,
      identifier: null,
      placement: { inbox: 0, spam: 0, rate: null },
      lastError: null,
      settings: {
        startPerDay: 5,
        incrementPerDay: 2,
        maxPerDay: 30,
        randomize: true,
        replyRate: 30,
        weekdaysOnly: false,
      },
    });
    expect(await listed(alpha, id("resend"))).toMatchObject({
      capable: false,
      status: "unavailable",
      enabled: false,
    });
  });

  it("refuses a source that cannot read its inbox, or is not in the workspace", async () => {
    await expect(
      warmup.update(alpha.workspaceId, id("resend"), { enabled: true }),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: "not_capable",
        message: expect.stringContaining("IMAP/SMTP"),
      },
    });
    await expect(
      warmup.update(beta.workspaceId, id("ada"), { enabled: true }),
    ).rejects.toMatchObject({ status: 404, response: { code: "not_found" } });
    await expect(
      warmup.update(alpha.workspaceId, randomUUID(), { enabled: true }),
    ).rejects.toMatchObject({ response: { code: "not_found" } });
    await expect(
      warmup.update(alpha.workspaceId, "nope", { enabled: true }),
    ).rejects.toMatchObject({ response: { code: "not_found" } });
  });

  it("validates the settings", async () => {
    const update = (input: Record<string, unknown>) =>
      warmup.update(alpha.workspaceId, id("ada"), input);
    const invalid: [Record<string, unknown>, string][] = [
      [{ startPerDay: 0 }, "startPerDay"],
      [{ startPerDay: 51 }, "startPerDay"],
      [{ startPerDay: 2.5 }, "startPerDay"],
      [{ incrementPerDay: 6 }, "incrementPerDay"],
      [{ incrementPerDay: 0 }, "incrementPerDay"],
      [{ maxPerDay: 51 }, "maxPerDay"],
      [{ maxPerDay: "30" }, "maxPerDay"],
      [{ replyRate: 61 }, "replyRate"],
      [{ replyRate: -1 }, "replyRate"],
      [{ maxPerDay: 3 }, "maxPerDay"],
      [{ startPerDay: 40 }, "startPerDay"],
      [{ enabled: "yes" }, "enabled"],
      [{ randomize: 1 }, "randomize"],
    ];
    for (const [input, field] of invalid) {
      await expect(update(input)).rejects.toMatchObject({
        status: 400,
        response: { code: "validation", field },
      });
    }
    const rows = await db
      .select()
      .from(warmupMailboxes)
      .where(eq(warmupMailboxes.sourceId, id("ada")));
    expect(rows).toHaveLength(0);
  });

  it("creates the identifier and a day 1 target of 5 on first enable", async () => {
    const mailbox = await warmup.update(
      alpha.workspaceId,
      id("ada"),
      { enabled: true, randomize: false, replyRate: 0 },
      planAt,
    );
    expect(mailbox).toMatchObject({
      enabled: true,
      status: "warming",
      pausedReason: null,
      day: 1,
      todayTarget: 5,
      todaySent: 0,
      settings: { randomize: false, replyRate: 0, startPerDay: 5 },
    });
    expect(mailbox.identifier).toMatch(/^[a-z]+-[a-z]+$/);
    expect(mailbox.days).toHaveLength(14);
    expect(mailbox.days.at(-1)?.day).toBe(today);

    const row = await mailboxRow(id("ada"));
    expect(row).toMatchObject({
      domain: "alpha.test",
      startedOn: today,
      holdDays: 0,
      identifier: mailbox.identifier,
    });

    const again = await warmup.update(
      alpha.workspaceId,
      id("ada"),
      { maxPerDay: 40 },
      planAt,
    );
    expect(again.identifier).toBe(mailbox.identifier);
    expect(again.settings.maxPerDay).toBe(40);
  });

  it("plans nothing with a pool of one, or with only same-domain partners", async () => {
    expect(await processor.plan(planAt, scope)).toMatchObject({
      mailboxes: 1,
      planned: 0,
    });
    await warmup.update(
      alpha.workspaceId,
      id("grace"),
      { enabled: true, randomize: false, replyRate: 0 },
      planAt,
    );
    expect(await processor.plan(planAt, scope)).toMatchObject({
      mailboxes: 2,
      planned: 0,
    });
    expect(await messagesFrom(id("ada"))).toHaveLength(0);
    expect(await messagesFrom(id("grace"))).toHaveLength(0);
    expect((await processor.sendDue(sendAt, scope)).sent).toBe(0);
  });

  it("plans the day's openers in order and never pairs same-domain or self", async () => {
    await warmup.update(
      beta.workspaceId,
      id("linus"),
      { enabled: true, randomize: false, replyRate: 60 },
      planAt,
    );
    random = () => 0.5;
    const result = await processor.plan(planAt, scope);
    random = Math.random;
    expect(result).toMatchObject({ mailboxes: 3, planned: 15 });

    const windowEnd = at(14 * hourMs).getTime();
    for (const key of ["ada", "grace", "linus"]) {
      const rows = await messagesFrom(id(key));
      expect(rows).toHaveLength(5);
      rows.forEach((row, index) => {
        expect(row).toMatchObject({ kind: "opener", status: "scheduled" });
        expect(row.threadId).toBe(row.id);
        expect(row.recipientSourceId).not.toBe(row.senderSourceId);
        expect(row.sendAt.getTime()).toBeGreaterThanOrEqual(planAt.getTime());
        expect(row.sendAt.getTime()).toBeLessThanOrEqual(windowEnd);
        const previous = rows[index - 1];
        if (previous) {
          expect(
            row.sendAt.getTime() - previous.sendAt.getTime(),
          ).toBeGreaterThanOrEqual(3 * minuteMs);
        }
        if (key === "linus") {
          expect([id("ada"), id("grace")]).toContain(row.recipientSourceId);
          expect(row.recipientWorkspaceId).toBe(alpha.workspaceId);
          expect(row.replyPlanned).toBe(false);
          expect(row.rfcMessageId).toBe(`<${row.id}@beta.test>`);
        } else {
          expect(row.recipientSourceId).toBe(id("linus"));
          expect(row.replyPlanned).toBe(true);
          expect(row.rfcMessageId).toBe(`<${row.id}@alpha.test>`);
        }
      });
      expect(await mailboxRow(id(key))).toMatchObject({
        plannedOn: today,
        plannedCount: 5,
      });
    }

    expect(await processor.plan(planAt, scope)).toMatchObject({ planned: 0 });
    expect(await processor.plan(at(hourMs), scope)).toMatchObject({
      planned: 0,
    });
    expect(await messagesFrom(id("ada"))).toHaveLength(5);
    expect((await listed(alpha, id("ada"))).todayTarget).toBe(5);
  });

  it("sends each due email once, even when two workers run together", async () => {
    fake.spamFrom.add("grace@alpha.test");
    expect((await processor.sendDue(planAt, scope)).sent).toBe(0);

    const results = await Promise.all([
      processor.sendDue(sendAt, scope),
      processor.sendDue(sendAt, scope),
    ]);
    expect(results[0].sent + results[1].sent).toBe(15);
    expect(results[0].failed + results[1].failed).toBe(0);
    expect((await processor.sendDue(sendAt, scope)).sent).toBe(0);

    expect(fake.sent).toHaveLength(15);
    expect(new Set(fake.sent.map((message) => message.messageId)).size).toBe(
      15,
    );

    const ada = await mailboxRow(id("ada"));
    const rows = await messagesFrom(id("ada"));
    for (const row of rows) {
      expect(row.status).toBe("sent");
      expect(row.sentAt?.getTime()).toBe(sendAt.getTime());
      const message = fake.sent.find(
        (item) => item.messageId === row.rfcMessageId,
      );
      expect(message).toMatchObject({
        from: { email: "ada@alpha.test" },
        to: ["linus@beta.test"],
        subject: row.subject,
        idempotencyKey: row.id,
      });
      expect(message?.html).toBeUndefined();
      expect(message?.thread).toBeUndefined();
      expect(message?.text?.split("\n").at(-1)).toBe(ada.identifier);
      expect(message?.text).not.toMatch(/https?:|\{|\}/);
    }
    expect((await listed(alpha, id("ada"), sendAt)).todaySent).toBe(5);
  });

  it("records placement, rescues from spam, files the email and plans replies", async () => {
    expect(await processor.sync(at(14 * hourMs + minuteMs), scope)).toEqual({
      received: 0,
      missing: 0,
    });

    const result = await processor.sync(syncAt, scope);
    expect(result).toEqual({ received: 15, missing: 0 });
    expect(await processor.sync(syncAt, scope)).toEqual({
      received: 0,
      missing: 0,
    });

    for (const row of await messagesFrom(id("ada"))) {
      expect(row).toMatchObject({
        status: "received",
        landedIn: "inbox",
        rescued: false,
      });
      expect(row.receivedAt?.getTime()).toBe(syncAt.getTime());
    }
    for (const row of await messagesFrom(id("grace"))) {
      expect(row).toMatchObject({
        status: "received",
        landedIn: "spam",
        rescued: true,
      });
    }

    const linusBox = fake.boxes.get("linus@beta.test") ?? [];
    expect(linusBox).toHaveLength(10);
    for (const mail of linusBox) {
      expect(mail).toMatchObject({
        folder: "inbox",
        unread: false,
        important: true,
        filedUnder: `folder:linus@beta.test|${warmupFolderName}`,
      });
    }
    expect((await mailboxRow(id("linus"))).folderId).toBe(
      "folder:linus@beta.test",
    );
    expect(fake.folderCalls.get("linus@beta.test")).toBe(1);

    const replies = await messagesFrom(id("linus"), "reply");
    expect(replies).toHaveLength(10);
    const openers = [
      ...(await messagesFrom(id("ada"))),
      ...(await messagesFrom(id("grace"))),
    ];
    for (const reply of replies) {
      const opener = openers.find((row) => row.threadId === reply.threadId);
      expect(opener).toBeDefined();
      expect(reply).toMatchObject({
        status: "scheduled",
        replyPlanned: false,
        recipientSourceId: opener?.senderSourceId,
        recipientWorkspaceId: alpha.workspaceId,
        inReplyTo: opener?.rfcMessageId,
        subject: `Re: ${opener?.subject}`,
      });
      const delay = reply.sendAt.getTime() - syncAt.getTime();
      expect(delay).toBeGreaterThanOrEqual(5 * minuteMs);
      expect(delay).toBeLessThanOrEqual(60 * minuteMs);
    }
    expect(new Set(replies.map((reply) => reply.threadId)).size).toBe(10);

    expect(await messagesFrom(id("ada"), "reply")).toHaveLength(0);
    expect(await messagesFrom(id("grace"), "reply")).toHaveLength(0);
  });

  it("threads the replies and never replies to a reply", async () => {
    const before = fake.sent.length;
    const result = await processor.sendDue(replySendAt, scope);
    expect(result).toEqual({ sent: 10, failed: 0 });

    const linus = await mailboxRow(id("linus"));
    const replies = await messagesFrom(id("linus"), "reply");
    for (const reply of replies) {
      const message = fake.sent
        .slice(before)
        .find((item) => item.messageId === reply.rfcMessageId);
      expect(message).toMatchObject({
        from: { email: "linus@beta.test" },
        subject: reply.subject,
        thread: {
          inReplyTo: reply.inReplyTo,
          references: [reply.inReplyTo],
        },
      });
      expect(message?.subject.startsWith("Re: ")).toBe(true);
      expect(message?.text?.split("\n").at(-1)).toBe(linus.identifier);
    }

    expect(await processor.sync(replySyncAt, scope)).toEqual({
      received: 10,
      missing: 0,
    });
    const after = await messagesFrom(id("linus"), "reply");
    expect(after.every((reply) => reply.status === "received")).toBe(true);
    expect(after.every((reply) => reply.landedIn === "inbox")).toBe(true);

    const all = await db
      .select({ kind: warmupMessages.kind })
      .from(warmupMessages)
      .where(inArray(warmupMessages.senderWorkspaceId, scope.workspaceIds));
    expect(all).toHaveLength(25);
    expect(all.filter((row) => row.kind === "reply")).toHaveLength(10);
    expect((await processor.sendDue(at(20 * hourMs), scope)).sent).toBe(0);
  });

  it("reports today's progress, placement and 14 days, per workspace", async () => {
    const alphaList = await warmup.list(alpha.workspaceId, replySyncAt);
    const betaList = await warmup.list(beta.workspaceId, replySyncAt);

    const ada = alphaList.mailboxes.find((item) => item.sourceId === id("ada"));
    expect(ada).toMatchObject({
      status: "warming",
      day: 1,
      todayTarget: 5,
      todaySent: 5,
      placement: { inbox: 5, spam: 0, rate: 1 },
    });
    expect(ada?.days).toHaveLength(14);
    expect(ada?.days.at(-1)).toEqual({
      day: today,
      sent: 5,
      inbox: 5,
      spam: 0,
    });
    expect(ada?.days.slice(0, 13).every((day) => day.sent === 0)).toBe(true);
    const sortedDays = [...(ada?.days ?? [])].sort((a, b) =>
      a.day.localeCompare(b.day),
    );
    expect(ada?.days).toEqual(sortedDays);

    const grace = alphaList.mailboxes.find(
      (item) => item.sourceId === id("grace"),
    );
    expect(grace).toMatchObject({
      todaySent: 5,
      placement: { inbox: 0, spam: 5, rate: 0 },
    });

    const linus = betaList.mailboxes.find(
      (item) => item.sourceId === id("linus"),
    );
    expect(linus).toMatchObject({
      todaySent: 5,
      placement: { inbox: 15, spam: 0, rate: 1 },
    });
    expect(linus?.days.at(-1)).toMatchObject({ sent: 15, inbox: 15 });

    expect(betaList.mailboxes.map((item) => item.sourceId)).toEqual([
      id("linus"),
    ]);
    expect(JSON.stringify(alphaList)).not.toContain("beta.test");
    expect(JSON.stringify(alphaList)).not.toContain(id("linus"));
    expect(JSON.stringify(betaList)).not.toContain("alpha.test");

    const [installWide] = await db
      .select({
        mailboxes: sql<number>`count(*)::int`,
        domains: sql<number>`count(distinct ${warmupMailboxes.domain})::int`,
      })
      .from(warmupMailboxes)
      .where(
        sql`${warmupMailboxes.enabled} and ${warmupMailboxes.pausedReason} is null`,
      );
    expect(alphaList.pool).toEqual(installWide);
    expect(betaList.pool).toEqual(installWide);
    expect(alphaList.pool.mailboxes).toBeGreaterThanOrEqual(3);
    expect(alphaList.pool.domains).toBeGreaterThanOrEqual(2);
    expect(Object.keys(alphaList.pool).sort()).toEqual([
      "domains",
      "mailboxes",
    ]);
  });

  it("marks an email that never arrives as missing after 48 hours", async () => {
    const lost = await insertSent(
      id("ada"),
      alpha.workspaceId,
      id("linus"),
      beta.workspaceId,
      { sentAt: new Date(replySyncAt.getTime() - 47 * hourMs) },
    );
    expect(await processor.sync(replySyncAt, scope)).toEqual({
      received: 0,
      missing: 0,
    });
    expect(
      await processor.sync(new Date(replySyncAt.getTime() + 2 * hourMs), scope),
    ).toEqual({ received: 0, missing: 1 });
    const [row] = await db
      .select()
      .from(warmupMessages)
      .where(eq(warmupMessages.id, lost.id));
    expect(row).toMatchObject({ status: "missing", landedIn: null });
    expect((await listed(alpha, id("ada"), replySyncAt)).placement).toEqual({
      inbox: 5,
      spam: 0,
      rate: 1,
    });
    await db.delete(warmupMessages).where(eq(warmupMessages.id, lost.id));
  });

  it("pauses by hand, resumes without planning twice, and keeps history when off", async () => {
    const paused = await warmup.update(
      alpha.workspaceId,
      id("ada"),
      { paused: true },
      replySyncAt,
    );
    expect(paused).toMatchObject({
      enabled: true,
      status: "paused",
      pausedReason: "manual",
      todayTarget: 0,
    });
    expect((await processor.plan(at(hourMs), scope)).mailboxes).toBe(2);

    const resumed = await warmup.update(
      alpha.workspaceId,
      id("ada"),
      { paused: false },
      replySyncAt,
    );
    expect(resumed).toMatchObject({ status: "warming", pausedReason: null });
    expect(await processor.plan(at(hourMs), scope)).toMatchObject({
      mailboxes: 3,
      planned: 0,
    });
    expect(await messagesFrom(id("ada"))).toHaveLength(5);

    const off = await warmup.update(
      alpha.workspaceId,
      id("ada"),
      { enabled: false },
      replySyncAt,
    );
    expect(off).toMatchObject({
      enabled: false,
      status: "off",
      day: null,
      todayTarget: 0,
      placement: { inbox: 5 },
    });
    expect(off.identifier).toBe(resumed.identifier);

    const on = await warmup.update(
      alpha.workspaceId,
      id("ada"),
      { enabled: true },
      replySyncAt,
    );
    expect(on).toMatchObject({ status: "warming", day: 1 });
    expect((await mailboxRow(id("ada"))).startedOn).toBe(today);
  });

  it("caps warm-up at 15 on a day with real sending", async () => {
    await connect(beta, "carol", "carol@gamma.test");
    await connect(beta, "dave", "dave@delta.test");
    const settings = {
      enabled: true,
      randomize: false,
      startPerDay: 20,
      replyRate: 0,
    };
    await sources.deliver(beta.workspaceId, id("carol"), {
      from: { email: "carol@gamma.test" },
      to: ["customer@example.com"],
      subject: "Your invoice",
      text: "A real email.",
    });
    await warmup.update(beta.workspaceId, id("carol"), settings, at(hourMs));
    await warmup.update(beta.workspaceId, id("dave"), settings, at(hourMs));
    expect((await listed(beta, id("dave"), at(hourMs))).todayTarget).toBe(20);

    await processor.plan(at(hourMs), scope);
    expect(await messagesFrom(id("carol"))).toHaveLength(15);
    expect((await mailboxRow(id("carol"))).plannedCount).toBe(15);
    expect(await messagesFrom(id("dave"))).toHaveLength(20);
    expect((await listed(beta, id("carol"), at(hourMs))).todayTarget).toBe(15);

    await sources.deliver(beta.workspaceId, id("dave"), {
      from: { email: "dave@delta.test" },
      to: ["customer@example.com"],
      subject: "Your invoice",
      text: "A real email.",
    });
    await processor.plan(at(hourMs + 10 * minuteMs), scope);
    const dave = await messagesFrom(id("dave"));
    expect(dave).toHaveLength(15);
    expect((await mailboxRow(id("dave"))).plannedCount).toBe(15);
    await processor.plan(at(hourMs + 20 * minuteMs), scope);
    expect(await messagesFrom(id("dave"))).toHaveLength(15);
    for (const row of [...dave, ...(await messagesFrom(id("carol")))]) {
      expect(row.recipientSourceId).not.toBe(row.senderSourceId);
      expect([id("carol"), id("dave")]).toContain(row.senderSourceId);
    }
  });

  it("stops quietly when the source reaches its daily limit", async () => {
    await sources.update(beta, id("carol"), { dailySendLimit: 3 });
    const attemptsBefore = fake.attempts.filter(
      (message) => message.from.email === "carol@gamma.test",
    ).length;

    await processor.sendDue(lateSendAt, scope);

    const rows = await messagesFrom(id("carol"));
    expect(rows.filter((row) => row.status === "sent")).toHaveLength(2);
    const failed = rows.filter((row) => row.status === "failed");
    expect(failed).toHaveLength(13);
    expect(failed.every((row) => row.errorCode === "daily_limit_reached")).toBe(
      true,
    );
    expect(
      fake.attempts.filter(
        (message) => message.from.email === "carol@gamma.test",
      ).length - attemptsBefore,
    ).toBe(2);

    expect(await mailboxRow(id("carol"))).toMatchObject({
      enabled: true,
      pausedReason: null,
      holdDays: 0,
    });
    expect(await listed(beta, id("carol"), lateSendAt)).toMatchObject({
      status: "warming",
      todaySent: 2,
      lastError: null,
    });
    const dave = await messagesFrom(id("dave"));
    expect(dave.every((row) => row.status === "sent")).toBe(true);
    await sources.update(beta, id("carol"), { dailySendLimit: null });
  });

  it("pauses with bounces after three failed sends in a day", async () => {
    await connect(alpha, "erin", "erin@epsilon.test");
    await warmup.update(
      alpha.workspaceId,
      id("erin"),
      { enabled: true, randomize: false, replyRate: 0 },
      at(2 * hourMs),
    );
    await processor.plan(at(2 * hourMs), scope);
    expect(await messagesFrom(id("erin"))).toHaveLength(5);

    fake.failFrom.add("erin@epsilon.test");
    await processor.sendDue(lateSendAt, scope);
    fake.failFrom.delete("erin@epsilon.test");

    const rows = await messagesFrom(id("erin"));
    expect(rows.filter((row) => row.errorCode === "unknown")).toHaveLength(3);
    expect(
      rows.filter((row) => row.errorCode === "warmup_paused"),
    ).toHaveLength(2);
    expect(rows.every((row) => row.status === "failed")).toBe(true);
    expect(
      fake.attempts.filter(
        (message) => message.from.email === "erin@epsilon.test",
      ),
    ).toHaveLength(3);

    expect(await listed(alpha, id("erin"), lateSendAt)).toMatchObject({
      status: "paused",
      pausedReason: "bounces",
      todayTarget: 0,
      lastError: { code: "unknown" },
    });
    const pool = (await processor.plan(at(3 * hourMs), scope)).mailboxes;

    const resumed = await warmup.update(
      alpha.workspaceId,
      id("erin"),
      { enabled: true },
      lateSendAt,
    );
    expect(resumed).toMatchObject({
      status: "warming",
      pausedReason: null,
      lastError: null,
    });
    expect((await processor.plan(at(3 * hourMs), scope)).mailboxes).toBe(
      pool + 1,
    );
    expect(await messagesFrom(id("erin"))).toHaveLength(5);
  });

  it("pauses with source_unavailable when the source is paused or disconnected", async () => {
    await sources.update(beta, id("carol"), { paused: true });
    await sources.disconnect(beta, id("dave"));
    await processor.plan(at(3 * hourMs), scope);

    expect(await mailboxRow(id("carol"))).toMatchObject({
      enabled: true,
      pausedReason: "source_unavailable",
      lastErrorCode: "source_paused",
    });
    expect(await mailboxRow(id("dave"))).toMatchObject({
      pausedReason: "source_unavailable",
      lastErrorCode: "source_missing",
    });
    expect(await listed(beta, id("carol"), lateSendAt)).toMatchObject({
      status: "paused",
      pausedReason: "source_unavailable",
    });
    const { mailboxes } = await warmup.list(beta.workspaceId, lateSendAt);
    expect(mailboxes.map((item) => item.sourceId)).not.toContain(id("dave"));

    await sources.update(beta, id("carol"), { paused: false });
    expect((await mailboxRow(id("carol"))).pausedReason).toBe(
      "source_unavailable",
    );
    const back = await warmup.update(
      beta.workspaceId,
      id("carol"),
      { paused: false },
      lateSendAt,
    );
    expect(back).toMatchObject({ status: "warming", pausedReason: null });
  });

  it("pauses one mailbox on a failed sign-in without blocking the others", async () => {
    const forErin = await insertSent(
      id("ada"),
      alpha.workspaceId,
      id("erin"),
      alpha.workspaceId,
      { sentAt: lateSendAt },
    );
    const forLinus = await insertSent(
      id("ada"),
      alpha.workspaceId,
      id("linus"),
      beta.workspaceId,
      { sentAt: lateSendAt },
    );
    fake.deliver({
      from: { email: "ada@alpha.test" },
      to: ["linus@beta.test"],
      subject: forLinus.subject,
      text: "Inserted by the test.",
      messageId: forLinus.rfcMessageId,
    });
    fake.lockedOut.add("erin@epsilon.test");

    await processor.sync(lateSyncAt, scope);
    fake.lockedOut.delete("erin@epsilon.test");

    expect(await mailboxRow(id("erin"))).toMatchObject({
      pausedReason: "sign_in_failed",
      lastErrorCode: "invalid_credentials",
    });
    const [received] = await db
      .select()
      .from(warmupMessages)
      .where(eq(warmupMessages.id, forLinus.id));
    expect(received).toMatchObject({ status: "received", landedIn: "inbox" });
    expect(fake.folderCalls.get("linus@beta.test")).toBe(1);

    await db
      .delete(warmupMessages)
      .where(inArray(warmupMessages.id, [forErin.id, forLinus.id]));
    await warmup.update(
      alpha.workspaceId,
      id("erin"),
      { enabled: true },
      lateSyncAt,
    );
  });

  it("advances the ramp the next day and holds it after spam or a failure", async () => {
    await processor.plan(tomorrow, scope);

    expect(await mailboxRow(id("ada"))).toMatchObject({ holdDays: 0 });
    expect(await mailboxRow(id("linus"))).toMatchObject({ holdDays: 0 });
    expect(await mailboxRow(id("grace"))).toMatchObject({ holdDays: 1 });
    expect(await mailboxRow(id("erin"))).toMatchObject({ holdDays: 1 });
    expect(await mailboxRow(id("carol"))).toMatchObject({ holdDays: 0 });

    expect(await listed(alpha, id("ada"), tomorrow)).toMatchObject({
      day: 2,
      todayTarget: 7,
      todaySent: 0,
    });
    expect(await listed(alpha, id("grace"), tomorrow)).toMatchObject({
      day: 1,
      todayTarget: 5,
    });
    expect(await listed(beta, id("linus"), tomorrow)).toMatchObject({
      day: 2,
      todayTarget: 7,
    });

    const from = new Date(tomorrow.getTime() - 6 * hourMs);
    const planned = async (key: string) =>
      (await messagesFrom(id(key))).filter(
        (row) => row.sendAt.getTime() >= from.getTime(),
      );
    expect(await planned("ada")).toHaveLength(7);
    expect(await planned("grace")).toHaveLength(5);
    expect(await planned("linus")).toHaveLength(7);
    expect(
      (await planned("ada")).every((row) => row.status === "scheduled"),
    ).toBe(true);

    const dayAfter = new Date(tomorrow.getTime() + dayMs);
    await processor.plan(dayAfter, scope);
    expect(await mailboxRow(id("grace"))).toMatchObject({ holdDays: 1 });
    expect(await listed(alpha, id("grace"), dayAfter)).toMatchObject({
      day: 2,
      todayTarget: 7,
    });
    expect(await listed(alpha, id("ada"), dayAfter)).toMatchObject({
      day: 3,
      todayTarget: 9,
    });
  });

  it("prunes warm-up emails older than 45 days", async () => {
    const old = await insertSent(
      id("ada"),
      alpha.workspaceId,
      id("linus"),
      beta.workspaceId,
      {
        sentAt: new Date(Date.now() - 50 * dayMs),
        createdAt: new Date(Date.now() - 50 * dayMs),
      },
    );
    const recent = await insertSent(
      id("ada"),
      alpha.workspaceId,
      id("linus"),
      beta.workspaceId,
      {
        sentAt: new Date(Date.now() - 40 * dayMs),
        createdAt: new Date(Date.now() - 40 * dayMs),
      },
    );
    const result = await processor.prune();
    expect(result.deleted).toBeGreaterThanOrEqual(1);
    const left = await db
      .select({ id: warmupMessages.id })
      .from(warmupMessages)
      .where(inArray(warmupMessages.id, [old.id, recent.id]));
    expect(left.map((row) => row.id)).toEqual([recent.id]);
    expect((await processor.prune()).deleted).toBe(0);
  });
});
