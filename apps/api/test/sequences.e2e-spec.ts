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
  type IntegrationAdapter,
  IntegrationError,
  type OutboundMessage,
  type ReceivedMessage,
  type ReceivedQuery,
} from "@workspace/integration-core";
import { createResendAdapter } from "@workspace/integration-resend";
import type { Job } from "bullmq";
import { AppModule } from "../src/app/app.module";
import { DATABASE } from "../src/infra/database/database.module";
import { REDIS, type Redis } from "../src/infra/redis/redis.module";
import {
  CAMPAIGN_OUTCOMES_QUEUE,
  type MessageOutcomeJob,
  SEND_QUEUE,
  SEQUENCE_OUTCOMES_QUEUE,
} from "../src/modules/dispatch/dispatch.constants";
import { DispatchService } from "../src/modules/dispatch/dispatch.service";
import { AdapterRegistry } from "../src/modules/integrations/adapter-registry";
import { SendingSourcesService } from "../src/modules/integrations/sending-sources.service";
import { EnrollmentsService } from "../src/modules/sequences/enrollments.service";
import { SequenceEnrollProcessor } from "../src/modules/sequences/jobs/sequence-enroll.processor";
import { SequenceOutcomesProcessor } from "../src/modules/sequences/jobs/sequence-outcomes.processor";
import { ReplyDetector } from "../src/modules/sequences/reply-detector";
import { SequenceOutcomes } from "../src/modules/sequences/sequence-outcomes";
import {
  SequenceRunner,
  spacingKey,
  stepIdempotencyKey,
} from "../src/modules/sequences/sequence-runner";
import {
  claimLeaseMs,
  type EnrollJob,
  enrollPageSize,
  retryAfterErrorMs,
  retryUnusableSourceMs,
  SEQUENCE_CLOCK,
  SEQUENCE_ENROLL_QUEUE,
} from "../src/modules/sequences/sequences.constants";
import { SequencesRepository } from "../src/modules/sequences/sequences.repository";
import { SuppressionService } from "../src/modules/suppression/suppression.service";
import {
  createWorkspaceSessions,
  type TestWorkspace,
} from "./support/workspace-session";

const {
  contacts,
  messageContents,
  messageEvents,
  messages,
  sequenceEnrollments,
  sequenceReplyCursors,
  sequenceSteps,
  sequences,
} = schema;

const secondMs = 1000;
const minuteMs = 60 * secondMs;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;
const tickMs = 30 * secondMs;
const everyDay = [1, 2, 3, 4, 5, 6, 7];
const alwaysOpen = {
  timezone: "UTC",
  sendDays: everyDay,
  windowStartMinute: 0,
  windowEndMinute: 1440,
};

type StubbedQueue = {
  add: (...args: unknown[]) => Promise<unknown>;
  addBulk: (...args: unknown[]) => Promise<unknown>;
};

type SequenceBody = {
  id: string;
  name: string;
  status: string;
  stepCount: number;
  stats: Record<string, number>;
  steps: {
    id: string;
    position: number;
    delayMinutes: number;
    template: { id: string; name: string } | null;
    subject: string;
    threadMode: string;
    stats: Record<string, number>;
  }[];
  sources: { id: string; hasInbox: boolean; email: string | null }[];
  timezone: string;
  layout: Record<string, { x: number; y: number }> | null;
};

type Problem = {
  severity: string;
  field: string;
  code: string;
  stepId?: string;
};

function usernameOf(credentials: Credentials) {
  if (credentials.kind !== "password") {
    throw new IntegrationError("invalid_credentials", "Wrong credentials.");
  }
  return credentials.username;
}

function fakeMail() {
  const sent: OutboundMessage[] = [];
  const received = new Map<string, ReceivedMessage[]>();
  const calls = {
    listReceived: 0,
    search: 0,
    applyActions: 0,
    ensureFolder: 0,
  };
  const listReceived = async (
    credentials: Credentials,
    query: ReceivedQuery,
  ) => {
    calls.listReceived += 1;
    const all = received.get(usernameOf(credentials)) ?? [];
    return {
      messages: all.filter(
        (message) => message.receivedAt.getTime() >= query.since.getTime(),
      ),
      state: { seen: all.length },
      more: false,
    };
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
    calls,
    setListing(enabled: boolean) {
      if (enabled) {
        inbox.listReceived = listReceived;
      } else {
        delete inbox.listReceived;
      }
    },
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

describe("Sequences (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let redis: Redis;
  let dispatch: DispatchService;
  let sources: SendingSourcesService;
  let suppression: SuppressionService;
  let runner: SequenceRunner;
  let outcomes: SequenceOutcomes;
  let detector: ReplyDetector;
  let enrollments: EnrollmentsService;
  let repository: SequencesRepository;
  let sessions: ReturnType<typeof createWorkspaceSessions>;
  let alpha: TestWorkspace;
  let beta: TestWorkspace;
  let scope: { workspaceIds: string[] };
  let ada = "";
  let grace = "";
  let resend = "";
  let templateId = "";
  let followUpTemplateId = "";
  let emptyTemplateId = "";
  let clockNow = new Date("2026-10-13T10:00:00.000Z");
  let randomValue = 0;
  const fake = fakeMail();
  const outcomeJobs: MessageOutcomeJob[] = [];
  const enrollJobs: EnrollJob[] = [];
  const sendJobs: string[] = [];
  let label = 0;

  const later = (ms: number) => new Date(clockNow.getTime() + ms);

  function noonZone() {
    const now = new Date();
    const offset = 12 - now.getUTCHours();
    const local = new Date(now.getTime() + offset * hourMs);
    return {
      now,
      timezone:
        offset === 0
          ? "UTC"
          : `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`,
      nextMidnight:
        Date.UTC(
          local.getUTCFullYear(),
          local.getUTCMonth(),
          local.getUTCDate() + 1,
        ) -
        offset * hourMs,
    };
  }

  async function http<T = Record<string, unknown>>(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
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

  async function makeTemplate(
    name: string,
    subject: string,
    html: string,
    workspace: TestWorkspace = alpha,
  ) {
    const created = await http<{ id: string }>(
      "POST",
      "/v1/templates",
      { name: `${name} ${randomUUID()}`, subject, html, text: "Plain text" },
      workspace,
    );
    expect(created.status).toBe(201);
    return created.body.id;
  }

  async function makeContacts(
    count: number,
    workspace: TestWorkspace = alpha,
    firstName = "Lin",
  ) {
    label += 1;
    const rows = await db
      .insert(contacts)
      .values(
        Array.from({ length: count }, (_, index) => ({
          workspaceId: workspace.workspaceId,
          email: `lead-${label}-${index}-${randomUUID().slice(0, 8)}@customer.test`,
          firstName,
        })),
      )
      .returning({ id: contacts.id, email: contacts.email });
    return rows;
  }

  async function quietOthers() {
    await db
      .update(sequences)
      .set({ status: "paused" })
      .where(
        and(
          inArray(sequences.workspaceId, scope.workspaceIds),
          eq(sequences.status, "active"),
        ),
      );
    await redis.del(spacingKey(ada), spacingKey(grace));
  }

  async function makeSequence(
    settings: Record<string, unknown> = {},
    steps: Record<string, unknown>[] = [
      { delayMinutes: 0, templateId },
      { delayMinutes: 60, templateId: followUpTemplateId },
    ],
    activate = true,
  ) {
    await quietOthers();
    const created = await http<SequenceBody>("POST", "/v1/sequences", {
      name: `Outreach ${randomUUID()}`,
    });
    expect(created.status).toBe(201);
    const { id } = created.body;
    const patched = await http("PATCH", `/v1/sequences/${id}`, {
      sourceIds: [ada],
      ...alwaysOpen,
      ...settings,
    });
    expect(patched.status).toBe(200);
    const withSteps = await http<SequenceBody>(
      "PUT",
      `/v1/sequences/${id}/steps`,
      { steps },
    );
    expect(withSteps.status).toBe(200);
    if (!activate) {
      return withSteps.body;
    }
    const active = await http<SequenceBody>(
      "POST",
      `/v1/sequences/${id}/activate`,
    );
    expect(active.status).toBe(200);
    expect(active.body.status).toBe("active");
    return active.body;
  }

  async function enrol(sequenceId: string, contactIds: string[]) {
    const response = await http<{
      enrolled: number;
      alreadyEnrolled: number;
      suppressed: number;
      queued: boolean;
    }>("POST", `/v1/sequences/${sequenceId}/enrollments`, { contactIds });
    expect(response.status).toBe(200);
    return response.body;
  }

  function enrollmentRows(sequenceId: string) {
    return db
      .select()
      .from(sequenceEnrollments)
      .where(eq(sequenceEnrollments.sequenceId, sequenceId))
      .orderBy(asc(sequenceEnrollments.id));
  }

  async function enrollmentOf(sequenceId: string, contactId: string) {
    const [row] = await db
      .select()
      .from(sequenceEnrollments)
      .where(
        and(
          eq(sequenceEnrollments.sequenceId, sequenceId),
          eq(sequenceEnrollments.contactId, contactId),
        ),
      );
    if (!row) {
      throw new Error("The enrolment is missing.");
    }
    return row;
  }

  function messagesOf(sequenceId: string) {
    return db
      .select()
      .from(messages)
      .where(eq(messages.sequenceId, sequenceId))
      .orderBy(asc(messages.id));
  }

  async function sequenceRow(id: string) {
    const [row] = await db.select().from(sequences).where(eq(sequences.id, id));
    if (!row) {
      throw new Error("The sequence is missing.");
    }
    return row;
  }

  async function headersOf(messageId: string) {
    const [row] = await db
      .select({ headers: messageContents.headers })
      .from(messageContents)
      .where(eq(messageContents.messageId, messageId));
    return row?.headers ?? {};
  }

  async function drainOutcomes() {
    const processor = new SequenceOutcomesProcessor(outcomes);
    const results = [];
    for (const job of outcomeJobs.splice(0)) {
      results.push(
        await processor.process({ data: job } as Job<MessageOutcomeJob>),
      );
    }
    return results;
  }

  async function markSent(messageId: string) {
    await dispatch.recordEvent({ messageId, type: "sent" });
    await drainOutcomes();
  }

  function outcome(
    message: {
      id: string;
      sequenceId: string | null;
      sequenceStepId: string | null;
      enrollmentId: string | null;
      contactId: string | null;
    },
    type: MessageOutcomeJob["type"],
    first = true,
  ): MessageOutcomeJob {
    return {
      workspaceId: alpha.workspaceId,
      messageId: message.id,
      type,
      first,
      occurredAt: clockNow.toISOString(),
      contactId: message.contactId,
      campaignId: null,
      sequenceId: message.sequenceId,
      sequenceStepId: message.sequenceStepId,
      enrollmentId: message.enrollmentId,
      email: "lead@customer.test",
      url: null,
    };
  }

  async function connect(email: string) {
    const source = await sources.connectImapSmtp(
      { workspaceId: alpha.workspaceId, userId: null },
      {
        email,
        password: "sequences-e2e-password",
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
      .overrideProvider(SEQUENCE_CLOCK)
      .useValue({ now: () => clockNow, random: () => randomValue })
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
    runner = app.get(SequenceRunner);
    outcomes = app.get(SequenceOutcomes);
    detector = app.get(ReplyDetector);
    enrollments = app.get(EnrollmentsService);
    repository = app.get(SequencesRepository);

    const sendQueue = app.get<StubbedQueue>(getQueueToken(SEND_QUEUE));
    vi.spyOn(sendQueue, "add").mockImplementation(async (_name, data) => {
      sendJobs.push((data as { messageId: string }).messageId);
      return {};
    });
    vi.spyOn(sendQueue, "addBulk").mockImplementation(async () => []);
    vi.spyOn(
      app.get<StubbedQueue>(getQueueToken(SEQUENCE_OUTCOMES_QUEUE)),
      "add",
    ).mockImplementation(async (_name, data) => {
      outcomeJobs.push(data as MessageOutcomeJob);
      return {};
    });
    vi.spyOn(
      app.get<StubbedQueue>(getQueueToken(CAMPAIGN_OUTCOMES_QUEUE)),
      "add",
    ).mockImplementation(async () => ({}));
    vi.spyOn(
      app.get<StubbedQueue>(getQueueToken(SEQUENCE_ENROLL_QUEUE)),
      "add",
    ).mockImplementation(async (_name, data) => {
      enrollJobs.push(data as EnrollJob);
      return {};
    });

    sessions = createWorkspaceSessions(app, "sequences-e2e");
    alpha = await sessions.workspace();
    beta = await sessions.workspace();
    scope = { workspaceIds: [alpha.workspaceId, beta.workspaceId] };

    ada = await connect("ada@alpha.test");
    grace = await connect("grace@alpha.test");
    const provider = await sources.connectResend(
      { workspaceId: alpha.workspaceId, userId: null },
      { name: "Product emails", apiKey: "re_test_sequences_key_1234" },
    );
    resend = provider.id;

    templateId = await makeTemplate(
      "Intro",
      "Quick question, {{first_name|there}}",
      "<html><body><p>Hi {{first_name|there}}, a question about {{company|your team}}.</p></body></html>",
    );
    followUpTemplateId = await makeTemplate(
      "Follow up",
      "Following up",
      "<html><body><p>Just floating this back up.</p></body></html>",
    );
    emptyTemplateId = await makeTemplate("Empty", "Nothing yet", "   ");
  });

  afterAll(async () => {
    await redis.del(spacingKey(ada), spacingKey(grace), spacingKey(resend));
    await sessions.cleanup();
    await app.close();
  });

  describe("sequences and steps", () => {
    let sequenceId = "";
    let stepIds: string[] = [];

    it("rejects requests without a session or API key", async () => {
      const list = await app.inject({ method: "GET", url: "/v1/sequences" });
      expect(list.statusCode).toBe(401);
      const create = await app.inject({
        method: "POST",
        url: "/v1/sequences",
        payload: { name: "No session" },
      });
      expect(create.statusCode).toBe(401);
    });

    it("creates a draft with outreach defaults and validates settings", async () => {
      const created = await http<SequenceBody & Record<string, unknown>>(
        "POST",
        "/v1/sequences",
        { name: "  Founders outreach  " },
      );
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        name: "Founders outreach",
        status: "draft",
        stepCount: 0,
        steps: [],
        sources: [],
        fromName: null,
        trackOpens: false,
        trackClicks: false,
        stopOnReply: true,
        timezone: "UTC",
        sendDays: [1, 2, 3, 4, 5],
        windowStartMinute: 540,
        windowEndMinute: 1020,
        dailyLimitPerSource: null,
        layout: null,
        stats: {
          enrolled: 0,
          active: 0,
          completed: 0,
          replied: 0,
          bounced: 0,
          unsubscribed: 0,
          sent: 0,
          opened: 0,
          clicked: 0,
        },
      });
      sequenceId = created.body.id;

      const taken = await http("POST", "/v1/sequences", {
        name: "founders OUTREACH",
      });
      expect(taken.status).toBe(409);
      expect(taken.body.code).toBe("name_taken");

      for (const [payload, field] of [
        [{ timezone: "Mars/Olympus" }, "timezone"],
        [{ sendDays: [] }, "sendDays"],
        [{ sendDays: [0] }, "sendDays"],
        [{ windowStartMinute: 600, windowEndMinute: 600 }, "windowEndMinute"],
        [{ windowEndMinute: 300 }, "windowEndMinute"],
        [{ dailyLimitPerSource: 0 }, "dailyLimitPerSource"],
        [{ sourceIds: ["nope"] }, "sourceIds"],
        [{ layout: { a: { x: "1", y: 2 } } }, "layout"],
        [{ name: "" }, "name"],
      ] as const) {
        const response = await http(
          "PATCH",
          `/v1/sequences/${sequenceId}`,
          payload,
        );
        expect(response.status).toBe(400);
        expect(response.body.field).toBe(field);
      }
      const unknownSource = await http("PATCH", `/v1/sequences/${sequenceId}`, {
        sourceIds: [randomUUID()],
      });
      expect(unknownSource.status).toBe(404);

      const updated = await http<SequenceBody & Record<string, unknown>>(
        "PATCH",
        `/v1/sequences/${sequenceId}`,
        {
          sourceIds: [grace, ada],
          fromName: "Ada at Northwind",
          timezone: "Europe/Berlin",
          sendDays: [5, 1, 1],
          windowStartMinute: 480,
          windowEndMinute: 1080,
          dailyLimitPerSource: 40,
          trackOpens: true,
          stopOnReply: false,
          layout: { start: { x: 0, y: 0 } },
        },
      );
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({
        fromName: "Ada at Northwind",
        timezone: "Europe/Berlin",
        sendDays: [1, 5],
        windowStartMinute: 480,
        windowEndMinute: 1080,
        dailyLimitPerSource: 40,
        trackOpens: true,
        stopOnReply: false,
        layout: { start: { x: 0, y: 0 } },
      });
      expect(updated.body.sources.map((source) => source.id)).toEqual([
        grace,
        ada,
      ]);
      expect(updated.body.sources[0]).toMatchObject({
        email: "grace@alpha.test",
        hasInbox: true,
      });
    });

    it("keeps one workspace's sequences out of another's reach", async () => {
      const list = await http<{ items: unknown[] }>(
        "GET",
        "/v1/sequences",
        undefined,
        beta,
      );
      expect(list.body.items).toEqual([]);
      for (const [method, path] of [
        ["GET", ""],
        ["PATCH", ""],
        ["DELETE", ""],
        ["POST", "/duplicate"],
        ["PUT", "/steps"],
        ["GET", "/check"],
        ["POST", "/activate"],
        ["POST", "/pause"],
        ["POST", "/archive"],
        ["GET", "/enrollments"],
        ["POST", "/enrollments"],
      ] as const) {
        const response = await http(
          method,
          `/v1/sequences/${sequenceId}${path}`,
          method === "GET" || method === "DELETE" ? undefined : { steps: [] },
          beta,
        );
        expect(response.status).toBe(404);
      }
      const foreignSource = await http(
        "POST",
        "/v1/sequences",
        { name: "Borrowed mailbox", sourceIds: [ada] },
        beta,
      );
      expect(foreignSource.status).toBe(404);
    });

    it("lists with a status filter, search and a cursor", async () => {
      await http("POST", "/v1/sequences", { name: "Winback one" });
      await http("POST", "/v1/sequences", { name: "Winback two" });
      const searched = await http<{
        items: { name: string }[];
        nextCursor: string | null;
      }>("GET", "/v1/sequences?search=winback&limit=1");
      expect(searched.body.items.map((item) => item.name)).toEqual([
        "Winback two",
      ]);
      expect(searched.body.nextCursor).toEqual(expect.any(String));
      const next = await http<{
        items: { name: string }[];
        nextCursor: string | null;
      }>(
        "GET",
        `/v1/sequences?search=winback&limit=1&cursor=${searched.body.nextCursor}`,
      );
      expect(next.body.items.map((item) => item.name)).toEqual(["Winback one"]);
      expect(next.body.nextCursor).toBeNull();
      const active = await http<{ items: unknown[] }>(
        "GET",
        "/v1/sequences?status=active",
      );
      expect(active.body.items).toEqual([]);
      const bad = await http("GET", "/v1/sequences?status=sending");
      expect(bad.status).toBe(400);
    });

    it("replaces steps in order, takes the subject from the template, and validates waits", async () => {
      const first = await http<SequenceBody>(
        "PUT",
        `/v1/sequences/${sequenceId}/steps`,
        {
          steps: [
            { delayMinutes: 0, templateId },
            {
              delayMinutes: 4320,
              templateId: followUpTemplateId,
              subject: "Any thoughts?",
              threadMode: "new",
            },
            { delayMinutes: 1440, templateId: null },
          ],
        },
      );
      expect(first.status).toBe(200);
      expect(first.body.stepCount).toBe(3);
      expect(
        first.body.steps.map((step) => [
          step.position,
          step.delayMinutes,
          step.subject,
          step.threadMode,
          step.template?.id ?? null,
        ]),
      ).toEqual([
        [0, 0, "Quick question, {{first_name|there}}", "reply", templateId],
        [1, 4320, "Any thoughts?", "new", followUpTemplateId],
        [2, 1440, "", "reply", null],
      ]);
      stepIds = first.body.steps.map((step) => step.id);

      for (const [steps, field] of [
        [[{ delayMinutes: -1, templateId }], "steps.0.delayMinutes"],
        [
          [
            { delayMinutes: 0, templateId },
            { delayMinutes: 0, templateId },
          ],
          "steps.1.delayMinutes",
        ],
        [[{ delayMinutes: 0, templateId: "nope" }], "steps.0.templateId"],
        [
          [{ delayMinutes: 0, templateId, threadMode: "side" }],
          "steps.0.threadMode",
        ],
        [[{ id: randomUUID(), delayMinutes: 0, templateId }], "steps.0.id"],
        [
          [
            { id: stepIds[0], delayMinutes: 0, templateId },
            { id: stepIds[0], delayMinutes: 5, templateId },
          ],
          "steps.1.id",
        ],
        [
          Array.from({ length: 21 }, () => ({ delayMinutes: 5, templateId })),
          "steps",
        ],
      ] as const) {
        const response = await http(
          "PUT",
          `/v1/sequences/${sequenceId}/steps`,
          { steps },
        );
        expect(response.status).toBe(400);
        expect(response.body.field).toBe(field);
      }
      const foreignTemplate = await makeTemplate(
        "Beta",
        "Beta",
        "<p>Beta</p>",
        beta,
      );
      const missing = await http("PUT", `/v1/sequences/${sequenceId}/steps`, {
        steps: [{ delayMinutes: 0, templateId: foreignTemplate }],
      });
      expect(missing.status).toBe(404);
      expect(missing.body.field).toBe("steps.0.templateId");
    });

    it("keeps the id, counters and snapshot of a step that is sent back, deletes the ones left out, and creates the rest", async () => {
      await db
        .update(sequenceSteps)
        .set({ sentCount: 7, repliedCount: 2 })
        .where(eq(sequenceSteps.id, stepIds[1] ?? ""));
      const before = await db
        .select()
        .from(sequenceSteps)
        .where(eq(sequenceSteps.sequenceId, sequenceId));
      const snapshotOf = (id: string | undefined) =>
        before.find((step) => step.id === id)?.snapshotId ?? null;
      expect(snapshotOf(stepIds[0])).toEqual(expect.any(String));
      expect(snapshotOf(stepIds[2])).toBeNull();

      const replaced = await http<SequenceBody>(
        "PUT",
        `/v1/sequences/${sequenceId}/steps`,
        {
          steps: [
            {
              id: stepIds[1],
              delayMinutes: 0,
              templateId: followUpTemplateId,
              subject: "Any thoughts?",
              threadMode: "new",
            },
            { delayMinutes: 30, templateId },
            {
              id: stepIds[0],
              delayMinutes: 2880,
              templateId,
              subject: "A new subject",
            },
          ],
        },
      );
      expect(replaced.status).toBe(200);
      expect(replaced.body.steps.map((step) => step.id)).toEqual([
        stepIds[1],
        expect.any(String),
        stepIds[0],
      ]);
      expect(replaced.body.steps.map((step) => step.position)).toEqual([
        0, 1, 2,
      ]);
      expect(replaced.body.steps[0]?.stats).toMatchObject({
        sent: 7,
        replied: 2,
      });
      expect(replaced.body.steps[1]?.id).not.toBe(stepIds[2]);
      expect(replaced.body.steps[2]?.subject).toBe("A new subject");

      const after = await db
        .select()
        .from(sequenceSteps)
        .where(eq(sequenceSteps.sequenceId, sequenceId));
      expect(after).toHaveLength(3);
      expect(after.find((step) => step.id === stepIds[2])).toBeUndefined();
      expect(after.find((step) => step.id === stepIds[1])?.snapshotId).toBe(
        snapshotOf(stepIds[1]),
      );
      const changed = after.find((step) => step.id === stepIds[0])?.snapshotId;
      expect(changed).toEqual(expect.any(String));
      expect(changed).not.toBe(snapshotOf(stepIds[0]));
      const snapshot = await dispatch.getSnapshot(
        alpha.workspaceId,
        changed ?? "",
      );
      expect(snapshot?.subject).toBe("A new subject");
    });

    it("duplicates steps and settings into a new draft with no enrolments", async () => {
      const copy = await http<SequenceBody & Record<string, unknown>>(
        "POST",
        `/v1/sequences/${sequenceId}/duplicate`,
      );
      expect(copy.status).toBe(201);
      expect(copy.body).toMatchObject({
        name: "Founders outreach copy",
        status: "draft",
        stepCount: 3,
        timezone: "Europe/Berlin",
        layout: null,
        fromName: "Ada at Northwind",
      });
      expect(copy.body.stats.enrolled).toBe(0);
      expect(copy.body.steps.map((step) => step.subject)).toEqual([
        "Any thoughts?",
        "Quick question, {{first_name|there}}",
        "A new subject",
      ]);
      expect(copy.body.steps.map((step) => step.id)).not.toContain(stepIds[0]);
      const again = await http<SequenceBody>(
        "POST",
        `/v1/sequences/${sequenceId}/duplicate`,
      );
      expect(again.body.name).toBe("Founders outreach copy 2");
    });
  });

  describe("check and activate", () => {
    it("lists what blocks activation and refuses to activate until it is fixed", async () => {
      const created = await http<SequenceBody>("POST", "/v1/sequences", {
        name: `Not ready ${randomUUID()}`,
      });
      const { id } = created.body;
      const empty = await http<{ ready: boolean; problems: Problem[] }>(
        "GET",
        `/v1/sequences/${id}/check`,
      );
      expect(empty.body.ready).toBe(false);
      expect(empty.body.problems.map((problem) => problem.code)).toEqual(
        expect.arrayContaining([
          "no_steps",
          "no_sources",
          "brand_without_address",
        ]),
      );

      const tagged = await makeTemplate(
        "Tagged",
        "Hello {{nickname}}",
        "<p>{{first_name}} {{fields.plan}} {{brand.name}}</p>",
      );
      await http("PATCH", `/v1/sequences/${id}`, {
        sourceIds: [resend, ada],
        windowStartMinute: 540,
        windowEndMinute: 570,
      });
      await sources.update(
        { workspaceId: alpha.workspaceId, userId: null },
        ada,
        { paused: true },
      );
      const steps = await http<SequenceBody>(
        "PUT",
        `/v1/sequences/${id}/steps`,
        {
          steps: [
            { delayMinutes: 0, templateId: tagged },
            { delayMinutes: 10, templateId: null },
            { delayMinutes: 10, templateId: emptyTemplateId },
          ],
        },
      );
      const ids = steps.body.steps.map((step) => step.id);
      const check = await http<{ ready: boolean; problems: Problem[] }>(
        "GET",
        `/v1/sequences/${id}/check`,
      );
      const found = check.body.problems.map((problem) => [
        problem.severity,
        problem.field,
        problem.code,
        problem.stepId ?? null,
      ]);
      expect(found).toEqual(
        expect.arrayContaining([
          ["error", "steps", "unknown_merge_tag", ids[0]],
          ["error", "steps", "step_without_template", ids[1]],
          ["error", "steps", "step_template_empty", ids[2]],
          ["error", "sources", "source_without_address", null],
          ["error", "sources", "source_paused", null],
          ["warning", "brand", "brand_without_address", null],
          ["warning", "window", "window_short", null],
        ]),
      );
      const unknown = check.body.problems.find(
        (problem) => problem.code === "unknown_merge_tag",
      ) as Problem & { message: string };
      expect(unknown.message).toContain("nickname");
      expect(unknown.message).toContain("fields.plan");
      expect(unknown.message).not.toContain("first_name");

      const refused = await http<{ code: string; problems: Problem[] }>(
        "POST",
        `/v1/sequences/${id}/activate`,
      );
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe("not_ready");
      expect(refused.body.problems.length).toBeGreaterThan(0);
      expect((await sequenceRow(id)).status).toBe("draft");

      await sources.update(
        { workspaceId: alpha.workspaceId, userId: null },
        ada,
        { paused: false },
      );
    });

    it("activates a ready sequence, refreshes its content, and guards pause, archive and delete", async () => {
      const sequence = await makeSequence({}, undefined, false);
      const before = await db
        .select()
        .from(sequenceSteps)
        .where(eq(sequenceSteps.sequenceId, sequence.id));
      const ready = await http<{ ready: boolean; problems: Problem[] }>(
        "GET",
        `/v1/sequences/${sequence.id}/check`,
      );
      expect(ready.body.ready).toBe(true);
      expect(
        ready.body.problems.every((problem) => problem.severity === "warning"),
      ).toBe(true);

      const notActive = await http(
        "POST",
        `/v1/sequences/${sequence.id}/pause`,
      );
      expect(notActive.status).toBe(409);
      expect(notActive.body.code).toBe("not_active");

      const active = await http<SequenceBody>(
        "POST",
        `/v1/sequences/${sequence.id}/activate`,
      );
      expect(active.body.status).toBe("active");
      const after = await db
        .select()
        .from(sequenceSteps)
        .where(eq(sequenceSteps.sequenceId, sequence.id));
      for (const step of after) {
        expect(step.snapshotId).toEqual(expect.any(String));
        expect(step.snapshotId).not.toBe(
          before.find((item) => item.id === step.id)?.snapshotId,
        );
      }

      const noSources = await http("PATCH", `/v1/sequences/${sequence.id}`, {
        sourceIds: [],
      });
      expect(noSources.status).toBe(400);
      const noSteps = await http("PUT", `/v1/sequences/${sequence.id}/steps`, {
        steps: [],
      });
      expect(noSteps.status).toBe(400);

      const removed = await http("DELETE", `/v1/sequences/${sequence.id}`);
      expect(removed.status).toBe(409);
      expect(removed.body.code).toBe("sequence_active");

      const paused = await http<SequenceBody>(
        "POST",
        `/v1/sequences/${sequence.id}/pause`,
      );
      expect(paused.body.status).toBe("paused");
      const archived = await http<SequenceBody>(
        "POST",
        `/v1/sequences/${sequence.id}/archive`,
      );
      expect(archived.body.status).toBe("archived");
      const frozen = await http("PATCH", `/v1/sequences/${sequence.id}`, {
        name: "Renamed",
      });
      expect(frozen.status).toBe(409);
      expect(frozen.body.code).toBe("not_editable");
      const gone = await http("DELETE", `/v1/sequences/${sequence.id}`);
      expect(gone.status).toBe(204);
      expect((await http("GET", `/v1/sequences/${sequence.id}`)).status).toBe(
        404,
      );
    });
  });

  describe("enrolment", () => {
    it("enrols contacts once, skips suppressed ones, ignores unknown ids, and schedules the first step after its wait", async () => {
      const sequence = await makeSequence({}, [
        { delayMinutes: 90, templateId },
      ]);
      const people = await makeContacts(4);
      const [first, second, third, blocked] = people;
      await suppression.record({
        workspaceId: alpha.workspaceId,
        email: blocked?.email ?? "",
        reason: "unsubscribed",
        origin: "user",
      });
      const [stranger] = await makeContacts(1, beta);

      const result = await enrol(sequence.id, [
        first?.id ?? "",
        second?.id ?? "",
        blocked?.id ?? "",
        stranger?.id ?? "",
        randomUUID(),
      ]);
      expect(result).toEqual({
        enrolled: 2,
        alreadyEnrolled: 0,
        suppressed: 1,
        queued: false,
      });
      const again = await enrol(sequence.id, [
        first?.id ?? "",
        second?.id ?? "",
        third?.id ?? "",
      ]);
      expect(again).toEqual({
        enrolled: 1,
        alreadyEnrolled: 2,
        suppressed: 0,
        queued: false,
      });

      const rows = await enrollmentRows(sequence.id);
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.status).toBe("active");
        expect(row.nextStepPosition).toBe(0);
        expect(row.nextRunAt?.toISOString()).toBe(
          later(90 * minuteMs).toISOString(),
        );
        expect(row.enrolledByUserId).toBe(alpha.owner.userId);
      }
      expect(await sequenceRow(sequence.id)).toMatchObject({
        enrolledCount: 3,
        activeCount: 3,
      });

      for (const [payload, field] of [
        [{ contactIds: [] }, "contactIds"],
        [{ contactIds: ["nope"] }, "contactIds"],
        [
          { contactIds: Array.from({ length: 1001 }, () => randomUUID()) },
          "contactIds",
        ],
        [{ contactIds: [first?.id], audience: { type: "all" } }, "audience"],
        [{ audience: { type: "everyone" } }, "audience.type"],
        [{}, "contactIds"],
      ] as const) {
        const response = await http(
          "POST",
          `/v1/sequences/${sequence.id}/enrollments`,
          payload,
        );
        expect(response.status).toBe(400);
        expect(response.body.field).toBe(field);
      }
    });

    it("enrols an audience in the background, page by page, and picks up where a crashed run stopped without enrolling anyone twice", async () => {
      const created = await http<SequenceBody>(
        "POST",
        "/v1/sequences",
        { name: `Everyone ${randomUUID()}` },
        beta,
      );
      const sequenceId = created.body.id;
      const total = enrollPageSize * 2 + 150;
      await makeContacts(total - 1, beta);
      const [blocked] = await makeContacts(1, beta);
      await suppression.record({
        workspaceId: beta.workspaceId,
        email: blocked?.email ?? "",
        reason: "bounced",
        origin: "user",
      });
      const everyone = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(contacts)
        .where(eq(contacts.workspaceId, beta.workspaceId));
      const expected = (everyone[0]?.count ?? 0) - 1;
      expect(expected).toBeGreaterThan(enrollPageSize * 2);

      enrollJobs.length = 0;
      const queued = await http(
        "POST",
        `/v1/sequences/${sequenceId}/enrollments`,
        { audience: { type: "all" } },
        beta,
      );
      expect(queued.status).toBe(200);
      expect(queued.body).toEqual({
        enrolled: 0,
        alreadyEnrolled: 0,
        suppressed: 0,
        queued: true,
      });
      const [data] = enrollJobs;
      expect(data).toMatchObject({
        workspaceId: beta.workspaceId,
        sequenceId,
        audience: { type: "all" },
        afterContactId: null,
        userId: beta.owner.userId,
      });
      if (!data) {
        throw new Error("No enrol job was added.");
      }

      const processor = new SequenceEnrollProcessor(enrollments);
      const job = { data: { ...data } };
      let saves = 0;
      const crashing = {
        get data() {
          return job.data;
        },
        async updateData(next: EnrollJob) {
          saves += 1;
          if (saves === 2) {
            throw new Error("The worker died.");
          }
          job.data = next;
        },
      } as unknown as Job<EnrollJob>;
      await expect(processor.process(crashing)).rejects.toThrow(
        "The worker died.",
      );
      expect(job.data.afterContactId).toEqual(expect.any(String));
      expect((await sequenceRow(sequenceId)).enrolledCount).toBe(
        enrollPageSize * 2,
      );

      const resumed = await processor.process({
        data: job.data,
        async updateData(next: EnrollJob) {
          job.data = next;
        },
      } as unknown as Job<EnrollJob>);
      expect(resumed).toMatchObject({ stopped: false });
      expect(resumed.enrolled).toBe(expected - enrollPageSize * 2);

      const rerun = await processor.process({
        data: { ...data },
        async updateData() {},
      } as unknown as Job<EnrollJob>);
      expect(rerun.enrolled).toBe(0);

      const counted = await db
        .select({
          count: sql<number>`count(*)::int`,
          contacts: sql<number>`count(distinct ${sequenceEnrollments.contactId})::int`,
        })
        .from(sequenceEnrollments)
        .where(eq(sequenceEnrollments.sequenceId, sequenceId));
      expect(counted[0]).toEqual({ count: expected, contacts: expected });
      expect(await sequenceRow(sequenceId)).toMatchObject({
        enrolledCount: expected,
        activeCount: expected,
      });
      expect(
        await db
          .select({ id: sequenceEnrollments.id })
          .from(sequenceEnrollments)
          .where(
            and(
              eq(sequenceEnrollments.sequenceId, sequenceId),
              eq(sequenceEnrollments.contactId, blocked?.id ?? ""),
            ),
          ),
      ).toEqual([]);
    });

    it("lists, searches, shows, pauses, resumes and removes one enrolment, keeping the active count right", async () => {
      const sequence = await makeSequence();
      const people = await makeContacts(3, alpha, "Searchable");
      await enrol(
        sequence.id,
        people.map((person) => person.id),
      );
      const base = `/v1/sequences/${sequence.id}/enrollments`;
      type Item = {
        id: string;
        contact: { id: string; email: string; firstName: string | null };
        status: string;
        source: { id: string; name: string } | null;
        nextStepPosition: number;
        nextRunAt: string | null;
        finishReason: string | null;
        finishedAt: string | null;
      };
      const list = await http<{ items: Item[]; nextCursor: string | null }>(
        "GET",
        `${base}?limit=2`,
      );
      expect(list.body.items).toHaveLength(2);
      expect(list.body.nextCursor).toEqual(expect.any(String));
      const rest = await http<{ items: Item[]; nextCursor: string | null }>(
        "GET",
        `${base}?limit=2&cursor=${list.body.nextCursor}`,
      );
      expect(rest.body.items).toHaveLength(1);
      expect(rest.body.nextCursor).toBeNull();
      expect(
        [...list.body.items, ...rest.body.items]
          .map((item) => item.contact.id)
          .sort(),
      ).toEqual(people.map((person) => person.id).sort());

      const target = people[0];
      const searched = await http<{ items: Item[] }>(
        "GET",
        `${base}?search=${encodeURIComponent(target?.email.toUpperCase() ?? "")}`,
      );
      expect(searched.body.items).toHaveLength(1);
      const item = searched.body.items[0];
      expect(item).toMatchObject({
        contact: {
          id: target?.id,
          email: target?.email,
          firstName: "Searchable",
        },
        status: "active",
        source: null,
        nextStepPosition: 0,
        finishReason: null,
      });
      const one = `${base}/${item?.id}`;

      const paused = await http<Item>("POST", `${one}/pause`);
      expect(paused.body.status).toBe("paused");
      expect(paused.body.nextRunAt).toBe(item?.nextRunAt);
      expect((await sequenceRow(sequence.id)).activeCount).toBe(2);
      const pausedOnly = await http<{ items: Item[] }>(
        "GET",
        `${base}?status=paused`,
      );
      expect(pausedOnly.body.items.map((entry) => entry.id)).toEqual([
        item?.id,
      ]);
      expect((await http<Item>("POST", `${one}/pause`)).body.status).toBe(
        "paused",
      );
      expect((await sequenceRow(sequence.id)).activeCount).toBe(2);
      const skipped = await runner.tick(later(minuteMs), scope);
      expect(skipped.sent).toBe(1);
      expect(
        (await enrollmentOf(sequence.id, target?.id ?? "")).lastSentAt,
      ).toBeNull();

      const resumed = await http<Item>("POST", `${one}/resume`);
      expect(resumed.body.status).toBe("active");
      expect((await sequenceRow(sequence.id)).activeCount).toBe(3);

      const removed = await http<Item>("POST", `${one}/remove`);
      expect(removed.body).toMatchObject({
        status: "removed",
        finishReason: "removed",
        nextRunAt: null,
      });
      expect(removed.body.finishedAt).toEqual(expect.any(String));
      expect((await sequenceRow(sequence.id)).activeCount).toBe(2);
      const refused = await http("POST", `${one}/resume`);
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe("invalid_state");
      expect((await sequenceRow(sequence.id)).activeCount).toBe(2);

      const sentTo = (await enrollmentRows(sequence.id)).find(
        (row) => row.lastMessageId,
      );
      const detail = await http<
        Item & { messages: { id: string; stepId: string; status: string }[] }
      >("GET", `${base}/${sentTo?.id}`);
      expect(detail.body.source).toEqual({ id: ada, name: expect.any(String) });
      expect(detail.body.messages).toEqual([
        expect.objectContaining({
          id: sentTo?.lastMessageId,
          stepId: sequence.steps[0]?.id,
          status: "queued",
          subject: "Quick question, Searchable",
        }),
      ]);
      expect((await http("GET", `${base}/${randomUUID()}`)).status).toBe(404);
      expect((await http("GET", one, undefined, beta)).status).toBe(404);
    });
  });

  describe("the tick", () => {
    it("waits for the window in the sequence's timezone, across a clock change, and never sends outside it", async () => {
      const sequence = await makeSequence(
        {
          timezone: "America/New_York",
          sendDays: [1, 2, 3, 4, 5],
          windowStartMinute: 540,
          windowEndMinute: 1020,
        },
        [{ delayMinutes: 0, templateId }],
      );
      const [first, second, third, fourth] = await makeContacts(4);

      clockNow = new Date("2026-03-06T23:00:00.000Z");
      randomValue = 0;
      await enrol(sequence.id, [first?.id ?? ""]);
      expect(await runner.tick(clockNow, scope)).toMatchObject({
        claimed: 1,
        sent: 0,
        rescheduled: 1,
      });
      expect(
        (
          await enrollmentOf(sequence.id, first?.id ?? "")
        ).nextRunAt?.toISOString(),
      ).toBe("2026-03-09T13:00:00.000Z");

      clockNow = new Date("2026-03-09T12:59:00.000Z");
      randomValue = 0.5;
      await enrol(sequence.id, [second?.id ?? ""]);
      expect(await runner.tick(clockNow, scope)).toMatchObject({
        claimed: 1,
        sent: 0,
        rescheduled: 1,
      });
      expect(
        (
          await enrollmentOf(sequence.id, second?.id ?? "")
        ).nextRunAt?.toISOString(),
      ).toBe("2026-03-09T13:10:00.000Z");
      expect(await messagesOf(sequence.id)).toHaveLength(0);

      clockNow = new Date("2026-03-09T13:00:00.000Z");
      expect(await runner.tick(clockNow, scope)).toMatchObject({
        claimed: 1,
        sent: 1,
      });
      clockNow = new Date("2026-03-09T13:10:00.000Z");
      expect(await runner.tick(clockNow, scope)).toMatchObject({
        claimed: 1,
        sent: 1,
      });

      clockNow = new Date("2026-03-09T20:59:30.000Z");
      await enrol(sequence.id, [third?.id ?? ""]);
      clockNow = new Date("2026-03-09T21:00:00.000Z");
      randomValue = 0;
      expect(await runner.tick(clockNow, scope)).toMatchObject({
        sent: 0,
        rescheduled: 1,
      });
      expect(
        (
          await enrollmentOf(sequence.id, third?.id ?? "")
        ).nextRunAt?.toISOString(),
      ).toBe("2026-03-10T13:00:00.000Z");

      clockNow = new Date("2026-10-30T22:00:00.000Z");
      await enrol(sequence.id, [fourth?.id ?? ""]);
      await db
        .update(sequenceEnrollments)
        .set({ status: "paused" })
        .where(eq(sequenceEnrollments.contactId, third?.id ?? ""));
      expect(await runner.tick(clockNow, scope)).toMatchObject({
        claimed: 1,
        rescheduled: 1,
      });
      expect(
        (
          await enrollmentOf(sequence.id, fourth?.id ?? "")
        ).nextRunAt?.toISOString(),
      ).toBe("2026-11-02T14:00:00.000Z");
      expect(await messagesOf(sequence.id)).toHaveLength(2);
      clockNow = new Date("2026-10-13T10:00:00.000Z");
    });

    it("rotates new contacts across mailboxes, keeps each contact on its mailbox, threads replies, and completes after the last step", async () => {
      const sequence = await makeSequence(
        { sourceIds: [ada, grace], fromName: "The Northwind team" },
        [
          { delayMinutes: 0, templateId },
          { delayMinutes: 60, templateId: followUpTemplateId },
          {
            delayMinutes: 120,
            templateId: followUpTemplateId,
            subject: "One last note for {{first_name}}",
            threadMode: "new",
          },
          { delayMinutes: 30, templateId: followUpTemplateId },
        ],
      );
      const people = await makeContacts(2, alpha, "Mira");
      await enrol(
        sequence.id,
        people.map((person) => person.id),
      );

      const first = await runner.tick(clockNow, scope);
      expect(first).toMatchObject({ claimed: 2, sent: 2, held: 0 });
      const afterFirst = await enrollmentRows(sequence.id);
      expect(afterFirst.map((row) => row.sourceId).sort()).toEqual(
        [ada, grace].sort(),
      );
      const mailboxOf = new Map(
        afterFirst.map((row) => [row.id, row.sourceId]),
      );
      const roots = new Map<string, string>();
      for (const row of afterFirst) {
        expect(row.nextStepPosition).toBe(1);
        expect(row.nextRunAt?.toISOString()).toBe(later(hourMs).toISOString());
        expect(row.threadSubject).toBe("Quick question, Mira");
        expect(row.threadRootRfcId).toBe(`<${row.lastMessageId}@alpha.test>`);
        roots.set(row.id, row.threadRootRfcId ?? "");
        expect(
          await dispatch.findByRfcMessageId(
            alpha.workspaceId,
            row.threadRootRfcId ?? "",
          ),
        ).toMatchObject({ id: row.lastMessageId });
      }
      const opening = await messagesOf(sequence.id);
      expect(opening).toHaveLength(2);
      for (const message of opening) {
        expect(message).toMatchObject({
          kind: "sequence",
          status: "queued",
          subject: "Quick question, Mira",
          fromName: "The Northwind team",
          sequenceStepId: sequence.steps[0]?.id,
          trackOpens: false,
          trackClicks: false,
        });
        expect(message.sourceId).toBe(
          mailboxOf.get(message.enrollmentId ?? ""),
        );
        expect(message.rfcMessageId).toBe(
          roots.get(message.enrollmentId ?? ""),
        );
        const headers = await headersOf(message.id);
        expect(headers).not.toHaveProperty("In-Reply-To");
        expect(headers).toHaveProperty("x-opencadence-unsubscribe", "1");
        expect(sendJobs).toContain(message.id);
      }

      expect(await runner.tick(later(tickMs), scope)).toMatchObject({
        claimed: 0,
        sent: 0,
      });

      const stepTimes = [hourMs, 3 * hourMs, 3 * hourMs + 30 * minuteMs];
      for (const [index, offset] of stepTimes.entries()) {
        const result = await runner.tick(later(offset), scope);
        expect(result).toMatchObject({ claimed: 2, sent: 2 });
        const rows = await enrollmentRows(sequence.id);
        for (const row of rows) {
          expect(row.sourceId).toBe(mailboxOf.get(row.id));
          expect(row.nextStepPosition).toBe(index + 2);
        }
      }

      const all = await messagesOf(sequence.id);
      expect(all).toHaveLength(8);
      for (const message of all) {
        expect(message.sourceId).toBe(
          mailboxOf.get(message.enrollmentId ?? ""),
        );
      }
      const byStep = (position: number) =>
        all.filter(
          (message) => message.sequenceStepId === sequence.steps[position]?.id,
        );
      for (const reply of byStep(1)) {
        expect(reply.subject).toBe("Re: Quick question, Mira");
        expect(await headersOf(reply.id)).toMatchObject({
          "In-Reply-To": roots.get(reply.enrollmentId ?? ""),
          References: roots.get(reply.enrollmentId ?? ""),
        });
      }
      const fresh = new Map<string, string>();
      for (const started of byStep(2)) {
        expect(started.subject).toBe("One last note for Mira");
        expect(await headersOf(started.id)).not.toHaveProperty("In-Reply-To");
        fresh.set(started.enrollmentId ?? "", started.rfcMessageId ?? "");
      }
      for (const last of byStep(3)) {
        expect(last.subject).toBe("Re: One last note for Mira");
        expect(await headersOf(last.id)).toMatchObject({
          "In-Reply-To": fresh.get(last.enrollmentId ?? ""),
          References: fresh.get(last.enrollmentId ?? ""),
        });
      }

      for (const row of await enrollmentRows(sequence.id)) {
        expect(row).toMatchObject({
          status: "completed",
          finishReason: "completed",
          nextRunAt: null,
          nextStepPosition: 4,
        });
        expect(row.finishedAt).toEqual(expect.any(Date));
      }
      expect(await sequenceRow(sequence.id)).toMatchObject({
        enrolledCount: 2,
        activeCount: 0,
        completedCount: 2,
      });
      expect(await runner.tick(later(dayMs), scope)).toMatchObject({
        claimed: 0,
      });
    });

    it("gives a new contact to the mailbox that has sent the fewest today", async () => {
      const zone = noonZone();
      const sequence = await makeSequence(
        { sourceIds: [ada, grace], timezone: zone.timezone },
        [{ delayMinutes: 0, templateId }],
      );
      clockNow = zone.now;
      const people = await makeContacts(2);
      await enrol(sequence.id, [people[0]?.id ?? ""]);
      await runner.tick(clockNow, scope);
      await redis.del(spacingKey(ada), spacingKey(grace));
      await enrol(sequence.id, [people[1]?.id ?? ""]);
      await runner.tick(later(tickMs), scope);
      const firstTwo = await messagesOf(sequence.id);
      expect(firstTwo.map((message) => message.sourceId).sort()).toEqual(
        [ada, grace].sort(),
      );
      clockNow = new Date("2026-10-13T10:00:00.000Z");
    });

    it("sends at most one email per mailbox per tick, and after a pause picks the backlog up one tick at a time", async () => {
      const sequence = await makeSequence({}, [
        { delayMinutes: 0, templateId },
      ]);
      const people = await makeContacts(5);
      await enrol(
        sequence.id,
        people.map((person) => person.id),
      );
      const dueAt = clockNow.toISOString();

      const first = await runner.tick(clockNow, scope);
      expect(first).toMatchObject({ claimed: 5, sent: 1, held: 4 });
      const waiting = (await enrollmentRows(sequence.id)).filter(
        (row) => row.status === "active",
      );
      expect(waiting).toHaveLength(4);
      for (const row of waiting) {
        expect(row.nextRunAt?.toISOString()).toBe(dueAt);
        expect(row.nextStepPosition).toBe(0);
      }

      expect(await runner.tick(later(secondMs), scope)).toMatchObject({
        sent: 0,
        held: 4,
      });
      expect(await messagesOf(sequence.id)).toHaveLength(1);

      await http("POST", `/v1/sequences/${sequence.id}/pause`);
      expect(await runner.tick(later(tickMs), scope)).toMatchObject({
        claimed: 0,
        sent: 0,
      });
      expect(await runner.tick(later(dayMs), scope)).toMatchObject({
        claimed: 0,
        sent: 0,
      });
      for (const row of await enrollmentRows(sequence.id)) {
        if (row.status === "active") {
          expect(row.nextRunAt?.toISOString()).toBe(dueAt);
        }
      }

      await http("POST", `/v1/sequences/${sequence.id}/activate`);
      await redis.del(spacingKey(ada));
      const resumeAt = 2 * dayMs;
      for (let index = 0; index < 4; index += 1) {
        const result = await runner.tick(
          later(resumeAt + index * tickMs),
          scope,
        );
        expect(result.sent).toBe(1);
        expect(await messagesOf(sequence.id)).toHaveLength(index + 2);
      }
      expect(
        await runner.tick(later(resumeAt + 4 * tickMs), scope),
      ).toMatchObject({ claimed: 0, sent: 0 });
      expect(await sequenceRow(sequence.id)).toMatchObject({
        activeCount: 0,
        completedCount: 5,
      });
    });

    it("a crash after the email is handed to dispatch and before the enrolment advances sends that step once, then moves on", async () => {
      const sequence = await makeSequence();
      const [person] = await makeContacts(1);
      await enrol(sequence.id, [person?.id ?? ""]);
      vi.spyOn(repository, "advance").mockRejectedValueOnce(
        new Error("The worker died."),
      );

      expect(await runner.tick(clockNow, scope)).toMatchObject({
        claimed: 1,
        sent: 0,
        failed: 1,
      });
      const stuck = await enrollmentOf(sequence.id, person?.id ?? "");
      expect(stuck).toMatchObject({
        status: "active",
        nextStepPosition: 0,
        lastMessageId: null,
      });
      expect(stuck.nextRunAt?.toISOString()).toBe(
        later(retryAfterErrorMs).toISOString(),
      );
      const [handedOver] = await messagesOf(sequence.id);
      expect(await messagesOf(sequence.id)).toHaveLength(1);

      await db
        .update(contacts)
        .set({ firstName: "Renamed" })
        .where(eq(contacts.id, person?.id ?? ""));
      const retry = await runner.tick(later(retryAfterErrorMs), scope);
      expect(retry).toMatchObject({ claimed: 1, sent: 0, failed: 0 });
      expect(await messagesOf(sequence.id)).toHaveLength(1);
      const moved = await enrollmentOf(sequence.id, person?.id ?? "");
      expect(moved).toMatchObject({
        nextStepPosition: 1,
        lastMessageId: handedOver?.id,
        threadRootRfcId: handedOver?.rfcMessageId,
      });

      const replay = await dispatch
        .enqueue({
          workspaceId: alpha.workspaceId,
          kind: "sequence",
          sourceId: ada,
          from: { email: "ada@alpha.test" },
          to: [person?.email ?? ""],
          subject: "Something else entirely",
          content: {
            snapshotId:
              (
                await db
                  .select()
                  .from(sequenceSteps)
                  .where(eq(sequenceSteps.id, sequence.steps[0]?.id ?? ""))
              )[0]?.snapshotId ?? "",
            variables: {},
          },
          idempotencyKey: stepIdempotencyKey(
            moved.id,
            sequence.steps[0]?.id ?? "",
          ),
        })
        .catch((error: { getStatus(): number }) => error.getStatus());
      expect(replay).toBe(409);
      expect(await messagesOf(sequence.id)).toHaveLength(1);
    });

    it("a crash after the claim and before the hand-off skips nothing: the step goes out once the lease runs out", async () => {
      const sequence = await makeSequence({}, [
        { delayMinutes: 0, templateId },
      ]);
      const [person] = await makeContacts(1);
      await enrol(sequence.id, [person?.id ?? ""]);
      const lease = later(claimLeaseMs);
      const claimed = await repository.claimDue({
        now: clockNow,
        lease,
        limit: 10,
        workspaceIds: scope.workspaceIds,
        excludeSourceIds: [],
        excludeUnassignedSequenceIds: [],
      });
      expect(claimed).toHaveLength(1);
      expect(claimed[0]?.dueAt.toISOString()).toBe(clockNow.toISOString());

      expect(await runner.tick(later(tickMs), scope)).toMatchObject({
        claimed: 0,
        sent: 0,
      });
      expect(
        await runner.tick(later(claimLeaseMs - secondMs), scope),
      ).toMatchObject({ claimed: 0 });
      expect(await messagesOf(sequence.id)).toHaveLength(0);
      expect(await runner.tick(later(claimLeaseMs), scope)).toMatchObject({
        claimed: 1,
        sent: 1,
      });
      expect(await messagesOf(sequence.id)).toHaveLength(1);
    });

    it("two workers ticking at the same moment never give one contact the same step twice or one mailbox two sends", async () => {
      const sequence = await makeSequence({ sourceIds: [ada, grace] }, [
        { delayMinutes: 0, templateId },
        { delayMinutes: 1, templateId: followUpTemplateId },
      ]);
      const people = await makeContacts(12);
      await enrol(
        sequence.id,
        people.map((person) => person.id),
      );
      for (let round = 0; round < 6; round += 1) {
        const at = later(round * tickMs);
        const results = await Promise.all([
          runner.tick(at, scope),
          runner.tick(at, scope),
          runner.tick(at, scope),
        ]);
        expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(2);
        expect(results.reduce((sum, result) => sum + result.failed, 0)).toBe(0);
        const sentNow = await messagesOf(sequence.id);
        expect(sentNow).toHaveLength((round + 1) * 2);
      }
      const all = await messagesOf(sequence.id);
      const keys = all.map(
        (message) => `${message.enrollmentId}:${message.sequenceStepId}`,
      );
      expect(new Set(keys).size).toBe(keys.length);
      const rows = await enrollmentRows(sequence.id);
      for (const row of rows) {
        const mine = all.filter((message) => message.enrollmentId === row.id);
        expect(mine).toHaveLength(row.nextStepPosition);
        expect(row.status).toBe(
          row.nextStepPosition === 2 ? "completed" : "active",
        );
      }
      const stats = await sequenceRow(sequence.id);
      expect(stats.activeCount + stats.completedCount).toBe(12);
      expect(stats.activeCount).toBe(
        rows.filter((row) => row.status === "active").length,
      );
    });

    it("stops a mailbox at the daily limit and carries on the next window day", async () => {
      const zone = noonZone();
      const sequence = await makeSequence(
        { dailyLimitPerSource: 1, timezone: zone.timezone },
        [{ delayMinutes: 0, templateId }],
      );
      clockNow = zone.now;
      randomValue = 0;
      const people = await makeContacts(3);
      await enrol(sequence.id, [people[0]?.id ?? "", people[1]?.id ?? ""]);
      expect(await runner.tick(clockNow, scope)).toMatchObject({
        claimed: 2,
        sent: 1,
        rescheduled: 1,
        held: 0,
      });
      await redis.del(spacingKey(ada));
      await enrol(sequence.id, [people[2]?.id ?? ""]);
      expect(await runner.tick(later(tickMs), scope)).toMatchObject({
        claimed: 1,
        sent: 0,
        rescheduled: 1,
      });
      const waiting = (await enrollmentRows(sequence.id)).filter(
        (row) => row.status === "active",
      );
      expect(waiting).toHaveLength(2);
      for (const row of waiting) {
        expect(row.nextRunAt?.getTime()).toBe(zone.nextMidnight);
        expect(row.nextStepPosition).toBe(0);
      }
      expect(await messagesOf(sequence.id)).toHaveLength(1);

      await redis.del(spacingKey(ada));
      clockNow = new Date(zone.nextMidnight);
      expect(await runner.tick(clockNow, scope)).toMatchObject({
        claimed: 2,
        sent: 1,
        rescheduled: 1,
      });
      expect(await messagesOf(sequence.id)).toHaveLength(2);
      clockNow = new Date("2026-10-13T10:00:00.000Z");
    });

    it("waits an hour when the contact's mailbox cannot send, and does not move the contact to another mailbox", async () => {
      const sequence = await makeSequence({ sourceIds: [ada, grace] });
      const [person] = await makeContacts(1);
      await enrol(sequence.id, [person?.id ?? ""]);
      await runner.tick(clockNow, scope);
      const assigned = (await enrollmentOf(sequence.id, person?.id ?? ""))
        .sourceId;
      expect(assigned).toEqual(expect.any(String));
      const actor = { workspaceId: alpha.workspaceId, userId: null };
      await sources.update(actor, assigned ?? "", { paused: true });

      const at = later(hourMs);
      expect(await runner.tick(at, scope)).toMatchObject({
        claimed: 1,
        sent: 0,
        rescheduled: 1,
      });
      const row = await enrollmentOf(sequence.id, person?.id ?? "");
      expect(row.sourceId).toBe(assigned);
      expect(row.nextStepPosition).toBe(1);
      expect(row.nextRunAt?.getTime()).toBe(
        at.getTime() + retryUnusableSourceMs,
      );
      await sources.update(actor, assigned ?? "", { paused: false });
      await redis.del(spacingKey(ada), spacingKey(grace));
      expect(
        await runner.tick(later(hourMs + retryUnusableSourceMs), scope),
      ).toMatchObject({ sent: 1 });
    });

    it("ends an enrolment as unsubscribed or bounced when dispatch skips the email because of suppression", async () => {
      const sequence = await makeSequence({ sourceIds: [ada, grace] }, [
        { delayMinutes: 0, templateId },
      ]);
      const [left, bounced] = await makeContacts(2);
      await enrol(sequence.id, [left?.id ?? "", bounced?.id ?? ""]);
      await suppression.record({
        workspaceId: alpha.workspaceId,
        email: left?.email ?? "",
        reason: "unsubscribed",
        origin: "user",
      });
      await suppression.record({
        workspaceId: alpha.workspaceId,
        email: bounced?.email ?? "",
        reason: "bounced",
        origin: "user",
      });
      expect(await runner.tick(clockNow, scope)).toMatchObject({
        claimed: 2,
        ended: 2,
      });
      expect(await enrollmentOf(sequence.id, left?.id ?? "")).toMatchObject({
        status: "unsubscribed",
        finishReason: "suppressed_unsubscribed",
        nextRunAt: null,
      });
      expect(await enrollmentOf(sequence.id, bounced?.id ?? "")).toMatchObject({
        status: "bounced",
        finishReason: "suppressed_bounced",
        nextRunAt: null,
      });
      expect(await sequenceRow(sequence.id)).toMatchObject({
        activeCount: 0,
        unsubscribedCount: 1,
        bouncedCount: 1,
        completedCount: 0,
      });
      expect(
        (await messagesOf(sequence.id)).map((message) => message.status),
      ).toEqual(["skipped", "skipped"]);
    });

    it("reconciles an email skipped at send time, which produces no outcome, even after the enrolment completed", async () => {
      const sequence = await makeSequence({}, [
        { delayMinutes: 0, templateId },
      ]);
      const [person] = await makeContacts(1);
      await enrol(sequence.id, [person?.id ?? ""]);
      await runner.tick(clockNow, scope);
      expect(await sequenceRow(sequence.id)).toMatchObject({
        completedCount: 1,
      });
      const [message] = await messagesOf(sequence.id);
      await suppression.record({
        workspaceId: alpha.workspaceId,
        email: person?.email ?? "",
        reason: "complained",
        origin: "user",
      });
      await db
        .update(messages)
        .set({ status: "skipped", suppressedEmails: [person?.email ?? ""] })
        .where(eq(messages.id, message?.id ?? ""));

      expect(await runner.reconcile(clockNow, scope)).toMatchObject({
        ended: 1,
      });
      expect(await enrollmentOf(sequence.id, person?.id ?? "")).toMatchObject({
        status: "bounced",
        finishReason: "suppressed_complained",
      });
      expect(await sequenceRow(sequence.id)).toMatchObject({
        activeCount: 0,
        completedCount: 0,
        bouncedCount: 1,
      });
      expect(await runner.reconcile(clockNow, scope)).toMatchObject({
        ended: 0,
      });
      expect((await sequenceRow(sequence.id)).bouncedCount).toBe(1);
    });
  });

  describe("outcomes", () => {
    async function started(settings: Record<string, unknown> = {}) {
      const sequence = await makeSequence(settings);
      const [person] = await makeContacts(1);
      await enrol(sequence.id, [person?.id ?? ""]);
      await runner.tick(clockNow, scope);
      const [message] = await messagesOf(sequence.id);
      if (!message || !person) {
        throw new Error("The first step was not handed over.");
      }
      return { sequence, person, message };
    }

    async function stepRow(id: string | undefined) {
      const [row] = await db
        .select()
        .from(sequenceSteps)
        .where(eq(sequenceSteps.id, id ?? ""));
      return row;
    }

    it("counts sent, opened and clicked once per email, through the real event path", async () => {
      const { sequence, message } = await started({
        trackOpens: true,
        trackClicks: true,
      });
      outcomeJobs.length = 0;
      await dispatch.recordEvent({ messageId: message.id, type: "sent" });
      await dispatch.recordEvent({
        messageId: message.id,
        type: "clicked",
        url: "https://example.com/a",
      });
      await dispatch.recordEvent({ messageId: message.id, type: "opened" });
      await dispatch.recordEvent({
        messageId: message.id,
        type: "clicked",
        url: "https://example.com/a",
      });
      expect(outcomeJobs.map((job) => [job.type, job.first])).toEqual([
        ["sent", true],
        ["clicked", true],
        ["opened", true],
        ["opened", false],
        ["clicked", false],
      ]);
      await drainOutcomes();
      expect(await sequenceRow(sequence.id)).toMatchObject({
        sentCount: 1,
        openedCount: 1,
        clickedCount: 1,
        activeCount: 1,
      });
      expect(await stepRow(sequence.steps[0]?.id)).toMatchObject({
        sentCount: 1,
        openedCount: 1,
        clickedCount: 1,
        repliedCount: 0,
      });
      const view = await http<SequenceBody>(
        "GET",
        `/v1/sequences/${sequence.id}`,
      );
      expect(view.body.stats).toMatchObject({ sent: 1, opened: 1, clicked: 1 });
      expect(view.body.steps[0]?.stats).toMatchObject({
        sent: 1,
        opened: 1,
        clicked: 1,
      });
    });

    it("a reply ends the enrolment once, and the same reply arriving again changes nothing", async () => {
      const { sequence, person, message } = await started();
      expect(await outcomes.apply(outcome(message, "replied"))).toEqual({
        counted: true,
        ended: "replied",
      });
      expect(await enrollmentOf(sequence.id, person.id)).toMatchObject({
        status: "replied",
        finishReason: "replied",
        nextRunAt: null,
      });
      expect(await sequenceRow(sequence.id)).toMatchObject({
        activeCount: 0,
        repliedCount: 1,
      });
      expect(await outcomes.apply(outcome(message, "replied", false))).toEqual({
        counted: false,
        ended: null,
      });
      for (const type of ["bounced", "unsubscribed", "failed"] as const) {
        expect(
          (await outcomes.apply(outcome(message, type, false))).ended,
        ).toBeNull();
      }
      expect(await sequenceRow(sequence.id)).toMatchObject({
        activeCount: 0,
        repliedCount: 1,
        bouncedCount: 0,
        unsubscribedCount: 0,
      });
      expect((await stepRow(sequence.steps[0]?.id))?.repliedCount).toBe(1);
      expect(await runner.tick(later(dayMs), scope)).toMatchObject({
        claimed: 0,
      });
      expect(await messagesOf(sequence.id)).toHaveLength(1);
    });

    it("a reply does not end the enrolment when stop on reply is off", async () => {
      const { sequence, person, message } = await started({
        stopOnReply: false,
      });
      expect(await outcomes.apply(outcome(message, "replied"))).toEqual({
        counted: true,
        ended: null,
      });
      expect((await enrollmentOf(sequence.id, person.id)).status).toBe(
        "active",
      );
      expect(await sequenceRow(sequence.id)).toMatchObject({
        activeCount: 1,
        repliedCount: 0,
      });
      expect((await stepRow(sequence.steps[0]?.id))?.repliedCount).toBe(1);
    });

    it("a bounce, a complaint, an unsubscribe and a failure each end the enrolment with their own status", async () => {
      for (const [type, status, reason, counter] of [
        ["bounced", "bounced", "bounced", "bouncedCount"],
        ["complained", "bounced", "complained", "bouncedCount"],
        ["unsubscribed", "unsubscribed", "unsubscribed", "unsubscribedCount"],
        ["failed", "failed", "send_failed", null],
      ] as const) {
        const { sequence, person, message } = await started();
        expect((await outcomes.apply(outcome(message, type))).ended).toBe(
          status,
        );
        expect(await enrollmentOf(sequence.id, person.id)).toMatchObject({
          status,
          finishReason: reason,
          nextRunAt: null,
        });
        const row = await sequenceRow(sequence.id);
        expect(row.activeCount).toBe(0);
        if (counter) {
          expect(row[counter]).toBe(1);
        }
        await outcomes.apply(outcome(message, type, false));
        const again = await sequenceRow(sequence.id);
        expect(again.activeCount).toBe(0);
        if (counter) {
          expect(again[counter]).toBe(1);
        }
      }
    });

    it("a reply to the last step, which arrives after completion, turns completed into replied and keeps both counters right", async () => {
      const sequence = await makeSequence({}, [
        { delayMinutes: 0, templateId },
      ]);
      const [person] = await makeContacts(1);
      await enrol(sequence.id, [person?.id ?? ""]);
      await runner.tick(clockNow, scope);
      const [message] = await messagesOf(sequence.id);
      expect(await sequenceRow(sequence.id)).toMatchObject({
        completedCount: 1,
        repliedCount: 0,
      });
      if (!message) {
        throw new Error("No message.");
      }
      expect((await outcomes.apply(outcome(message, "replied"))).ended).toBe(
        "replied",
      );
      await outcomes.apply(outcome(message, "replied", false));
      expect(await sequenceRow(sequence.id)).toMatchObject({
        activeCount: 0,
        completedCount: 0,
        repliedCount: 1,
      });
    });

    it("ignores outcomes for a removed enrolment, another workspace, or no sequence", async () => {
      const { sequence, person, message } = await started();
      const row = await enrollmentOf(sequence.id, person.id);
      await http(
        "POST",
        `/v1/sequences/${sequence.id}/enrollments/${row.id}/remove`,
      );
      expect(
        (await outcomes.apply(outcome(message, "replied", false))).ended,
      ).toBeNull();
      expect((await enrollmentOf(sequence.id, person.id)).status).toBe(
        "removed",
      );
      const foreign = {
        ...outcome(message, "sent"),
        workspaceId: beta.workspaceId,
      };
      await outcomes.apply(foreign);
      expect((await sequenceRow(sequence.id)).sentCount).toBe(0);
      expect(
        await outcomes.apply({ ...outcome(message, "sent"), sequenceId: null }),
      ).toEqual({ counted: false, ended: null });
    });
  });

  describe("reply and bounce detection", () => {
    it("reads mail since the cursor, records replies and permanent bounces once, ignores auto-replies, and never changes the mailbox", async () => {
      const sequence = await makeSequence();
      const people = await makeContacts(5);
      const [replier, away, dead, slow, quiet] = people;
      const roots = new Map<string, string>();
      for (const [index, person] of people.entries()) {
        await enrol(sequence.id, [person.id]);
        await redis.del(spacingKey(ada));
        await runner.tick(later(index * tickMs), scope);
        const row = await enrollmentOf(sequence.id, person.id);
        await markSent(row.lastMessageId ?? "");
        roots.set(person.id, row.threadRootRfcId ?? "");
      }
      const now = later(10 * minuteMs);
      const mail = (
        person: { id: string; email: string } | undefined,
        extra: Partial<ReceivedMessage>,
      ): ReceivedMessage => ({
        inReplyTo: roots.get(person?.id ?? ""),
        references: [roots.get(person?.id ?? "") ?? ""],
        from: { email: person?.email ?? "" },
        receivedAt: later(5 * minuteMs),
        headers: {},
        ...extra,
      });
      fake.received.set("ada@alpha.test", [
        mail(replier, {}),
        mail(away, { headers: { "auto-submitted": "auto-replied" } }),
        mail(dead, {
          inReplyTo: undefined,
          references: [],
          from: { email: "MAILER-DAEMON@mx.customer.test" },
          deliveryStatus: {
            action: "failed",
            status: "5.1.1",
            originalMessageId: roots.get(dead?.id ?? ""),
            failedRecipient: dead?.email.toUpperCase(),
          },
        }),
        mail(slow, {
          from: { email: "mailer-daemon@mx.customer.test" },
          deliveryStatus: { action: "delayed", status: "4.4.1" },
        }),
        mail(quiet, { from: { email: "ada@alpha.test" } }),
        mail(undefined, {
          inReplyTo: "<unrelated@elsewhere.test>",
          references: ["<unrelated@elsewhere.test>"],
          from: { email: "stranger@elsewhere.test" },
        }),
        mail(replier, { receivedAt: later(-3 * dayMs) }),
      ]);
      outcomeJobs.length = 0;
      fake.calls.applyActions = 0;
      fake.calls.ensureFolder = 0;

      const result = await detector.run(now, scope);
      expect(result).toMatchObject({
        failed: 0,
        unsupported: 0,
        replies: 1,
        autoReplies: 1,
        bounces: 1,
      });
      expect(outcomeJobs.map((job) => job.type).sort()).toEqual([
        "bounced",
        "replied",
      ]);
      await drainOutcomes();

      expect(await enrollmentOf(sequence.id, replier?.id ?? "")).toMatchObject({
        status: "replied",
        nextRunAt: null,
      });
      expect((await enrollmentOf(sequence.id, away?.id ?? "")).status).toBe(
        "active",
      );
      expect(await enrollmentOf(sequence.id, dead?.id ?? "")).toMatchObject({
        status: "bounced",
        finishReason: "bounced",
      });
      expect((await enrollmentOf(sequence.id, slow?.id ?? "")).status).toBe(
        "active",
      );
      expect((await enrollmentOf(sequence.id, quiet?.id ?? "")).status).toBe(
        "active",
      );
      const blocked = await suppression.findBlocked(
        alpha.workspaceId,
        people.map((person) => person.email),
        "transactional",
      );
      expect([...blocked.entries()]).toEqual([[dead?.email, "bounced"]]);
      const all = await messagesOf(sequence.id);
      const messageOf = (person: { id: string } | undefined) =>
        all.find((message) => message.contactId === person?.id);
      expect(messageOf(replier)?.repliedAt).toEqual(expect.any(Date));
      expect(messageOf(dead)?.status).toBe("bounced");
      expect(messageOf(away)?.repliedAt).toBeNull();
      expect(await sequenceRow(sequence.id)).toMatchObject({
        repliedCount: 1,
        bouncedCount: 1,
        activeCount: 3,
      });

      const [cursor] = await db
        .select()
        .from(sequenceReplyCursors)
        .where(eq(sequenceReplyCursors.sourceId, ada));
      expect(cursor?.lastCheckedAt?.toISOString()).toBe(now.toISOString());
      expect(cursor?.workspaceId).toBe(alpha.workspaceId);
      expect(Object.keys(cursor?.state ?? {})).toEqual(["seen"]);

      const again = await detector.run(later(12 * minuteMs), scope);
      expect(again).toMatchObject({ replies: 0, bounces: 0 });
      expect(outcomeJobs).toHaveLength(0);
      const events = await db
        .select({ type: messageEvents.type })
        .from(messageEvents)
        .where(
          and(
            inArray(
              messageEvents.messageId,
              all.map((message) => message.id),
            ),
            inArray(messageEvents.type, ["replied", "bounced"]),
          ),
        );
      expect(events.map((event) => event.type).sort()).toEqual([
        "bounced",
        "replied",
      ]);
      expect(fake.calls.applyActions).toBe(0);
      expect(fake.calls.ensureFolder).toBe(0);

      const next = await runner.tick(later(hourMs + minuteMs), scope);
      expect(next.sent).toBe(1);
      const followUps = (await messagesOf(sequence.id)).filter(
        (message) => message.sequenceStepId === sequence.steps[1]?.id,
      );
      expect(followUps).toHaveLength(1);
      expect([away?.id, slow?.id, quiet?.id]).toContain(
        followUps[0]?.contactId,
      );
    });

    it("does nothing for a mailbox whose adapter cannot list received mail", async () => {
      const sequence = await makeSequence();
      const [person] = await makeContacts(1);
      await enrol(sequence.id, [person?.id ?? ""]);
      await runner.tick(clockNow, scope);
      const row = await enrollmentOf(sequence.id, person?.id ?? "");
      fake.received.set("ada@alpha.test", [
        {
          inReplyTo: row.threadRootRfcId ?? "",
          references: [],
          from: { email: person?.email ?? "" },
          receivedAt: later(minuteMs),
          headers: {},
        },
      ]);
      fake.setListing(false);
      outcomeJobs.length = 0;
      const result = await detector.run(later(20 * minuteMs), scope);
      const blind = await http<SequenceBody>(
        "GET",
        `/v1/sequences/${sequence.id}`,
      );
      const blindCheck = await http<{ problems: Problem[] }>(
        "GET",
        `/v1/sequences/${sequence.id}/check`,
      );
      fake.setListing(true);
      const sighted = await http<{ problems: Problem[] }>(
        "GET",
        `/v1/sequences/${sequence.id}/check`,
      );
      expect(
        blind.body.sources.find((source) => source.id === ada)?.hasInbox,
      ).toBe(false);
      expect(blindCheck.body.problems.map((problem) => problem.code)).toContain(
        "source_without_inbox",
      );
      expect(
        sighted.body.problems.map((problem) => problem.code),
      ).not.toContain("source_without_inbox");
      expect(result.unsupported).toBeGreaterThan(0);
      expect(result.replies).toBe(0);
      expect(outcomeJobs).toHaveLength(0);
      expect((await enrollmentOf(sequence.id, person?.id ?? "")).status).toBe(
        "active",
      );
    });
  });
});
