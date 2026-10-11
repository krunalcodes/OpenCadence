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
import { DelayedError, type Job, type Queue } from "bullmq";
import { AppModule } from "../src/app/app.module";
import { WorkerModule } from "../src/app/worker.module";
import { DATABASE } from "../src/infra/database/database.module";
import { TrackingKeys } from "../src/infra/tracking-keys/tracking-keys";
import { BrandService } from "../src/modules/brand/brand.service";
import {
  CAMPAIGN_FANOUT_QUEUE,
  type CampaignFanoutJob,
  fanoutJobId,
  fanoutPageSize,
  maxQueuedPerCampaign,
} from "../src/modules/campaigns/campaigns.constants";
import { CampaignsEngine } from "../src/modules/campaigns/campaigns.engine";
import { CampaignsRepository } from "../src/modules/campaigns/campaigns.repository";
import type {
  Campaign,
  CampaignCheck,
  CampaignRecipient,
  CampaignSummary,
} from "../src/modules/campaigns/campaigns.service";
import { CampaignFanoutProcessor } from "../src/modules/campaigns/jobs/campaign-fanout.processor";
import { CampaignMaintenanceProcessor } from "../src/modules/campaigns/jobs/campaign-maintenance.processor";
import { CampaignOutcomesProcessor } from "../src/modules/campaigns/jobs/campaign-outcomes.processor";
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
import { AdapterRegistry } from "../src/modules/integrations/adapter-registry";
import {
  type Actor,
  SendingSourcesService,
} from "../src/modules/integrations/sending-sources.service";
import { AudienceService } from "../src/modules/segments/audience.service";
import { SuppressionService } from "../src/modules/suppression/suppression.service";
import {
  createApiKey,
  createWorkspaceSessions,
  type TestMember,
  type TestWorkspace,
} from "./support/workspace-session";

type Page = { items: CampaignSummary[]; nextCursor: string | null };
type RecipientPage = { items: CampaignRecipient[]; nextCursor: string | null };
type Method = "GET" | "POST" | "PATCH" | "DELETE";

type StubbedQueue = {
  add: (...args: unknown[]) => Promise<unknown>;
  addBulk: (...args: unknown[]) => Promise<unknown>;
};

const bigListSize = fanoutPageSize * 5 + 100;
const smallListSize = fanoutPageSize + 200;
const insertChunk = 1000;
const templateHtml =
  '<html><body><p>Hi {{first_name|there}}, your plan is {{fields.plan}}.</p><a href="https://example.com/offer">See the offer</a><p>{{brand.name}}</p></body></html>';

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

describe("Campaigns (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let dispatch: DispatchService;
  let sources: SendingSourcesService;
  let engine: CampaignsEngine;
  let fanoutProcessor: CampaignFanoutProcessor;
  let outcomesProcessor: CampaignOutcomesProcessor;
  let maintenance: CampaignMaintenanceProcessor;
  let sendProcessor: SendProcessor;
  let sessions: ReturnType<typeof createWorkspaceSessions>;
  let workspace: TestWorkspace;
  let other: TestWorkspace;
  let member: TestMember;
  let actor: Actor;
  let apiKey: string;
  let sourceId: string;
  let templateId: string;
  let emptyTemplateId: string;
  let bigListId: string;
  let smallListId: string;
  let emptyListId: string;
  let otherListId: string;
  let bigCampaignId: string;
  const fake = fakeResend();
  const sendJobs: SendJob[] = [];
  const fanoutJobs: { data: CampaignFanoutJob; jobId: string | undefined }[] =
    [];
  const outcomes: MessageOutcomeJob[] = [];

  function call(
    who: TestMember,
    method: Method,
    path: string,
    payload?: Record<string, unknown>,
  ) {
    return app.inject({
      method,
      url: `/v1/campaigns${path}`,
      headers: { cookie: who.cookie },
      ...(payload ? { payload } : {}),
    });
  }

  async function create(
    payload: Record<string, unknown>,
    who: TestMember = workspace.owner,
  ): Promise<Campaign> {
    const response = await call(who, "POST", "", payload);
    expect([payload.name, response.statusCode]).toEqual([payload.name, 201]);
    return response.json();
  }

  async function read(id: string): Promise<Campaign> {
    const response = await call(workspace.owner, "GET", `/${id}`);
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  async function check(id: string, query = ""): Promise<CampaignCheck> {
    const response = await call(workspace.owner, "GET", `/${id}/check${query}`);
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  function codes(result: CampaignCheck, severity: "error" | "warning") {
    return result.problems
      .filter((problem) => problem.severity === severity)
      .map((problem) => `${problem.field}:${problem.code}`)
      .sort();
  }

  function ready(name: string, audienceListId: string) {
    return create({
      name,
      templateId,
      sourceId,
      fromEmail: "news@example.com",
      fromName: "Northwind News",
      replyTo: "hello@example.com",
      audience: { type: "lists", listIds: [audienceListId] },
      trackClicks: false,
    });
  }

  async function act(id: string, action: string, payload = {}) {
    const response = await call(
      workspace.owner,
      "POST",
      `/${id}/${action}`,
      payload,
    );
    return { status: response.statusCode, body: response.json() };
  }

  async function createList(owner: string, name: string) {
    const [list] = await db
      .insert(schema.lists)
      .values({ workspaceId: owner, name })
      .returning();
    if (!list) {
      throw new Error("The test list was not created.");
    }
    return list.id;
  }

  async function addContacts(listId: string, prefix: string, count: number) {
    for (let offset = 0; offset < count; offset += insertChunk) {
      const size = Math.min(insertChunk, count - offset);
      const rows = await db
        .insert(schema.contacts)
        .values(
          Array.from({ length: size }, (_, index) => ({
            workspaceId: workspace.workspaceId,
            email: `${prefix}${offset + index}@campaigns-e2e.test`,
            firstName: `${prefix} ${offset + index}`,
            fields: { plan: "pro" },
          })),
        )
        .returning({ id: schema.contacts.id });
      await db.insert(schema.listMembers).values(
        rows.map((row) => ({
          listId,
          contactId: row.id,
          workspaceId: workspace.workspaceId,
          status: "subscribed",
        })),
      );
    }
  }

  async function campaignMessages(campaignId: string) {
    return db
      .select({
        id: schema.messages.id,
        contactId: schema.messages.contactId,
        status: schema.messages.status,
        subject: schema.messages.subject,
        toEmails: schema.messages.toEmails,
        fromEmail: schema.messages.fromEmail,
        fromName: schema.messages.fromName,
        replyTo: schema.messages.replyTo,
        trackOpens: schema.messages.trackOpens,
        trackClicks: schema.messages.trackClicks,
        unsubscribeListId: schema.messages.unsubscribeListId,
        kind: schema.messages.kind,
      })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.workspaceId, workspace.workspaceId),
          eq(schema.messages.campaignId, campaignId),
        ),
      );
  }

  function expectEachContactOnce(
    rows: Awaited<ReturnType<typeof campaignMessages>>,
    total: number,
  ) {
    expect(rows).toHaveLength(total);
    expect(new Set(rows.map((row) => row.contactId)).size).toBe(total);
    expect(new Set(rows.map((row) => row.toEmails[0])).size).toBe(total);
  }

  async function settle(campaignId: string, status: string) {
    await db
      .update(schema.messages)
      .set({ status })
      .where(
        and(
          eq(schema.messages.workspaceId, workspace.workspaceId),
          eq(schema.messages.campaignId, campaignId),
          eq(schema.messages.status, "queued"),
        ),
      );
  }

  function fanOut(campaignId: string) {
    return engine.fanOut(workspace.workspaceId, campaignId);
  }

  function sendJob(messageId: string) {
    const data = sendJobs.find((job) => job.messageId === messageId);
    if (!data) {
      throw new Error("No send job was added for this message.");
    }
    return {
      data,
      attemptsMade: 0,
      opts: { attempts: 6 },
      progress: 0,
      updateProgress: vi.fn(async () => undefined),
      moveToDelayed: vi.fn(async () => undefined),
    } as unknown as Job<SendJob>;
  }

  async function applyOutcomes() {
    const pending = outcomes.splice(0);
    for (const data of pending) {
      await outcomesProcessor.process({ data } as Job<MessageOutcomeJob>);
    }
    return pending;
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
      new FastifyAdapter({ bodyLimit: 4 * 1024 * 1024 }),
      { bodyParser: false },
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = app.get<Db>(DATABASE);
    dispatch = app.get(DispatchService);
    sources = app.get(SendingSourcesService);

    const sendQueue = app.get<StubbedQueue>(getQueueToken(SEND_QUEUE));
    vi.spyOn(sendQueue, "add").mockImplementation(async (_name, data) => {
      sendJobs.push(data as SendJob);
      return {};
    });
    vi.spyOn(sendQueue, "addBulk").mockImplementation(async (jobs) => {
      sendJobs.push(...(jobs as { data: SendJob }[]).map((job) => job.data));
      return [];
    });
    const fanoutQueue = app.get<Queue<CampaignFanoutJob>>(
      getQueueToken(CAMPAIGN_FANOUT_QUEUE),
    );
    vi.spyOn(fanoutQueue as unknown as StubbedQueue, "add").mockImplementation(
      async (_name, data, opts) => {
        fanoutJobs.push({
          data: data as CampaignFanoutJob,
          jobId: (opts as { jobId?: string }).jobId,
        });
        return {};
      },
    );
    vi.spyOn(
      app.get<StubbedQueue>(getQueueToken(CAMPAIGN_OUTCOMES_QUEUE)),
      "add",
    ).mockImplementation(async (_name, data) => {
      outcomes.push(data as MessageOutcomeJob);
      return {};
    });
    vi.spyOn(
      app.get<StubbedQueue>(getQueueToken(SEQUENCE_OUTCOMES_QUEUE)),
      "add",
    ).mockImplementation(async () => ({}));

    engine = new CampaignsEngine(
      app.get(CampaignsRepository),
      dispatch,
      app.get(AudienceService),
      app.get(BrandService),
      sources,
      fanoutQueue,
    );
    fanoutProcessor = new CampaignFanoutProcessor(engine);
    outcomesProcessor = new CampaignOutcomesProcessor(engine);
    maintenance = new CampaignMaintenanceProcessor(
      { upsertJobScheduler: async () => undefined } as unknown as Queue,
      engine,
    );
    sendProcessor = new SendProcessor(
      app.get(DispatchRepository),
      sources,
      app.get(SuppressionService),
      { waitMs: async () => 0 } as unknown as SendRateLimiter,
      app.get(MessageEvents),
      app.get(TrackingKeys),
    );

    sessions = createWorkspaceSessions(app, "campaigns-e2e");
    workspace = await sessions.workspace();
    other = await sessions.workspace();
    member = await workspace.addMember("member");
    actor = { workspaceId: workspace.workspaceId, userId: null };
    apiKey = await createApiKey(app, workspace.owner, workspace.workspaceId);

    await db.insert(schema.contactFields).values({
      workspaceId: workspace.workspaceId,
      key: "plan",
      label: "Plan",
      type: "text",
    });
    bigListId = await createList(workspace.workspaceId, "Newsletter");
    smallListId = await createList(workspace.workspaceId, "Customers");
    emptyListId = await createList(workspace.workspaceId, "Nobody");
    otherListId = await createList(other.workspaceId, "Elsewhere");
    await addContacts(bigListId, "big", bigListSize);
    await addContacts(smallListId, "small", smallListSize);

    const template = await app.inject({
      method: "POST",
      url: "/v1/templates",
      headers: { cookie: workspace.owner.cookie },
      payload: {
        name: "October news",
        subject: "News for {{first_name|you}}",
        previewText: "What is new this month",
        html: templateHtml,
        text: "Hi {{first_name|there}}",
      },
    });
    expect(template.statusCode).toBe(201);
    templateId = template.json().id;
    const empty = await app.inject({
      method: "POST",
      url: "/v1/templates",
      headers: { cookie: workspace.owner.cookie },
      payload: { name: "Blank" },
    });
    expect(empty.statusCode).toBe(201);
    emptyTemplateId = empty.json().id;
  }, 120_000);

  afterAll(async () => {
    await sessions.cleanup();
    await app.close();
  });

  it("wires the worker module without starting it", async () => {
    const worker = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();
    expect(worker.get(CampaignsEngine, { strict: false })).toBeInstanceOf(
      CampaignsEngine,
    );
    expect(
      worker.get(CampaignFanoutProcessor, { strict: false }),
    ).toBeInstanceOf(CampaignFanoutProcessor);
    await worker.close();
  });

  it("requires a session or an API key", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/v1/campaigns" });
    expect(anonymous.statusCode).toBe(401);
    const withKey = await app.inject({
      method: "GET",
      url: "/v1/campaigns",
      headers: { "x-api-key": apiKey },
    });
    expect(withKey.statusCode).toBe(200);
    expect(withKey.json()).toEqual({ items: [], nextCursor: null });
  });

  it("creates a draft from a name alone, for any member", async () => {
    const campaign = await create({ name: "  Autumn sale  " }, member);
    expect(campaign).toMatchObject({
      name: "Autumn sale",
      status: "draft",
      subject: "",
      previewText: "",
      audienceLabel: null,
      audience: null,
      template: null,
      source: null,
      from: { name: null, email: null },
      replyTo: null,
      trackOpens: true,
      trackClicks: true,
      error: null,
      fanoutDone: false,
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      stats: {
        recipients: 0,
        skipped: 0,
        sent: 0,
        delivered: 0,
        bounced: 0,
        complained: 0,
        failed: 0,
        opened: 0,
        clicked: 0,
        unsubscribed: 0,
      },
    });
    const removed = await call(member, "DELETE", `/${campaign.id}`);
    expect(removed.statusCode).toBe(204);
  });

  it("validates draft fields", async () => {
    const draft = await create({ name: "Validation" });
    const cases: [Record<string, unknown>, number, string][] = [
      [{ name: "" }, 400, "name"],
      [{ name: "x".repeat(121) }, 400, "name"],
      [{ subject: "two\nlines" }, 400, "subject"],
      [{ previewText: "x".repeat(301) }, 400, "previewText"],
      [{ fromEmail: "not-an-address" }, 400, "fromEmail"],
      [{ replyTo: 5 }, 400, "replyTo"],
      [{ trackOpens: "yes" }, 400, "trackOpens"],
      [{ templateId: "nope" }, 400, "templateId"],
      [{ templateId: randomUUID() }, 404, "templateId"],
      [{ sourceId: "nope" }, 400, "sourceId"],
      [{ audience: { type: "everyone" } }, 400, "audience.type"],
      [{ audience: { type: "lists", listIds: [] } }, 400, "audience.listIds"],
      [
        { audience: { type: "lists", listIds: [otherListId] } },
        404,
        "audience.listIds",
      ],
      [
        { audience: { type: "segment", segmentId: randomUUID() } },
        404,
        "audience.segmentId",
      ],
    ];
    for (const [payload, status, field] of cases) {
      const response = await call(
        workspace.owner,
        "PATCH",
        `/${draft.id}`,
        payload,
      );
      expect([field, response.statusCode]).toEqual([field, status]);
      expect(response.json().field).toBe(field);
    }
    const missingSource = await call(workspace.owner, "PATCH", `/${draft.id}`, {
      sourceId: randomUUID(),
    });
    expect(missingSource.statusCode).toBe(404);
    const unnamed = await call(workspace.owner, "POST", "", { subject: "Hi" });
    expect(unnamed.statusCode).toBe(400);
    expect(unnamed.json().field).toBe("name");
    expect((await read(draft.id)).updatedAt).toBe(draft.updatedAt);
    await call(workspace.owner, "DELETE", `/${draft.id}`);
  });

  it("copies the template's subject and preview text only when they are empty", async () => {
    const draft = await create({ name: "Prefill", templateId });
    expect(draft).toMatchObject({
      template: { id: templateId, name: "October news" },
      subject: "News for {{first_name|you}}",
      previewText: "What is new this month",
    });
    const kept = await call(workspace.owner, "PATCH", `/${draft.id}`, {
      subject: "My own subject",
      previewText: "",
      templateId,
    });
    expect(kept.json()).toMatchObject({
      subject: "My own subject",
      previewText: "What is new this month",
    });
    const cleared = await call(workspace.owner, "PATCH", `/${draft.id}`, {
      templateId: null,
      fromName: "  ",
      fromEmail: " News@Example.com ",
    });
    expect(cleared.json()).toMatchObject({
      template: null,
      subject: "My own subject",
      from: { name: null, email: "news@example.com" },
    });
    await call(workspace.owner, "DELETE", `/${draft.id}`);
  });

  it("keeps campaigns inside their workspace", async () => {
    const mine = await create({ name: "Private" });
    for (const [method, path, payload] of [
      ["GET", `/${mine.id}`, undefined],
      ["PATCH", `/${mine.id}`, { name: "Taken over" }],
      ["DELETE", `/${mine.id}`, undefined],
      ["POST", `/${mine.id}/duplicate`, undefined],
      ["GET", `/${mine.id}/check`, undefined],
      ["POST", `/${mine.id}/send`, {}],
      ["POST", `/${mine.id}/unschedule`, undefined],
      ["POST", `/${mine.id}/pause`, undefined],
      ["POST", `/${mine.id}/resume`, undefined],
      ["POST", `/${mine.id}/cancel`, undefined],
      ["GET", `/${mine.id}/recipients`, undefined],
      ["POST", `/${mine.id}/test`, { to: "ada@example.com" }],
    ] as [Method, string, Record<string, unknown> | undefined][]) {
      const response = await call(other.owner, method, path, payload);
      expect([method, path, response.statusCode]).toEqual([method, path, 404]);
    }
    const theirs = await call(other.owner, "GET", "");
    expect(theirs.json().items).toEqual([]);
    expect((await call(workspace.owner, "GET", "/not-an-id")).statusCode).toBe(
      404,
    );
    expect((await read(mine.id)).name).toBe("Private");
    await call(workspace.owner, "DELETE", `/${mine.id}`);
  });

  it("lists newest first with search, a status filter and pages", async () => {
    const names = ["Alpha launch", "Beta launch", "Gamma digest"];
    const created: Campaign[] = [];
    for (const name of names) {
      created.push(
        await create({
          name,
          audience: { type: "lists", listIds: [bigListId, smallListId] },
        }),
      );
    }
    const all: Page = (await call(workspace.owner, "GET", "")).json();
    expect(all.items.map((item) => item.name)).toEqual([...names].reverse());
    expect(all.items[0]?.audienceLabel?.split(", ").sort()).toEqual([
      "Customers",
      "Newsletter",
    ]);
    expect(all.nextCursor).toBeNull();

    const first: Page = (await call(workspace.owner, "GET", "?limit=2")).json();
    expect(first.items.map((item) => item.name)).toEqual([
      "Gamma digest",
      "Beta launch",
    ]);
    const second: Page = (
      await call(workspace.owner, "GET", `?limit=2&cursor=${first.nextCursor}`)
    ).json();
    expect(second.items.map((item) => item.name)).toEqual(["Alpha launch"]);
    expect(second.nextCursor).toBeNull();

    const searched: Page = (
      await call(workspace.owner, "GET", "?search=LAUNCH")
    ).json();
    expect(searched.items.map((item) => item.name)).toEqual([
      "Beta launch",
      "Alpha launch",
    ]);
    const drafts: Page = (
      await call(workspace.owner, "GET", "?status=draft")
    ).json();
    expect(drafts.items).toHaveLength(3);
    const sent: Page = (
      await call(workspace.owner, "GET", "?status=sent")
    ).json();
    expect(sent.items).toEqual([]);
    expect(
      (await call(workspace.owner, "GET", "?status=nope")).statusCode,
    ).toBe(400);
    expect(
      (await call(workspace.owner, "GET", "?cursor=nope")).statusCode,
    ).toBe(400);
    for (const campaign of created) {
      await call(workspace.owner, "DELETE", `/${campaign.id}`);
    }
  });

  it("reports what blocks a draft with nothing chosen and no source", async () => {
    const draft = await create({ name: "Empty" });
    const result = await check(draft.id);
    expect(result.ready).toBe(false);
    expect(result.recipientCount).toBeNull();
    expect(codes(result, "error")).toEqual([
      "audience:audience_missing",
      "source:source_missing",
      "subject:subject_missing",
      "template:template_missing",
    ]);
    expect(codes(result, "warning")).toEqual(["brand:brand_address_missing"]);
    const refused = await act(draft.id, "send");
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("not_ready");
    expect(refused.body.problems).toEqual(result.problems);
    expect((await read(draft.id)).status).toBe("draft");
    await call(workspace.owner, "DELETE", `/${draft.id}`);
  });

  it("checks the template, merge tags, audience, source and sender", async () => {
    const source = await sources.connectResend(actor, {
      name: "Campaign sender",
      apiKey: "re_test_campaigns_key_1234",
    });
    sourceId = source.id;

    const draft = await create({
      name: "Problems",
      templateId: emptyTemplateId,
      subject: "Hello {{nickname}}",
      previewText: "For {{fields.tier}}",
      sourceId,
      audience: { type: "lists", listIds: [emptyListId] },
    });
    expect(draft.source).toMatchObject({
      id: sourceId,
      name: "Campaign sender",
      email: null,
      integrationType: "resend",
      status: "active",
    });
    expect(draft.audienceLabel).toBe("Nobody");
    let result = await check(draft.id);
    expect(result.recipientCount).toBe(0);
    expect(codes(result, "error")).toEqual([
      "audience:audience_empty",
      "from:from_missing",
      "subject:unknown_merge_tag",
      "template:template_empty",
    ]);
    const tagProblem = result.problems.find(
      (problem) => problem.code === "unknown_merge_tag",
    );
    expect(tagProblem?.message).toContain("{{fields.tier}}");
    expect(tagProblem?.message).toContain("{{nickname}}");

    await sources.update(actor, sourceId, { paused: true });
    result = await check(draft.id);
    expect(codes(result, "error")).toContain("source:source_paused");
    await sources.update(actor, sourceId, {
      paused: false,
      dailySendLimit: 1000,
    });

    const fixed = await call(workspace.owner, "PATCH", `/${draft.id}`, {
      templateId,
      subject: "Hello {{first_name|there}}, {{fields.plan}} plan",
      previewText: "",
      fromEmail: "news@example.com",
      audience: { type: "lists", listIds: [bigListId] },
    });
    expect(fixed.statusCode).toBe(200);
    result = await check(draft.id);
    expect(result).toMatchObject({ ready: true, recipientCount: bigListSize });
    expect(codes(result, "error")).toEqual([]);
    expect(codes(result, "warning")).toEqual([
      "brand:brand_address_missing",
      "source:over_daily_limit",
      "template:unsubscribe_link_missing",
    ]);

    result = await check(
      draft.id,
      `?scheduledAt=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}`,
    );
    expect(codes(result, "error")).toEqual(["schedule:schedule_in_past"]);
    const late = await act(draft.id, "send", {
      scheduledAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe("not_ready");
    const unreadable = await act(draft.id, "send", { scheduledAt: "soon" });
    expect(unreadable.status).toBe(400);
    expect(unreadable.body.field).toBe("scheduledAt");

    await app.get(BrandService).update(
      {
        method: "session",
        workspaceId: workspace.workspaceId,
        userId: workspace.owner.userId,
        role: "owner",
      },
      { brandName: "Northwind", postalAddress: "1 Main Street, London" },
    );
    await sources.update(actor, sourceId, { dailySendLimit: null });
    result = await check(draft.id);
    expect(codes(result, "warning")).toEqual([
      "template:unsubscribe_link_missing",
    ]);
    await db
      .delete(schema.templates)
      .where(eq(schema.templates.id, emptyTemplateId));
    await call(workspace.owner, "PATCH", `/${draft.id}`, { templateId: null });
    await call(workspace.owner, "DELETE", `/${draft.id}`);
  });

  it("duplicates a campaign as a new draft", async () => {
    const original = await ready("Spring offer", bigListId);
    const response = await act(original.id, "duplicate");
    expect(response.status).toBe(201);
    const copy: Campaign = response.body;
    expect(copy.id).not.toBe(original.id);
    expect(copy).toMatchObject({
      name: "Spring offer copy",
      status: "draft",
      subject: original.subject,
      previewText: original.previewText,
      template: original.template,
      source: original.source,
      audience: original.audience,
      from: original.from,
      replyTo: "hello@example.com",
      trackOpens: true,
      trackClicks: false,
    });
    const long = await create({ name: "n".repeat(120) });
    const longCopy = await act(long.id, "duplicate");
    expect(longCopy.body.name).toBe(`${"n".repeat(115)} copy`);
    for (const id of [original.id, copy.id, long.id, longCopy.body.id]) {
      await call(workspace.owner, "DELETE", `/${id}`);
    }
  });

  it("sends a test with sample values through the campaign's source", async () => {
    const draft = await ready("Test send", bigListId);
    sendJobs.length = 0;
    const response = await act(draft.id, "test", { to: "me@example.com" });
    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ status: "queued", suppressed: [] });
    expect(sendJobs).toHaveLength(1);
    const message = await dispatch.get(
      workspace.workspaceId,
      response.body.messageId,
    );
    expect(message).toMatchObject({
      kind: "transactional",
      campaignId: null,
      sourceId,
      to: ["me@example.com"],
      from: { email: "news@example.com" },
      subject: "[Test] News for Ada",
    });
    expect(message.content?.html).toContain("Hi Ada");
    expect(message.content?.html).toContain("Northwind");
    const invalid = await act(draft.id, "test", { to: "nope" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.field).toBe("to");
    await call(workspace.owner, "PATCH", `/${draft.id}`, { templateId: null });
    const noTemplate = await act(draft.id, "test", { to: "me@example.com" });
    expect(noTemplate.status).toBe(400);
    expect(noTemplate.body.field).toBe("template");
    expect((await read(draft.id)).status).toBe("draft");
    await call(workspace.owner, "DELETE", `/${draft.id}`);
  });

  it("schedules, unschedules, and starts a scheduled campaign when due", async () => {
    const draft = await ready("Scheduled", smallListId);
    fanoutJobs.length = 0;
    const scheduledAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const scheduled = await act(draft.id, "send", { scheduledAt });
    expect(scheduled.status).toBe(200);
    expect(scheduled.body).toMatchObject({
      status: "scheduled",
      scheduledAt,
      startedAt: null,
    });
    expect(fanoutJobs).toEqual([]);

    const edit = await call(workspace.owner, "PATCH", `/${draft.id}`, {
      name: "Changed",
    });
    expect(edit.statusCode).toBe(409);
    expect(edit.json().code).toBe("not_editable");
    expect((await act(draft.id, "send")).status).toBe(409);
    expect((await act(draft.id, "pause")).body.code).toBe("invalid_status");

    await maintenance.process({ name: "start-scheduled" } as Job);
    expect((await read(draft.id)).status).toBe("scheduled");
    expect(fanoutJobs).toEqual([]);

    const back = await act(draft.id, "unschedule");
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ status: "draft", scheduledAt: null });
    expect((await act(draft.id, "unschedule")).status).toBe(409);
    const renamed = await call(workspace.owner, "PATCH", `/${draft.id}`, {
      name: "Scheduled again",
    });
    expect(renamed.statusCode).toBe(200);

    expect((await act(draft.id, "send", { scheduledAt })).status).toBe(200);
    await db
      .update(schema.campaigns)
      .set({ scheduledAt: new Date(Date.now() - 1000) })
      .where(eq(schema.campaigns.id, draft.id));
    await maintenance.process({ name: "start-scheduled" } as Job);
    const started = await read(draft.id);
    expect(started.status).toBe("sending");
    expect(started.startedAt).not.toBeNull();
    expect(
      fanoutJobs.filter((job) => job.data.campaignId === draft.id),
    ).toEqual([
      {
        data: { workspaceId: workspace.workspaceId, campaignId: draft.id },
        jobId: fanoutJobId(draft.id),
      },
    ]);

    const removal = await call(workspace.owner, "DELETE", `/${draft.id}`);
    expect(removal.statusCode).toBe(409);
    expect(removal.json().code).toBe("campaign_sending");

    const original = dispatch.enqueueBatch.bind(dispatch);
    const spy = vi
      .spyOn(dispatch, "enqueueBatch")
      .mockImplementationOnce(async (common, recipients) => {
        const results = await original(common, recipients);
        expect((await act(draft.id, "cancel")).status).toBe(200);
        return results;
      });
    const run = await fanOut(draft.id);
    spy.mockRestore();
    expect(run).toEqual({ outcome: "stopped", pages: 1 });
    expectEachContactOnce(await campaignMessages(draft.id), fanoutPageSize);
    const cancelled = await read(draft.id);
    expect(cancelled).toMatchObject({ status: "cancelled", fanoutDone: false });
    expect(cancelled.completedAt).not.toBeNull();
    expect(cancelled.stats.recipients).toBe(fanoutPageSize);

    expect(await fanOut(draft.id)).toEqual({ outcome: "stopped", pages: 0 });
    expect((await act(draft.id, "resume")).status).toBe(409);
    expect((await act(draft.id, "cancel")).status).toBe(409);
    expect(await campaignMessages(draft.id)).toHaveLength(fanoutPageSize);
    const removed = await call(workspace.owner, "DELETE", `/${draft.id}`);
    expect(removed.statusCode).toBe(204);
  }, 60_000);

  it("starts one fan-out when send is called twice at once", async () => {
    const draft = await ready("October newsletter", bigListId);
    bigCampaignId = draft.id;
    fanoutJobs.length = 0;
    const [first, second] = await Promise.all([
      act(draft.id, "send"),
      act(draft.id, "send"),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(fanoutJobs).toEqual([
      {
        data: { workspaceId: workspace.workspaceId, campaignId: draft.id },
        jobId: fanoutJobId(draft.id),
      },
    ]);
    const sending = await read(draft.id);
    expect(sending).toMatchObject({
      status: "sending",
      fanoutDone: false,
      audienceLabel: "Newsletter",
    });
    expect(sending.startedAt).not.toBeNull();
  });

  it("freezes the content at send time", async () => {
    const edited = await app.inject({
      method: "PATCH",
      url: `/v1/templates/${templateId}`,
      headers: { cookie: workspace.owner.cookie },
      payload: { html: "<p>Rewritten after the send</p>" },
    });
    expect(edited.statusCode).toBe(200);
    const [row] = await db
      .select({ snapshotId: schema.campaigns.snapshotId })
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, bigCampaignId));
    const snapshot = await dispatch.getSnapshot(
      workspace.workspaceId,
      row?.snapshotId ?? "",
    );
    expect(snapshot).toMatchObject({
      subject: "News for {{first_name|you}}",
      previewText: "What is new this month",
      html: templateHtml,
    });
  });

  it("resumes after a crash in the middle of the fan-out without a second email", async () => {
    sendJobs.length = 0;
    const original = dispatch.enqueueBatch.bind(dispatch);
    let calls = 0;
    const spy = vi
      .spyOn(dispatch, "enqueueBatch")
      .mockImplementation(async (common, recipients) => {
        calls += 1;
        const results = await original(common, recipients);
        if (calls === 2) {
          throw new Error("The worker died after handing the page over.");
        }
        return results;
      });
    await expect(fanOut(bigCampaignId)).rejects.toThrow("The worker died");
    spy.mockRestore();

    const crashed = await campaignMessages(bigCampaignId);
    expectEachContactOnce(crashed, fanoutPageSize * 2);
    expect((await read(bigCampaignId)).stats.recipients).toBe(fanoutPageSize);

    const resumed = await fanoutProcessor
      .process(
        {
          data: {
            workspaceId: workspace.workspaceId,
            campaignId: bigCampaignId,
          },
          moveToDelayed: vi.fn(async () => undefined),
        } as unknown as Job<CampaignFanoutJob>,
        "token",
      )
      .catch((error: unknown) => error);
    expect(resumed).toBeInstanceOf(DelayedError);

    const afterResume = await campaignMessages(bigCampaignId);
    const queuedNow = afterResume.length;
    expectEachContactOnce(afterResume, queuedNow);
    expect(queuedNow).toBeGreaterThanOrEqual(maxQueuedPerCampaign);
    expect(queuedNow).toBeLessThan(bigListSize);
    expect(queuedNow % fanoutPageSize).toBe(0);
    const campaign = await read(bigCampaignId);
    expect(campaign.stats.recipients).toBe(queuedNow);
    expect(campaign.fanoutDone).toBe(false);
    expect(new Set(sendJobs.map((job) => job.messageId)).size).toBe(queuedNow);
  }, 60_000);

  it("waits instead of flooding the send queue, and pause stops it", async () => {
    expect((await fanOut(bigCampaignId)).outcome).toBe("wait");
    const before = (await campaignMessages(bigCampaignId)).length;
    expect(before).toBeGreaterThan(maxQueuedPerCampaign);
    expect(before).toBeLessThan(bigListSize);
    expect(await fanOut(bigCampaignId)).toEqual({ outcome: "wait", pages: 0 });
    expect(await campaignMessages(bigCampaignId)).toHaveLength(before);

    const paused = await act(bigCampaignId, "pause");
    expect(paused.status).toBe(200);
    expect(paused.body.status).toBe("paused");
    await settle(bigCampaignId, "sent");
    expect(await fanOut(bigCampaignId)).toEqual({
      outcome: "stopped",
      pages: 0,
    });
    expect(await campaignMessages(bigCampaignId)).toHaveLength(before);
    expect((await act(bigCampaignId, "pause")).status).toBe(409);

    fanoutJobs.length = 0;
    const resumed = await act(bigCampaignId, "resume");
    expect(resumed.status).toBe(200);
    expect(resumed.body.status).toBe("sending");
    expect(fanoutJobs).toHaveLength(1);

    const finished = await fanOut(bigCampaignId);
    expect(finished.outcome).toBe("done");
    const rows = await campaignMessages(bigCampaignId);
    expectEachContactOnce(rows, bigListSize);
    const campaign = await read(bigCampaignId);
    expect(campaign.fanoutDone).toBe(true);
    expect(campaign.stats).toMatchObject({
      recipients: bigListSize,
      skipped: 0,
    });

    expect(await fanOut(bigCampaignId)).toEqual({ outcome: "done", pages: 0 });
    expect(await campaignMessages(bigCampaignId)).toHaveLength(bigListSize);
    expect((await read(bigCampaignId)).stats.recipients).toBe(bigListSize);
  }, 60_000);

  it("hands dispatch the sender, tracking, list and merged subject", async () => {
    const rows = await campaignMessages(bigCampaignId);
    const sample = rows.find(
      (row) => row.toEmails[0] === "big7@campaigns-e2e.test",
    );
    expect(sample).toMatchObject({
      kind: "campaign",
      subject: "News for big 7",
      fromEmail: "news@example.com",
      fromName: "Northwind News",
      replyTo: "hello@example.com",
      trackOpens: true,
      trackClicks: false,
      unsubscribeListId: bigListId,
    });
    expect(new Set(rows.map((row) => row.unsubscribeListId))).toEqual(
      new Set([bigListId]),
    );
  });

  it("counts outcomes once each and sends the frozen content", async () => {
    const queued = (await campaignMessages(bigCampaignId)).filter(
      (row) => row.status === "queued",
    );
    expect(queued.length).toBeGreaterThanOrEqual(3);
    const [first, second, third] = queued;
    if (!first || !second || !third) {
      throw new Error("Three queued messages are needed.");
    }
    const baseline = (await read(bigCampaignId)).stats;
    outcomes.length = 0;
    fake.sent.length = 0;
    for (const message of [first, second, third]) {
      await sendProcessor.process(sendJob(message.id), "token");
    }
    expect(fake.sent).toHaveLength(3);
    expect(fake.sent[0]?.html).toContain("your plan is pro");
    expect(fake.sent[0]?.html).toContain("Northwind");
    expect(fake.sent[0]?.html).not.toContain("Rewritten after the send");
    expect(fake.sent[0]?.html).toContain("/t/u/");
    expect(fake.sent[0]?.html).toContain("/t/o/");
    expect(fake.sent[0]?.html).not.toContain("/t/c/");

    const sentJobs = await applyOutcomes();
    expect(sentJobs.map((job) => job.type)).toEqual(["sent", "sent", "sent"]);
    expect((await read(bigCampaignId)).stats.sent).toBe(baseline.sent + 3);

    for (const job of sentJobs) {
      await outcomesProcessor.process({ data: job } as Job<MessageOutcomeJob>);
    }
    expect((await read(bigCampaignId)).stats.sent).toBe(baseline.sent + 6);
    await engine.reconcile();
    const corrected = (await read(bigCampaignId)).stats;
    expect(corrected.sent).toBe(
      (await campaignMessages(bigCampaignId)).filter(
        (row) => row.status === "sent",
      ).length,
    );

    await dispatch.recordEvent({ messageId: first.id, type: "delivered" });
    await dispatch.recordEvent({ messageId: first.id, type: "opened" });
    await dispatch.recordEvent({ messageId: first.id, type: "opened" });
    await dispatch.recordEvent({
      messageId: second.id,
      type: "clicked",
      url: "https://example.com/offer",
    });
    await dispatch.recordEvent({
      messageId: second.id,
      type: "clicked",
      url: "https://example.com/offer",
    });
    await dispatch.recordEvent({ messageId: second.id, type: "unsubscribed" });
    await dispatch.recordEvent({ messageId: third.id, type: "bounced" });
    await applyOutcomes();
    const stats = (await read(bigCampaignId)).stats;
    expect(stats).toMatchObject({
      delivered: corrected.delivered + 1,
      opened: 2,
      clicked: 1,
      unsubscribed: 1,
      bounced: corrected.bounced + 1,
      sent: corrected.sent,
    });
  }, 60_000);

  it("lists recipients with a status filter and pages", async () => {
    const page: RecipientPage = (
      await call(
        workspace.owner,
        "GET",
        `/${bigCampaignId}/recipients?limit=40`,
      )
    ).json();
    expect(page.items).toHaveLength(40);
    expect(page.nextCursor).not.toBeNull();
    const next: RecipientPage = (
      await call(
        workspace.owner,
        "GET",
        `/${bigCampaignId}/recipients?limit=40&cursor=${page.nextCursor}`,
      )
    ).json();
    expect(next.items).toHaveLength(40);
    const seen = new Set(
      [...page.items, ...next.items].map((item) => item.messageId),
    );
    expect(seen.size).toBe(80);
    const untouched = [...page.items, ...next.items].find(
      (item) => item.status === "queued",
    );
    expect(untouched).toEqual({
      messageId: expect.any(String),
      contactId: expect.any(String),
      email: expect.stringContaining("@campaigns-e2e.test"),
      status: "queued",
      openedAt: null,
      clickedAt: null,
      unsubscribedAt: null,
      error: null,
      sentAt: null,
    });

    const bounced: RecipientPage = (
      await call(
        workspace.owner,
        "GET",
        `/${bigCampaignId}/recipients?status=bounced`,
      )
    ).json();
    expect(bounced.items).toHaveLength(1);
    expect(bounced.items[0]?.status).toBe("bounced");
    const delivered: RecipientPage = (
      await call(
        workspace.owner,
        "GET",
        `/${bigCampaignId}/recipients?status=delivered`,
      )
    ).json();
    expect(delivered.items).toHaveLength(1);
    expect(delivered.items[0]?.openedAt).not.toBeNull();
    const bad = await call(
      workspace.owner,
      "GET",
      `/${bigCampaignId}/recipients?status=nope`,
    );
    expect(bad.statusCode).toBe(400);
  });

  it("reconciles the counters and marks the campaign sent when nothing is queued", async () => {
    fanoutJobs.length = 0;
    await maintenance.process({ name: "reconcile" } as Job);
    expect((await read(bigCampaignId)).status).toBe("sending");
    expect(
      fanoutJobs.filter((job) => job.data.campaignId === bigCampaignId),
    ).toEqual([]);

    await settle(bigCampaignId, "delivered");
    await db.execute(sql`
      update campaigns set sent_count = 1, delivered_count = 7, failed_count = 9
      where id = ${bigCampaignId}::uuid
    `);
    await maintenance.process({ name: "reconcile" } as Job);
    const rows = await campaignMessages(bigCampaignId);
    const count = (status: string) =>
      rows.filter((row) => row.status === status).length;
    const done = await read(bigCampaignId);
    expect(done.status).toBe("sent");
    expect(done.completedAt).not.toBeNull();
    expect(done.stats).toMatchObject({
      recipients: bigListSize,
      skipped: 0,
      sent: bigListSize,
      delivered: count("delivered"),
      bounced: 1,
      complained: 0,
      failed: 0,
      opened: 2,
      clicked: 1,
      unsubscribed: 1,
    });
    expect(count("queued")).toBe(0);

    const completedAt = done.completedAt;
    await maintenance.process({ name: "reconcile" } as Job);
    expect((await read(bigCampaignId)).completedAt).toBe(completedAt);
    for (const action of ["pause", "resume", "cancel", "unschedule", "send"]) {
      expect((await act(bigCampaignId, action)).status).toBe(409);
    }
    const sent: Page = (
      await call(workspace.owner, "GET", "?status=sent")
    ).json();
    expect(sent.items.map((item) => item.id)).toEqual([bigCampaignId]);
  }, 60_000);

  it("queues the fan-out again when a sending campaign lost its job", async () => {
    const draft = await ready("Lost job", smallListId);
    expect((await act(draft.id, "send")).status).toBe(200);
    fanoutJobs.length = 0;
    await engine.reconcile();
    expect(
      fanoutJobs.filter((job) => job.data.campaignId === draft.id),
    ).toHaveLength(1);
    expect((await read(draft.id)).status).toBe("sending");
    expect((await act(draft.id, "cancel")).status).toBe(200);
    expect(await fanOut(draft.id)).toEqual({ outcome: "stopped", pages: 0 });
    expect(await campaignMessages(draft.id)).toHaveLength(0);
  });

  it("pauses with the reason when the source stops being usable", async () => {
    const draft = await ready("Source trouble", smallListId);
    expect((await act(draft.id, "send")).status).toBe(200);
    await sources.update(actor, sourceId, { paused: true });
    expect((await fanOut(draft.id)).outcome).toBe("paused");
    const paused = await read(draft.id);
    expect(paused.status).toBe("paused");
    expect(paused.error?.code).toBe("source_unavailable");
    expect(await campaignMessages(draft.id)).toHaveLength(0);

    await sources.update(actor, sourceId, { paused: false });
    const resumed = await act(draft.id, "resume");
    expect(resumed.body).toMatchObject({ status: "sending", error: null });
    expect((await fanOut(draft.id)).outcome).toBe("done");
    expectEachContactOnce(await campaignMessages(draft.id), smallListSize);
    expect((await read(draft.id)).stats.recipients).toBe(smallListSize);
  }, 60_000);
});
