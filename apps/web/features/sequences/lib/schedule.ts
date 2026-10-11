export const weekdays = [1, 2, 3, 4, 5, 6, 7] as const;

export type Weekday = (typeof weekdays)[number];

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
