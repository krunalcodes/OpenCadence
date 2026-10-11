import {
  assignedMessageId,
  bulkWaitMs,
  nextDailyLimitReset,
} from "./send.processor";

describe("send pacing", () => {
  it("waits until the next UTC day when the daily limit is reached", () => {
    expect(nextDailyLimitReset(new Date("2026-10-11T23:59:59.999Z"))).toBe(
      Date.parse("2026-10-12T00:00:00.000Z"),
    );
    expect(nextDailyLimitReset(new Date("2026-12-31T00:00:00.000Z"))).toBe(
      Date.parse("2027-01-01T00:00:00.000Z"),
    );
  });

  it("backs off waiting bulk email up to five minutes", () => {
    expect(bulkWaitMs(1000, 0)).toBe(1000);
    expect(bulkWaitMs(1000, 3)).toBe(8000);
    expect(bulkWaitMs(1000, 9)).toBe(5 * 60 * 1000);
    expect(bulkWaitMs(1000, 100_000)).toBe(5 * 60 * 1000);
  });
});

describe("message ids assigned by the provider", () => {
  const stored = "<0199d0c5-7b1e-7c3a-9d3e-2f6f3f0c9a11@example.com>";

  it("keeps the stored id when the provider used it", () => {
    expect(assignedMessageId(stored, stored)).toEqual({});
    expect(assignedMessageId(stored, stored.slice(1, -1))).toEqual({});
    expect(assignedMessageId(stored, undefined)).toEqual({});
  });

  it("stores the id the provider assigned in its place", () => {
    expect(
      assignedMessageId(stored, "<010f-abc-000000@eu-west-1.amazonses.com>"),
    ).toEqual({ rfcMessageId: "<010f-abc-000000@eu-west-1.amazonses.com>" });
    expect(
      assignedMessageId(null, "010f-abc-000000@email.amazonses.com"),
    ).toEqual({ rfcMessageId: "<010f-abc-000000@email.amazonses.com>" });
  });

  it("ignores a value that is not a message id", () => {
    expect(assignedMessageId(stored, "not an id")).toEqual({});
    expect(assignedMessageId(stored, "no-at-sign")).toEqual({});
    expect(assignedMessageId(stored, "  ")).toEqual({});
  });
});
