export type DateMode = "local" | "stable";

export type SchedulePreset = "hour" | "tomorrow" | "monday";

export const schedulePresets: SchedulePreset[] = ["hour", "tomorrow", "monday"];

export const minimumLeadMinutes = 2;

const stableLocale = "en-US";
const stableZone = "UTC";

export function presetDate(preset: SchedulePreset, now: Date) {
  const result = new Date(now);
  result.setSeconds(0, 0);
  if (preset === "hour") {
    result.setMinutes(result.getMinutes() + 60);
    result.setMinutes(Math.ceil(result.getMinutes() / 5) * 5);
    return result;
  }
  result.setHours(9, 0, 0, 0);
  if (preset === "tomorrow") {
    result.setDate(result.getDate() + 1);
    return result;
  }
  const untilMonday = (8 - result.getDay()) % 7 || 7;
  result.setDate(result.getDate() + untilMonday);
  return result;
}

export function isSchedulable(date: Date, now: Date) {
  return date.getTime() - now.getTime() >= minimumLeadMinutes * 60 * 1000;
}

export function exactMoment(value: string | Date, mode: DateMode) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const locale = mode === "stable" ? stableLocale : undefined;
  const timeZone = mode === "stable" ? stableZone : undefined;
  const day = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone,
  }).format(date);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);
  return { iso: date.toISOString(), day, time, zone: zoneName(date, mode) };
}

function zonePart(date: Date, style: "long" | "shortOffset", mode: DateMode) {
  try {
    return (
      new Intl.DateTimeFormat(mode === "stable" ? stableLocale : undefined, {
        timeZoneName: style,
        timeZone: mode === "stable" ? stableZone : undefined,
      })
        .formatToParts(date)
        .find((part) => part.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}

export function zoneName(date: Date, mode: DateMode) {
  const name = zonePart(date, "long", mode);
  const offset = zonePart(date, "shortOffset", mode);
  if (name && offset && name !== offset) {
    return `${name}, ${offset}`;
  }
  return name || offset || stableZone;
}
