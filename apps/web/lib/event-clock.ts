export type DateMode = "local" | "stable";

export type DayLabels = { today: string; yesterday: string };

export type EventMoment = {
  iso: string;
  dayKey: string;
  day: string;
  time: string;
};

export type EventClock = (value: string) => EventMoment | null;

const stableLocale = "en-US";
const stableZone = "UTC";
const dayLength = 24 * 60 * 60 * 1000;

function zoneOf(mode: DateMode) {
  return mode === "stable" ? stableZone : undefined;
}

function localeOf(mode: DateMode) {
  return mode === "stable" ? stableLocale : undefined;
}

export function createEventClock(
  mode: DateMode,
  now: Date,
  labels: DayLabels,
): EventClock {
  const keyFormat = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: zoneOf(mode),
  });
  const today = keyFormat.format(now);
  const yesterday = keyFormat.format(new Date(now.getTime() - dayLength));
  const dayFormat = new Intl.DateTimeFormat(localeOf(mode), {
    dateStyle: "medium",
    timeZone: zoneOf(mode),
  });
  const timeFormat = new Intl.DateTimeFormat(localeOf(mode), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: zoneOf(mode),
  });

  return (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    const key = keyFormat.format(date);
    return {
      iso: date.toISOString(),
      dayKey: key,
      day:
        key === today
          ? labels.today
          : key === yesterday
            ? labels.yesterday
            : dayFormat.format(date),
      time: timeFormat.format(date),
    };
  };
}
