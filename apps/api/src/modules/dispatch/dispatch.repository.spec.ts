import { hourCeil, hourFloor, hourlyDelta } from "./dispatch.repository";

const state = (
  status: string,
  flags: Partial<{
    opened: boolean;
    clicked: boolean;
    replied: boolean;
    unsubscribed: boolean;
  }> = {},
) => ({
  status,
  opened: false,
  clicked: false,
  replied: false,
  unsubscribed: false,
  ...flags,
});

const none = {
  sent: 0,
  delivered: 0,
  bounced: 0,
  complained: 0,
  failed: 0,
  opened: 0,
  clicked: 0,
  replied: 0,
  unsubscribed: 0,
};

describe("hourlyDelta", () => {
  it("counts a message as sent once it leaves the queue", () => {
    expect(hourlyDelta(state("queued"), state("sent"))).toEqual({
      ...none,
      sent: 1,
    });
    expect(hourlyDelta(state("sent"), state("delayed"))).toBeNull();
    expect(hourlyDelta(state("queued"), state("skipped"))).toBeNull();
    expect(hourlyDelta(state("queued"), state("delivered"))).toEqual({
      ...none,
      sent: 1,
      delivered: 1,
    });
  });

  it("moves a message between outcomes instead of counting it twice", () => {
    expect(hourlyDelta(state("delivered"), state("bounced"))).toEqual({
      ...none,
      delivered: -1,
      bounced: 1,
    });
    expect(hourlyDelta(state("bounced"), state("complained"))).toEqual({
      ...none,
      delivered: 1,
      bounced: -1,
      complained: 1,
    });
    expect(hourlyDelta(state("delivered"), state("complained"))).toEqual({
      ...none,
      complained: 1,
    });
    expect(hourlyDelta(state("sent"), state("failed"))).toEqual({
      ...none,
      sent: -1,
      failed: 1,
    });
    expect(hourlyDelta(state("queued"), state("failed"))).toEqual({
      ...none,
      failed: 1,
    });
  });

  it("counts only the first open, click, reply and unsubscribe", () => {
    expect(
      hourlyDelta(
        state("sent"),
        state("sent", { opened: true, clicked: true }),
      ),
    ).toEqual({ ...none, opened: 1, clicked: 1 });
    expect(
      hourlyDelta(
        state("sent", { opened: true }),
        state("sent", { opened: true }),
      ),
    ).toBeNull();
    expect(
      hourlyDelta(
        state("delivered", { opened: true }),
        state("delivered", { opened: true, replied: true, unsubscribed: true }),
      ),
    ).toEqual({ ...none, replied: 1, unsubscribed: 1 });
  });
});

describe("hour bounds", () => {
  it("rounds to whole hours in UTC", () => {
    const date = new Date("2026-03-29T01:30:15.123+05:30");
    expect(hourFloor(date).toISOString()).toBe("2026-03-28T20:00:00.000Z");
    expect(hourCeil(date).toISOString()).toBe("2026-03-28T21:00:00.000Z");
    const whole = new Date("2026-03-28T20:00:00.000Z");
    expect(hourFloor(whole)).toEqual(whole);
    expect(hourCeil(whole)).toEqual(whole);
  });
});
