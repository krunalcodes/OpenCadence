export type HourCycle = "h12" | "h23";

export const minutesPerDay = 1440;

type DatePart = "day" | "month" | "year";

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const clockPattern = /^(\d{2}):(\d{2})$/;
const fallbackOrder: DatePart[] = ["day", "month", "year"];
const englishLocale = "en-US";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(
  locale: string | undefined,
  key: string,
  options: Intl.DateTimeFormatOptions,
) {
  const id = `${locale ?? ""}|${key}`;
  let found = formatters.get(id);
  if (!found) {
    found = new Intl.DateTimeFormat(locale, options);
    formatters.set(id, found);
  }
  return found;
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function localDay(year: number, month: number, day: number): Date | null {
  const result = new Date(2000, 0, 1, 0, 0, 0, 0);
  result.setFullYear(year, month - 1, day);
  if (
    Number.isNaN(result.getTime()) ||
    result.getFullYear() !== year ||
    result.getMonth() !== month - 1 ||
    result.getDate() !== day
  ) {
    return null;
  }
  return result;
}

export function toIsoDate(date: Date) {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseIsoDate(value: string | null | undefined): Date | null {
  const match = value ? isoDatePattern.exec(value) : null;
  if (!match) {
    return null;
  }
  return localDay(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function formatIsoDate(value: string, locale?: string) {
  const date = parseIsoDate(value);
  if (!date) {
    return value;
  }
  return formatter(locale, "date", { dateStyle: "medium" }).format(date);
}

export function numericDate(value: string, locale?: string) {
  const date = parseIsoDate(value);
  if (!date) {
    return value;
  }
  return formatter(locale, "numeric", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function firstWeekday(locale: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  try {
    const resolved = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay?: number };
      weekInfo?: { firstDay?: number };
    };
    const first = (resolved.getWeekInfo?.() ?? resolved.weekInfo)?.firstDay;
    if (typeof first === "number" && first >= 1 && first <= 7) {
      return (first % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    }
  } catch {
    return 1;
  }
  return 1;
}

function dateOrder(locale?: string): DatePart[] {
  try {
    const order = formatter(locale, "numeric", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
      .formatToParts(new Date(2000, 0, 1))
      .map((part) => part.type)
      .filter(
        (type): type is DatePart =>
          type === "day" || type === "month" || type === "year",
      );
    return order.length === 3 ? order : fallbackOrder;
  } catch {
    return fallbackOrder;
  }
}

function monthWords(locale?: string) {
  const words: string[][] = [];
  for (let month = 0; month < 12; month += 1) {
    const sample = new Date(2000, month, 1);
    const names = new Set<string>();
    for (const language of [locale, englishLocale]) {
      for (const style of ["long", "short"] as const) {
        try {
          const name = formatter(language, `month-${style}`, { month: style })
            .format(sample)
            .toLocaleLowerCase(language)
            .replace(/\./g, "");
          if (name !== "" && !/^\d+$/.test(name)) {
            names.add(name);
          }
        } catch {}
      }
    }
    words.push([...names]);
  }
  return words;
}

function monthOf(token: string, words: string[][]) {
  const exact = words.findIndex((names) => names.includes(token));
  if (exact !== -1) {
    return exact + 1;
  }
  if (token.length < 3) {
    return null;
  }
  const partial = words
    .map((names, index) =>
      names.some((name) => name.startsWith(token)) ? index + 1 : null,
    )
    .filter((month): month is number => month !== null);
  return partial.length === 1 ? (partial[0] ?? null) : null;
}

function yearOf(token: string) {
  if (token.length === 4) {
    return Number(token);
  }
  if (token.length <= 2) {
    return 2000 + Number(token);
  }
  return null;
}

export function parseTypedDate(
  input: string,
  locale?: string,
  today: Date = new Date(),
): string | null {
  const text = input
    .trim()
    .toLocaleLowerCase(locale)
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1");
  const tokens = text.split(/[\s,./-]+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 3) {
    return null;
  }

  const words = monthWords(locale);
  const numbers: string[] = [];
  let month: number | null = null;
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      numbers.push(token);
      continue;
    }
    const found = monthOf(token, words);
    if (found === null || month !== null) {
      return null;
    }
    month = found;
  }

  let year: number | null = today.getFullYear();
  let day: number | null = null;

  if (month !== null) {
    const [first, second] = numbers;
    if (first === undefined) {
      return null;
    }
    if (second === undefined) {
      day = Number(first);
    } else if (first.length === 4) {
      year = Number(first);
      day = Number(second);
    } else if (second.length === 4) {
      day = Number(first);
      year = Number(second);
    } else {
      const order = dateOrder(locale);
      const dayFirst = order.indexOf("day") < order.indexOf("year");
      day = Number(dayFirst ? first : second);
      year = yearOf(dayFirst ? second : first);
    }
  } else {
    const [first, second, third] = numbers;
    if (first === undefined || second === undefined) {
      return null;
    }
    const order =
      first.length === 4
        ? (["year", "month", "day"] satisfies DatePart[])
        : dateOrder(locale);
    const parts = order.filter(
      (part) => third !== undefined || part !== "year",
    );
    const values: Partial<Record<DatePart, string>> = {};
    [first, second, third].forEach((value, index) => {
      const part = parts[index];
      if (part && value !== undefined) {
        values[part] = value;
      }
    });
    if (values.day === undefined || values.month === undefined) {
      return null;
    }
    day = Number(values.day);
    month = Number(values.month);
    if (values.year !== undefined) {
      year = yearOf(values.year);
    }
  }

  if (year === null || day === null || year < 1000) {
    return null;
  }
  const result = localDay(year, month, day);
  return result ? toIsoDate(result) : null;
}

export function minutesToTime(minutes: number) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function timeToMinutes(value: string | null | undefined): number | null {
  const match = value ? clockPattern.exec(value) : null;
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const total = hours * 60 + minutes;
  if (minutes > 59 || total > minutesPerDay) {
    return null;
  }
  return total;
}

export function localeHourCycle(locale?: string): HourCycle {
  try {
    const cycle = formatter(locale, "cycle", {
      hour: "numeric",
    }).resolvedOptions().hourCycle;
    return cycle === "h11" || cycle === "h12" ? "h12" : "h23";
  } catch {
    return "h23";
  }
}

export function formatMinutes(
  minutes: number,
  cycle: HourCycle,
  locale?: string,
) {
  if (minutes >= minutesPerDay) {
    return minutesToTime(minutesPerDay);
  }
  const sample = new Date(
    Date.UTC(2000, 0, 1, Math.floor(minutes / 60), minutes % 60),
  );
  try {
    return cycle === "h12"
      ? formatter(locale, "time-h12", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "UTC",
        }).format(sample)
      : formatter(locale, "time-h23", {
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
          timeZone: "UTC",
        }).format(sample);
  } catch {
    return minutesToTime(minutes);
  }
}

function dayPeriod(hour: number, locale?: string) {
  try {
    return (
      formatter(locale, "period", {
        hour: "numeric",
        hour12: true,
        timeZone: "UTC",
      })
        .formatToParts(new Date(Date.UTC(2000, 0, 1, hour)))
        .find((part) => part.type === "dayPeriod")
        ?.value.toLocaleLowerCase(locale)
        .replace(/[\s.]/g, "") ?? ""
    );
  } catch {
    return "";
  }
}

export function parseTypedTime(
  input: string,
  cycle: HourCycle,
  locale?: string,
): number[] {
  let text = input
    .trim()
    .toLocaleLowerCase(locale)
    .replace(/[\s.]+$/g, "");
  if (text === "") {
    return [];
  }

  let half: "am" | "pm" | null = null;
  const periods: ["am" | "pm", string][] = [
    ["am", dayPeriod(9, locale)],
    ["pm", dayPeriod(21, locale)],
  ];
  const compact = text.replace(/[\s.]/g, "");
  for (const [name, word] of periods) {
    if (word !== "" && !/^\d/.test(word) && compact.endsWith(word)) {
      half = name;
      text = compact.slice(0, compact.length - word.length);
    }
  }
  if (half === null) {
    const english = /^(.*\d)\s*([ap])\.?\s*(m\.?)?$/.exec(text);
    if (english) {
      half = english[2] === "a" ? "am" : "pm";
      text = english[1] ?? "";
    }
  }

  const match =
    /^(\d{1,2})(?:\s*[:.h\s]\s*(\d{2}))?$/.exec(text.trim()) ??
    /^(\d{1,2})(\d{2})$/.exec(text.trim());
  if (!match) {
    return [];
  }
  const hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  if (minutes > 59) {
    return [];
  }

  if (half !== null) {
    if (hours < 1 || hours > 12) {
      return [];
    }
    return [((hours % 12) + (half === "pm" ? 12 : 0)) * 60 + minutes];
  }
  if (hours > 24 || (hours === 24 && minutes > 0)) {
    return [];
  }
  const literal = hours * 60 + minutes;
  if (cycle === "h12" && hours >= 1 && hours <= 12) {
    const morning = (hours % 12) * 60 + minutes;
    return [morning, morning + 12 * 60];
  }
  return [literal];
}

export function splitInstant(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { date: null, time: null };
  }
  return {
    date: toIsoDate(date),
    time: date.getHours() * 60 + date.getMinutes(),
  };
}

export function joinInstant(
  date: string | null,
  time: number | null,
): string | null {
  const day = parseIsoDate(date);
  if (!day || time === null || time < 0 || time >= minutesPerDay) {
    return null;
  }
  const hours = Math.floor(time / 60);
  const minutes = time % 60;
  const result = new Date(day);
  result.setHours(hours, minutes, 0, 0);
  if (
    Number.isNaN(result.getTime()) ||
    result.getHours() !== hours ||
    result.getMinutes() !== minutes ||
    toIsoDate(result) !== date
  ) {
    return null;
  }
  return result.toISOString();
}

function zonePart(date: Date, style: "long" | "shortOffset", locale?: string) {
  try {
    return (
      new Intl.DateTimeFormat(locale, { timeZoneName: style })
        .formatToParts(date)
        .find((part) => part.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}

export function zoneName(date: Date, locale?: string) {
  const name = zonePart(date, "long", locale);
  const offset = zonePart(date, "shortOffset", locale);
  if (name && offset && name !== offset) {
    return `${name}, ${offset}`;
  }
  return name || offset;
}

export function zoneId() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}
