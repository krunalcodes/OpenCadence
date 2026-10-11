import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { and, type Db, eq, schema } from "@workspace/db";
import { AppModule } from "../src/app/app.module";
import { DATABASE } from "../src/infra/database/database.module";
import { REDIS, type Redis } from "../src/infra/redis/redis.module";
import type { OverviewPayload } from "../src/modules/analytics/overview";
import {
  overviewCacheKey,
  overviewCacheSeconds,
} from "../src/modules/analytics/overview.service";
import {
  createApiKey,
  createWorkspaceSessions,
  type TestMember,
  type TestWorkspace,
} from "./support/workspace-session";

type MessageSeed = {
  kind: "campaign" | "sequence" | "transactional" | "test";
  status: string;
  hoursAgo: number;
  count?: number;
  trackOpens?: boolean;
  opened?: boolean;
  replied?: boolean;
};

const hourMs = 60 * 60 * 1000;

function middayZone(now: Date) {
  const shift = 12 - now.getUTCHours();
  if (shift === 0) {
    return "UTC";
  }
  return shift > 0 ? `Etc/GMT-${shift}` : `Etc/GMT+${-shift}`;
}

describe("Overview (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let redis: Redis;
  let sessions: ReturnType<typeof createWorkspaceSessions>;
  let busy: TestWorkspace;
  let other: TestWorkspace;
  let empty: TestWorkspace;
  let troubled: TestWorkspace;
  let busySourceId: string;
  const startedAt = new Date();
  const zone = middayZone(startedAt);

  function ago(hours: number) {
    return new Date(startedAt.getTime() - hours * hourMs);
  }

  async function addSource(workspaceId: string, name: string) {
    const [source] = await db
      .insert(schema.sendingSources)
      .values({ workspaceId, integrationType: "resend", name })
      .returning({ id: schema.sendingSources.id });
    if (!source) {
      throw new Error("The test source was not created.");
    }
    return source.id;
  }

  async function addMessages(
    workspaceId: string,
    sourceId: string,
    seeds: MessageSeed[],
  ) {
    const rows = seeds.flatMap((seed) =>
      Array.from({ length: seed.count ?? 1 }, (_, index) => {
        const createdAt = ago(seed.hoursAgo);
        return {
          workspaceId,
          sourceId,
          createdAt,
          kind: seed.kind,
          status: seed.status,
          fromEmail: "news@example.com",
          toEmails: [`person-${index}@example.com`],
          subject: "Overview e2e",
          trackOpens: seed.trackOpens ?? false,
          firstOpenedAt: seed.opened ? createdAt : null,
          openCount: seed.opened ? 1 : 0,
          repliedAt: seed.replied ? createdAt : null,
        };
      }),
    );
    for (let index = 0; index < rows.length; index += 500) {
      await db.insert(schema.messages).values(rows.slice(index, index + 500));
    }
  }

  async function clearCache(workspaceId: string) {
    const keys = await redis.keys(`opencadence:overview:v1:${workspaceId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  function request(who: TestMember, query = "") {
    return app.inject({
      method: "GET",
      url: `/v1/overview${query}`,
      headers: { cookie: who.cookie },
    });
  }

  async function read(workspace: TestWorkspace, range = "7d", timezone = zone) {
    await clearCache(workspace.workspaceId);
    const response = await request(
      workspace.owner,
      `?range=${range}&timezone=${encodeURIComponent(timezone)}`,
    );
    expect(response.statusCode).toBe(200);
    return response.json() as OverviewPayload;
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = app.get<Db>(DATABASE);
    redis = app.get<Redis>(REDIS);
    sessions = createWorkspaceSessions(app, "overview-e2e");
    busy = await sessions.workspace();
    other = await sessions.workspace();
    empty = await sessions.workspace();
    troubled = await sessions.workspace();

    busySourceId = await addSource(busy.workspaceId, "Busy source");
    await addMessages(busy.workspaceId, busySourceId, [
      { kind: "transactional", status: "sent", hoursAgo: 0 },
      { kind: "transactional", status: "sent", hoursAgo: 1 },
      {
        kind: "campaign",
        status: "delivered",
        hoursAgo: 2,
        count: 2,
        trackOpens: true,
        opened: true,
      },
      {
        kind: "campaign",
        status: "delivered",
        hoursAgo: 2,
        count: 2,
        trackOpens: true,
      },
      { kind: "campaign", status: "bounced", hoursAgo: 2, trackOpens: true },
      { kind: "test", status: "delivered", hoursAgo: 2, count: 3 },
      { kind: "transactional", status: "failed", hoursAgo: 2 },
      { kind: "transactional", status: "skipped", hoursAgo: 2 },
      { kind: "transactional", status: "queued", hoursAgo: 2 },
      { kind: "sequence", status: "delivered", hoursAgo: 3, replied: true },
      { kind: "sequence", status: "delivered", hoursAgo: 3 },
      {
        kind: "campaign",
        status: "delivered",
        hoursAgo: 30,
        count: 3,
        trackOpens: true,
      },
      {
        kind: "campaign",
        status: "delivered",
        hoursAgo: 30,
        trackOpens: true,
        opened: true,
      },
      {
        kind: "transactional",
        status: "delivered",
        hoursAgo: 5 * 24,
        count: 3,
      },
      {
        kind: "transactional",
        status: "delivered",
        hoursAgo: 10 * 24,
        count: 5,
      },
      {
        kind: "transactional",
        status: "delivered",
        hoursAgo: 40 * 24,
        count: 10,
      },
      {
        kind: "transactional",
        status: "delivered",
        hoursAgo: 100 * 24,
        count: 3,
      },
    ]);

    const otherSourceId = await addSource(other.workspaceId, "Other source");
    await addMessages(other.workspaceId, otherSourceId, [
      { kind: "transactional", status: "delivered", hoursAgo: 1, count: 7 },
      { kind: "sequence", status: "bounced", hoursAgo: 2, count: 2 },
    ]);
  });

  afterAll(async () => {
    for (const workspace of [busy, other, empty, troubled]) {
      await clearCache(workspace.workspaceId);
    }
    await sessions.cleanup();
    await app.close();
  });

  it("needs a session or an API key", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/v1/overview" });
    expect(anonymous.statusCode).toBe(401);

    const key = await createApiKey(app, empty.owner, empty.workspaceId);
    const withKey = await app.inject({
      method: "GET",
      url: "/v1/overview?range=24h",
      headers: { "x-api-key": key },
    });
    expect(withKey.statusCode).toBe(200);
    expect(withKey.json()).toMatchObject({ range: "24h", timezone: "UTC" });
  });

  it("rejects an unknown range or time zone", async () => {
    const range = await request(busy.owner, "?range=1y");
    expect(range.statusCode).toBe(400);
    expect(range.json()).toMatchObject({ code: "validation", field: "range" });

    const timezone = await request(busy.owner, "?timezone=Mars%2FOlympus");
    expect(timezone.statusCode).toBe(400);
    expect(timezone.json()).toMatchObject({
      code: "validation",
      field: "timezone",
    });
  });

  it("returns a calm, empty payload for a new workspace on every range", async () => {
    for (const range of ["24h", "7d", "30d", "90d"]) {
      const payload = await read(empty, range);
      expect(payload.range).toBe(range);
      expect(payload.stats.sent).toEqual({
        value: 0,
        previous: 0,
        change: null,
      });
      expect(payload.stats.openRate).toEqual({
        value: null,
        previous: null,
        change: null,
      });
      expect(payload.stats.replyRate.value).toBeNull();
      expect(payload.stats.bounceRate.value).toBeNull();
      expect(payload.today.campaigns).toEqual([]);
      expect(payload.today.sequences).toEqual([]);
      expect(payload.today.transactional).toEqual([]);
      expect(payload.sends).toEqual([]);
      expect(payload.mailboxes).toEqual([]);
      expect(payload.alert).toBeNull();
      expect(payload.summary).toMatchObject({
        running: 0,
        scheduledToday: 0,
        hasSent: false,
        setup: {
          source: false,
          contacts: false,
          template: false,
          campaign: false,
        },
      });
    }
  });

  it("checks off the getting-started steps from real data", async () => {
    await addSource(empty.workspaceId, "First source");
    expect((await read(empty)).summary.setup).toEqual({
      source: true,
      contacts: false,
      template: false,
      campaign: false,
    });

    await db
      .insert(schema.contacts)
      .values({ workspaceId: empty.workspaceId, email: "first@example.com" });
    await db
      .insert(schema.templates)
      .values({ workspaceId: empty.workspaceId, name: "First template" });
    const payload = await read(empty);
    expect(payload.summary.hasSent).toBe(false);
    expect(payload.summary.setup).toEqual({
      source: true,
      contacts: true,
      template: true,
      campaign: false,
    });
    expect(payload.mailboxes).toHaveLength(1);
  });

  it("totals the last 24 hours against the 24 hours before", async () => {
    const { stats, summary } = await read(busy, "24h");
    expect(stats.sent).toEqual({ value: 9, previous: 4, change: 125 });
    expect(stats.opened).toEqual({ value: 2, previous: 1, change: 100 });
    expect(stats.openRate).toEqual({ value: 0.5, previous: 0.25, change: 25 });
    expect(stats.replied.value).toBe(1);
    expect(stats.replyRate).toEqual({
      value: 0.5,
      previous: null,
      change: null,
    });
    expect(stats.bounced.value).toBe(1);
    expect(stats.bounceRate.value).toBeCloseTo(1 / 9, 10);
    expect(stats.bounceRate.previous).toBe(0);
    expect(stats.bounceRate.change).toBe(11.1);
    expect(summary.hasSent).toBe(true);
    expect(summary.setup).toBeNull();
  });

  it("totals 7, 30 and 90 days against the equal period before", async () => {
    const week = await read(busy, "7d");
    expect(week.stats.sent).toEqual({ value: 16, previous: 5, change: 220 });
    expect(week.stats.opened.value).toBe(3);
    expect(week.stats.openRate.value).toBeCloseTo(3 / 8, 10);
    expect(week.stats.openRate.previous).toBeNull();
    expect(week.stats.openRate.change).toBeNull();

    const month = await read(busy, "30d");
    expect(month.stats.sent).toEqual({ value: 21, previous: 10, change: 110 });

    const quarter = await read(busy, "90d");
    expect(quarter.stats.sent).toEqual({
      value: 31,
      previous: 3,
      change: 933.3,
    });
    expect(new Date(quarter.period.to).getTime()).toBeGreaterThan(
      new Date(quarter.period.from).getTime(),
    );
    expect(
      new Date(quarter.period.from).getTime() -
        new Date(quarter.period.previousFrom).getTime(),
    ).toBe(90 * 24 * hourMs);
  });

  it("keeps workspaces apart", async () => {
    const mine = await read(other, "24h");
    expect(mine.stats.sent.value).toBe(9);
    expect(mine.stats.bounced.value).toBe(2);
    expect(mine.stats.opened.value).toBe(0);
    expect(mine.stats.replyRate.value).toBe(0);
    expect(mine.mailboxes.map((mailbox) => mailbox.name)).toEqual([
      "Other source",
    ]);
    expect(mine.sends).toEqual([]);

    const theirs = await read(busy, "24h");
    expect(theirs.mailboxes.map((mailbox) => mailbox.name)).toEqual([
      "Busy source",
    ]);
    expect(theirs.stats.bounced.value).toBe(1);
  });

  it("lays out today hour by hour in the requested time zone", async () => {
    const [sent] = await db
      .insert(schema.campaigns)
      .values([
        {
          workspaceId: busy.workspaceId,
          name: "Morning digest",
          status: "sent",
          subject: "Your digest",
          sourceId: busySourceId,
          startedAt: ago(3),
          completedAt: ago(2),
          fanoutDoneAt: ago(3),
          recipientCount: 40,
          sentCount: 40,
          deliveredCount: 40,
          openedCount: 10,
          clickedCount: 4,
        },
        {
          workspaceId: busy.workspaceId,
          name: "Product update",
          status: "sending",
          sourceId: busySourceId,
          trackClicks: false,
          startedAt: ago(1),
          fanoutDoneAt: ago(1),
          recipientCount: 110,
          skippedCount: 10,
          sentCount: 50,
        },
        {
          workspaceId: busy.workspaceId,
          name: "Afternoon invite",
          status: "scheduled",
          scheduledAt: ago(-2),
        },
        {
          workspaceId: busy.workspaceId,
          name: "Tomorrow invite",
          status: "scheduled",
          scheduledAt: ago(-24),
        },
        { workspaceId: busy.workspaceId, name: "Unfinished draft" },
      ])
      .returning({ id: schema.campaigns.id });
    await db.insert(schema.sequences).values({
      workspaceId: busy.workspaceId,
      name: "Founder outreach",
      status: "active",
      enrolledCount: 20,
      activeCount: 12,
      sentCount: 30,
    });

    const payload = await read(busy, "24h");
    expect(payload.timezone).toBe(zone);
    expect(payload.today.nowHour).toBeGreaterThanOrEqual(12);
    expect(payload.today.nowHour).toBeLessThan(13.2);

    const blocks = new Map(
      payload.today.campaigns.map((block) => [block.name, block]),
    );
    expect([...blocks.keys()].sort()).toEqual([
      "Afternoon invite",
      "Morning digest",
      "Product update",
    ]);
    const digest = blocks.get("Morning digest");
    expect(digest).toMatchObject({ id: sent?.id, state: "sent" });
    expect(digest?.startHour).toBeCloseTo(payload.today.nowHour - 3, 1);
    expect(digest?.endHour).toBeCloseTo(payload.today.nowHour - 2, 1);
    const update = blocks.get("Product update");
    expect(update?.state).toBe("sending");
    expect(update?.startHour).toBeCloseTo(payload.today.nowHour - 1, 1);
    expect(update?.endHour).toBeCloseTo(payload.today.nowHour + 1, 1);
    const invite = blocks.get("Afternoon invite");
    expect(invite?.state).toBe("scheduled");
    expect(invite?.startHour).toBeCloseTo(payload.today.nowHour + 2, 1);

    expect(payload.today.sequences).toEqual([
      { state: "sent", startHour: 9, endHour: 10, count: 2 },
    ]);
    expect(payload.today.transactional).toHaveLength(1);
    expect(payload.today.transactional[0]).toMatchObject({
      startHour: 11,
      count: 2,
    });

    const campaigns = payload.sends.filter((send) => send.kind === "campaign");
    expect(campaigns.map((send) => send.name)).toEqual([
      "Tomorrow invite",
      "Afternoon invite",
      "Product update",
      "Morning digest",
    ]);
    expect(campaigns[2]).toMatchObject({
      status: "sending",
      sent: 50,
      done: 50,
      total: 100,
      openRate: 0,
      clickRate: null,
      source: { id: busySourceId, name: "Busy source" },
    });
    expect(campaigns[3]).toMatchObject({
      status: "sent",
      detail: "Your digest",
      done: 40,
      total: 40,
      openRate: 0.25,
      clickRate: 0.1,
    });
    expect(campaigns[1]).toMatchObject({ status: "scheduled", source: null });
    expect(payload.summary.scheduledToday).toBe(1);

    const sequences = payload.sends.filter((send) => send.kind === "sequence");
    if (payload.summary.sequences === "service") {
      expect(sequences).toHaveLength(1);
      expect(sequences[0]).toMatchObject({
        name: "Founder outreach",
        status: "active",
        sent: 30,
        done: 8,
        total: 20,
      });
      expect(payload.summary.running).toBe(2);
    } else {
      expect(sequences).toEqual([]);
      expect(payload.summary.running).toBe(1);
    }

    expect(payload.mailboxes).toHaveLength(1);
    expect(payload.mailboxes[0]).toMatchObject({
      id: busySourceId,
      name: "Busy source",
      integrationType: "resend",
      status: "active",
      dailySendLimit: null,
    });
    expect(payload.mailboxes[0]?.health).toHaveLength(14);
  });

  it("moves today when the time zone changes", async () => {
    const hour = startedAt.getUTCHours();
    const shift = hour >= 12 ? 23 - hour + 1 : -(hour + 1);
    const farZone = shift > 0 ? `Etc/GMT-${shift}` : `Etc/GMT+${-shift}`;
    const near = await read(busy, "24h", zone);
    const far = await read(busy, "24h", farZone);
    expect(far.today.date).not.toBe(near.today.date);
    expect(far.stats.sent.value).toBe(near.stats.sent.value);
  });

  it("serves the cached payload for 60 seconds", async () => {
    const first = await read(busy, "30d");
    await addMessages(busy.workspaceId, busySourceId, [
      { kind: "transactional", status: "delivered", hoursAgo: 4, count: 6 },
    ]);
    const cached = await request(
      busy.owner,
      `?range=30d&timezone=${encodeURIComponent(zone)}`,
    );
    expect(cached.json()).toEqual(first);

    const key = overviewCacheKey(busy.workspaceId, "30d", zone);
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(overviewCacheSeconds);

    const otherRange = await request(
      busy.owner,
      `?range=90d&timezone=${encodeURIComponent(zone)}`,
    );
    expect((otherRange.json() as OverviewPayload).stats.sent.value).toBe(
      (first.stats.sent.value ?? 0) + 10 + 6,
    );

    const fresh = await read(busy, "30d");
    expect(fresh.stats.sent.value).toBe((first.stats.sent.value ?? 0) + 6);
    expect(fresh.generatedAt).not.toBe(first.generatedAt);
  });

  it("reports the most important problem first", async () => {
    const { workspaceId } = troubled;
    const brokenId = await addSource(workspaceId, "Broken source");
    const pausedId = await addSource(workspaceId, "Paused source");
    await addMessages(workspaceId, brokenId, [
      { kind: "transactional", status: "delivered", hoursAgo: 1, count: 1000 },
      { kind: "transactional", status: "bounced", hoursAgo: 1, count: 30 },
      { kind: "transactional", status: "complained", hoursAgo: 1, count: 2 },
    ]);
    const [failed] = await db
      .insert(schema.campaigns)
      .values({
        workspaceId,
        name: "Launch",
        status: "failed",
        startedAt: ago(2),
        completedAt: ago(2),
        errorCode: "source_unavailable",
      })
      .returning({ id: schema.campaigns.id });
    const setStatus = (id: string, status: string) =>
      db
        .update(schema.sendingSources)
        .set({ status })
        .where(
          and(
            eq(schema.sendingSources.workspaceId, workspaceId),
            eq(schema.sendingSources.id, id),
          ),
        );
    const restate = (from: string, to: string) =>
      db
        .update(schema.messages)
        .set({ status: to })
        .where(
          and(
            eq(schema.messages.workspaceId, workspaceId),
            eq(schema.messages.status, from),
          ),
        );
    await setStatus(brokenId, "needs_attention");
    await setStatus(pausedId, "paused");

    expect((await read(troubled, "24h")).alert).toEqual({
      code: "source_needs_attention",
      entity: { type: "source", id: brokenId, name: "Broken source" },
      others: 0,
      rate: null,
      path: "integrations",
    });

    await setStatus(brokenId, "active");
    expect((await read(troubled, "24h")).alert).toMatchObject({
      code: "source_paused",
      entity: { type: "source", id: pausedId, name: "Paused source" },
    });

    await setStatus(pausedId, "active");
    expect((await read(troubled, "24h")).alert).toEqual({
      code: "campaign_failed",
      entity: { type: "campaign", id: failed?.id, name: "Launch" },
      others: 0,
      rate: null,
      path: `campaigns/${failed?.id}`,
    });

    await db
      .delete(schema.campaigns)
      .where(eq(schema.campaigns.workspaceId, workspaceId));
    const bounce = (await read(troubled, "24h")).alert;
    expect(bounce).toMatchObject({
      code: "bounce_rate_high",
      entity: null,
      path: "suppressions",
    });
    expect(bounce?.rate).toBeCloseTo(30 / 1032, 10);

    await restate("bounced", "delivered");
    const complaint = (await read(troubled, "24h")).alert;
    expect(complaint).toMatchObject({ code: "complaint_rate_high" });
    expect(complaint?.rate).toBeCloseTo(2 / 1032, 10);

    await restate("complained", "delivered");
    expect((await read(troubled, "24h")).alert).toBeNull();
  });
});
