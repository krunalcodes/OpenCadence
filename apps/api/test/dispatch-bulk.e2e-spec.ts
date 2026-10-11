import { randomUUID } from "node:crypto";
import { getQueueToken } from "@nestjs/bullmq";
import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { and, type Db, eq, schema, sql } from "@workspace/db";
import {
  type Credentials,
  type IntegrationAdapter,
  IntegrationError,
  type OutboundMessage,
} from "@workspace/integration-core";
import { createResendAdapter } from "@workspace/integration-resend";
import { DelayedError, type Job } from "bullmq";
import { AppModule } from "../src/app/app.module";
import { uuidv7 } from "../src/common/uuid";
import { DATABASE } from "../src/infra/database/database.module";
import { TrackingKeys } from "../src/infra/tracking-keys/tracking-keys";
import { ContentArchive } from "../src/modules/dispatch/content-archive";
import {
  CAMPAIGN_OUTCOMES_QUEUE,
  DISPATCH_MAINTENANCE_QUEUE,
  type MessageOutcomeJob,
  outcomeJobId,
  SEND_QUEUE,
  SEQUENCE_OUTCOMES_QUEUE,
  type SendJob,
} from "../src/modules/dispatch/dispatch.constants";
import { DispatchRepository } from "../src/modules/dispatch/dispatch.repository";
import {
  type BatchCommon,
  type BatchRecipient,
  DispatchService,
} from "../src/modules/dispatch/dispatch.service";
import {
  DispatchMaintenanceProcessor,
  stuckWindowMs,
} from "../src/modules/dispatch/jobs/dispatch-maintenance.processor";
import {
  nextDailyLimitReset,
  SendProcessor,
} from "../src/modules/dispatch/jobs/send.processor";
import { MessageEvents } from "../src/modules/dispatch/message-events";
import type { SendRateLimiter } from "../src/modules/dispatch/send-rate-limiter";
import { AdapterRegistry } from "../src/modules/integrations/adapter-registry";
import {
  type Actor,
  SendingSourcesService,
} from "../src/modules/integrations/sending-sources.service";
import { SuppressionService } from "../src/modules/suppression/suppression.service";

type AddedJob = {
  name: string;
  data: SendJob;
  opts: { jobId?: string };
};

type OutcomeAdd = {
  queue: "campaign" | "sequence";
  data: MessageOutcomeJob;
  jobId: string | undefined;
};

type StubbedQueue = {
  add: (...args: unknown[]) => Promise<unknown>;
  addBulk: (...args: unknown[]) => Promise<unknown>;
};

function fakeResend() {
  const sent: OutboundMessage[] = [];
  const adapter: IntegrationAdapter = {
    ...createResendAdapter(),
    async verify(credentials: Credentials) {
      if (credentials.kind !== "api_key") {
        throw new IntegrationError("invalid_credentials", "Wrong credentials.");
      }
      return { account: {}, settings: { permission: "full", domains: [] } };
    },
    async send(_credentials, message) {
      sent.push(message);
      return { providerMessageId: `email_${randomUUID()}` };
    },
    webhooks: undefined,
  };
  return { adapter, sent };
}

describe("Dispatch for campaigns and sequences (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let dispatch: DispatchService;
  let sources: SendingSourcesService;
  let suppression: SuppressionService;
  let processor: SendProcessor;
  let maintenance: DispatchMaintenanceProcessor;
  let keys: TrackingKeys;
  let actor: Actor;
  let other: Actor;
  let sourceId: string;
  let snapshotId: string;
  const fake = fakeResend();
  let limiterWaitMs = 0;
  const added: AddedJob[] = [];
  const bulkCalls: AddedJob[][] = [];
  const outcomes: OutcomeAdd[] = [];
  const campaignId = randomUUID();
  const sequence = {
    sequenceId: randomUUID(),
    stepId: randomUUID(),
    enrollmentId: randomUUID(),
  };

  const common = (overrides: Partial<BatchCommon> = {}): BatchCommon => ({
    workspaceId: actor.workspaceId,
    kind: "campaign",
    from: { email: "news@example.com", name: "Northwind" },
    snapshotId,
    campaignId,
    tracking: { opens: true, clicks: true },
    unsubscribe: {},
    ...overrides,
  });

  const recipient = (
    name: string,
    overrides: Partial<BatchRecipient> = {},
  ): BatchRecipient => ({
    contactId: randomUUID(),
    to: `${name}@example.com`,
    subject: `Hello ${name}`,
    variables: { first_name: name },
    idempotencyKey: `campaign:${campaignId}:${name}:${randomUUID()}`,
    ...overrides,
  });

  function job(data: SendJob) {
    const moveToDelayed = vi.fn(async (_timestamp: number) => undefined);
    const fakeJob = {
      data,
      attemptsMade: 0,
      opts: { attempts: 6 },
      progress: 0,
      updateProgress: vi.fn(async () => undefined),
      moveToDelayed,
    };
    return { job: fakeJob as unknown as Job<SendJob>, moveToDelayed };
  }

  async function run(messageId: string) {
    const queued = added.find((item) => item.data.messageId === messageId);
    if (!queued) {
      throw new Error("No send job was added for this message.");
    }
    return processor.process(job(queued.data).job, "token");
  }

  async function row(messageId: string) {
    const [found] = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, messageId));
    if (!found) {
      throw new Error("The message row is missing.");
    }
    return found;
  }

  async function sentCampaignMessage(name: string) {
    const [result] = await dispatch.enqueueBatch(common(), [recipient(name)]);
    if (!result) {
      throw new Error("The batch returned nothing.");
    }
    await run(result.messageId);
    return result.messageId;
  }

  beforeAll(async () => {
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
    dispatch = app.get(DispatchService);
    sources = app.get(SendingSourcesService);
    suppression = app.get(SuppressionService);
    keys = app.get(TrackingKeys);

    const sendQueue = app.get<StubbedQueue>(getQueueToken(SEND_QUEUE));
    vi.spyOn(sendQueue, "add").mockImplementation(async (name, data, opts) => {
      added.push({ name, data, opts } as AddedJob);
      return {};
    });
    vi.spyOn(sendQueue, "addBulk").mockImplementation(async (jobs) => {
      bulkCalls.push(jobs as AddedJob[]);
      added.push(...(jobs as AddedJob[]));
      return [];
    });
    for (const [queue, token] of [
      ["campaign", CAMPAIGN_OUTCOMES_QUEUE],
      ["sequence", SEQUENCE_OUTCOMES_QUEUE],
    ] as const) {
      vi.spyOn(
        app.get<StubbedQueue>(getQueueToken(token)),
        "add",
      ).mockImplementation(async (_name, data, opts) => {
        outcomes.push({
          queue,
          data: data as MessageOutcomeJob,
          jobId: (opts as { jobId?: string }).jobId,
        });
        return {};
      });
    }

    const repository = app.get(DispatchRepository);
    processor = new SendProcessor(
      repository,
      sources,
      suppression,
      { waitMs: async () => limiterWaitMs } as unknown as SendRateLimiter,
      app.get(MessageEvents),
      keys,
    );
    maintenance = new DispatchMaintenanceProcessor(
      app.get(getQueueToken(DISPATCH_MAINTENANCE_QUEUE)),
      app.get(getQueueToken(SEND_QUEUE)),
      repository,
      app.get(ContentArchive),
    );

    const created = await db
      .insert(schema.workspaces)
      .values([
        { name: "Bulk e2e", slug: `bulk-e2e-${randomUUID()}` },
        { name: "Bulk e2e other", slug: `bulk-e2e-${randomUUID()}` },
      ])
      .returning();
    const [first, second] = created;
    if (!first || !second) {
      throw new Error("The test workspaces were not created.");
    }
    actor = { workspaceId: first.id, userId: null };
    other = { workspaceId: second.id, userId: null };
    const source = await sources.connectResend(actor, {
      name: "Campaigns",
      apiKey: "re_test_bulk_key_1234",
    });
    sourceId = source.id;
  });

  afterAll(async () => {
    await db
      .delete(schema.workspaces)
      .where(eq(schema.workspaces.id, actor.workspaceId));
    await db
      .delete(schema.workspaces)
      .where(eq(schema.workspaces.id, other.workspaceId));
    await app.close();
  });

  it("stores content once as a snapshot, scoped to the workspace", async () => {
    const created = await dispatch.createSnapshot(actor.workspaceId, {
      subject: "Hello {{first_name}}",
      previewText: "A note for you",
      html: '<html><body><p>Hi {{first_name}}</p><a href="https://example.com/offer">See the offer</a></body></html>',
      text: "Hi {{first_name}}",
    });
    snapshotId = created.id;
    const snapshot = await dispatch.getSnapshot(actor.workspaceId, snapshotId);
    expect(snapshot).toMatchObject({
      id: snapshotId,
      subject: "Hello {{first_name}}",
      previewText: "A note for you",
      text: "Hi {{first_name}}",
    });
    expect(
      await dispatch.getSnapshot(other.workspaceId, snapshotId),
    ).toBeNull();
    expect(await dispatch.getSnapshot(actor.workspaceId, "nope")).toBeNull();
  });

  it("rejects a snapshot from another workspace", async () => {
    await expect(
      dispatch.enqueue({
        workspaceId: actor.workspaceId,
        kind: "sequence",
        from: { email: "news@example.com" },
        to: ["ada@example.com"],
        subject: "Hello",
        content: { snapshotId: randomUUID(), variables: {} },
      }),
    ).rejects.toMatchObject({ response: { code: "not_found" } });
    await expect(
      dispatch.enqueueBatch(common({ snapshotId: randomUUID() }), [
        recipient("ada"),
      ]),
    ).rejects.toMatchObject({ response: { code: "not_found" } });
  });

  it("renders a sequence email from its snapshot at send time", async () => {
    const contactId = randomUUID();
    const listId = randomUUID();
    const accepted = await dispatch.enqueue({
      workspaceId: actor.workspaceId,
      kind: "sequence",
      from: { email: "news@example.com", name: "Northwind" },
      to: ["ada@example.com"],
      subject: "Hello Ada",
      content: { snapshotId, variables: { first_name: "Ada <b>" } },
      contactId,
      sequence,
      tracking: { opens: true, clicks: true },
      unsubscribe: { listId },
      headers: { "X-Campaign": "spring" },
    });
    expect(accepted).toMatchObject({
      status: "queued",
      contactId,
      campaignId: null,
      sequenceId: sequence.sequenceId,
      sequenceStepId: sequence.stepId,
      enrollmentId: sequence.enrollmentId,
      unsubscribeListId: listId,
      openedAt: null,
      openCount: 0,
      clickedAt: null,
      clickCount: 0,
      repliedAt: null,
      unsubscribedAt: null,
    });
    const stored = await row(accepted.id);
    expect(stored).toMatchObject({ trackOpens: true, trackClicks: true });
    const [content] = await db
      .select()
      .from(schema.messageContents)
      .where(eq(schema.messageContents.messageId, accepted.id));
    expect(content).toMatchObject({
      html: null,
      text: null,
      snapshotId,
      variables: { first_name: "Ada <b>" },
    });

    outcomes.length = 0;
    await run(accepted.id);
    const delivered = fake.sent.at(-1);
    expect(delivered?.subject).toBe("Hello Ada");
    expect(delivered?.html).toContain("Hi Ada &lt;b&gt;");
    expect(delivered?.html).toContain(`${keys.baseUrl}/t/o/`);
    expect(delivered?.html).toContain(`${keys.baseUrl}/t/c/`);
    expect(delivered?.html).toContain(`${keys.baseUrl}/t/u/`);
    expect(delivered?.text).toContain("Hi Ada <b>");
    expect(delivered?.headers).toMatchObject({ "X-Campaign": "spring" });
    const headerNames = Object.keys(delivered?.headers ?? {}).map((name) =>
      name.toLowerCase(),
    );
    expect(headerNames).toContain("list-unsubscribe");
    expect(headerNames).toContain("list-unsubscribe-post");
    expect(headerNames).not.toContain("x-opencadence-unsubscribe");

    const message = await dispatch.get(actor.workspaceId, accepted.id);
    expect(message.status).toBe("sent");
    expect(message.attempts).toBe(1);
    expect(message.content?.html).toContain("Hi Ada &lt;b&gt;");
    expect(message.content?.html).not.toContain("/t/o/");
    expect(message.content?.headers).toEqual({ "X-Campaign": "spring" });

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      queue: "sequence",
      data: {
        workspaceId: actor.workspaceId,
        messageId: accepted.id,
        type: "sent",
        first: true,
        contactId,
        campaignId: null,
        sequenceId: sequence.sequenceId,
        sequenceStepId: sequence.stepId,
        enrollmentId: sequence.enrollmentId,
        email: "ada@example.com",
        url: null,
      },
    });
    const events = await dispatch.listEvents(actor.workspaceId, accepted.id);
    expect(events.map((event) => event.type)).toEqual(["sent"]);
    expect(outcomes[0]?.jobId).toBe(
      outcomeJobId(accepted.id, "sent", events[0]?.id ?? ""),
    );
    expect(await dispatch.listEvents(other.workspaceId, accepted.id)).toEqual(
      [],
    );
  });

  it("sends stored content untouched when nothing is tracked", async () => {
    outcomes.length = 0;
    const accepted = await dispatch.enqueue({
      workspaceId: actor.workspaceId,
      kind: "transactional",
      from: { email: "news@example.com" },
      to: ["grace@example.com"],
      subject: "Receipt",
      html: "<p>Total {{amount}}</p>",
      text: "Total {{amount}}",
      headers: { "X-Order": "42", "X-OpenCadence-Unsubscribe": "1" },
    });
    await run(accepted.id);
    expect(fake.sent.at(-1)).toMatchObject({
      html: "<p>Total {{amount}}</p>",
      text: "Total {{amount}}",
      headers: { "X-Order": "42" },
    });
    expect(outcomes).toHaveLength(0);
    const events = await dispatch.listEvents(actor.workspaceId, accepted.id);
    expect(events.map((event) => event.type)).toEqual(["sent"]);
  });

  it("queues a batch with one insert and skips suppressed recipients", async () => {
    await suppression.record({
      workspaceId: actor.workspaceId,
      email: "left@example.com",
      reason: "unsubscribed",
      origin: "user",
    });
    const recipients = [
      recipient("ada"),
      recipient("left", { to: "Left@Example.com" }),
      recipient("grace"),
    ];
    bulkCalls.length = 0;
    const results = await dispatch.enqueueBatch(common(), recipients);
    expect(results.map((item) => item.status)).toEqual([
      "queued",
      "skipped",
      "queued",
    ]);
    expect(results.map((item) => item.contactId)).toEqual(
      recipients.map((item) => item.contactId),
    );
    expect(bulkCalls).toHaveLength(1);
    expect(bulkCalls[0]?.map((item) => item.opts.jobId)).toEqual([
      results[0]?.messageId,
      results[2]?.messageId,
    ]);
    expect(bulkCalls[0]?.[0]?.data).toMatchObject({
      kind: "campaign",
      sourceId,
      integrationType: "resend",
    });

    const skipped = await dispatch.get(
      actor.workspaceId,
      results[1]?.messageId ?? "",
    );
    expect(skipped).toMatchObject({
      status: "skipped",
      to: ["left@example.com"],
      suppressed: ["left@example.com"],
      error: { code: "suppressed" },
      campaignId,
      contactId: recipients[1]?.contactId,
      content: null,
    });
    const queued = await row(results[0]?.messageId ?? "");
    expect(queued).toMatchObject({
      kind: "campaign",
      status: "queued",
      subject: "Hello ada",
      campaignId,
      contactId: recipients[0]?.contactId,
      trackOpens: true,
      trackClicks: true,
      unsubscribeListId: null,
      rfcMessageId: `<${queued.id}@example.com>`,
    });

    const before = fake.sent.length;
    await run(queued.id);
    expect(fake.sent).toHaveLength(before + 1);
    expect(fake.sent.at(-1)?.html).toContain("Hi ada");
    expect(
      Object.keys(fake.sent.at(-1)?.headers ?? {}).map((name) =>
        name.toLowerCase(),
      ),
    ).toContain("list-unsubscribe");
  });

  it("replays a batch without sending again", async () => {
    const recipients = [recipient("ada"), recipient("grace")];
    const first = await dispatch.enqueueBatch(common(), recipients);
    await run(first[0]?.messageId ?? "");
    const sentBefore = fake.sent.length;

    bulkCalls.length = 0;
    added.length = 0;
    const extra = recipient("linus");
    const again = await dispatch.enqueueBatch(common(), [
      ...recipients,
      extra,
      { ...extra, contactId: extra.contactId },
    ]);
    expect(again.slice(0, 2)).toEqual(first);
    expect(again[2]?.messageId).toBe(again[3]?.messageId);
    expect(added.map((item) => item.opts.jobId).sort()).toEqual(
      [first[1]?.messageId, again[2]?.messageId].sort(),
    );
    expect(fake.sent).toHaveLength(sentBefore);

    const [count] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.workspaceId, actor.workspaceId),
          eq(schema.messages.subject, "Hello linus"),
        ),
      );
    expect(count?.value).toBe(1);

    const changed = await dispatch.enqueueBatch(common(), [
      {
        ...recipients[0],
        variables: { first_name: "Changed" },
      } as BatchRecipient,
    ]);
    expect(changed).toEqual([first[0]]);
  });

  it("gives concurrent batches with the same keys one message each", async () => {
    const recipients = Array.from({ length: 20 }, (_, index) =>
      recipient(`race${index}`),
    );
    const [left, right] = await Promise.all([
      dispatch.enqueueBatch(common(), recipients),
      dispatch.enqueueBatch(common(), recipients),
    ]);
    expect(left).toEqual(right);
    const [count] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.workspaceId, actor.workspaceId),
          sql`${schema.messages.subject} like 'Hello race%'`,
        ),
      );
    expect(count?.value).toBe(20);
  });

  it("uses the same number of queries for any batch size", async () => {
    const spy = vi.spyOn(db.$client, "query");
    try {
      await dispatch.enqueueBatch(
        common(),
        Array.from({ length: 3 }, (_, index) => recipient(`small${index}`)),
      );
      const small = spy.mock.calls.length;
      spy.mockClear();
      const results = await dispatch.enqueueBatch(
        common(),
        Array.from({ length: 500 }, (_, index) => recipient(`large${index}`)),
      );
      expect(results).toHaveLength(500);
      expect(spy.mock.calls.length).toBe(small);
    } finally {
      spy.mockRestore();
    }
    await expect(
      dispatch.enqueueBatch(
        common(),
        Array.from({ length: 501 }, (_, index) => recipient(`over${index}`)),
      ),
    ).rejects.toMatchObject({ response: { code: "validation" } });
    expect(await dispatch.enqueueBatch(common(), [])).toEqual([]);
  });

  it("filters the email list by campaign, sequence, enrolment and contact", async () => {
    const byCampaign = await dispatch.list(actor.workspaceId, {
      campaignId,
      limit: 5,
    });
    expect(byCampaign.emails).toHaveLength(5);
    expect(
      byCampaign.emails.every((item) => item.campaignId === campaignId),
    ).toBe(true);
    const bySequence = await dispatch.list(actor.workspaceId, {
      sequenceId: sequence.sequenceId,
    });
    expect(bySequence.emails).toHaveLength(1);
    const byEnrollment = await dispatch.list(actor.workspaceId, {
      enrollmentId: sequence.enrollmentId,
    });
    expect(byEnrollment.emails.map((item) => item.id)).toEqual(
      bySequence.emails.map((item) => item.id),
    );
    const contactId = bySequence.emails[0]?.contactId ?? "";
    const byContact = await dispatch.list(actor.workspaceId, { contactId });
    expect(byContact.emails).toHaveLength(1);
    expect(
      (await dispatch.list(other.workspaceId, { campaignId })).emails,
    ).toHaveLength(0);
    await expect(
      dispatch.list(actor.workspaceId, { campaignId: "nope" }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "campaignId" },
    });
  });

  it("finds an email by its Message-ID header", async () => {
    const id = await sentCampaignMessage("rfc");
    const found = await dispatch.findByRfcMessageId(
      actor.workspaceId,
      `<${id}@example.com>`,
    );
    expect(found?.id).toBe(id);
    expect(
      (
        await dispatch.findByRfcMessageId(
          actor.workspaceId,
          `${id}@example.com`,
        )
      )?.id,
    ).toBe(id);
    expect(
      await dispatch.findByRfcMessageId(
        other.workspaceId,
        `<${id}@example.com>`,
      ),
    ).toBeNull();
    expect(
      await dispatch.findByRfcMessageId(actor.workspaceId, "<abc@mail.test>"),
    ).toBeNull();
  });

  it("ranks delivery events and reports the first of each type", async () => {
    const id = await sentCampaignMessage("rank");
    outcomes.length = 0;

    const delivered = await dispatch.recordEvent({
      messageId: id,
      type: "delivered",
    });
    expect(delivered).toMatchObject({
      first: true,
      message: { status: "delivered" },
    });
    expect(delivered?.message.lastEventAt).not.toBeNull();
    const repeated = await dispatch.recordEvent({
      messageId: id,
      type: "delivered",
    });
    expect(repeated?.first).toBe(false);

    const late = await dispatch.recordEvent({ messageId: id, type: "delayed" });
    expect(late).toMatchObject({
      first: true,
      message: { status: "delivered" },
    });

    const bounced = await dispatch.recordEvent({
      messageId: id,
      type: "bounced",
    });
    expect(bounced).toMatchObject({
      first: true,
      message: { status: "bounced" },
    });
    const after = await dispatch.recordEvent({
      messageId: id,
      type: "delivered",
    });
    expect(after).toMatchObject({
      first: false,
      message: { status: "bounced" },
    });

    expect(outcomes.map((item) => [item.data.type, item.data.first])).toEqual([
      ["delivered", true],
      ["delivered", false],
      ["delayed", true],
      ["bounced", true],
      ["delivered", false],
    ]);
    expect(outcomes.every((item) => item.queue === "campaign")).toBe(true);
    expect(new Set(outcomes.map((item) => item.jobId)).size).toBe(5);

    expect(
      await dispatch.recordEvent({ messageId: uuidv7(), type: "opened" }),
    ).toBeNull();
    expect(
      await dispatch.recordEvent({ messageId: randomUUID(), type: "opened" }),
    ).toBeNull();
  });

  it("applies provider events through the same path", async () => {
    const id = await sentCampaignMessage("provider");
    outcomes.length = 0;
    const { providerMessageId } = await row(id);
    const occurredAt = new Date();
    const applied = await dispatch.applyProviderEvent(sourceId, {
      type: "bounced",
      providerMessageId,
      occurredAt,
      recipients: [],
      bounce: { permanent: true, message: "No such user" },
    } as never);
    expect(applied).toEqual({
      messageId: id,
      recipients: ["provider@example.com"],
    });
    const message = await dispatch.get(actor.workspaceId, id);
    expect(message).toMatchObject({
      status: "bounced",
      error: { code: "bounced", message: "No such user" },
    });
    expect(outcomes.map((item) => item.data.type)).toEqual(["bounced"]);
    const events = await dispatch.listEvents(actor.workspaceId, id);
    expect(events.map((event) => event.type)).toEqual(["bounced", "sent"]);
  });

  it("counts opens atomically and reports exactly one first open", async () => {
    const id = await sentCampaignMessage("opens");
    outcomes.length = 0;
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        dispatch.recordEvent({
          messageId: id,
          type: "opened",
          userAgent: "Mail",
        }),
      ),
    );
    expect(results.filter((result) => result?.first)).toHaveLength(1);
    const message = await dispatch.get(actor.workspaceId, id);
    expect(message.openCount).toBe(12);
    expect(message.openedAt).not.toBeNull();
    expect(message.status).toBe("sent");
    expect(outcomes.filter((item) => item.data.first)).toHaveLength(1);
    expect(outcomes).toHaveLength(12);
  });

  it("counts a click as an open when there was none", async () => {
    const id = await sentCampaignMessage("clicks");
    outcomes.length = 0;
    const clicked = await dispatch.recordEvent({
      messageId: id,
      type: "clicked",
      url: "https://example.com/offer",
    });
    expect(clicked).toMatchObject({
      first: true,
      message: { openCount: 1, clickCount: 1 },
    });
    expect(clicked?.message.openedAt).toBe(clicked?.message.clickedAt);
    expect(
      outcomes.map((item) => [item.data.type, item.data.first, item.data.url]),
    ).toEqual([
      ["clicked", true, "https://example.com/offer"],
      ["opened", true, null],
    ]);

    outcomes.length = 0;
    const opened = await dispatch.recordEvent({
      messageId: id,
      type: "opened",
    });
    expect(opened).toMatchObject({ first: false, message: { openCount: 2 } });
    const again = await dispatch.recordEvent({
      messageId: id,
      type: "clicked",
      url: "https://example.com/other",
    });
    expect(again).toMatchObject({
      first: false,
      message: { openCount: 2, clickCount: 2 },
    });
    expect(outcomes.map((item) => item.data.type)).toEqual([
      "opened",
      "clicked",
    ]);
    const events = await dispatch.listEvents(actor.workspaceId, id);
    expect(events.filter((event) => event.type === "opened")).toHaveLength(2);
    expect(events.find((event) => event.url)?.url).toContain("example.com");
  });

  it("records a reply and an unsubscribe once", async () => {
    const id = await sentCampaignMessage("reply");
    const occurredAt = new Date(Date.now() - 1000);
    const replied = await dispatch.recordEvent({
      messageId: id,
      type: "replied",
      occurredAt,
    });
    expect(replied?.first).toBe(true);
    const repliedAgain = await dispatch.recordEvent({
      messageId: id,
      type: "replied",
    });
    expect(repliedAgain?.first).toBe(false);
    expect(repliedAgain?.message.repliedAt).toBe(replied?.message.repliedAt);

    const unsubscribed = await dispatch.recordEvent({
      messageId: id,
      type: "unsubscribed",
    });
    expect(unsubscribed?.first).toBe(true);
    expect(unsubscribed?.message.unsubscribedAt).not.toBeNull();
    expect(
      (await dispatch.recordEvent({ messageId: id, type: "unsubscribed" }))
        ?.first,
    ).toBe(false);
  });

  it("makes campaign email wait at the daily limit and fails transactional", async () => {
    const current = (await sources.list(actor.workspaceId)).sources.find(
      (source) => source.id === sourceId,
    );
    await sources.update(actor, sourceId, {
      dailySendLimit: Math.max(current?.sentToday ?? 0, 1),
    });
    try {
      outcomes.length = 0;
      const [waiting] = await dispatch.enqueueBatch(common(), [
        recipient("waits"),
      ]);
      const queued = added.find(
        (item) => item.data.messageId === waiting?.messageId,
      );
      const attempt = job(queued?.data as SendJob);
      const before = Date.now();
      await expect(
        processor.process(attempt.job, "token"),
      ).rejects.toBeInstanceOf(DelayedError);
      expect(attempt.moveToDelayed).toHaveBeenCalledTimes(1);
      const until = attempt.moveToDelayed.mock.calls[0]?.[0] ?? 0;
      expect(until).toBeGreaterThanOrEqual(
        nextDailyLimitReset(new Date(before)),
      );
      expect(until).toBeLessThan(
        nextDailyLimitReset(new Date()) + 2 * 60 * 1000,
      );
      const stillQueued = await row(waiting?.messageId ?? "");
      expect(stillQueued).toMatchObject({
        status: "queued",
        attempts: 0,
        errorCode: null,
      });
      expect(outcomes).toHaveLength(0);

      const transactional = await dispatch.enqueue({
        workspaceId: actor.workspaceId,
        kind: "transactional",
        from: { email: "news@example.com" },
        to: ["ada@example.com"],
        subject: "Receipt",
        text: "Thanks",
      });
      await expect(run(transactional.id)).rejects.toThrow(
        "daily_limit_reached",
      );
      const failed = await dispatch.get(actor.workspaceId, transactional.id);
      expect(failed).toMatchObject({
        status: "failed",
        error: { code: "daily_limit_reached" },
      });

      await sources.update(actor, sourceId, { dailySendLimit: null });
      await processor.process(job(queued?.data as SendJob).job, "token");
      expect((await row(waiting?.messageId ?? "")).status).toBe("sent");
    } finally {
      await sources.update(actor, sourceId, { dailySendLimit: null });
    }
  });

  it("keeps campaign email waiting on the rate limit without failing it", async () => {
    const [result] = await dispatch.enqueueBatch(common(), [
      recipient("paced"),
    ]);
    const queued = added.find(
      (item) => item.data.messageId === result?.messageId,
    );
    const attempt = job(queued?.data as SendJob);
    Object.assign(attempt.job, { progress: 5000 });
    limiterWaitMs = 400;
    try {
      const sentBefore = fake.sent.length;
      await expect(
        processor.process(attempt.job, "token"),
      ).rejects.toBeInstanceOf(DelayedError);
      expect(attempt.moveToDelayed).toHaveBeenCalledTimes(1);
      expect(fake.sent).toHaveLength(sentBefore);
      expect((await row(result?.messageId ?? "")).status).toBe("queued");
    } finally {
      limiterWaitMs = 0;
    }
  });

  it("reports a failed campaign email to the outcome queue", async () => {
    const [result] = await dispatch.enqueueBatch(common(), [
      recipient("orphan"),
    ]);
    const id = result?.messageId ?? "";
    await db
      .delete(schema.messageContents)
      .where(eq(schema.messageContents.messageId, id));
    outcomes.length = 0;
    await expect(run(id)).rejects.toThrow("content_missing");
    expect((await row(id)).status).toBe("failed");
    expect(outcomes.map((item) => [item.data.type, item.data.first])).toEqual([
      ["failed", true],
    ]);
  });

  it("adds a send job again for email left queued without one", async () => {
    const insert = async (createdAt: Date) => {
      const id = uuidv7(createdAt);
      await db.insert(schema.messages).values({
        id,
        createdAt,
        workspaceId: actor.workspaceId,
        sourceId,
        kind: "campaign",
        status: "queued",
        fromEmail: "news@example.com",
        toEmails: ["stuck@example.com"],
        subject: "Stuck",
      });
      return id;
    };
    const stuck = await insert(new Date(Date.now() - 10 * 60 * 1000));
    const recent = await insert(new Date(Date.now() - 60 * 1000));
    const ancient = await insert(new Date(Date.now() - 3 * 60 * 60 * 1000));
    const sent = uuidv7(new Date(Date.now() - 11 * 60 * 1000));
    await db.insert(schema.messages).values({
      id: sent,
      createdAt: new Date(Date.now() - 11 * 60 * 1000),
      workspaceId: actor.workspaceId,
      sourceId,
      kind: "campaign",
      status: "sent",
      fromEmail: "news@example.com",
      toEmails: ["stuck@example.com"],
      subject: "Stuck",
    });

    added.length = 0;
    const result = await maintenance.requeueStuck(stuckWindowMs);
    const ids = added.map((item) => item.opts.jobId);
    expect(result.checked).toBeGreaterThanOrEqual(1);
    expect(ids).toContain(stuck);
    expect(ids).not.toContain(recent);
    expect(ids).not.toContain(ancient);
    expect(ids).not.toContain(sent);
    expect(added.find((item) => item.opts.jobId === stuck)?.data).toMatchObject(
      { messageId: stuck },
    );

    added.length = 0;
    await maintenance.requeueStuck(7 * 24 * 60 * 60 * 1000);
    expect(added.map((item) => item.opts.jobId)).toContain(ancient);

    await db
      .delete(schema.messages)
      .where(
        and(
          eq(schema.messages.workspaceId, actor.workspaceId),
          eq(schema.messages.subject, "Stuck"),
        ),
      );
  });

  it("keeps event partitions ahead and drops them on the message retention", async () => {
    await db.execute(sql`
      create table if not exists "message_events_2024_01"
      partition of "message_events"
      for values from ('2024-01-01T00:00:00Z') to ('2024-02-01T00:00:00Z')
    `);
    const result = await maintenance.maintainPartitions();
    expect(result.dropped).toContain("message_events_2024_01");
    const partitions = await db.execute<{ name: string }>(sql`
      select child.relname as name from pg_inherits
      join pg_class child on child.oid = pg_inherits.inhrelid
      where inhparent = 'message_events'::regclass
    `);
    const names = partitions.rows.map((item) => item.name);
    const ahead = new Date();
    ahead.setUTCDate(1);
    ahead.setUTCMonth(ahead.getUTCMonth() + 3);
    expect(names).toContain(
      `message_events_${ahead.getUTCFullYear()}_${String(ahead.getUTCMonth() + 1).padStart(2, "0")}`,
    );
    expect(names).not.toContain("message_events_2024_01");
  });
});
