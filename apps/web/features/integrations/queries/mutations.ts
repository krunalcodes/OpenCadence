import {
  type EventFilters,
  type EventsPage,
  eventsQuery,
  type SendingSource,
  toEventsPage,
  toSource,
} from "@/features/integrations/lib/sources";

export type ApiError = {
  status: number;
  code: string;
  message: string | null;
  field: string | null;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export type TestResult = {
  ok: boolean;
  source: SendingSource | null;
  error: ApiError | null;
};

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value !== "" ? value : null;
}

function toApiError(status: number, body: unknown): ApiError {
  const row = isRow(body) ? body : {};
  return {
    status,
    code: textOrNull(row.code) ?? "",
    message: textOrNull(row.message),
    field: textOrNull(row.field),
  };
}

const malformed: ApiError = {
  status: 200,
  code: "",
  message: null,
  field: null,
};

async function request(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: Row,
): Promise<ApiResult<unknown>> {
  try {
    const response = await fetch(`/api/v1${path}`, {
      method,
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data: unknown =
      response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false, error: toApiError(response.status, data) };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: toApiError(0, null) };
  }
}

function asSource(result: ApiResult<unknown>): ApiResult<SendingSource> {
  if (!result.ok) {
    return result;
  }
  const source = toSource(result.data);
  return source ? { ok: true, data: source } : { ok: false, error: malformed };
}

function sourcePath(id: string, suffix = "") {
  return `/sending-sources/${encodeURIComponent(id)}${suffix}`;
}

export async function connectResend(input: { name: string; apiKey: string }) {
  return asSource(await request("POST", "/sending-sources/resend", input));
}

export async function authorizeGmail(input: {
  dailySendLimit?: number;
}): Promise<ApiResult<{ url: string }>> {
  const result = await request(
    "POST",
    "/sending-sources/gmail/authorize",
    input,
  );
  if (!result.ok) {
    return result;
  }
  const url = isRow(result.data) ? textOrNull(result.data.url) : null;
  return url ? { ok: true, data: { url } } : { ok: false, error: malformed };
}

export async function updateSource(
  id: string,
  input: { name?: string; dailySendLimit?: number | null; paused?: boolean },
) {
  return asSource(await request("PATCH", sourcePath(id), input));
}

export async function testSource(id: string): Promise<ApiResult<TestResult>> {
  const result = await request("POST", sourcePath(id, "/test"));
  if (!result.ok) {
    return result;
  }
  if (!isRow(result.data)) {
    return { ok: false, error: malformed };
  }
  return {
    ok: true,
    data: {
      ok: result.data.ok === true,
      source: toSource(result.data.source),
      error: isRow(result.data.error)
        ? toApiError(200, result.data.error)
        : null,
    },
  };
}

export async function sendTestEmail(
  id: string,
  input: { to: string; from?: string },
) {
  return request("POST", sourcePath(id, "/test-email"), input);
}

export async function disconnectSource(id: string) {
  return request("DELETE", sourcePath(id));
}

export async function fetchEvents(
  filters: EventFilters,
  cursor: string,
): Promise<ApiResult<EventsPage>> {
  const result = await request(
    "GET",
    `/sending-sources/events?${eventsQuery(filters, cursor)}`,
  );
  if (!result.ok) {
    return result;
  }
  const page = toEventsPage(result.data);
  return page ? { ok: true, data: page } : { ok: false, error: malformed };
}
