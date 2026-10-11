export const weekdays = [1, 2, 3, 4, 5, 6, 7] as const;

export type Weekday = (typeof weekdays)[number];

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function minutesToTime(minutes: number) {
  const clamped = Math.min(1439, Math.max(0, Math.round(minutes)));
  const hours = Math.floor(clamped / 60);
  const rest = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function timeToMinutes(value: string) {
  const match = timePattern.exec(value.trim());
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function timezoneLabel(zone: string) {
  return zone.replace(/_/g, " ");
}

export function timezoneOptions(current: string) {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  const all = new Set(["UTC", ...zones]);
  if (current) {
    all.add(current);
  }
  return [...all].map((zone) => ({ value: zone, label: timezoneLabel(zone) }));
}

export function parseDailyLimit(value: string, max: number) {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true as const, value: null };
  }
  if (!/^\d{1,6}$/.test(trimmed)) {
    return { ok: false as const };
  }
  const parsed = Number.parseInt(trimmed, 10);
  return parsed >= 1 && parsed <= max
    ? { ok: true as const, value: parsed }
    : { ok: false as const };
}
