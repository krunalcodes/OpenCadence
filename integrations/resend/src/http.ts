import {
  type Credentials,
  IntegrationError,
} from "@workspace/integration-core";
import type { ResolvedResendConfig } from "./config";
import { toResendError, unreachableError } from "./errors";

export type ResendRequest = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export type ResendResponse = {
  status: number;
  body: unknown;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export function apiKeyFrom(credentials: Credentials) {
  if (credentials.kind !== "api_key" || !credentials.apiKey) {
    throw new IntegrationError(
      "invalid_credentials",
      "Resend needs an API key.",
    );
  }
  return credentials.apiKey;
}

function parseJson(text: string): unknown {
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function resendRequest(
  config: ResolvedResendConfig,
  apiKey: string,
  request: ResendRequest,
): Promise<ResendResponse> {
  const hasBody = request.body !== undefined;
  const headers: Record<string, string> = {
    ...request.headers,
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": config.userAgent,
  };
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  let text: string;
  try {
    response = await config.fetch(`${config.baseUrl}${request.path}`, {
      method: request.method,
      headers,
      body: hasBody ? JSON.stringify(request.body) : undefined,
    });
    text = await response.text();
  } catch (cause) {
    throw unreachableError(cause);
  }

  const body = parseJson(text);
  if (!response.ok) {
    const error = isRecord(body) ? body : {};
    throw toResendError({
      status: response.status,
      name: optionalString(error.name),
      message: optionalString(error.message)?.replaceAll(apiKey, "[redacted]"),
      retryAfter: response.headers.get("retry-after"),
    });
  }
  return { status: response.status, body };
}
