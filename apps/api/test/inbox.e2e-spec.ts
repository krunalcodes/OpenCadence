import { randomUUID } from "node:crypto";
import { getQueueToken } from "@nestjs/bullmq";
import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { and, asc, type Db, eq, inArray, schema } from "@workspace/db";
import {
  type Credentials,
  type IntegrationAdapter,
  IntegrationError,
  type OutboundMessage,
  type ReceivedContent,
  type ReceivedMessage,
  type ReceivedQuery,
} from "@workspace/integration-core";
import { createResendAdapter } from "@workspace/integration-resend";
import type { Job } from "bullmq";
import { AppModule } from "../src/app/app.module";
import { DATABASE } from "../src/infra/database/database.module";
import { REDIS, type Redis } from "../src/infra/redis/redis.module";
import { TrackingKeys } from "../src/infra/tracking-keys/tracking-keys";
import {
  CAMPAIGN_OUTCOMES_QUEUE,
  type MessageOutcomeJob,
  SEND_QUEUE,
  SEQUENCE_OUTCOMES_QUEUE,
  type SendJob,
} from "../src/modules/dispatch/dispatch.constants";
import { DispatchRepository } from "../src/modules/dispatch/dispatch.repository";
import { DispatchService } from "../src/modules/dispatch/dispatch.service";
import { SendProcessor } from "../src/modules/dispatch/jobs/send.processor";
import { MessageEvents } from "../src/modules/dispatch/message-events";
import type { SendRateLimiter } from "../src/modules/dispatch/send-rate-limiter";
import {
  pollBlockedKey,
  pollFailuresKey,
  pollLockKey,
} from "../src/modules/inbox/inbox.constants";
import { InboxRetention } from "../src/modules/inbox/inbox-retention";
import { MailPoller } from "../src/modules/inbox/mail-poller";
import { AdapterRegistry } from "../src/modules/integrations/adapter-registry";
import { SendingSourcesService } from "../src/modules/integrations/sending-sources.service";
import { SuppressionService } from "../src/modules/suppression/suppression.service";
import {
  createApiKey,
  createWorkspaceSessions,
  type TestWorkspace,
} from "./support/workspace-session";

const {
  contacts,
  inboxMessages,
  inboxThreads,
  messageContents,
  messageEvents,
  messages,
  sequenceReplyCursors,
} = schema;

type StubbedQueue = {
  add: (...args: unknown[]) => Promise<unknown>;
  addBulk: (...args: unknown[]) => Promise<unknown>;
};

type ThreadBody = {
  id: string;
  contact: { id: string | null; email: string; name: string | null };
  subject: string;
  snippet: string;
  status: string;
  unread: boolean;
  source: { id: string; name: string; email: string | null };
  origin: { type: string; id: string; name: string } | null;
  messageCount: number;
  lastDirection: string;
  lastMessageAt: string;
};

type MessageBody = {
  id: string;
  direction: string;
  from: { email: string; name: string | null };
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  occurredAt: string;
  status: string | null;
};

type ThreadList = {
  items: ThreadBody[];
  nextCursor: string | null;
  unreadCount: number;
};

type Mail = ReceivedMessage & { ref: string };

function usernameOf(credentials: Credentials) {
  if (credentials.kind !== "password") {
    throw new IntegrationError("invalid_credentials", "Wrong credentials.");
  }
  return credentials.username;
}

function fakeMail() {
  const sent: OutboundMessage[] = [];
  const received = new Map<string, Mail[]>();
  const contents = new Map<string, ReceivedContent | Error>();
  const listFailures = new Map<string, Error>();
  const brokenLogins = new Set<string>();
  const calls = {
    listReceived: [] as string[],
    fetchReceived: [] as string[],
    search: 0,
    applyActions: 0,
    ensureFolder: 0,
  };
  const settings = { pageSize: 100, listing: true, fetching: true };
  const listReceived = async (
    credentials: Credentials,
    query: ReceivedQuery,
  ) => {
    const username = usernameOf(credentials);
    calls.listReceived.push(username);
    const failure = listFailures.get(username);
    if (failure) {
      throw failure;
    }
    const all = received.get(username) ?? [];
    const seen = typeof query.state?.seen === "number" ? query.state.seen : 0;
    const page = all.slice(seen, seen + settings.pageSize);
    return {
      messages: page,
      state: { seen: seen + page.length },
      more: seen + page.length < all.length,
    };
  };
  const fetchReceived = async (_credentials: Credentials, ref: string) => {
    calls.fetchReceived.push(ref);
    const content = contents.get(ref) ?? null;
    if (content instanceof Error) {
      throw content;
    }
    return content;
  };
  const inbox: NonNullable<IntegrationAdapter["inbox"]> = {
    async search() {
      calls.search += 1;
      return null;
    },
    async applyActions(_credentials, ref) {
      calls.applyActions += 1;
      return { ref, unsupported: [] };
    },
    async ensureFolder(_credentials, name) {
      calls.ensureFolder += 1;
      return { providerFolderId: name, name };
    },
    listReceived,
    fetchReceived,
  };
  const adapter: IntegrationAdapter = {
    type: "imap-smtp",
    name: "IMAP and SMTP",
    auth: "password",
    capabilities: ["send", "replies", "warmup"],
    async verify(credentials) {
      const username = usernameOf(credentials);
      if (brokenLogins.has(username)) {
        throw new IntegrationError(
          "invalid_credentials",
          "The IMAP server rejected the sign-in.",
        );
      }
      return { account: { email: username }, settings: {} };
    },
    async send(_credentials, message) {
      sent.push(message);
      return {
        providerMessageId: message.messageId ?? randomUUID(),
        messageId: message.messageId,
      };
    },
    inbox,
  };
  return {
    adapter,
    sent,
    received,
    contents,
    listFailures,
    brokenLogins,
    calls,
    settings,
  };
}

function fakeResend(): IntegrationAdapter {
  return {
    ...createResendAdapter(),
    webhooks: undefined,
    async verify() {
      return { account: {}, settings: { permission: "full", domains: [] } };
    },
    async send() {
      return { providerMessageId: `email_${randomUUID()}` };
    },
  };
}

describe("Inbox (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let redis: Redis;
  let dispatch: DispatchService;
  let sources: SendingSourcesService;
  let suppression: SuppressionService;
  let poller: MailPoller;
  let retention: InboxRetention;
  let sendProcessor: SendProcessor;
  let sessions: ReturnType<typeof createWorkspaceSessions>;
  let alpha: TestWorkspace;
  let beta: TestWorkspace;
  let scope: { workspaceIds: string[] };
  let ada = "";
  let grace = "";
  let hedy = "";
  let bea = "";
  let resend = "";
  let campaignId = "";
  let campaignName = "";
  let sequenceId = "";
  let sequenceName = "";
  let mailCount = 0;
  const fake = fakeMail();
  const outcomeJobs: { queue: string; job: MessageOutcomeJob }[] = [];
  const sendJobs: string[] = [];
  const sendJobData: SendJob[] = [];

  async function http<T = Record<string, unknown>>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    payload?: unknown,
    workspace: TestWorkspace = alpha,
  ) {
    const response = await app.inject({
      method,
      url,
      headers: { cookie: workspace.owner.cookie },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return {
      status: response.statusCode,
      body: (response.body ? response.json() : {}) as T,
    };
  }

  async function connect(email: string, workspace: TestWorkspace = alpha) {
    const source = await sources.connectImapSmtp(
      { workspaceId: workspace.workspaceId, userId: null },
      {
        email,
        password: "inbox-e2e-password",
        smtpHost: "smtp.mail.test",
        smtpPort: 465,
        smtpSecurity: "tls",
        imapHost: "imap.mail.test",
        imapPort: 993,
        imapSecurity: "tls",
      },
    );
    return source.id;
  }

  async function makeContact(
    workspace: TestWorkspace = alpha,
    firstName = "Lin",
  ) {
    const [row] = await db
      .insert(contacts)
      .values({
        workspaceId: workspace.workspaceId,
        email: `lead-${randomUUID().slice(0, 12)}@customer.test`,
        firstName,
      })
      .returning({ id: contacts.id, email: contacts.email });
    if (!row) {
      throw new Error("The contact was not created.");
    }
    return row;
  }

  async function sendOurs(
    input: {
      sourceId?: string;
      from?: string;
      kind?: "campaign" | "sequence" | "transactional";
      subject?: string;
      workspace?: TestWorkspace;
      sequence?: { stepId: string; enrollmentId: string };
      headers?: Record<string, string>;
      contact?: { id: string; email: string };
      html?: string;
    } = {},
  ) {
    const workspace = input.workspace ?? alpha;
    const contact = input.contact ?? (await makeContact(workspace));
    const kind = input.kind ?? "campaign";
    const message = await dispatch.enqueue({
      workspaceId: workspace.workspaceId,
      kind,
      sourceId: input.sourceId ?? ada,
      from: { email: input.from ?? "ada@alpha.test", name: "Ada Lovelace" },
      to: [contact.email],
      subject: input.subject ?? "Quick question about your team",
      html:
        input.html ??
        '<p>Hi Lin, are you free on <b>Thursday</b>?</p><img src="https://cdn.alpha.test/logo.png" alt="Alpha">',
      text: "Hi Lin, are you free on Thursday?",
      contactId: contact.id,
      headers: input.headers,
      ...(kind === "campaign" ? { campaignId } : {}),
      ...(kind === "sequence" && input.sequence
        ? { sequence: { sequenceId, ...input.sequence } }
        : {}),
    });
    await dispatch.recordEvent({ messageId: message.id, type: "sent" });
    if (!message.rfcMessageId) {
      throw new Error("The message has no RFC id.");
    }
    return { ...message, rfcMessageId: message.rfcMessageId, contact };
  }

  function mail(
    mailbox: string,
    extra: Partial<ReceivedMessage>,
    content?: Partial<ReceivedContent> | Error,
  ): Mail {
    mailCount += 1;
    const ref = `7:${mailCount}`;
    const message: Mail = {
      ref,
      messageId: `<in-${mailCount}-${randomUUID()}@customer.test>`,
      references: extra.inReplyTo ? [extra.inReplyTo] : [],
      receivedAt: new Date(),
      headers: {},
      ...extra,
    };
    fake.received.set(mailbox, [
      ...(fake.received.get(mailbox) ?? []),
      message,
    ]);
    if (content instanceof Error) {
      fake.contents.set(ref, content);
    } else if (content) {
      fake.contents.set(ref, {
        subject: "Re: Quick question about your team",
        text: null,
        html: null,
        from: message.from
          ? { email: message.from.email, name: "Lin Chen" }
          : null,
        to: [mailbox],
        date: message.receivedAt,
        ...content,
      });
    }
    return message;
  }

  function replyTo(
    ours: { rfcMessageId: string; contact: { email: string } },
    content: Partial<ReceivedContent> | Error = { text: "Thursday works." },
    extra: Partial<ReceivedMessage> = {},
    mailbox = "ada@alpha.test",
  ) {
    return mail(
      mailbox,
      {
        inReplyTo: ours.rfcMessageId,
        references: [ours.rfcMessageId],
        from: { email: ours.contact.email },
        ...extra,
      },
      content,
    );
  }

  async function threadOf(rootRfcMessageId: string, workspaceId?: string) {
    const [row] = await db
      .select()
      .from(inboxThreads)
      .where(
        and(
          eq(inboxThreads.workspaceId, workspaceId ?? alpha.workspaceId),
          eq(inboxThreads.rootRfcMessageId, rootRfcMessageId),
        ),
      );
    return row ?? null;
  }

  function storedIn(threadId: string) {
    return db
      .select()
      .from(inboxMessages)
      .where(eq(inboxMessages.threadId, threadId))
      .orderBy(asc(inboxMessages.occurredAt), asc(inboxMessages.id));
  }

  async function messageRow(id: string) {
    const [row] = await db.select().from(messages).where(eq(messages.id, id));
    if (!row) {
      throw new Error("The message is missing.");
    }
    return row;
  }

  async function cursorOf(sourceId: string) {
    const [row] = await db
      .select()
      .from(sequenceReplyCursors)
      .where(eq(sequenceReplyCursors.sourceId, sourceId));
    return row ?? null;
  }

  function poll(overrides: Parameters<MailPoller["run"]>[2] = {}) {
    return poller.run(new Date(), scope, overrides);
  }

  async function clearPollState() {
    for (const sourceId of [ada, grace, hedy, bea]) {
      await redis.del(
        pollBlockedKey(sourceId),
        pollFailuresKey(sourceId),
        pollLockKey(sourceId),
      );
    }
  }

  async function conversation(text = "Thursday works.") {
    const ours = await sendOurs();
    const received = replyTo(ours, { text });
    await poll();
    const thread = await threadOf(ours.rfcMessageId);
    if (!thread) {
      throw new Error("The reply was not stored.");
    }
    return { ours, received, thread };
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
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
      .compile();
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
    sources = app.get(SendingSourcesService);
    suppression = app.get(SuppressionService);
    poller = app.get(MailPoller);
    retention = app.get(InboxRetention);
    sendProcessor = new SendProcessor(
      app.get(DispatchRepository),
      sources,
      suppression,
      { waitMs: async () => 0 } as unknown as SendRateLimiter,
      app.get(MessageEvents),
      app.get(TrackingKeys),
    );

    const sendQueue = app.get<StubbedQueue>(getQueueToken(SEND_QUEUE));
    vi.spyOn(sendQueue, "add").mockImplementation(async (_name, data) => {
      sendJobs.push((data as SendJob).messageId);
      sendJobData.push(data as SendJob);
      return {};
    });
    vi.spyOn(sendQueue, "addBulk").mockImplementation(async () => []);
    for (const queue of [CAMPAIGN_OUTCOMES_QUEUE, SEQUENCE_OUTCOMES_QUEUE]) {
      vi.spyOn(
        app.get<StubbedQueue>(getQueueToken(queue)),
        "add",
      ).mockImplementation(async (_name, data) => {
        outcomeJobs.push({ queue, job: data as MessageOutcomeJob });
        return {};
      });
    }

    sessions = createWorkspaceSessions(app, "inbox-e2e");
    alpha = await sessions.workspace();
    beta = await sessions.workspace();
    scope = { workspaceIds: [alpha.workspaceId, beta.workspaceId] };

    ada = await connect("ada@alpha.test");
    grace = await connect("grace@alpha.test");
    hedy = await connect("hedy@alpha.test");
    bea = await connect("bea@beta.test", beta);
    const provider = await sources.connectResend(
      { workspaceId: alpha.workspaceId, userId: null },
      { name: "Product emails", apiKey: "re_test_inbox_key_12345678" },
    );
    resend = provider.id;

    campaignName = `October news ${randomUUID()}`;
    const campaign = await http<{ id: string }>("POST", "/v1/campaigns", {
      name: campaignName,
    });
    expect(campaign.status).toBe(201);
    campaignId = campaign.body.id;
    sequenceName = `Outreach ${randomUUID()}`;
    const sequence = await http<{ id: string }>("POST", "/v1/sequences", {
      name: sequenceName,
    });
    expect(sequence.status).toBe(201);
    sequenceId = sequence.body.id;
  });

  beforeEach(async () => {
    await clearPollState();
    fake.listFailures.clear();
    fake.settings.pageSize = 100;
  });

  afterAll(async () => {
    await clearPollState();
    await sessions.cleanup();
    await app.close();
  });

  describe("polling", () => {
    it("polls nothing for a mailbox that has sent no campaign, sequence or reply mail", async () => {
      const result = await poll();
      expect(result.sources).toBe(0);
      expect(fake.calls.listReceived).toEqual([]);

      await sendOurs({ kind: "transactional" });
      await sendOurs({
        kind: "campaign",
        sourceId: resend,
        from: "news@alpha.test",
      });
      expect((await poll()).sources).toBe(0);
      expect(fake.calls.listReceived).toEqual([]);
    });

    it("reads a mailbox used only by a campaign: stores the reply, suppresses the bounce, ignores the auto-reply, and fetches one body", async () => {
      const answered = await sendOurs();
      const dead = await sendOurs();
      const away = await sendOurs();
      const reply = replyTo(answered, {
        subject: "Re: Quick question about your team",
        text: "Thursday works for me.\n\nLin\n\nOn Mon, 12 Oct 2026 at 09:14, Ada Lovelace <ada@alpha.test> wrote:\n> Hi Lin, are you free on Thursday?",
        html: '<div onclick="steal()">Thursday <b>works</b> for me.<script>alert(1)</script><img src="https://tracker.customer.test/open.gif?id=1" alt="Lin\'s signature"><a href="javascript:alert(1)">here</a><style>div{background:url(https://tracker.customer.test/bg.gif)}</style></div>',
      });
      const autoReply = replyTo(
        away,
        { text: "I am out of the office." },
        { headers: { "auto-submitted": "auto-replied" } },
      );
      const bounce = mail("ada@alpha.test", {
        from: { email: "MAILER-DAEMON@mx.customer.test" },
        references: [],
        deliveryStatus: {
          action: "failed",
          status: "5.1.1",
          originalMessageId: dead.rfcMessageId,
          failedRecipient: dead.contact.email.toUpperCase(),
        },
      });
      const unrelated = mail(
        "ada@alpha.test",
        {
          inReplyTo: "<private@elsewhere.test>",
          references: ["<private@elsewhere.test>"],
          from: { email: "friend@elsewhere.test" },
        },
        { text: "A private message that has nothing to do with us." },
      );
      const newsletter = mail(
        "ada@alpha.test",
        { from: { email: "news@elsewhere.test" } },
        { text: "A newsletter." },
      );
      const ownCopy = replyTo(
        answered,
        { text: "A copy of our own mail." },
        { from: { email: "ada@alpha.test" } },
      );
      outcomeJobs.length = 0;

      const result = await poll();

      expect(result).toMatchObject({
        sources: 1,
        failed: 0,
        unsupported: 0,
        replies: 1,
        stored: 1,
        autoReplies: 1,
        bounces: 1,
        retrying: 0,
        skipped: 0,
      });
      expect(fake.calls.listReceived).toEqual(["ada@alpha.test"]);
      expect(fake.calls.fetchReceived).toEqual([reply.ref]);
      for (const untouched of [
        autoReply,
        bounce,
        unrelated,
        newsletter,
        ownCopy,
      ]) {
        expect(fake.calls.fetchReceived).not.toContain(untouched.ref);
      }
      expect(fake.calls.applyActions).toBe(0);
      expect(fake.calls.ensureFolder).toBe(0);
      expect(fake.calls.search).toBe(0);

      const blocked = await suppression.findBlocked(
        alpha.workspaceId,
        [answered.contact.email, dead.contact.email, away.contact.email],
        "campaign",
      );
      expect([...blocked.entries()]).toEqual([[dead.contact.email, "bounced"]]);
      expect((await messageRow(dead.id)).status).toBe("bounced");
      expect((await messageRow(answered.id)).repliedAt).toEqual(
        expect.any(Date),
      );
      expect((await messageRow(away.id)).repliedAt).toBeNull();
      expect(
        outcomeJobs
          .map(({ queue, job }) => `${queue}:${job.type}:${job.messageId}`)
          .sort(),
      ).toEqual(
        [
          `${CAMPAIGN_OUTCOMES_QUEUE}:bounced:${dead.id}`,
          `${CAMPAIGN_OUTCOMES_QUEUE}:replied:${answered.id}`,
        ].sort(),
      );

      const thread = await threadOf(answered.rfcMessageId);
      expect(thread).toMatchObject({
        workspaceId: alpha.workspaceId,
        sourceId: ada,
        contactId: answered.contact.id,
        contactEmail: answered.contact.email,
        contactName: "Lin Chen",
        subject: "Quick question about your team",
        snippet: "Thursday works for me. Lin",
        status: "open",
        unread: true,
        rootMessageId: answered.id,
        campaignId,
        sequenceId: null,
        messageCount: 1,
        lastDirection: "inbound",
      });
      expect(await threadOf(dead.rfcMessageId)).toBeNull();
      expect(await threadOf(away.rfcMessageId)).toBeNull();
      const [stored] = await storedIn(thread?.id ?? "");
      expect(stored).toMatchObject({
        direction: "inbound",
        rfcMessageId: reply.messageId,
        inReplyTo: answered.rfcMessageId,
        fromEmail: answered.contact.email,
        fromName: "Lin Chen",
        toEmails: ["ada@alpha.test"],
        subject: "Re: Quick question about your team",
      });
      expect(stored?.text).toContain("Thursday works for me.");
      expect(stored?.html).toBe(
        '<div>Thursday <b>works</b> for me.<span data-inbox-image="">Lin&#39;s signature</span><a>here</a></div>',
      );
      expect(stored?.occurredAt.toISOString()).toBe(
        reply.receivedAt.toISOString(),
      );
      const cursor = await cursorOf(ada);
      expect(cursor?.workspaceId).toBe(alpha.workspaceId);
      expect(cursor?.state).toEqual({
        seen: fake.received.get("ada@alpha.test")?.length,
      });
    });

    it("changes nothing when the same mail is read again", async () => {
      const { ours, thread } = await conversation();
      const before = {
        fetches: fake.calls.fetchReceived.length,
        threads: (
          await db
            .select({ id: inboxThreads.id })
            .from(inboxThreads)
            .where(eq(inboxThreads.workspaceId, alpha.workspaceId))
        ).length,
      };
      await db
        .update(inboxThreads)
        .set({ unread: false, status: "closed" })
        .where(eq(inboxThreads.id, thread.id));
      await db
        .delete(sequenceReplyCursors)
        .where(eq(sequenceReplyCursors.sourceId, ada));
      outcomeJobs.length = 0;

      const again = await poll();

      expect(again).toMatchObject({
        failed: 0,
        replies: 0,
        stored: 0,
        bounces: 0,
      });
      expect(outcomeJobs).toHaveLength(0);
      expect(fake.calls.fetchReceived).toHaveLength(before.fetches);
      expect(
        await db
          .select({ id: inboxThreads.id })
          .from(inboxThreads)
          .where(eq(inboxThreads.workspaceId, alpha.workspaceId)),
      ).toHaveLength(before.threads);
      expect(await storedIn(thread.id)).toHaveLength(1);
      expect(await threadOf(ours.rfcMessageId)).toMatchObject({
        messageCount: 1,
        unread: false,
        status: "closed",
      });
      const replied = await db
        .select({ id: messageEvents.id })
        .from(messageEvents)
        .where(
          and(
            eq(messageEvents.messageId, ours.id),
            eq(messageEvents.type, "replied"),
          ),
        );
      expect(replied).toHaveLength(1);
    });

    it("keeps a reply to our reply, a later mail in the chain and a new subject weeks later in one thread", async () => {
      const { ours, received, thread } = await conversation();
      const sent = await http<MessageBody>(
        "POST",
        `/v1/inbox/threads/${thread.id}/reply`,
        { text: "Great, see you then." },
      );
      expect(sent.status).toBe(202);
      const [, outbound] = await storedIn(thread.id);
      const ourReplyId = outbound?.rfcMessageId ?? "";
      expect(ourReplyId).toMatch(/^<.+@alpha\.test>$/);

      const second = mail(
        "ada@alpha.test",
        {
          inReplyTo: ourReplyId,
          references: [ours.rfcMessageId, received.messageId ?? "", ourReplyId],
          from: { email: ours.contact.email },
        },
        { text: "Could we make it 3pm?" },
      );
      await poll();
      const third = mail(
        "ada@alpha.test",
        {
          inReplyTo: second.messageId,
          references: [second.messageId ?? ""],
          from: { email: ours.contact.email },
        },
        { subject: "One more thing", text: "Bring the contract please." },
      );
      const fourth = mail(
        "ada@alpha.test",
        {
          inReplyTo: ours.rfcMessageId,
          references: [ours.rfcMessageId],
          from: { email: ours.contact.email },
        },
        { subject: "A different subject", text: "Are you still interested?" },
      );
      const result = await poll();

      expect(result).toMatchObject({ failed: 0, stored: 2 });
      const all = await storedIn(thread.id);
      expect(all.map((message) => message.direction)).toEqual([
        "inbound",
        "outbound",
        "inbound",
        "inbound",
        "inbound",
      ]);
      expect(all.map((message) => message.rfcMessageId)).toEqual([
        received.messageId,
        ourReplyId,
        second.messageId,
        third.messageId,
        fourth.messageId,
      ]);
      expect(await threadOf(ours.rfcMessageId)).toMatchObject({
        id: thread.id,
        messageCount: 5,
        unread: true,
        status: "open",
        lastDirection: "inbound",
        snippet: "Are you still interested?",
        subject: "Quick question about your team",
      });
      const threads = await db
        .select({ id: inboxThreads.id })
        .from(inboxThreads)
        .where(
          and(
            eq(inboxThreads.workspaceId, alpha.workspaceId),
            eq(inboxThreads.contactEmail, ours.contact.email),
          ),
        );
      expect(threads).toHaveLength(1);
    });

    it("threads a reply to a follow-up under the first email of the sequence", async () => {
      const contact = await makeContact();
      const enrollmentId = randomUUID();
      const first = await sendOurs({
        kind: "sequence",
        contact,
        sequence: { stepId: randomUUID(), enrollmentId },
        subject: "An idea for your team",
      });
      const followUp = await sendOurs({
        kind: "sequence",
        contact,
        sequence: { stepId: randomUUID(), enrollmentId },
        subject: "Re: An idea for your team",
        headers: {
          "In-Reply-To": first.rfcMessageId,
          References: first.rfcMessageId,
        },
      });
      outcomeJobs.length = 0;
      replyTo(
        { ...followUp, contact },
        { text: "Tell me more." },
        { references: [first.rfcMessageId, followUp.rfcMessageId] },
      );
      replyTo({ ...first, contact }, { text: "And send pricing." });

      const result = await poll();

      expect(result).toMatchObject({ failed: 0, replies: 2, stored: 2 });
      expect(await threadOf(followUp.rfcMessageId)).toBeNull();
      const thread = await threadOf(first.rfcMessageId);
      expect(thread).toMatchObject({
        rootMessageId: first.id,
        sequenceId,
        enrollmentId,
        campaignId: null,
        contactId: contact.id,
        subject: "An idea for your team",
        messageCount: 2,
      });
      expect(
        outcomeJobs.map(({ queue, job }) => `${queue}:${job.type}`).sort(),
      ).toEqual([
        `${SEQUENCE_OUTCOMES_QUEUE}:replied`,
        `${SEQUENCE_OUTCOMES_QUEUE}:replied`,
      ]);
      const listed = await http<ThreadList>(
        "GET",
        `/v1/inbox/threads?search=${encodeURIComponent(contact.email)}`,
      );
      expect(listed.body.items[0]?.origin).toEqual({
        type: "sequence",
        id: sequenceId,
        name: sequenceName,
      });
    });

    it("stores a reply with no body when the adapter cannot fetch one, and derives the text from HTML when that is all there is", async () => {
      const plain = await sendOurs();
      const rich = await sendOurs();
      const bare = mail("ada@alpha.test", {
        inReplyTo: plain.rfcMessageId,
        references: [plain.rfcMessageId],
        from: { email: plain.contact.email },
      });
      replyTo(rich, {
        html: "<html><head><title>x</title></head><body><p>Yes &amp; thanks.</p><blockquote>Hi Lin, are you free?</blockquote></body></html>",
      });
      await poll();

      const first = await threadOf(plain.rfcMessageId);
      expect(first).toMatchObject({ snippet: "", messageCount: 1 });
      expect((await storedIn(first?.id ?? ""))[0]).toMatchObject({
        rfcMessageId: bare.messageId,
        text: null,
        html: null,
        subject: "",
        fromName: null,
      });
      const second = await threadOf(rich.rfcMessageId);
      expect(second?.snippet).toBe("Yes & thanks.");
      expect((await storedIn(second?.id ?? ""))[0]).toMatchObject({
        text: "Yes & thanks.\n\n> Hi Lin, are you free?",
        html: "<p>Yes &amp; thanks.</p><blockquote>Hi Lin, are you free?</blockquote>",
      });
    });

    it("never matches mail to another workspace's messages", async () => {
      const theirs = await sendOurs({
        workspace: beta,
        sourceId: bea,
        from: "bea@beta.test",
        kind: "transactional",
      });
      const crossed = replyTo(theirs, { text: "Meant for beta." });
      const fetches = fake.calls.fetchReceived.length;
      const result = await poll();

      expect(result).toMatchObject({ failed: 0, replies: 0, stored: 0 });
      expect(fake.calls.fetchReceived).toHaveLength(fetches);
      expect(fake.calls.fetchReceived).not.toContain(crossed.ref);
      expect(await threadOf(theirs.rfcMessageId)).toBeNull();
      expect(await threadOf(theirs.rfcMessageId, beta.workspaceId)).toBeNull();
      expect((await messageRow(theirs.id)).repliedAt).toBeNull();
    });

    it("carries on with other mailboxes when one fails, backs the failing one off, and reads it again later", async () => {
      const viaAda = await sendOurs();
      const viaGrace = await sendOurs({
        sourceId: grace,
        from: "grace@alpha.test",
      });
      replyTo(viaAda, { text: "Reached Ada." });
      replyTo(viaGrace, { text: "Reached Grace." }, {}, "grace@alpha.test");
      fake.listFailures.set(
        "grace@alpha.test",
        new IntegrationError("temporary", "The IMAP server timed out."),
      );
      fake.calls.listReceived.length = 0;

      const first = await poll();

      expect(first).toMatchObject({ sources: 2, failed: 1, stored: 1 });
      expect(await threadOf(viaAda.rfcMessageId)).not.toBeNull();
      expect(await threadOf(viaGrace.rfcMessageId)).toBeNull();
      expect(await redis.get(pollFailuresKey(grace))).toBe("1");
      expect(await redis.pttl(pollBlockedKey(grace))).toBeGreaterThan(0);
      const source = (await sources.list(alpha.workspaceId)).sources.find(
        (item) => item.id === grace,
      );
      expect(source?.status).toBe("active");

      fake.listFailures.clear();
      fake.calls.listReceived.length = 0;
      const second = await poll();
      expect(second).toMatchObject({ backedOff: 1, failed: 0, stored: 0 });
      expect(fake.calls.listReceived).not.toContain("grace@alpha.test");
      expect(await threadOf(viaGrace.rfcMessageId)).toBeNull();

      await redis.del(pollBlockedKey(grace));
      const third = await poll();
      expect(third).toMatchObject({ backedOff: 0, failed: 0, stored: 1 });
      expect(await threadOf(viaGrace.rfcMessageId)).toMatchObject({
        sourceId: grace,
        messageCount: 1,
      });
      expect(await redis.exists(pollFailuresKey(grace))).toBe(0);
    });

    it("marks a mailbox whose sign-in is rejected as needing attention and stops reading it", async () => {
      const viaHedy = await sendOurs({
        sourceId: hedy,
        from: "hedy@alpha.test",
      });
      replyTo(viaHedy, { text: "Reached Hedy." }, {}, "hedy@alpha.test");
      fake.listFailures.set(
        "hedy@alpha.test",
        new IntegrationError(
          "invalid_credentials",
          "The IMAP server rejected the sign-in.",
        ),
      );
      fake.brokenLogins.add("hedy@alpha.test");

      const first = await poll();
      expect(first.failed).toBe(1);
      const source = (await sources.list(alpha.workspaceId)).sources.find(
        (item) => item.id === hedy,
      );
      expect(source).toMatchObject({
        status: "needs_attention",
        lastError: { code: "invalid_credentials" },
      });

      await redis.del(pollBlockedKey(hedy));
      fake.calls.listReceived.length = 0;
      const second = await poll();
      expect(second.needsAttention).toBe(1);
      expect(fake.calls.listReceived).not.toContain("hedy@alpha.test");
      expect(await threadOf(viaHedy.rfcMessageId)).toBeNull();

      fake.listFailures.clear();
      fake.brokenLogins.clear();
      const fixed = await sources.test(
        { workspaceId: alpha.workspaceId, userId: null },
        hedy,
      );
      expect(fixed.ok).toBe(true);
      const third = await poll();
      expect(third).toMatchObject({ needsAttention: 0, failed: 0, stored: 1 });
      expect(await threadOf(viaHedy.rfcMessageId)).not.toBeNull();
    });

    it("retries a message that fails without losing its place, handles the rest of the page, and after three tries stores it without a body", async () => {
      const stubborn = await sendOurs();
      const fine = await sendOurs();
      const broken = replyTo(
        stubborn,
        new IntegrationError("temporary", "The IMAP server dropped the line."),
      );
      replyTo(fine, { text: "This one is fine." });
      const before = (await cursorOf(ada))?.state;
      const checkedAt = (await cursorOf(ada))?.lastCheckedAt?.toISOString();
      const attempts = fake.calls.fetchReceived.filter(
        (ref) => ref === broken.ref,
      ).length;

      const first = await poll();
      expect(first).toMatchObject({
        failed: 0,
        retrying: 1,
        skipped: 0,
        stored: 1,
        replies: 1,
      });
      expect(await threadOf(fine.rfcMessageId)).toMatchObject({
        messageCount: 1,
      });
      expect(await threadOf(stubborn.rfcMessageId)).toBeNull();
      expect((await messageRow(stubborn.id)).repliedAt).toEqual(
        expect.any(Date),
      );
      expect((await cursorOf(ada))?.state).toEqual(before);
      expect((await cursorOf(ada))?.lastCheckedAt?.toISOString()).toBe(
        checkedAt,
      );

      const second = await poll();
      expect(second).toMatchObject({ retrying: 1, stored: 0, replies: 0 });
      expect((await cursorOf(ada))?.state).toEqual(before);

      const third = await poll();
      expect(third).toMatchObject({
        failed: 0,
        retrying: 0,
        skipped: 0,
        stored: 1,
      });
      expect(
        fake.calls.fetchReceived.filter((ref) => ref === broken.ref),
      ).toHaveLength(attempts + 3);
      const thread = await threadOf(stubborn.rfcMessageId);
      expect((await storedIn(thread?.id ?? ""))[0]).toMatchObject({
        rfcMessageId: broken.messageId,
        text: null,
        html: null,
      });
      expect((await cursorOf(ada))?.state).toEqual({
        seen: fake.received.get("ada@alpha.test")?.length,
      });

      const fourth = await poll();
      expect(fourth).toMatchObject({ retrying: 0, stored: 0, replies: 0 });
      expect(
        fake.calls.fetchReceived.filter((ref) => ref === broken.ref),
      ).toHaveLength(attempts + 3);
    });

    it("gives up on a message that cannot be handled at all after the bounded tries, and moves on", async () => {
      const ours = await sendOurs();
      const poisoned = replyTo(ours, { text: "x" });
      const original = dispatch.recordEvent.bind(dispatch);
      const spy = vi
        .spyOn(dispatch, "recordEvent")
        .mockImplementation(async (input) => {
          if (input.messageId === ours.id && input.type === "replied") {
            throw new Error("The database is away.");
          }
          return original(input);
        });
      try {
        expect(await poll()).toMatchObject({ retrying: 1, skipped: 0 });
        expect(await poll()).toMatchObject({ retrying: 1, skipped: 0 });
        const last = await poll();
        expect(last).toMatchObject({ failed: 0, retrying: 0, skipped: 1 });
      } finally {
        spy.mockRestore();
      }
      expect((await cursorOf(ada))?.state).toEqual({
        seen: fake.received.get("ada@alpha.test")?.length,
      });
      expect(await threadOf(ours.rfcMessageId)).toBeNull();
      expect(fake.calls.fetchReceived).not.toContain(poisoned.ref);
    });

    it("saves the cursor page by page and stops at the time budget without skipping mail", async () => {
      const one = await sendOurs();
      const two = await sendOurs();
      const three = await sendOurs();
      const start = fake.received.get("ada@alpha.test")?.length ?? 0;
      replyTo(one, { text: "First." });
      replyTo(two, { text: "Second." });
      replyTo(three, { text: "Third." });

      const none = await poll({ sourceBudgetMs: 0 });
      expect(none).toMatchObject({ stored: 0, failed: 0 });
      expect(none.outOfTime).toBeGreaterThan(0);
      expect((await cursorOf(ada))?.state).toEqual({ seen: start });

      fake.settings.pageSize = 2;
      fake.calls.listReceived.length = 0;
      const all = await poll();
      expect(all).toMatchObject({ outOfTime: 0, stored: 3 });
      expect(
        fake.calls.listReceived.filter((name) => name === "ada@alpha.test"),
      ).toHaveLength(2);
      expect((await cursorOf(ada))?.state).toEqual({ seen: start + 3 });
    });

    it("leaves a mailbox alone while another run is reading it", async () => {
      const ours = await sendOurs();
      replyTo(ours, { text: "Hello." });
      await redis.set(pollLockKey(ada), "another-run", "PX", 60_000);
      fake.calls.listReceived.length = 0;

      const result = await poll();
      expect(result).toMatchObject({ busy: 1, stored: 0 });
      expect(fake.calls.listReceived).not.toContain("ada@alpha.test");
      expect(await redis.get(pollLockKey(ada))).toBe("another-run");

      await redis.del(pollLockKey(ada));
      expect(await poll()).toMatchObject({ busy: 0, stored: 1 });
      expect(await redis.exists(pollLockKey(ada))).toBe(0);
    });
  });

  describe("HTTP", () => {
    it("rejects requests without a session or API key, and accepts an API key", async () => {
      for (const [method, url] of [
        ["GET", "/v1/inbox/threads"],
        ["GET", "/v1/inbox/summary"],
        ["GET", `/v1/inbox/threads/${randomUUID()}`],
        ["POST", `/v1/inbox/threads/${randomUUID()}/read`],
        ["POST", `/v1/inbox/threads/${randomUUID()}/reply`],
      ] as const) {
        const response = await app.inject({ method, url });
        expect(response.statusCode).toBe(401);
      }
      const key = await createApiKey(app, alpha.owner, alpha.workspaceId);
      const listed = await app.inject({
        method: "GET",
        url: "/v1/inbox/threads?limit=1",
        headers: { "x-api-key": key },
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json().items).toHaveLength(1);
      const summary = await app.inject({
        method: "GET",
        url: "/v1/inbox/summary",
        headers: { "x-api-key": key },
      });
      expect(summary.statusCode).toBe(200);
      expect(summary.json()).toEqual({ unreadCount: expect.any(Number) });
    });

    it("lists conversations newest first with the source, the origin and the unread count", async () => {
      const { ours, thread } = await conversation("Listed first.");
      const listed = await http<ThreadList>("GET", "/v1/inbox/threads");

      expect(listed.status).toBe(200);
      expect(listed.body.items[0]).toEqual({
        id: thread.id,
        contact: {
          id: ours.contact.id,
          email: ours.contact.email,
          name: "Lin Chen",
        },
        subject: "Quick question about your team",
        snippet: "Listed first.",
        status: "open",
        unread: true,
        source: { id: ada, name: "ada@alpha.test", email: "ada@alpha.test" },
        origin: { type: "campaign", id: campaignId, name: campaignName },
        messageCount: 1,
        lastDirection: "inbound",
        lastMessageAt: thread.lastMessageAt.toISOString(),
      });
      const times = listed.body.items.map((item) => item.lastMessageAt);
      expect(times).toEqual([...times].sort().reverse());
      const unread = await db
        .select({ id: inboxThreads.id })
        .from(inboxThreads)
        .where(
          and(
            eq(inboxThreads.workspaceId, alpha.workspaceId),
            eq(inboxThreads.unread, true),
            eq(inboxThreads.status, "open"),
          ),
        );
      expect(listed.body.unreadCount).toBe(unread.length);
      expect(
        (await http<{ unreadCount: number }>("GET", "/v1/inbox/summary")).body,
      ).toEqual({ unreadCount: unread.length });
    });

    it("pages with a cursor and filters by status, unread, source and search", async () => {
      const open = await conversation("Still open.");
      const closed = await conversation("Now closed.");
      const read = await conversation("Already read.");
      await http("POST", `/v1/inbox/threads/${closed.thread.id}/close`);
      await http("POST", `/v1/inbox/threads/${read.thread.id}/read`);

      const ids = async (query: string) => {
        const seen: string[] = [];
        let cursor: string | null = null;
        do {
          const page: { status: number; body: ThreadList } = await http(
            "GET",
            `/v1/inbox/threads?${query}${cursor ? `&cursor=${cursor}` : ""}`,
          );
          expect(page.status).toBe(200);
          seen.push(...page.body.items.map((item) => item.id));
          cursor = page.body.nextCursor;
        } while (cursor);
        return seen;
      };

      const everything = await ids("status=all&limit=2");
      expect(new Set(everything).size).toBe(everything.length);
      expect(everything).toEqual(
        expect.arrayContaining([
          open.thread.id,
          closed.thread.id,
          read.thread.id,
        ]),
      );
      const total = await db
        .select({ id: inboxThreads.id })
        .from(inboxThreads)
        .where(eq(inboxThreads.workspaceId, alpha.workspaceId));
      expect(everything).toHaveLength(total.length);

      const openIds = await ids("limit=100");
      expect(openIds).toContain(open.thread.id);
      expect(openIds).toContain(read.thread.id);
      expect(openIds).not.toContain(closed.thread.id);
      expect(await ids("status=closed")).toContain(closed.thread.id);
      expect(await ids("status=closed")).not.toContain(open.thread.id);

      const unreadIds = await ids("unread=true");
      expect(unreadIds).toContain(open.thread.id);
      expect(unreadIds).not.toContain(read.thread.id);
      expect(unreadIds).not.toContain(closed.thread.id);
      expect(await ids("status=all&unread=true")).toContain(closed.thread.id);
      expect(await ids("unread=false")).toContain(read.thread.id);
      expect(await ids("unread=false")).not.toContain(open.thread.id);

      expect(await ids(`sourceId=${ada}&limit=100`)).toContain(open.thread.id);
      expect(await ids(`sourceId=${resend}`)).toEqual([]);
      expect(
        await ids(`search=${encodeURIComponent(open.ours.contact.email)}`),
      ).toEqual([open.thread.id]);
      expect(
        await ids(
          `status=all&search=${encodeURIComponent(closed.ours.contact.email.toUpperCase())}`,
        ),
      ).toEqual([closed.thread.id]);
      expect(await ids("search=100%25_nothing")).toEqual([]);
      expect(await ids("search=quick%20question&limit=100")).toContain(
        open.thread.id,
      );
    });

    it("names the field when a filter is not valid", async () => {
      for (const [query, field] of [
        ["status=archived", "status"],
        ["unread=maybe", "unread"],
        ["sourceId=nope", "sourceId"],
        ["cursor=nope", "cursor"],
        [`search=${"x".repeat(201)}`, "search"],
      ]) {
        const response = await http<{ code: string; field: string }>(
          "GET",
          `/v1/inbox/threads?${query}`,
        );
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ code: "validation", field });
      }
    });

    it("shows a conversation starting with the email that was answered, with safe HTML, and marks nothing", async () => {
      const { ours, received, thread } = await conversation();
      const shown = await http<ThreadBody & { messages: MessageBody[] }>(
        "GET",
        `/v1/inbox/threads/${thread.id}`,
      );

      expect(shown.status).toBe(200);
      expect(shown.body).toMatchObject({
        id: thread.id,
        unread: true,
        messageCount: 1,
        origin: { type: "campaign", id: campaignId, name: campaignName },
      });
      expect(shown.body.messages).toEqual([
        {
          id: ours.id,
          direction: "outbound",
          from: { email: "ada@alpha.test", name: "Ada Lovelace" },
          to: [ours.contact.email],
          subject: "Quick question about your team",
          text: "Hi Lin, are you free on Thursday?",
          html: '<p>Hi Lin, are you free on <b>Thursday</b>?</p><span data-inbox-image="">Alpha</span>',
          occurredAt: expect.any(String),
          status: "sent",
        },
        {
          id: expect.any(String),
          direction: "inbound",
          from: { email: ours.contact.email, name: "Lin Chen" },
          to: ["ada@alpha.test"],
          subject: "Re: Quick question about your team",
          text: "Thursday works.",
          html: null,
          occurredAt: received.receivedAt.toISOString(),
          status: null,
        },
      ]);
      expect((await threadOf(ours.rfcMessageId))?.unread).toBe(true);
    });

    it("marks read and unread, closes and reopens, and keeps the unread count right", async () => {
      const { thread } = await conversation();
      const count = async () =>
        (await http<{ unreadCount: number }>("GET", "/v1/inbox/summary")).body
          .unreadCount;
      const start = await count();

      const read = await http<ThreadBody>(
        "POST",
        `/v1/inbox/threads/${thread.id}/read`,
      );
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({ id: thread.id, unread: false });
      expect(await count()).toBe(start - 1);

      const unread = await http<ThreadBody>(
        "POST",
        `/v1/inbox/threads/${thread.id}/unread`,
      );
      expect(unread.body).toMatchObject({ unread: true, status: "open" });
      expect(await count()).toBe(start);

      const closed = await http<ThreadBody>(
        "POST",
        `/v1/inbox/threads/${thread.id}/close`,
      );
      expect(closed.status).toBe(200);
      expect(closed.body).toMatchObject({ status: "closed", unread: true });
      expect(await count()).toBe(start - 1);

      const reopened = await http<ThreadBody>(
        "POST",
        `/v1/inbox/threads/${thread.id}/reopen`,
      );
      expect(reopened.body).toMatchObject({ status: "open", unread: true });
      expect(await count()).toBe(start);
    });

    it("reopens a closed conversation and marks it unread when the contact writes again", async () => {
      const { ours, thread } = await conversation();
      await http("POST", `/v1/inbox/threads/${thread.id}/read`);
      await http("POST", `/v1/inbox/threads/${thread.id}/close`);
      replyTo(ours, { text: "One more question." });
      await poll();
      expect(await threadOf(ours.rfcMessageId)).toMatchObject({
        status: "open",
        unread: true,
        messageCount: 2,
        snippet: "One more question.",
      });
    });

    it("keeps one workspace's conversations out of another's reach", async () => {
      const { ours, thread } = await conversation();
      const sends = sendJobs.length;
      for (const [method, path] of [
        ["GET", ""],
        ["POST", "/read"],
        ["POST", "/unread"],
        ["POST", "/close"],
        ["POST", "/reopen"],
        ["POST", "/reply"],
      ] as const) {
        const response = await http(
          method,
          `/v1/inbox/threads/${thread.id}${path}`,
          method === "POST" ? { text: "Hello from beta." } : undefined,
          beta,
        );
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({ code: "not_found" });
      }
      for (const id of [randomUUID(), "not-an-id"]) {
        expect((await http("GET", `/v1/inbox/threads/${id}`)).status).toBe(404);
        expect(
          (await http("POST", `/v1/inbox/threads/${id}/close`)).status,
        ).toBe(404);
        expect(
          (await http("POST", `/v1/inbox/threads/${id}/reply`, { text: "x" }))
            .status,
        ).toBe(404);
      }
      const theirs = await http<ThreadList>(
        "GET",
        "/v1/inbox/threads?status=all",
        undefined,
        beta,
      );
      expect(theirs.body).toEqual({
        items: [],
        nextCursor: null,
        unreadCount: 0,
      });
      expect(
        (
          await http<{ unreadCount: number }>(
            "GET",
            "/v1/inbox/summary",
            undefined,
            beta,
          )
        ).body,
      ).toEqual({ unreadCount: 0 });
      const betaKey = await createApiKey(app, beta.owner, beta.workspaceId);
      const viaKey = await app.inject({
        method: "GET",
        url: `/v1/inbox/threads/${thread.id}`,
        headers: { "x-api-key": betaKey },
      });
      expect(viaKey.statusCode).toBe(404);
      expect(await threadOf(ours.rfcMessageId)).toMatchObject({
        status: "open",
        unread: true,
        messageCount: 1,
      });
      expect(sendJobs).toHaveLength(sends);
    });
  });

  describe("replying", () => {
    it("sends from the conversation's mailbox as kind reply, in the email thread, with no tracking and no unsubscribe, and stores it", async () => {
      const { ours, received, thread } = await conversation();
      await http("POST", `/v1/inbox/threads/${thread.id}/close`);
      const sends = sendJobs.length;

      const sent = await http<MessageBody>(
        "POST",
        `/v1/inbox/threads/${thread.id}/reply`,
        {
          text: "Great, see you on Thursday.\n\nAda",
          html: '<p onclick="x()">Great, see you on <b>Thursday</b>.</p><script>alert(1)</script><img src="https://alpha.test/sig.png" alt="Ada">',
        },
      );

      expect(sent.status).toBe(202);
      expect(sent.body).toEqual({
        id: expect.any(String),
        direction: "outbound",
        from: { email: "ada@alpha.test", name: "Ada Lovelace" },
        to: [ours.contact.email],
        subject: "Re: Quick question about your team",
        text: "Great, see you on Thursday.\n\nAda",
        html: '<p>Great, see you on <b>Thursday</b>.</p><span data-inbox-image="">Ada</span>',
        occurredAt: expect.any(String),
        status: "queued",
      });
      expect(sendJobs).toHaveLength(sends + 1);
      const row = await messageRow(sendJobs.at(-1) ?? "");
      expect(row).toMatchObject({
        workspaceId: alpha.workspaceId,
        kind: "reply",
        sourceId: ada,
        status: "queued",
        fromEmail: "ada@alpha.test",
        toEmails: [ours.contact.email],
        subject: "Re: Quick question about your team",
        contactId: ours.contact.id,
        campaignId: null,
        sequenceId: null,
        trackOpens: false,
        trackClicks: false,
        unsubscribeListId: null,
      });
      const [content] = await db
        .select()
        .from(messageContents)
        .where(eq(messageContents.messageId, row.id));
      expect(content?.headers).toEqual({
        "In-Reply-To": received.messageId,
        References: `${ours.rfcMessageId} ${received.messageId}`,
      });
      expect(content?.html).toBe(sent.body.html);
      expect(content?.text).toBe(sent.body.text);

      const stored = await storedIn(thread.id);
      expect(stored).toHaveLength(2);
      expect(stored[1]).toMatchObject({
        id: sent.body.id,
        direction: "outbound",
        rfcMessageId: row.rfcMessageId,
        inReplyTo: received.messageId,
        outboundMessageId: row.id,
        sentByUserId: alpha.owner.userId,
      });
      expect(await threadOf(ours.rfcMessageId)).toMatchObject({
        status: "open",
        unread: false,
        messageCount: 2,
        lastDirection: "outbound",
        snippet: "Great, see you on Thursday. Ada",
      });
      const shown = await http<{ messages: MessageBody[] }>(
        "GET",
        `/v1/inbox/threads/${thread.id}`,
      );
      expect(
        shown.body.messages.map((message) => [
          message.direction,
          message.status,
        ]),
      ).toEqual([
        ["outbound", "sent"],
        ["inbound", null],
        ["outbound", "queued"],
      ]);
    });

    it("is sent by the worker in the email thread with no tracking, counts toward the daily limit, and then shows as sent", async () => {
      const { ours, received, thread } = await conversation();
      const sentToday = async () =>
        (await sources.list(alpha.workspaceId)).sources.find(
          (source) => source.id === ada,
        )?.sentToday ?? 0;
      const before = await sentToday();
      const accepted = await http<MessageBody>(
        "POST",
        `/v1/inbox/threads/${thread.id}/reply`,
        {
          text: "Sure, here is the pricing.",
          html: '<p>Sure, here is the <a href="https://alpha.test/pricing">pricing</a>.</p>',
        },
      );
      expect(accepted.status).toBe(202);
      const data = sendJobData.at(-1);
      if (!data) {
        throw new Error("No send job was added for the reply.");
      }
      fake.sent.length = 0;
      outcomeJobs.length = 0;

      await sendProcessor.process(
        {
          data,
          attemptsMade: 0,
          opts: { attempts: 6 },
          progress: 0,
          updateProgress: vi.fn(async () => undefined),
          moveToDelayed: vi.fn(async () => undefined),
        } as unknown as Job<SendJob>,
        "token",
      );

      expect(fake.sent).toHaveLength(1);
      const [wire] = fake.sent;
      const row = await messageRow(data.messageId);
      expect(wire).toMatchObject({
        from: { email: "ada@alpha.test", name: "Ada Lovelace" },
        to: [ours.contact.email],
        subject: "Re: Quick question about your team",
        text: "Sure, here is the pricing.",
        html: '<p>Sure, here is the <a href="https://alpha.test/pricing" target="_blank" rel="noopener noreferrer nofollow">pricing</a>.</p>',
        messageId: row.rfcMessageId,
        headers: {
          "In-Reply-To": received.messageId,
          References: `${ours.rfcMessageId} ${received.messageId}`,
        },
      });
      expect(Object.keys(wire?.headers ?? {}).sort()).toEqual([
        "In-Reply-To",
        "References",
      ]);
      expect(wire?.html).not.toMatch(/\/t\/|<img/);
      expect(row).toMatchObject({ kind: "reply", status: "sent" });
      expect(await sentToday()).toBe(before + 1);
      expect(outcomeJobs).toEqual([]);
      const shown = await http<{ messages: MessageBody[] }>(
        "GET",
        `/v1/inbox/threads/${thread.id}`,
      );
      expect(shown.body.messages.at(-1)).toMatchObject({
        id: accepted.body.id,
        direction: "outbound",
        status: "sent",
      });
    });

    it("is a known kind everywhere dispatch reads kinds: the list, the hourly breakdown and the recent senders", async () => {
      const { ours, thread } = await conversation();
      const sent = await http<MessageBody>(
        "POST",
        `/v1/inbox/threads/${thread.id}/reply`,
        { text: "Counted." },
      );
      expect(sent.status).toBe(202);
      const id = sendJobs.at(-1) ?? "";
      const listed = await dispatch.list(alpha.workspaceId, {
        contactId: ours.contact.id,
      });
      expect(listed.emails.map((email) => email.kind).sort()).toEqual([
        "campaign",
        "reply",
      ]);
      await dispatch.recordEvent({ messageId: id, type: "sent" });
      const now = new Date();
      const hourly = await dispatch.hourlyByKind(alpha.workspaceId, {
        from: new Date(now.getTime() - 60 * 60 * 1000),
        to: new Date(now.getTime() + 60 * 60 * 1000),
        timezone: "UTC",
        kinds: ["reply"],
      });
      expect(hourly.reduce((sum, row) => sum + row.count, 0)).toBeGreaterThan(
        0,
      );
      expect(hourly.every((row) => row.kind === "reply")).toBe(true);
      const senders = await dispatch.recentSenders({
        since: new Date(now.getTime() - 60_000),
        kinds: ["reply"],
        workspaceIds: [alpha.workspaceId],
        accepts: () => true,
      });
      expect(senders).toContainEqual({
        workspaceId: alpha.workspaceId,
        sourceId: ada,
        integrationType: "imap-smtp",
      });
    });

    it("still reaches a contact who unsubscribed, but never one who bounced, complained or was blocked", async () => {
      const unsubscribed = await conversation();
      await suppression.record({
        workspaceId: alpha.workspaceId,
        email: unsubscribed.ours.contact.email,
        reason: "unsubscribed",
        origin: "user",
      });
      const allowed = await http<MessageBody>(
        "POST",
        `/v1/inbox/threads/${unsubscribed.thread.id}/reply`,
        { text: "Understood, no more newsletters." },
      );
      expect(allowed.status).toBe(202);
      expect(
        await suppression.findBlocked(
          alpha.workspaceId,
          [unsubscribed.ours.contact.email],
          "reply",
        ),
      ).toEqual(new Map());
      expect(
        await suppression.findBlocked(
          alpha.workspaceId,
          [unsubscribed.ours.contact.email],
          "campaign",
        ),
      ).toEqual(new Map([[unsubscribed.ours.contact.email, "unsubscribed"]]));

      for (const reason of ["bounced", "complained", "manual"] as const) {
        const { ours, thread } = await conversation();
        await suppression.record({
          workspaceId: alpha.workspaceId,
          email: ours.contact.email,
          reason,
          origin: "user",
        });
        const sends = sendJobs.length;
        const refused = await http<{ code: string; message: string }>(
          "POST",
          `/v1/inbox/threads/${thread.id}/reply`,
          { text: "Are you there?" },
        );
        expect(refused.status).toBe(409);
        expect(refused.body.code).toBe("recipient_suppressed");
        expect(sendJobs).toHaveLength(sends);
        expect(await storedIn(thread.id)).toHaveLength(1);
        expect(await threadOf(ours.rfcMessageId)).toMatchObject({
          unread: true,
          lastDirection: "inbound",
        });
        const rows = await db
          .select({ id: messages.id })
          .from(messages)
          .where(
            and(
              eq(messages.workspaceId, alpha.workspaceId),
              eq(messages.contactId, ours.contact.id),
              eq(messages.kind, "reply"),
            ),
          );
        expect(rows).toEqual([]);
      }
    });

    it("validates the reply and refuses a paused mailbox without storing anything", async () => {
      const { thread } = await conversation();
      for (const [payload, field] of [
        [{}, "text"],
        [{ text: "   " }, "text"],
        [{ text: 5 }, "text"],
        [{ text: "x".repeat(100_001) }, "text"],
        [{ text: "Hello", html: 5 }, "html"],
        [{ text: "Hello", html: "x".repeat(400_001) }, "html"],
      ] as const) {
        const response = await http<{ code: string; field: string }>(
          "POST",
          `/v1/inbox/threads/${thread.id}/reply`,
          payload,
        );
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ code: "validation", field });
      }

      const viaGrace = await sendOurs({
        sourceId: grace,
        from: "grace@alpha.test",
      });
      replyTo(viaGrace, { text: "Hello Grace." }, {}, "grace@alpha.test");
      await poll();
      const paused = await threadOf(viaGrace.rfcMessageId);
      const pause = await http("PATCH", `/v1/sending-sources/${grace}`, {
        paused: true,
      });
      expect(pause.status).toBe(200);
      const sends = sendJobs.length;
      const refused = await http<{ code: string }>(
        "POST",
        `/v1/inbox/threads/${paused?.id}/reply`,
        { text: "Hello." },
      );
      await http("PATCH", `/v1/sending-sources/${grace}`, { paused: false });
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe("source_unavailable");
      expect(sendJobs).toHaveLength(sends);
      expect(await storedIn(paused?.id ?? "")).toHaveLength(1);
    });

    it("never puts a hostile Message-ID from the contact into our reply's headers", async () => {
      const ours = await sendOurs();
      const hostile = replyTo(
        ours,
        { text: "Hello." },
        { messageId: "<x@customer.test>\r\nBcc: eve@evil.test" },
      );
      await poll();
      const thread = await threadOf(ours.rfcMessageId);
      const [stored] = await storedIn(thread?.id ?? "");
      expect(stored?.rfcMessageId).toMatch(
        /^<[0-9a-f]{32}@.+\.inbox\.invalid>$/,
      );
      expect(stored?.rfcMessageId).not.toContain("evil");
      await poll();
      expect(await storedIn(thread?.id ?? "")).toHaveLength(1);

      const sent = await http<MessageBody>(
        "POST",
        `/v1/inbox/threads/${thread?.id}/reply`,
        { text: "Hello back." },
      );
      expect(sent.status).toBe(202);
      const [content] = await db
        .select()
        .from(messageContents)
        .where(eq(messageContents.messageId, sendJobs.at(-1) ?? ""));
      expect(content?.headers).toEqual({
        "In-Reply-To": ours.rfcMessageId,
        References: ours.rfcMessageId,
      });
      expect(hostile.ref).toBeTruthy();
    });

    it("replies with an API key and records no user", async () => {
      const { thread } = await conversation();
      const key = await createApiKey(app, alpha.owner, alpha.workspaceId);
      const response = await app.inject({
        method: "POST",
        url: `/v1/inbox/threads/${thread.id}/reply`,
        headers: { "x-api-key": key },
        payload: { text: "Sent by an integration." },
      });
      expect(response.statusCode).toBe(202);
      const stored = await storedIn(thread.id);
      expect(stored[1]).toMatchObject({
        direction: "outbound",
        sentByUserId: null,
        html: null,
        text: "Sent by an integration.",
      });
    });
  });

  describe("retention", () => {
    it("deletes messages older than the message retention and the conversations left empty, and nothing newer", async () => {
      const mixed = await conversation("Recent enough.");
      const gone = await conversation("Long ago.");
      const old = new Date();
      old.setUTCMonth(old.getUTCMonth() - 13);
      await db
        .update(inboxMessages)
        .set({ createdAt: old })
        .where(eq(inboxMessages.threadId, gone.thread.id));
      await db.insert(inboxMessages).values({
        workspaceId: alpha.workspaceId,
        threadId: mixed.thread.id,
        direction: "inbound",
        rfcMessageId: `<old-${randomUUID()}@customer.test>`,
        fromEmail: mixed.ours.contact.email,
        text: "An old message.",
        occurredAt: old,
        createdAt: old,
      });
      await db
        .update(inboxThreads)
        .set({ messageCount: 2 })
        .where(eq(inboxThreads.id, mixed.thread.id));
      const others = await db
        .select({ id: inboxThreads.id })
        .from(inboxThreads)
        .where(
          inArray(inboxThreads.workspaceId, [
            alpha.workspaceId,
            beta.workspaceId,
          ]),
        );

      const result = await retention.run(new Date(), 1);

      expect(result.messages).toBeGreaterThanOrEqual(2);
      expect(result.threads).toBeGreaterThanOrEqual(1);
      expect(await threadOf(gone.ours.rfcMessageId)).toBeNull();
      expect(await storedIn(gone.thread.id)).toEqual([]);
      expect(await threadOf(mixed.ours.rfcMessageId)).toMatchObject({
        messageCount: 1,
        snippet: "Recent enough.",
      });
      const kept = await storedIn(mixed.thread.id);
      expect(kept.map((message) => message.text)).toEqual(["Recent enough."]);
      const after = await db
        .select({ id: inboxThreads.id })
        .from(inboxThreads)
        .where(
          inArray(inboxThreads.workspaceId, [
            alpha.workspaceId,
            beta.workspaceId,
          ]),
        );
      expect(after).toHaveLength(others.length - 1);
      expect(await retention.run()).toEqual({ messages: 0, threads: 0 });
    });
  });
});
