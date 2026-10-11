export type SendWindow = {
  timezone: string;
  sendDays: number[];
  startMinute: number;
  endMinute: number;
};

export type LocalTime = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minuteOfDay: number;
  second: number;
};

type LocalDate = { year: number; month: number; day: number };

const secondMs = 1000;
const minuteMs = 60 * secondMs;
const hourMs = 60 * minuteMs;
const daysToLook = 8;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string) {
  let found = formatters.get(timezone);
  if (!found) {
    found = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timezone, found);
  }
  return found;
}

export function isTimezone(value: string) {
  try {
    formatter(value);
    return true;
  } catch {
    return false;
  }
}

function wallClock(timezone: string, instant: number) {
  const parts: Record<string, number> = {};
  for (const part of formatter(timezone).formatToParts(new Date(instant))) {
    if (part.type !== "literal") {
      parts[part.type] = Number(part.value);
    }
  }
  return {
    year: parts.year ?? 1970,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: (parts.hour ?? 0) % 24,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

function isoWeekday(date: LocalDate) {
  const day = new Date(
    Date.UTC(date.year, date.month - 1, date.day),
  ).getUTCDay();
  return day === 0 ? 7 : day;
}

function offsetAt(timezone: string, instant: number) {
  const whole = Math.floor(instant / secondMs) * secondMs;
  const wall = wallClock(timezone, whole);
  return (
    Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second,
    ) - whole
  );
}

export function localTime(timezone: string, instant: Date): LocalTime {
  const wall = wallClock(timezone, instant.getTime());
  return {
    year: wall.year,
    month: wall.month,
    day: wall.day,
    weekday: isoWeekday(wall),
    minuteOfDay: wall.hour * 60 + wall.minute,
    second: wall.second,
  };
}

function addDays(date: LocalDate, days: number): LocalDate {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
  };
}

function firstInstantWithOffset(
  timezone: string,
  offset: number,
  from: number,
  to: number,
) {
  let low = from;
  let high = to;
  while (high - low > secondMs) {
    const middle = low + Math.floor((high - low) / 2 / secondMs) * secondMs;
    if (offsetAt(timezone, middle) === offset) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return high;
}

export function instantsOfLocalTime(
  timezone: string,
  date: LocalDate,
  minuteOfDay: number,
): number[] {
  const wall = Date.UTC(date.year, date.month - 1, date.day, 0, minuteOfDay);
  const offsets = new Set<number>();
  for (const probe of [wall - 24 * hourMs, wall, wall + 24 * hourMs]) {
    const offset = offsetAt(timezone, probe);
    offsets.add(offset);
    offsets.add(offsetAt(timezone, wall - offset));
  }
  const exact = [...offsets]
    .map((offset) => wall - offset)
    .filter((instant) => instant + offsetAt(timezone, instant) === wall)
    .sort((left, right) => left - right);
  if (exact.length > 0) {
    return exact;
  }
  const sorted = [...offsets].sort((left, right) => left - right);
  const before = sorted[0] ?? 0;
  const after = sorted.at(-1) ?? 0;
  return [firstInstantWithOffset(timezone, after, wall - after, wall - before)];
}

export function isInsideWindow(window: SendWindow, now: Date) {
  const local = localTime(window.timezone, now);
  return (
    window.sendDays.includes(local.weekday) &&
    local.minuteOfDay >= window.startMinute &&
    local.minuteOfDay < window.endMinute
  );
}

function openingOn(window: SendWindow, date: LocalDate, notBefore: number) {
  if (!window.sendDays.includes(isoWeekday(date))) {
    return null;
  }
  const instant = instantsOfLocalTime(
    window.timezone,
    date,
    window.startMinute,
  ).find((candidate) => candidate >= notBefore);
  return instant === undefined ? null : new Date(instant);
}

export function nextWindowOpening(window: SendWindow, now: Date): Date {
  if (isInsideWindow(window, now)) {
    return now;
  }
  const today = localTime(window.timezone, now);
  for (let offset = 0; offset < daysToLook; offset += 1) {
    const opening = openingOn(window, addDays(today, offset), now.getTime());
    if (opening) {
      return opening;
    }
  }
  return new Date(now.getTime() + 24 * hourMs);
}

export function nextWindowDay(window: SendWindow, now: Date): Date {
  const today = localTime(window.timezone, now);
  for (let offset = 1; offset < daysToLook; offset += 1) {
    const opening = openingOn(window, addDays(today, offset), now.getTime());
    if (opening) {
      return opening;
    }
  }
  return new Date(now.getTime() + 24 * hourMs);
}

export function startOfLocalDay(timezone: string, now: Date): Date {
  const today = localTime(timezone, now);
  const [instant] = instantsOfLocalTime(timezone, today, 0);
  return new Date(Math.min(instant ?? now.getTime(), now.getTime()));
}

export function windowLengthMs(window: SendWindow) {
  return (window.endMinute - window.startMinute) * minuteMs;
}
