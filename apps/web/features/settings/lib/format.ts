const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function parse(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

export function formatDate(value: string) {
  const time = parse(value);
  return time === null ? null : dateFormat.format(time);
}

export function formatLastActive(value: string, now = Date.now()) {
  const time = parse(value);
  if (time === null) {
    return null;
  }
  const seconds = Math.max(0, (now - time) / 1000);
  if (seconds < 60) {
    return "Just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return relativeFormat.format(-minutes, "minute");
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return relativeFormat.format(-hours, "hour");
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return relativeFormat.format(-days, "day");
  }
  return dateFormat.format(time);
}

const methodNames: Record<string, string> = {
  email: "email and password",
  google: "Google",
};

export function describeLoginMethod(method: string | null | undefined) {
  if (!method) {
    return null;
  }
  return methodNames[method] ?? null;
}
