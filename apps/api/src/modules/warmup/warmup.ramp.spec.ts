import {
  capForRealSending,
  choosePartner,
  emailDomain,
  isSendingDay,
  lastDays,
  planningWindowEnd,
  rampDay,
  rampTarget,
  randomizedTarget,
  replyIsPlanned,
  spreadSendTimes,
} from "./warmup.ramp";

const defaults = { startPerDay: 5, incrementPerDay: 2, maxPerDay: 30 };
const minuteMs = 60 * 1000;

function sequence(values: number[]) {
  let index = 0;
  return () => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
}

describe("warm-up ramp", () => {
  it("counts the ramp day from the start date and the held days", () => {
    expect(rampDay("2026-03-02", 0, "2026-03-02")).toBe(1);
    expect(rampDay("2026-03-02", 0, "2026-03-05")).toBe(4);
    expect(rampDay("2026-03-02", 2, "2026-03-05")).toBe(2);
    expect(rampDay("2026-03-02", 9, "2026-03-05")).toBe(1);
    expect(rampDay("2026-02-27", 0, "2026-03-01")).toBe(3);
  });

  it("starts at the first day's volume and grows to the maximum", () => {
    expect(rampTarget(defaults, 1)).toBe(5);
    expect(rampTarget(defaults, 2)).toBe(7);
    expect(rampTarget(defaults, 13)).toBe(29);
    expect(rampTarget(defaults, 14)).toBe(30);
    expect(rampTarget(defaults, 200)).toBe(30);
    expect(
      rampTarget({ startPerDay: 50, incrementPerDay: 5, maxPerDay: 50 }, 9),
    ).toBe(50);
  });

  it("randomises between the target minus five and the target", () => {
    expect(randomizedTarget(20, () => 0)).toBe(15);
    expect(randomizedTarget(20, () => 0.999999)).toBe(20);
    expect(randomizedTarget(3, () => 0)).toBe(1);
    expect(randomizedTarget(1, () => 0.5)).toBe(1);
    for (let index = 0; index < 500; index += 1) {
      const value = randomizedTarget(12, Math.random);
      expect(value).toBeGreaterThanOrEqual(7);
      expect(value).toBeLessThanOrEqual(12);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("caps the target at 15 on a day with real sending", () => {
    expect(capForRealSending(30, 0)).toBe(30);
    expect(capForRealSending(30, 4)).toBe(15);
    expect(capForRealSending(9, 4)).toBe(9);
  });

  it("skips Saturday and Sunday in UTC only when asked to", () => {
    const friday = new Date("2026-03-06T23:59:00Z");
    const saturday = new Date("2026-03-07T00:00:00Z");
    const sunday = new Date("2026-03-08T12:00:00Z");
    const monday = new Date("2026-03-09T00:00:00Z");
    expect(isSendingDay(saturday, false)).toBe(true);
    expect(isSendingDay(friday, true)).toBe(true);
    expect(isSendingDay(saturday, true)).toBe(false);
    expect(isSendingDay(sunday, true)).toBe(false);
    expect(isSendingDay(monday, true)).toBe(true);
  });

  it("lists the last days oldest first", () => {
    const days = lastDays("2026-03-02", 14);
    expect(days).toHaveLength(14);
    expect(days[0]).toBe("2026-02-17");
    expect(days.at(-1)).toBe("2026-03-02");
  });

  it("reads the domain of an address", () => {
    expect(emailDomain("Ada@Example.COM")).toBe("example.com");
    expect(emailDomain(null)).toBeNull();
    expect(emailDomain("nothing")).toBeNull();
  });
});

describe("warm-up send times", () => {
  const from = new Date("2026-03-02T09:00:00Z");
  const until = planningWindowEnd(from);

  it("ends the planning window at 20:00 UTC", () => {
    expect(until.toISOString()).toBe("2026-03-02T20:00:00.000Z");
  });

  it("spreads sends in order, inside the window, three minutes apart", () => {
    for (let round = 0; round < 50; round += 1) {
      const times = spreadSendTimes(30, from, until, Math.random);
      expect(times).toHaveLength(30);
      times.forEach((time, index) => {
        expect(time.getTime()).toBeGreaterThanOrEqual(from.getTime());
        expect(time.getTime()).toBeLessThanOrEqual(until.getTime());
        const previous = times[index - 1];
        if (previous) {
          expect(time.getTime() - previous.getTime()).toBeGreaterThanOrEqual(
            3 * minuteMs,
          );
        }
      });
    }
  });

  it("keeps the gap even when the random source repeats itself", () => {
    const times = spreadSendTimes(4, from, until, () => 0);
    expect(times.map((time) => time.toISOString())).toEqual([
      "2026-03-02T09:00:00.000Z",
      "2026-03-02T09:03:00.000Z",
      "2026-03-02T09:06:00.000Z",
      "2026-03-02T09:09:00.000Z",
    ]);
  });

  it("plans fewer sends when the window is too short", () => {
    const late = new Date("2026-03-02T19:53:00Z");
    expect(spreadSendTimes(10, late, until, Math.random)).toHaveLength(3);
  });

  it("plans nothing after the window or for an empty target", () => {
    const after = new Date("2026-03-02T20:00:00Z");
    expect(
      spreadSendTimes(5, after, planningWindowEnd(after), () => 0),
    ).toEqual([]);
    expect(spreadSendTimes(0, from, until, () => 0)).toEqual([]);
    expect(spreadSendTimes(-2, from, until, () => 0)).toEqual([]);
  });
});

describe("warm-up pairing", () => {
  const sender = { sourceId: "a", domain: "one.test" };
  const pool = [
    sender,
    { sourceId: "b", domain: "one.test" },
    { sourceId: "c", domain: "two.test" },
    { sourceId: "d", domain: "three.test" },
  ];

  it("never picks the sender or a mailbox on the same domain", () => {
    const picked = new Set<string>();
    for (let index = 0; index < 300; index += 1) {
      picked.add(choosePartner(sender, pool, Math.random)?.sourceId ?? "");
    }
    expect([...picked].sort()).toEqual(["c", "d"]);
  });

  it("follows the injected random source", () => {
    expect(choosePartner(sender, pool, () => 0)?.sourceId).toBe("c");
    expect(choosePartner(sender, pool, () => 0.99)?.sourceId).toBe("d");
    const alternate = sequence([0.1, 0.6]);
    expect(choosePartner(sender, pool, alternate)?.sourceId).toBe("c");
    expect(choosePartner(sender, pool, alternate)?.sourceId).toBe("d");
  });

  it("returns nothing when no partner is allowed", () => {
    expect(choosePartner(sender, [sender], Math.random)).toBeNull();
    expect(choosePartner(sender, pool.slice(0, 2), Math.random)).toBeNull();
    expect(choosePartner(sender, [], Math.random)).toBeNull();
  });

  it("plans a reply with the recipient's reply rate", () => {
    expect(replyIsPlanned(30, () => 0.29)).toBe(true);
    expect(replyIsPlanned(30, () => 0.3)).toBe(false);
    expect(replyIsPlanned(0, () => 0)).toBe(false);
  });
});
