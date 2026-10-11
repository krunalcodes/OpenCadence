import "server-only";

import { headers } from "next/headers";

const apiUrl = (process.env.API_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  "",
);

const tokenPattern = /^[A-Za-z0-9_-]{20,200}$/;

export type UnsubscribeScope = "list" | "all";

export type UnsubscribeDetails = {
  email: string;
  brandName: string;
  listName: string | null;
  alreadyUnsubscribed: boolean;
};

export type UnsubscribeFailure = "invalid" | "busy" | "offline";

export type DetailsResult =
  | { ok: true; details: UnsubscribeDetails }
  | { ok: false; reason: UnsubscribeFailure };

export type ActionResult =
  | { ok: true }
  | { ok: false; reason: UnsubscribeFailure };

export function isToken(value: string) {
  return tokenPattern.test(value);
}

function failure(status: number): UnsubscribeFailure {
  if (status === 404 || status === 400) {
    return "invalid";
  }
  return status === 429 ? "busy" : "offline";
}

async function call(
  path: string,
  init: { method: "GET" | "POST"; body?: object },
) {
  const forwarded = (await headers()).get("x-forwarded-for");
  try {
    const response = await fetch(`${apiUrl}/v1/t/u/${path}`, {
      method: init.method,
      headers: {
        ...(forwarded ? { "x-forwarded-for": forwarded } : {}),
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const data: unknown = await response.json().catch(() => null);
    return { status: response.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

function parseDetails(data: unknown): UnsubscribeDetails | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (typeof record.email !== "string") {
    return null;
  }
  return {
    email: record.email,
    brandName: typeof record.brandName === "string" ? record.brandName : "",
    listName: typeof record.listName === "string" ? record.listName : null,
    alreadyUnsubscribed: record.alreadyUnsubscribed === true,
  };
}

export async function readDetails(token: string): Promise<DetailsResult> {
  if (!isToken(token)) {
    return { ok: false, reason: "invalid" };
  }
  const response = await call(`${token}/details`, { method: "GET" });
  if (response.status !== 200) {
    return { ok: false, reason: failure(response.status) };
  }
  const details = parseDetails(response.data);
  return details ? { ok: true, details } : { ok: false, reason: "offline" };
}

export async function confirmUnsubscribe(
  token: string,
  scope: UnsubscribeScope,
): Promise<ActionResult> {
  if (!isToken(token)) {
    return { ok: false, reason: "invalid" };
  }
  const response = await call(`${token}/confirm`, {
    method: "POST",
    body: { scope },
  });
  return response.status === 200
    ? { ok: true }
    : { ok: false, reason: failure(response.status) };
}

export async function undoUnsubscribe(token: string): Promise<ActionResult> {
  if (!isToken(token)) {
    return { ok: false, reason: "invalid" };
  }
  const response = await call(`${token}/resubscribe`, { method: "POST" });
  return response.status === 200
    ? { ok: true }
    : { ok: false, reason: failure(response.status) };
}
