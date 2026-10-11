const maxRedirectLength = 512;

export function safeRedirect(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  if (value.length < 2 || value.length > maxRedirectLength) {
    return null;
  }
  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  if (value.includes("\\")) {
    return null;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      return null;
    }
  }
  return value;
}

export function withRedirect(path: string, redirect: string | null) {
  if (!redirect) {
    return path;
  }
  return `${path}?redirect=${encodeURIComponent(redirect)}`;
}

export const requestPathHeader = "x-opencadence-path";

const pendingRedirectKey = "opencadence:pending-redirect";
const pendingRedirectLifetime = 24 * 60 * 60 * 1000;

export function rememberPendingRedirect(redirect: string | null) {
  try {
    if (!redirect) {
      window.localStorage.removeItem(pendingRedirectKey);
      return;
    }
    window.localStorage.setItem(
      pendingRedirectKey,
      JSON.stringify({ path: redirect, savedAt: Date.now() }),
    );
  } catch {
    return;
  }
}

export function takePendingRedirect(): string | null {
  try {
    const raw = window.localStorage.getItem(pendingRedirectKey);
    if (!raw) {
      return null;
    }
    window.localStorage.removeItem(pendingRedirectKey);
    const saved: unknown = JSON.parse(raw);
    if (typeof saved !== "object" || saved === null) {
      return null;
    }
    const { path, savedAt } = saved as { path?: unknown; savedAt?: unknown };
    if (
      typeof savedAt !== "number" ||
      Date.now() - savedAt > pendingRedirectLifetime
    ) {
      return null;
    }
    return safeRedirect(path);
  } catch {
    return null;
  }
}
