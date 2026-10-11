import { type FetchLike, IntegrationError } from "@workspace/integration-core";

export type JsonObject = Record<string, unknown>;

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
      "Google could not be reached. Try again in a moment.",
      { cause },
    );
  }
}

export async function readJson(response: Response): Promise<JsonObject> {
  try {
    const parsed: unknown = JSON.parse(await response.text());
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
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
