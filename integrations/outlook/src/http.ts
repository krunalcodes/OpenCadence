import {
  type Credentials,
  type FetchLike,
  IntegrationError,
} from "@workspace/integration-core";

export type JsonObject = Record<string, unknown>;

export const immutableIdPreference = 'IdType="ImmutableId"';

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function request(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch (cause) {
    throw new IntegrationError(
      "temporary",
      "Microsoft could not be reached. Try again in a moment.",
      { cause },
    );
  }
}

export function graphGet(
  fetchImpl: FetchLike,
  url: string,
  accessToken: string,
  prefer: string[] = [],
): Promise<Response> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
  };
  if (prefer.length > 0) {
    headers.prefer = prefer.join(", ");
  }
  return request(fetchImpl, url, { method: "GET", headers });
}

export async function readJson(response: Response): Promise<JsonObject> {
  try {
    const parsed: unknown = JSON.parse(await response.text());
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function readText(
  response: Response,
  limit: number,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return (await response.text()).slice(0, limit);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done || !value) {
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  if (size >= limit) {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).subarray(0, limit).toString("utf8");
}

export function retryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.ceil(seconds));
  }
  const date = Date.parse(header);
  if (Number.isNaN(date)) {
    return undefined;
  }
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

export function normalizeScope(scope: string): string {
  return scope
    .trim()
    .replace(/^https:\/\/graph\.microsoft\.com\//i, "")
    .toLowerCase();
}

export function hasScope(scopes: string[], wanted: string): boolean {
  const target = normalizeScope(wanted);
  return scopes.some((scope) => normalizeScope(scope) === target);
}

export function requireAccessToken(credentials: Credentials): string {
  if (credentials.kind !== "oauth2") {
    throw new IntegrationError(
      "invalid_credentials",
      "Outlook needs a connected Microsoft account.",
    );
  }
  if (!credentials.accessToken) {
    throw new IntegrationError(
      "auth_expired",
      "The Microsoft access token is missing and must be refreshed.",
    );
  }
  return credentials.accessToken;
}
