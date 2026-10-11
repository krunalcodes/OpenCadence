import {
  campaignBlock,
  countMeasure,
  dayWindow,
  emptyTotals,
  hourBlocks,
  hourlyCounts,
  hourOfDay,
  type OverviewTotals,
  parseRange,
  pickAlert,
  projectedEnd,
  rangeWindow,
  rateMeasure,
  rateOf,
  resolveTimezone,
  toStats,
} from "./overview";

function totals(values: Partial<OverviewTotals>): OverviewTotals {
  return { ...emptyTotals, ...values };
}

describe("overview ranges and time zones", () => {
  it("accepts the four ranges and defaults to seven days", () => {
    expect(parseRange("24h")).toBe("24h");
    expect(parseRange("90d")).toBe("90d");
    expect(parseRange(undefined)).toBe("7d");
    expect(parseRange("")).toBe("7d");
    expect(parseRange("1y")).toBeNull();
    expect(parseRange(7)).toBeNull();
  });

  it("splits a range into the period and the equal period before it", () => {
    const now = new Date("2026-10-11T12:00:00.000Z");
    const window = rangeWindow("7d", now);
    expect(window.to).toEqual(now);
    expect(window.split.toISOString()).toBe("2026-10-04T12:00:00.000Z");
    expect(window.from.toISOString()).toBe("2026-09-27T12:00:00.000Z");
    expect(rangeWindow("24h", now).from.toISOString()).toBe(
      "2026-10-09T12:00:00.000Z",
    );
  });

  it("accepts IANA names and rejects anything else", () => {
    expect(resolveTimezone(undefined)).toBe("UTC");
    expect(resolveTimezone("Europe/Berlin")).toBe("Europe/Berlin");
    expect(resolveTimezone("America/Argentina/Buenos_Aires")).not.toBeNull();
    expect(resolveTimezone("Mars/Olympus")).toBeNull();
    expect(resolveTimezone("+05:30")).toBeNull();
    expect(resolveTimezone("UTC'; drop table messages; --")).toBeNull();
    expect(resolveTimezone(5)).toBeNull();
  });

  it("finds the local day around an instant", () => {
    const day = dayWindow(new Date("2026-10-11T20:00:00.000Z"), "Asia/Kolkata");
    expect(day.date).toBe("2026-10-12");
    expect(day.start.toISOString()).toBe("2026-10-11T18:30:00.000Z");
    expect(day.end.toISOString()).toBe("2026-10-12T18:30:00.000Z");
  });

  it("handles days that are not 24 hours long", () => {
    const spring = dayWindow(
      new Date("2026-03-29T10:00:00.000Z"),
      "Europe/Berlin",
    );
    expect(spring.start.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(spring.end.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    const autumn = dayWindow(
      new Date("2026-11-01T12:00:00.000Z"),
      "America/New_York",
    );
    expect(autumn.start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(autumn.end.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("gives the local hour of an instant, clamped to the day", () => {
    const zone = "America/New_York";
    const day = dayWindow(new Date("2026-10-11T15:00:00.000Z"), zone);
    expect(hourOfDay(new Date("2026-10-11T14:30:00.000Z"), day, zone)).toBe(
      10.5,
    );
    expect(hourOfDay(new Date("2026-10-10T14:30:00.000Z"), day, zone)).toBe(0);
    expect(hourOfDay(new Date("2026-10-12T14:30:00.000Z"), day, zone)).toBe(24);
  });
});

describe("overview rates and deltas", () => {
  it("divides by delivered when there is any, else by sent", () => {
    expect(rateOf(25, 50, 100)).toBe(0.5);
    expect(rateOf(25, 0, 100)).toBe(0.25);
    expect(rateOf(0, 0, 0)).toBeNull();
    expect(rateOf(80, 50, 100)).toBe(1);
  });

  it("reports counts as a percent change and hides it with no baseline", () => {
    expect(countMeasure(112, 100).change).toBe(12);
    expect(countMeasure(50, 100).change).toBe(-50);
    expect(countMeasure(1234, 1100).change).toBe(12.2);
    expect(countMeasure(10, 0).change).toBeNull();
  });

  it("reports rates as percentage points and hides them when one is missing", () => {
    expect(rateMeasure(0.469, 0.448).change).toBe(2.1);
    expect(rateMeasure(0.019, 0.025).change).toBe(-0.6);
    expect(rateMeasure(0.3, null).change).toBeNull();
    expect(rateMeasure(null, 0.3).change).toBeNull();
  });

  it("counts opens only against mail with open tracking on", () => {
    const stats = toStats(
      totals({
        sent: 1000,
        delivered: 900,
        trackedSent: 400,
        trackedDelivered: 360,
        opened: 180,
        sequenceSent: 600,
        sequenceDelivered: 540,
        replied: 54,
        bounced: 30,
        complained: 2,
      }),
      totals({ sent: 500, bounced: 5 }),
    );
    expect(stats.sent).toEqual({ value: 1000, previous: 500, change: 100 });
    expect(stats.openRate.value).toBe(0.5);
    expect(stats.openRate.previous).toBeNull();
    expect(stats.openRate.change).toBeNull();
    expect(stats.replyRate.value).toBe(0.1);
    expect(stats.bounceRate).toEqual({
      value: 0.03,
      previous: 0.01,
      change: 2,
    });
    expect(stats.complaintRate.value).toBe(0.002);
  });

  it("returns null rates for an empty period", () => {
    const stats = toStats(totals({}), totals({}));
    expect(stats.sent).toEqual({ value: 0, previous: 0, change: null });
    expect(stats.openRate.value).toBeNull();
    expect(stats.replyRate.value).toBeNull();
    expect(stats.bounceRate.value).toBeNull();
  });
});

describe("overview hour buckets", () => {
  it("places each row in its hour and ignores other kinds", () => {
    const counts = hourlyCounts(
      [
        { kind: "sequence", hour: 9, count: 4 },
        { kind: "sequence", hour: 9, count: 1 },
        { kind: "transactional", hour: 9, count: 7 },
        { kind: "sequence", hour: 23, count: 2 },
        { kind: "sequence", hour: 24, count: 9 },
      ],
      "sequence",
    );
    expect(counts).toHaveLength(24);
    expect(counts[9]).toBe(5);
    expect(counts[23]).toBe(2);
    expect(counts.reduce((sum, value) => sum + value, 0)).toBe(7);
  });

  it("joins neighbouring hours into one block and splits at a gap", () => {
    const counts = Array.from({ length: 24 }, () => 0);
    counts[6] = 3;
    counts[7] = 2;
    counts[8] = 5;
    counts[11] = 1;
    expect(hourBlocks(counts, 15.5)).toEqual([
      { state: "sent", startHour: 6, endHour: 9, count: 10 },
      { state: "sent", startHour: 11, endHour: 12, count: 1 },
    ]);
  });

  it("ends the block of the current hour at the current time", () => {
    const counts = Array.from({ length: 24 }, () => 0);
    counts[9] = 4;
    counts[10] = 6;
    expect(hourBlocks(counts, 10.43)).toEqual([
      { state: "sending", startHour: 9, endHour: 10.43, count: 10 },
    ]);
    counts[9] = 0;
    expect(hourBlocks(counts, 10.05)).toEqual([
      { state: "sending", startHour: 10, endHour: 10.25, count: 6 },
    ]);
  });

  it("returns nothing for a day with no sends", () => {
    expect(
      hourBlocks(
        Array.from({ length: 24 }, () => 0),
        12,
      ),
    ).toEqual([]);
  });
});

describe("overview campaign blocks", () => {
  const zone = "UTC";
  const now = new Date("2026-10-11T10:00:00.000Z");
  const day = dayWindow(now, zone);
  const base = {
    id: "c1",
    name: "October update",
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    fanoutDone: true,
    stats: { recipients: 0, skipped: 0, sent: 0 },
  };

  it("draws a sent campaign from its start to its end", () => {
    const block = campaignBlock(
      {
        ...base,
        status: "sent",
        startedAt: "2026-10-11T08:00:00.000Z",
        completedAt: "2026-10-11T09:15:00.000Z",
      },
      day,
      zone,
      now,
    );
    expect(block).toMatchObject({ state: "sent", startHour: 8, endHour: 9.25 });
  });

  it("projects the end of a sending campaign from its pace", () => {
    const campaign = {
      ...base,
      status: "sending",
      startedAt: "2026-10-11T09:00:00.000Z",
      stats: { recipients: 1100, skipped: 100, sent: 250 },
    };
    expect(projectedEnd(campaign, now).toISOString()).toBe(
      "2026-10-11T13:00:00.000Z",
    );
    expect(campaignBlock(campaign, day, zone, now)).toMatchObject({
      state: "sending",
      startHour: 9,
      endHour: 13,
    });
  });

  it("gives a sending campaign with no pace yet a short projection", () => {
    const campaign = {
      ...base,
      status: "sending",
      startedAt: "2026-10-11T09:55:00.000Z",
      fanoutDone: false,
      stats: { recipients: 500, skipped: 0, sent: 0 },
    };
    expect(projectedEnd(campaign, now).toISOString()).toBe(
      "2026-10-11T10:30:00.000Z",
    );
  });

  it("shows a scheduled campaign only on its day", () => {
    const today = campaignBlock(
      { ...base, status: "scheduled", scheduledAt: "2026-10-11T14:30:00.000Z" },
      day,
      zone,
      now,
    );
    expect(today).toMatchObject({
      state: "scheduled",
      startHour: 14.5,
      endHour: 15.5,
    });
    expect(
      campaignBlock(
        {
          ...base,
          status: "scheduled",
          scheduledAt: "2026-10-12T14:30:00.000Z",
        },
        day,
        zone,
        now,
      ),
    ).toBeNull();
  });

  it("leaves out campaigns that finished before today, drafts and paused ones", () => {
    expect(
      campaignBlock(
        {
          ...base,
          status: "sent",
          startedAt: "2026-10-10T08:00:00.000Z",
          completedAt: "2026-10-10T09:00:00.000Z",
        },
        day,
        zone,
        now,
      ),
    ).toBeNull();
    expect(
      campaignBlock(
        { ...base, status: "paused", startedAt: "2026-10-11T08:00:00.000Z" },
        day,
        zone,
        now,
      ),
    ).toBeNull();
  });

  it("clips a campaign that started yesterday to the start of today", () => {
    expect(
      campaignBlock(
        {
          ...base,
          status: "sent",
          startedAt: "2026-10-10T23:00:00.000Z",
          completedAt: "2026-10-11T01:30:00.000Z",
        },
        day,
        zone,
        now,
      ),
    ).toMatchObject({ startHour: 0, endHour: 1.5 });
  });
});

describe("overview alert", () => {
  const healthy = { id: "s1", name: "Resend", status: "active" };
  const broken = { id: "s2", name: "Outreach", status: "needs_attention" };
  const paused = { id: "s3", name: "Sales", status: "paused" };
  const failed = { id: "c1", name: "Launch" };
  const bouncing = totals({ sent: 1000, bounced: 30, complained: 5 });

  it("is null when nothing is wrong", () => {
    expect(
      pickAlert({
        sources: [healthy],
        failedCampaigns: [],
        totals: totals({ sent: 1000, bounced: 10 }),
      }),
    ).toBeNull();
  });

  it("puts a source that needs attention first", () => {
    const alert = pickAlert({
      sources: [healthy, paused, broken],
      failedCampaigns: [failed],
      totals: bouncing,
    });
    expect(alert).toEqual({
      code: "source_needs_attention",
      entity: { type: "source", id: "s2", name: "Outreach" },
      others: 0,
      rate: null,
      path: "integrations",
    });
  });

  it("then a paused source, then a failed campaign", () => {
    expect(
      pickAlert({
        sources: [healthy, paused],
        failedCampaigns: [failed],
        totals: bouncing,
      })?.code,
    ).toBe("source_paused");
    expect(
      pickAlert({
        sources: [healthy],
        failedCampaigns: [failed, { id: "c2", name: "Older" }],
        totals: bouncing,
      }),
    ).toEqual({
      code: "campaign_failed",
      entity: { type: "campaign", id: "c1", name: "Launch" },
      others: 1,
      rate: null,
      path: "campaigns/c1",
    });
  });

  it("then the bounce rate, then the complaint rate", () => {
    expect(
      pickAlert({ sources: [healthy], failedCampaigns: [], totals: bouncing }),
    ).toMatchObject({ code: "bounce_rate_high", rate: 0.03, entity: null });
    expect(
      pickAlert({
        sources: [healthy],
        failedCampaigns: [],
        totals: totals({ sent: 1000, bounced: 10, complained: 5 }),
      }),
    ).toMatchObject({ code: "complaint_rate_high", rate: 0.005 });
  });

  it("needs enough sends before a rate counts", () => {
    expect(
      pickAlert({
        sources: [],
        failedCampaigns: [],
        totals: totals({ sent: 49, bounced: 20 }),
      }),
    ).toBeNull();
    expect(
      pickAlert({
        sources: [],
        failedCampaigns: [],
        totals: totals({ sent: 50, bounced: 1 }),
      }),
    ).toBeNull();
    expect(
      pickAlert({
        sources: [],
        failedCampaigns: [],
        totals: totals({ sent: 499, bounced: 5, complained: 3 }),
      }),
    ).toBeNull();
    expect(
      pickAlert({
        sources: [],
        failedCampaigns: [],
        totals: totals({ sent: 50, bounced: 2 }),
      })?.code,
    ).toBe("bounce_rate_high");
  });
});
