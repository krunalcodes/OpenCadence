import {
  instantsOfLocalTime,
  isInsideWindow,
  isTimezone,
  localTime,
  nextWindowDay,
  nextWindowOpening,
  type SendWindow,
  startOfLocalDay,
} from "./send-window";

const everyDay = [1, 2, 3, 4, 5, 6, 7];
const weekdays = [1, 2, 3, 4, 5];

function window(overrides: Partial<SendWindow> = {}): SendWindow {
  return {
    timezone: "UTC",
    sendDays: weekdays,
    startMinute: 9 * 60,
    endMinute: 17 * 60,
    ...overrides,
  };
}

const at = (iso: string) => new Date(iso);
const iso = (date: Date) => date.toISOString();

describe("localTime", () => {
  it("reads the wall clock and ISO weekday in the zone", () => {
    expect(localTime("UTC", at("2026-10-11T23:59:30Z"))).toEqual({
      year: 2026,
      month: 10,
      day: 11,
      weekday: 7,
      minuteOfDay: 23 * 60 + 59,
      second: 30,
    });
    expect(localTime("Asia/Kolkata", at("2026-10-11T20:00:00Z"))).toMatchObject(
      { day: 12, weekday: 1, minuteOfDay: 90 },
    );
    expect(
      localTime("America/Los_Angeles", at("2026-01-01T03:00:00Z")),
    ).toMatchObject({
      year: 2025,
      month: 12,
      day: 31,
      weekday: 3,
      minuteOfDay: 19 * 60,
    });
  });

  it("reads midnight as minute zero, never as hour 24", () => {
    expect(localTime("Europe/Paris", at("2026-06-30T22:00:00Z"))).toMatchObject(
      { month: 7, day: 1, minuteOfDay: 0 },
    );
  });
});

describe("isTimezone", () => {
  it("accepts IANA names and rejects anything else", () => {
    expect(isTimezone("Europe/Berlin")).toBe(true);
    expect(isTimezone("UTC")).toBe(true);
    expect(isTimezone("Mars/Olympus")).toBe(false);
    expect(isTimezone("")).toBe(false);
  });
});

describe("isInsideWindow", () => {
  it("includes the first minute and excludes the closing minute", () => {
    expect(isInsideWindow(window(), at("2026-10-12T08:59:59Z"))).toBe(false);
    expect(isInsideWindow(window(), at("2026-10-12T09:00:00Z"))).toBe(true);
    expect(isInsideWindow(window(), at("2026-10-12T16:59:59Z"))).toBe(true);
    expect(isInsideWindow(window(), at("2026-10-12T17:00:00Z"))).toBe(false);
  });

  it("is closed on days that are not send days", () => {
    expect(isInsideWindow(window(), at("2026-10-10T12:00:00Z"))).toBe(false);
    expect(isInsideWindow(window(), at("2026-10-11T12:00:00Z"))).toBe(false);
    expect(
      isInsideWindow(window({ sendDays: [6] }), at("2026-10-10T12:00:00Z")),
    ).toBe(true);
  });

  it("uses the weekday of the zone, not of UTC", () => {
    const tokyo = window({ timezone: "Asia/Tokyo", sendDays: [1] });
    expect(isInsideWindow(tokyo, at("2026-10-11T23:59:00Z"))).toBe(false);
    expect(isInsideWindow(tokyo, at("2026-10-12T00:00:00Z"))).toBe(true);
    expect(isInsideWindow(tokyo, at("2026-10-12T08:00:00Z"))).toBe(false);
    const honolulu = window({ timezone: "Pacific/Honolulu", sendDays: [5] });
    expect(isInsideWindow(honolulu, at("2026-10-10T02:00:00Z"))).toBe(true);
  });

  it("follows the zone through winter and summer time", () => {
    const newYork = window({ timezone: "America/New_York" });
    expect(isInsideWindow(newYork, at("2026-01-12T13:30:00Z"))).toBe(false);
    expect(isInsideWindow(newYork, at("2026-01-12T14:00:00Z"))).toBe(true);
    expect(isInsideWindow(newYork, at("2026-07-13T13:00:00Z"))).toBe(true);
    expect(isInsideWindow(newYork, at("2026-07-13T12:59:00Z"))).toBe(false);
  });

  it("stays open until midnight when the window ends at 1440", () => {
    const late = window({ startMinute: 22 * 60, endMinute: 1440 });
    expect(isInsideWindow(late, at("2026-10-12T23:59:59Z"))).toBe(true);
    expect(isInsideWindow(late, at("2026-10-13T00:00:00Z"))).toBe(false);
  });
});

describe("nextWindowOpening", () => {
  it("is now when the window is open", () => {
    const now = at("2026-10-12T10:15:00Z");
    expect(nextWindowOpening(window(), now)).toBe(now);
  });

  it("is later today when the window has not opened yet", () => {
    expect(iso(nextWindowOpening(window(), at("2026-10-12T03:00:00Z")))).toBe(
      "2026-10-12T09:00:00.000Z",
    );
  });

  it("is tomorrow after the window closed", () => {
    expect(iso(nextWindowOpening(window(), at("2026-10-12T17:00:00Z")))).toBe(
      "2026-10-13T09:00:00.000Z",
    );
  });

  it("skips days that are not send days", () => {
    expect(iso(nextWindowOpening(window(), at("2026-10-09T18:00:00Z")))).toBe(
      "2026-10-12T09:00:00.000Z",
    );
    expect(iso(nextWindowOpening(window(), at("2026-10-10T10:00:00Z")))).toBe(
      "2026-10-12T09:00:00.000Z",
    );
  });

  it("waits a whole week when the only send day has already closed", () => {
    const mondays = window({ sendDays: [1] });
    expect(iso(nextWindowOpening(mondays, at("2026-10-12T17:30:00Z")))).toBe(
      "2026-10-19T09:00:00.000Z",
    );
  });

  it("opens at the local hour in zones with a half hour offset", () => {
    const kolkata = window({ timezone: "Asia/Kolkata", sendDays: everyDay });
    expect(iso(nextWindowOpening(kolkata, at("2026-10-12T12:00:00Z")))).toBe(
      "2026-10-13T03:30:00.000Z",
    );
  });

  it("opens an hour earlier in UTC once summer time has started", () => {
    const newYork = window({
      timezone: "America/New_York",
      sendDays: everyDay,
    });
    expect(iso(nextWindowOpening(newYork, at("2026-03-07T23:00:00Z")))).toBe(
      "2026-03-08T13:00:00.000Z",
    );
    expect(iso(nextWindowOpening(newYork, at("2026-03-06T23:00:00Z")))).toBe(
      "2026-03-07T14:00:00.000Z",
    );
  });

  it("opens an hour later in UTC once winter time has returned", () => {
    const newYork = window({
      timezone: "America/New_York",
      sendDays: everyDay,
    });
    expect(iso(nextWindowOpening(newYork, at("2026-10-31T22:00:00Z")))).toBe(
      "2026-11-01T14:00:00.000Z",
    );
    expect(iso(nextWindowOpening(newYork, at("2026-10-30T22:00:00Z")))).toBe(
      "2026-10-31T13:00:00.000Z",
    );
  });

  it("opens when the clocks jump forward over a start time that does not exist", () => {
    const early = window({
      timezone: "America/New_York",
      sendDays: everyDay,
      startMinute: 2 * 60 + 30,
      endMinute: 6 * 60,
    });
    const opening = nextWindowOpening(early, at("2026-03-08T05:00:00Z"));
    expect(iso(opening)).toBe("2026-03-08T07:00:00.000Z");
    expect(isInsideWindow(early, opening)).toBe(true);
    expect(isInsideWindow(early, new Date(opening.getTime() - 1000))).toBe(
      false,
    );
  });

  it("opens at the first pass of a start time that happens twice", () => {
    const early = window({
      timezone: "America/New_York",
      sendDays: everyDay,
      startMinute: 90,
      endMinute: 120,
    });
    expect(iso(nextWindowOpening(early, at("2026-11-01T05:10:00Z")))).toBe(
      "2026-11-01T05:30:00.000Z",
    );
  });

  it("opens at the second pass when the first pass is already over", () => {
    const early = window({
      timezone: "America/New_York",
      sendDays: everyDay,
      startMinute: 90,
      endMinute: 120,
    });
    expect(isInsideWindow(early, at("2026-11-01T05:45:00Z"))).toBe(true);
    expect(isInsideWindow(early, at("2026-11-01T06:10:00Z"))).toBe(false);
    expect(iso(nextWindowOpening(early, at("2026-11-01T06:10:00Z")))).toBe(
      "2026-11-01T06:30:00.000Z",
    );
    expect(iso(nextWindowOpening(early, at("2026-11-01T07:00:00Z")))).toBe(
      "2026-11-02T06:30:00.000Z",
    );
  });

  it("handles a zone whose clocks move by half an hour", () => {
    const lordHowe = window({
      timezone: "Australia/Lord_Howe",
      sendDays: everyDay,
    });
    expect(iso(nextWindowOpening(lordHowe, at("2026-07-01T12:00:00Z")))).toBe(
      "2026-07-01T22:30:00.000Z",
    );
    expect(iso(nextWindowOpening(lordHowe, at("2026-12-01T12:00:00Z")))).toBe(
      "2026-12-01T22:00:00.000Z",
    );
  });

  it("handles London and the southern hemisphere", () => {
    const london = window({ timezone: "Europe/London", sendDays: everyDay });
    expect(iso(nextWindowOpening(london, at("2026-03-28T20:00:00Z")))).toBe(
      "2026-03-29T08:00:00.000Z",
    );
    expect(iso(nextWindowOpening(london, at("2026-10-24T20:00:00Z")))).toBe(
      "2026-10-25T09:00:00.000Z",
    );
    const sydney = window({ timezone: "Australia/Sydney", sendDays: everyDay });
    expect(iso(nextWindowOpening(sydney, at("2026-10-03T10:00:00Z")))).toBe(
      "2026-10-03T22:00:00.000Z",
    );
    expect(iso(nextWindowOpening(sydney, at("2026-10-02T10:00:00Z")))).toBe(
      "2026-10-02T23:00:00.000Z",
    );
  });

  it("always returns a time inside the window, for every hour of a year", () => {
    const zones = [
      "America/New_York",
      "Europe/Berlin",
      "Australia/Lord_Howe",
      "Asia/Kolkata",
      "America/Sao_Paulo",
      "Pacific/Auckland",
    ];
    const start = Date.UTC(2026, 0, 1);
    for (const timezone of zones) {
      const checked = window({
        timezone,
        sendDays: [1, 3, 7],
        startMinute: 2 * 60 + 15,
        endMinute: 3 * 60 + 45,
      });
      let previous = 0;
      for (let hour = 0; hour < 365 * 24; hour += 1) {
        const now = new Date(start + hour * 3_600_000 + 17 * 60_000);
        const opening = nextWindowOpening(checked, now);
        expect(opening.getTime()).toBeGreaterThanOrEqual(now.getTime());
        expect(opening.getTime()).toBeGreaterThanOrEqual(previous);
        expect(opening.getTime() - now.getTime()).toBeLessThan(
          8 * 24 * 3_600_000,
        );
        expect(isInsideWindow(checked, opening)).toBe(true);
        previous = opening.getTime();
      }
    }
  });
});

describe("nextWindowDay", () => {
  it("is the opening on the next send day, never today", () => {
    expect(iso(nextWindowDay(window(), at("2026-10-12T03:00:00Z")))).toBe(
      "2026-10-13T09:00:00.000Z",
    );
    expect(iso(nextWindowDay(window(), at("2026-10-12T10:00:00Z")))).toBe(
      "2026-10-13T09:00:00.000Z",
    );
    expect(iso(nextWindowDay(window(), at("2026-10-09T10:00:00Z")))).toBe(
      "2026-10-12T09:00:00.000Z",
    );
  });

  it("is a week away when there is one send day", () => {
    const mondays = window({ sendDays: [1] });
    expect(iso(nextWindowDay(mondays, at("2026-10-12T10:00:00Z")))).toBe(
      "2026-10-19T09:00:00.000Z",
    );
  });

  it("uses the local calendar day and the new offset after a clock change", () => {
    const newYork = window({
      timezone: "America/New_York",
      sendDays: everyDay,
    });
    expect(iso(nextWindowDay(newYork, at("2026-03-08T03:30:00Z")))).toBe(
      "2026-03-08T13:00:00.000Z",
    );
    expect(iso(nextWindowDay(newYork, at("2026-03-07T15:00:00Z")))).toBe(
      "2026-03-08T13:00:00.000Z",
    );
  });
});

describe("startOfLocalDay", () => {
  it("is local midnight as an instant", () => {
    expect(iso(startOfLocalDay("UTC", at("2026-10-12T10:00:00Z")))).toBe(
      "2026-10-12T00:00:00.000Z",
    );
    expect(
      iso(startOfLocalDay("America/New_York", at("2026-10-12T03:00:00Z"))),
    ).toBe("2026-10-11T04:00:00.000Z");
    expect(iso(startOfLocalDay("Asia/Tokyo", at("2026-10-12T16:00:00Z")))).toBe(
      "2026-10-12T15:00:00.000Z",
    );
  });

  it("covers 23 and 25 hour days", () => {
    expect(
      iso(startOfLocalDay("America/New_York", at("2026-03-09T03:59:00Z"))),
    ).toBe("2026-03-08T05:00:00.000Z");
    expect(
      iso(startOfLocalDay("America/New_York", at("2026-11-02T04:59:00Z"))),
    ).toBe("2026-11-01T04:00:00.000Z");
  });

  it("is the moment the clocks change when midnight does not exist", () => {
    expect(
      iso(startOfLocalDay("Asia/Beirut", at("2026-03-29T10:00:00Z"))),
    ).toBe("2026-03-28T22:00:00.000Z");
  });
});

describe("instantsOfLocalTime", () => {
  it("returns one instant for an ordinary time, two for a repeated one", () => {
    const date = { year: 2026, month: 11, day: 1 };
    expect(instantsOfLocalTime("America/New_York", date, 12 * 60)).toEqual([
      Date.UTC(2026, 10, 1, 17),
    ]);
    expect(instantsOfLocalTime("America/New_York", date, 90)).toEqual([
      Date.UTC(2026, 10, 1, 5, 30),
      Date.UTC(2026, 10, 1, 6, 30),
    ]);
  });
});
