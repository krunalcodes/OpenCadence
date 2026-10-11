import "server-only";

import { headers } from "next/headers";

const apiUrl = (process.env.API_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  "",
);

const tokenPattern = /^[A-Za-z0-9_-]{20,200}$/;
const listIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const maxListIds = 200;

export type PreferenceList = {
  id: string;
  name: string;
  description: string | null;
  subscribed: boolean;
};

export type Preferences = {
  email: string;
  brandName: string;
  lists: PreferenceList[];
  unsubscribedFromAll: boolean;
  contactFound: boolean;
};

export type PreferencesFailure = "invalid" | "busy" | "offline";

export type PreferencesResult =
  | { ok: true; preferences: Preferences }
  | { ok: false; reason: PreferencesFailure };

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: PreferencesFailure };

export function isToken(value: string) {
  return tokenPattern.test(value);
}

export function isListId(value: unknown): value is string {
  return typeof value === "string" && listIdPattern.test(value);
}

function failure(status: number): PreferencesFailure {
  if (status === 404 || status === 400) {
    return "invalid";
  }
  return status === 429 ? "busy" : "offline";
}

async function call(token: string, body?: object) {
  const forwarded = (await headers()).get("x-forwarded-for");
  try {
    const response = await fetch(`${apiUrl}/v1/public/preferences/${token}`, {
      method: body ? "POST" : "GET",
      headers: {
        ...(forwarded ? { "x-forwarded-for": forwarded } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data: unknown = await response.json().catch(() => null);
    return { status: response.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePreferences(data: unknown): Preferences | null {
  if (!isRecord(data) || typeof data.email !== "string") {
    return null;
  }
  const lists = Array.isArray(data.lists) ? data.lists : [];
  return {
    email: data.email,
    brandName: typeof data.brandName === "string" ? data.brandName : "",
    lists: lists.flatMap((item) => {
      if (!isRecord(item) || !isListId(item.id)) {
        return [];
      }
      return [
        {
          id: item.id,
          name: typeof item.name === "string" ? item.name : "",
          description:
            typeof item.description === "string" && item.description !== ""
              ? item.description
              : null,
          subscribed: item.subscribed === true,
        },
      ];
    }),
    unsubscribedFromAll: data.unsubscribedFromAll === true,
    contactFound: data.contactFound !== false,
  };
}

export async function readPreferences(
  token: string,
): Promise<PreferencesResult> {
  if (!isToken(token)) {
    return { ok: false, reason: "invalid" };
  }
  const response = await call(token);
  if (response.status !== 200) {
    return { ok: false, reason: failure(response.status) };
  }
  const preferences = parsePreferences(response.data);
  return preferences
    ? { ok: true, preferences }
    : { ok: false, reason: "offline" };
}

export async function savePreferences(
  token: string,
  input: { listIds: string[]; unsubscribeAll: boolean },
): Promise<SaveResult> {
  if (!isToken(token)) {
    return { ok: false, reason: "invalid" };
  }
  const response = await call(token, {
    listIds: input.listIds,
    ...(input.unsubscribeAll ? { unsubscribeAll: true } : {}),
  });
  return response.status === 200
    ? { ok: true }
    : { ok: false, reason: failure(response.status) };
}
