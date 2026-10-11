import {
  dayMs,
  minSendGapMs,
  planningEndsAtUtcHour,
  randomizeSpread,
  realSendingCap,
  type WarmupRandom,
} from "./warmup.constants";

export type RampSettings = {
  startPerDay: number;
  incrementPerDay: number;
  maxPerDay: number;
};

export type PoolMember = { sourceId: string; domain: string };

export function utcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function dayStart(day: string) {
  return new Date(`${day}T00:00:00.000Z`);
}

export function addDays(day: string, count: number) {
  return utcDay(new Date(dayStart(day).getTime() + count * dayMs));
}

export function daysBetween(fromDay: string, toDay: string) {
  return Math.round(
    (dayStart(toDay).getTime() - dayStart(fromDay).getTime()) / dayMs,
  );
}

export function lastDays(today: string, count: number) {
  return Array.from({ length: count }, (_, index) =>
    addDays(today, index - count + 1),
  );
}

export function randomInt(random: WarmupRandom, min: number, max: number) {
  if (max <= min) {
    return min;
  }
  const value = Math.min(Math.max(random(), 0), 0.9999999999);
  return min + Math.floor(value * (max - min + 1));
}

export function rampDay(startedOn: string, holdDays: number, today: string) {
  return Math.max(1, daysBetween(startedOn, today) - holdDays + 1);
}

export function rampTarget(settings: RampSettings, day: number) {
  const grown =
    settings.startPerDay + (Math.max(day, 1) - 1) * settings.incrementPerDay;
  return Math.max(1, Math.min(grown, settings.maxPerDay));
}

export function randomizedTarget(target: number, random: WarmupRandom) {
  return randomInt(random, Math.max(1, target - randomizeSpread), target);
}

export function capForRealSending(target: number, realSentToday: number) {
  return realSentToday > 0 ? Math.min(target, realSendingCap) : target;
}

export function isSendingDay(date: Date, weekdaysOnly: boolean) {
  const weekday = date.getUTCDay();
  return !weekdaysOnly || (weekday !== 0 && weekday !== 6);
}

export function planningWindowEnd(now: Date) {
  const end = startOfUtcDay(now);
  end.setUTCHours(planningEndsAtUtcHour);
  return end;
}

export function spreadSendTimes(
  count: number,
  from: Date,
  until: Date,
  random: WarmupRandom,
  minGapMs = minSendGapMs,
) {
  const windowMs = until.getTime() - from.getTime();
  if (count <= 0 || windowMs <= 0) {
    return [];
  }
  const fitting = Math.min(count, Math.floor(windowMs / minGapMs) + 1);
  const slackMs = windowMs - (fitting - 1) * minGapMs;
  const offsets = Array.from({ length: fitting }, () =>
    Math.floor(Math.min(Math.max(random(), 0), 1) * slackMs),
  ).sort((a, b) => a - b);
  return offsets.map(
    (offset, index) => new Date(from.getTime() + offset + index * minGapMs),
  );
}

export function eligiblePartners<T extends PoolMember>(
  sender: PoolMember,
  pool: T[],
) {
  return pool.filter(
    (member) =>
      member.sourceId !== sender.sourceId && member.domain !== sender.domain,
  );
}

export function choosePartner<T extends PoolMember>(
  sender: PoolMember,
  pool: T[],
  random: WarmupRandom,
): T | null {
  const candidates = eligiblePartners(sender, pool);
  if (candidates.length === 0) {
    return null;
  }
  return candidates[randomInt(random, 0, candidates.length - 1)] ?? null;
}

export function replyIsPlanned(replyRate: number, random: WarmupRandom) {
  return random() * 100 < replyRate;
}

export function emailDomain(email: string | null) {
  const domain = email?.split("@")[1]?.trim().toLowerCase();
  return domain ? domain : null;
}
