import type { Queue } from "bullmq";
import { uuidv7 } from "../../common/uuid";
import { type MessageOutcomeJob, outcomeJobId } from "./dispatch.constants";
import type {
  DispatchRepository,
  EventWrite,
  MessageListRow,
} from "./dispatch.repository";
import { MessageEvents } from "./message-events";

function setup(
  overrides: Partial<MessageListRow>,
  result: { first: boolean; impliedOpen: boolean } | null = {
    first: true,
    impliedOpen: false,
  },
) {
  const id = uuidv7();
  const row = {
    id,
    createdAt: new Date(),
    workspaceId: "workspace",
    toEmails: ["ada@example.com", "grace@example.com"],
    contactId: "contact",
    campaignId: null,
    sequenceId: null,
    sequenceStepId: null,
    enrollmentId: null,
    status: "sent",
    ...overrides,
  } as MessageListRow;
  const writes: EventWrite[] = [];
  const repository = {
    applyEvent: vi.fn(async (write: EventWrite) => {
      writes.push(write);
      return result ? { workspaceId: row.workspaceId, ...result } : null;
    }),
    findListedMessage: vi.fn(async () => row),
  } as unknown as DispatchRepository;
  const campaign = { add: vi.fn(async () => ({})) };
  const sequence = { add: vi.fn(async () => ({})) };
  const events = new MessageEvents(
    repository,
    campaign as unknown as Queue<MessageOutcomeJob>,
    sequence as unknown as Queue<MessageOutcomeJob>,
  );
  return { id, events, writes, campaign, sequence };
}

describe("MessageEvents", () => {
  it("adds no outcome job for email outside a campaign or sequence", async () => {
    const { id, events, campaign, sequence } = setup({});
    const result = await events.record({ messageId: id, type: "delivered" });
    expect(result?.first).toBe(true);
    expect(campaign.add).not.toHaveBeenCalled();
    expect(sequence.add).not.toHaveBeenCalled();
  });

  it("adds a campaign outcome job keyed by the event", async () => {
    const { id, events, writes, campaign, sequence } = setup({
      campaignId: "campaign",
    });
    await events.record({
      messageId: id,
      type: "clicked",
      url: "https://example.com",
    });
    expect(sequence.add).not.toHaveBeenCalled();
    expect(campaign.add).toHaveBeenCalledTimes(1);
    expect(campaign.add).toHaveBeenCalledWith(
      "clicked",
      expect.objectContaining({
        messageId: id,
        type: "clicked",
        first: true,
        campaignId: "campaign",
        contactId: "contact",
        email: "ada@example.com",
        url: "https://example.com",
      }),
      expect.objectContaining({
        jobId: outcomeJobId(id, "clicked", writes[0]?.eventId ?? ""),
      }),
    );
    expect(outcomeJobId(id, "clicked", "event")).not.toContain(":");
  });

  it("adds an opened outcome when a click implied the first open", async () => {
    const { id, events, sequence } = setup(
      { sequenceId: "sequence", enrollmentId: "enrollment" },
      { first: true, impliedOpen: true },
    );
    await events.record({ messageId: id, type: "clicked" });
    expect(sequence.add.mock.calls.map((call) => call.at(0))).toEqual([
      "clicked",
      "opened",
    ]);
  });

  it("keeps the event time between the message and now", async () => {
    const { id, events, writes } = setup({});
    await events.record({
      messageId: id,
      type: "delivered",
      occurredAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await events.record({
      messageId: id,
      type: "delivered",
      occurredAt: new Date(0),
    });
    await events.record({
      messageId: id,
      type: "delivered",
      occurredAt: new Date("nope"),
    });
    const now = Date.now();
    for (const write of writes) {
      expect(write.eventCreatedAt.getTime()).toBeLessThanOrEqual(now);
      expect(write.eventCreatedAt.getTime()).toBeGreaterThanOrEqual(
        write.messageCreatedAt.getTime(),
      );
    }
    expect(writes[1]?.occurredAt).toEqual(new Date(0));
  });

  it("returns nothing for an unknown message and still succeeds when a queue is down", async () => {
    const missing = setup({ campaignId: "campaign" }, null);
    expect(
      await missing.events.record({ messageId: missing.id, type: "opened" }),
    ).toBeNull();
    expect(
      await missing.events.record({ messageId: "nope", type: "opened" }),
    ).toBeNull();
    expect(missing.campaign.add).not.toHaveBeenCalled();

    const down = setup({ campaignId: "campaign" });
    down.campaign.add.mockRejectedValue(new Error("Redis is down"));
    const result = await down.events.record({
      messageId: down.id,
      type: "opened",
    });
    expect(result?.first).toBe(true);
  });
});
