import { bulkWaitMs, nextDailyLimitReset } from "./send.processor";

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
