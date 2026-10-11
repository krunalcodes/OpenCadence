import { HttpStatus } from "@nestjs/common";
import type { Queue } from "bullmq";
import { apiError } from "../../common/api-error";
import type { BrandService } from "../brand/brand.service";
import type { MessageOutcomeJob } from "../dispatch/dispatch.constants";
import {
  type BatchCommon,
  type BatchRecipient,
  type BatchResult,
  type DispatchService,
  type MessageStatus,
  messageStatuses,
} from "../dispatch/dispatch.service";
import type { SendingSourcesService } from "../integrations/sending-sources.service";
import type {
  AudienceContact,
  AudienceService,
} from "../segments/audience.service";
import {
  type CampaignFanoutJob,
  fanoutPageSize,
  maxQueuedPerCampaign,
} from "./campaigns.constants";
import { CampaignsEngine, deliveryCounts } from "./campaigns.engine";
import type {
  CampaignRow,
  CampaignsRepository,
  DeliveryCounts,
  OutcomeCounter,
} from "./campaigns.repository";

const workspaceId = "00000000-0000-7000-8000-0000000000aa";
const campaignId = "00000000-0000-7000-8000-0000000000bb";
const snapshotId = "00000000-0000-7000-8000-0000000000cc";
const sourceId = "00000000-0000-7000-8000-0000000000dd";
const listId = "00000000-0000-7000-8000-0000000000ee";

function contactId(index: number) {
  return `00000000-0000-7000-8000-${String(index).padStart(12, "0")}`;
}

function contact(index: number): AudienceContact {
  return {
    id: contactId(index),
    email: `person${index}@example.com`,
    firstName: `Person ${index}`,
    lastName: null,
    company: null,
    jobTitle: null,
    phone: null,
    city: null,
    country: null,
    fields: { plan: "pro" },
  };
}

function zeroCounts() {
  return Object.fromEntries(
    messageStatuses.map((status) => [status, 0]),
  ) as Record<MessageStatus, number>;
}

function campaignRow(overrides: Partial<CampaignRow> = {}): CampaignRow {
  const now = new Date();
  return {
    id: campaignId,
    workspaceId,
    name: "Launch",
    status: "sending",
    templateId: null,
    subject: "Hello {{first_name}}",
    previewText: "",
    fromName: null,
    fromEmail: "news@example.com",
    replyTo: null,
    sourceId,
    audience: { type: "all" },
    trackOpens: true,
    trackClicks: false,
    scheduledAt: null,
    startedAt: now,
    completedAt: null,
    snapshotId,
    fanoutCursor: null,
    fanoutDoneAt: null,
    errorCode: null,
    errorMessage: null,
    recipientCount: 0,
    skippedCount: 0,
    sentCount: 0,
    deliveredCount: 0,
    bouncedCount: 0,
    complainedCount: 0,
    failedCount: 0,
    openedCount: 0,
    clickedCount: 0,
    unsubscribedCount: 0,
    createdByUserId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function harness(options: {
  contacts: number;
  campaign?: Partial<CampaignRow>;
  suppressed?: number[];
}) {
  const row = campaignRow(options.campaign);
  const contacts = Array.from({ length: options.contacts }, (_, index) =>
    contact(index + 1),
  );
  const suppressed = new Set(
    (options.suppressed ?? []).map((index) => `person${index}@example.com`),
  );
  const messages = new Map<string, BatchResult>();
  const batches: { common: BatchCommon; recipients: BatchRecipient[] }[] = [];
  const fanoutJobs: CampaignFanoutJob[] = [];
  const increments: OutcomeCounter[] = [];
  const state = {
    failNextBatch: null as Error | null,
    afterBatch: null as (() => void) | null,
    queuedOverride: null as number | null,
    countCalls: 0,
  };

  const repository = {
    find: async () => ({ ...row }),
    advanceFanout: async (
      _workspace: string,
      _id: string,
      step: {
        previousCursor: string | null;
        cursor: string | null;
        recipients: number;
        skipped: number;
        done: boolean;
      },
    ) => {
      if (row.fanoutDoneAt || row.fanoutCursor !== step.previousCursor) {
        return false;
      }
      row.fanoutCursor = step.cursor;
      row.recipientCount += step.recipients;
      row.skippedCount += step.skipped;
      if (step.done) {
        row.fanoutDoneAt = new Date();
      }
      return true;
    },
    transition: async (
      _workspace: string,
      _id: string,
      from: string[],
      to: string,
      values: Partial<CampaignRow> = {},
    ) => {
      if (!from.includes(row.status)) {
        return null;
      }
      Object.assign(row, values, { status: to });
      return { ...row };
    },
    increment: async (
      _workspace: string,
      _id: string,
      counter: OutcomeCounter,
    ) => {
      increments.push(counter);
    },
    setDeliveryCounts: async (
      _workspace: string,
      _id: string,
      counts: DeliveryCounts,
    ) => {
      row.sentCount = counts.sent;
      row.deliveredCount = counts.delivered;
      row.bouncedCount = counts.bounced;
      row.complainedCount = counts.complained;
      row.failedCount = counts.failed;
      if (row.fanoutDoneAt) {
        row.skippedCount = counts.skipped;
      }
    },
    startDue: async () => [{ id: campaignId, workspaceId }],
    listToReconcile: async (_since: Date, after: string | null) =>
      after ? [] : [{ ...row }],
  };

  const dispatch = {
    getSnapshot: async () => ({
      id: snapshotId,
      subject: "Hello {{first_name|there}} from {{brand.name}}",
      previewText: "",
      html: "<p>Hi</p>",
      text: "Hi",
      createdAt: new Date().toISOString(),
    }),
    countByStatus: async () => {
      state.countCalls += 1;
      const counts = zeroCounts();
      for (const message of messages.values()) {
        counts[message.status] += 1;
      }
      if (state.queuedOverride !== null) {
        counts.queued = state.queuedOverride;
      }
      return counts;
    },
    enqueueBatch: async (
      common: BatchCommon,
      recipients: BatchRecipient[],
    ): Promise<BatchResult[]> => {
      if (state.failNextBatch) {
        const failure = state.failNextBatch;
        state.failNextBatch = null;
        const half = recipients.slice(0, Math.floor(recipients.length / 2));
        for (const recipient of half) {
          messages.set(recipient.idempotencyKey, {
            contactId: recipient.contactId,
            messageId: `m-${recipient.contactId}`,
            status: suppressed.has(recipient.to) ? "skipped" : "queued",
          });
        }
        throw failure;
      }
      batches.push({ common, recipients });
      const results = recipients.map((recipient) => {
        const earlier = messages.get(recipient.idempotencyKey);
        if (earlier) {
          return earlier;
        }
        const result: BatchResult = {
          contactId: recipient.contactId,
          messageId: `m-${recipient.contactId}`,
          status: suppressed.has(recipient.to) ? "skipped" : "queued",
        };
        messages.set(recipient.idempotencyKey, result);
        return result;
      });
      state.afterBatch?.();
      return results;
    },
  };

  const audiences = {
    page: async (
      _workspace: string,
      _audience: unknown,
      after: string | null,
      limit: number,
    ) =>
      contacts
        .filter((item) => after === null || item.id > after)
        .slice(0, limit),
  };

  const brand = {
    get: async () => ({
      brandName: "Northwind",
      postalAddress: "1 Main Street",
      websiteUrl: null,
    }),
  };

  const sources = {
    resolveForSend: async () => ({
      id: sourceId,
      name: "Main",
      email: null,
      integrationType: "resend",
    }),
  };

  const queue = {
    add: async (_name: string, data: CampaignFanoutJob) => {
      fanoutJobs.push(data);
      return {};
    },
  };

  const engine = new CampaignsEngine(
    repository as unknown as CampaignsRepository,
    dispatch as unknown as DispatchService,
    audiences as unknown as AudienceService,
    brand as unknown as BrandService,
    sources as unknown as SendingSourcesService,
    queue as unknown as Queue<CampaignFanoutJob>,
  );

  return {
    engine,
    row,
    contacts,
    messages,
    batches,
    fanoutJobs,
    increments,
    state,
    run: () => engine.fanOut(workspaceId, campaignId),
    drain: async () => {
      for (let turn = 0; turn < 50; turn += 1) {
        const result = await engine.fanOut(workspaceId, campaignId);
        if (result.outcome !== "wait") {
          return result;
        }
        for (const message of messages.values()) {
          if (message.status === "queued") {
            (message as { status: string }).status = "sent";
          }
        }
      }
      throw new Error("The fan-out never finished.");
    },
  };
}

function outcome(overrides: Partial<MessageOutcomeJob>): MessageOutcomeJob {
  return {
    workspaceId,
    messageId: "m",
    type: "sent",
    first: true,
    occurredAt: new Date().toISOString(),
    contactId: null,
    campaignId,
    sequenceId: null,
    sequenceStepId: null,
    enrollmentId: null,
    email: "ada@example.com",
    url: null,
    ...overrides,
  };
}

describe("CampaignsEngine.fanOut", () => {
  it("reaches every contact exactly once across pages", async () => {
    const test = harness({
      contacts: fanoutPageSize * 2 + 7,
      suppressed: [3, 600],
    });
    const result = await test.run();
    expect(result).toEqual({ outcome: "done", pages: 3 });
    expect(test.batches.map((batch) => batch.recipients.length)).toEqual([
      fanoutPageSize,
      fanoutPageSize,
      7,
    ]);
    const keys = test.batches.flatMap((batch) =>
      batch.recipients.map((recipient) => recipient.idempotencyKey),
    );
    expect(new Set(keys).size).toBe(test.contacts.length);
    expect(keys[0]).toBe(`campaign:${campaignId}:${contactId(1)}`);
    expect(test.row.recipientCount).toBe(test.contacts.length);
    expect(test.row.skippedCount).toBe(2);
    expect(test.row.fanoutDoneAt).not.toBeNull();
    expect(test.row.fanoutCursor).toBe(contactId(test.contacts.length));
  });

  it("hands dispatch the frozen content, tracking and per contact values", async () => {
    const test = harness({
      contacts: 2,
      campaign: { audience: { type: "lists", listIds: [listId] } },
    });
    await test.run();
    const [batch] = test.batches;
    expect(batch?.common).toMatchObject({
      workspaceId,
      kind: "campaign",
      sourceId,
      campaignId,
      snapshotId,
      from: { email: "news@example.com", name: "Northwind" },
      tracking: { opens: true, clicks: false },
      unsubscribe: { listId },
    });
    expect(batch?.recipients[0]).toMatchObject({
      contactId: contactId(1),
      to: "person1@example.com",
      subject: "Hello Person 1 from Northwind",
      variables: {
        email: "person1@example.com",
        first_name: "Person 1",
        "fields.plan": "pro",
        "brand.name": "Northwind",
        "brand.address": "1 Main Street",
      },
    });
  });

  it("uses no list for the unsubscribe link when the audience is not one list", async () => {
    for (const audience of [
      { type: "all" as const },
      { type: "lists" as const, listIds: [listId, sourceId] },
      { type: "segment" as const, segmentId: listId },
    ]) {
      const test = harness({ contacts: 1, campaign: { audience } });
      await test.run();
      expect(test.batches[0]?.common.unsubscribe).toEqual({});
    }
  });

  it("resumes after a crash in the middle of a page without a second send", async () => {
    const test = harness({ contacts: fanoutPageSize + 40, suppressed: [510] });
    await test.run();
    expect(test.row.fanoutDoneAt).not.toBeNull();

    const crashed = harness({
      contacts: fanoutPageSize + 40,
      suppressed: [10, 510],
    });
    crashed.state.failNextBatch = new Error("connection reset");
    await expect(crashed.run()).rejects.toThrow("connection reset");
    expect(crashed.row.fanoutCursor).toBeNull();
    expect(crashed.row.recipientCount).toBe(0);
    expect(crashed.messages.size).toBe(fanoutPageSize / 2);

    const resumed = await crashed.run();
    expect(resumed.outcome).toBe("done");
    expect(crashed.messages.size).toBe(crashed.contacts.length);
    expect(
      [...crashed.messages.values()].map((message) => message.contactId).sort(),
    ).toEqual(crashed.contacts.map((item) => item.id).sort());
    expect(crashed.row.recipientCount).toBe(crashed.contacts.length);
    expect(crashed.row.skippedCount).toBe(2);
  });

  it("does nothing when the same job runs again after it finished", async () => {
    const test = harness({ contacts: 30 });
    await test.run();
    const again = await test.run();
    expect(again).toEqual({ outcome: "done", pages: 0 });
    expect(test.batches).toHaveLength(1);
    expect(test.row.recipientCount).toBe(30);
  });

  it("counts a page once when two runs race over it", async () => {
    const test = harness({ contacts: 20 });
    let raced = false;
    test.state.afterBatch = () => {
      if (!raced) {
        raced = true;
        test.row.fanoutCursor = contactId(20);
        test.row.recipientCount = 20;
        test.row.fanoutDoneAt = new Date();
      }
    };
    const result = await test.run();
    expect(result.outcome).toBe("done");
    expect(test.row.recipientCount).toBe(20);
    expect(test.messages.size).toBe(20);
  });

  it("stops between pages when the campaign is paused, and resumes from the cursor", async () => {
    const test = harness({ contacts: fanoutPageSize * 3 });
    test.state.afterBatch = () => {
      test.row.status = "paused";
    };
    const paused = await test.run();
    expect(paused).toEqual({ outcome: "stopped", pages: 1 });
    expect(test.row.fanoutCursor).toBe(contactId(fanoutPageSize));
    expect(test.row.recipientCount).toBe(fanoutPageSize);
    expect(test.messages.size).toBe(fanoutPageSize);

    expect(await test.run()).toEqual({ outcome: "stopped", pages: 0 });

    test.state.afterBatch = null;
    test.row.status = "sending";
    const resumed = await test.run();
    expect(resumed).toEqual({ outcome: "done", pages: 3 });
    expect(test.messages.size).toBe(fanoutPageSize * 3);
    expect(test.row.recipientCount).toBe(fanoutPageSize * 3);
    expect(test.batches[1]?.recipients[0]?.contactId).toBe(
      contactId(fanoutPageSize + 1),
    );
  });

  it("stops for good when the campaign is cancelled", async () => {
    const test = harness({ contacts: fanoutPageSize * 2 });
    test.state.afterBatch = () => {
      test.row.status = "cancelled";
    };
    expect((await test.run()).outcome).toBe("stopped");
    expect(test.messages.size).toBe(fanoutPageSize);
    expect(test.row.fanoutDoneAt).toBeNull();
  });

  it("waits while more than the allowed number of emails are still queued", async () => {
    const pagesBeforeWait =
      Math.floor(maxQueuedPerCampaign / fanoutPageSize) + 1;
    const total = fanoutPageSize * (pagesBeforeWait + 3);
    const test = harness({ contacts: total });
    const first = await test.run();
    expect(first).toEqual({ outcome: "wait", pages: pagesBeforeWait });
    expect(test.messages.size).toBe(fanoutPageSize * pagesBeforeWait);
    expect(test.state.countCalls).toBe(1);

    expect(await test.run()).toEqual({ outcome: "wait", pages: 0 });
    expect(test.messages.size).toBe(fanoutPageSize * pagesBeforeWait);

    const finished = await test.drain();
    expect(finished.outcome).toBe("done");
    expect(test.messages.size).toBe(total);
    expect(test.row.recipientCount).toBe(total);
  });

  it("finishes an empty audience without calling dispatch", async () => {
    const test = harness({ contacts: 0 });
    expect(await test.run()).toEqual({ outcome: "done", pages: 1 });
    expect(test.batches).toHaveLength(0);
    expect(test.row.fanoutDoneAt).not.toBeNull();
  });

  it("pauses with the reason when the source cannot send", async () => {
    const test = harness({ contacts: 5 });
    test.state.failNextBatch = apiError(
      HttpStatus.CONFLICT,
      "source_unavailable",
      "Sending through Main is paused.",
    );
    expect((await test.run()).outcome).toBe("paused");
    expect(test.row).toMatchObject({
      status: "paused",
      errorCode: "source_unavailable",
      errorMessage: "Sending through Main is paused.",
      completedAt: null,
    });
  });

  it("fails with the reason when dispatch rejects the campaign", async () => {
    const test = harness({ contacts: 5 });
    test.state.failNextBatch = apiError(
      HttpStatus.NOT_FOUND,
      "not_found",
      "This content snapshot does not exist in the workspace.",
    );
    expect((await test.run()).outcome).toBe("failed");
    expect(test.row.status).toBe("failed");
    expect(test.row.errorCode).toBe("not_found");
    expect(test.row.completedAt).not.toBeNull();
  });

  it("fails a campaign that has no saved content", async () => {
    const test = harness({ contacts: 5, campaign: { snapshotId: null } });
    expect((await test.run()).outcome).toBe("failed");
    expect(test.row.errorCode).toBe("content_missing");
    expect(test.batches).toHaveLength(0);
  });
});

describe("CampaignsEngine outcomes", () => {
  it("adds one to the matching counter for a first event", async () => {
    const test = harness({ contacts: 0 });
    for (const type of [
      "sent",
      "delivered",
      "bounced",
      "complained",
      "failed",
      "opened",
      "clicked",
      "unsubscribed",
    ] as const) {
      await test.engine.applyOutcome(outcome({ type }));
    }
    expect(test.increments).toEqual([
      "sent",
      "delivered",
      "bounced",
      "complained",
      "failed",
      "opened",
      "clicked",
      "unsubscribed",
    ]);
  });

  it("ignores repeats, other event types and messages without a campaign", async () => {
    const test = harness({ contacts: 0 });
    await test.engine.applyOutcome(outcome({ type: "opened", first: false }));
    await test.engine.applyOutcome(outcome({ type: "clicked", first: false }));
    await test.engine.applyOutcome(outcome({ type: "delayed" }));
    await test.engine.applyOutcome(outcome({ type: "replied" }));
    await test.engine.applyOutcome(outcome({ campaignId: null }));
    expect(test.increments).toEqual([]);
  });
});

describe("CampaignsEngine.reconcile", () => {
  it("maps message statuses to cumulative delivery counters", () => {
    expect(
      deliveryCounts({
        queued: 4,
        sent: 10,
        delivered: 20,
        delayed: 1,
        bounced: 2,
        complained: 3,
        failed: 5,
        skipped: 6,
      }),
    ).toEqual({
      sent: 36,
      delivered: 23,
      bounced: 2,
      complained: 3,
      failed: 5,
      skipped: 6,
    });
  });

  it("queues the fan-out again for a sending campaign that has not finished it", async () => {
    const test = harness({ contacts: 3 });
    expect(await test.engine.reconcile()).toBe(0);
    expect(test.fanoutJobs).toEqual([{ workspaceId, campaignId }]);
    expect(test.row.status).toBe("sending");
  });

  it("keeps a campaign sending while emails are queued, then marks it sent", async () => {
    const test = harness({ contacts: 3, suppressed: [2] });
    await test.run();
    expect(await test.engine.reconcile()).toBe(0);
    expect(test.row.status).toBe("sending");
    expect(test.row.skippedCount).toBe(1);

    for (const message of test.messages.values()) {
      if (message.status === "queued") {
        (message as { status: string }).status = "delivered";
      }
    }
    const now = new Date();
    expect(await test.engine.reconcile(now)).toBe(1);
    expect(test.row).toMatchObject({
      status: "sent",
      completedAt: now,
      sentCount: 2,
      deliveredCount: 2,
      skippedCount: 1,
    });
    expect(test.fanoutJobs).toEqual([]);
  });

  it("starts scheduled campaigns that are due", async () => {
    const test = harness({ contacts: 0 });
    expect(await test.engine.startDue()).toBe(1);
    expect(test.fanoutJobs).toEqual([{ workspaceId, campaignId }]);
  });
});
