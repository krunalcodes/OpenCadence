export type DeviceKind = "desktop" | "phone" | "tablet" | "unknown";

export type DeviceInfo = {
  browser: string | null;
  system: string | null;
  kind: DeviceKind;
};

const browsers: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const systems: [RegExp, string][] = [
  [/iPhone|iPod/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

function deviceKind(userAgent: string): DeviceKind {
  if (/iPad|Tablet/.test(userAgent)) {
    return "tablet";
  }
  if (/Android/.test(userAgent)) {
    return /Mobile/.test(userAgent) ? "phone" : "tablet";
  }
  if (/iPhone|iPod|Mobile/.test(userAgent)) {
    return "phone";
  }
  return "desktop";
}

export function parseUserAgent(
  userAgent: string | null | undefined,
): DeviceInfo {
  const value = userAgent?.trim() ?? "";
  const browser = browsers.find(([pattern]) => pattern.test(value))?.[1];
  const system = systems.find(([pattern]) => pattern.test(value))?.[1];
  return {
    browser: browser ?? null,
    system: system ?? null,
    kind: browser || system ? deviceKind(value) : "unknown",
  };
}

export function describeDevice(info: DeviceInfo) {
  if (info.browser && info.system) {
    return `${info.browser} on ${info.system}`;
  }
  return info.browser ?? info.system ?? "Unknown device";
}
