export type ApiError = {
  status: number;
  code: string;
  message: string | null;
  field: string | null;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export type Row = Record<string, unknown>;

export function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function rowsOf(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRow) : [];
}

export function textOrNull(value: unknown) {
  return typeof value === "string" && value !== "" ? value : null;
}

export function textsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && item !== "",
      )
    : [];
}

export function countOf(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function toApiError(status: number, body: unknown): ApiError {
  const row = isRow(body) ? body : {};
  return {
    status,
    code: textOrNull(row.code) ?? "",
    message: textOrNull(row.message),
    field: textOrNull(row.field),
  };
}

export const malformed: ApiError = {
  status: 200,
  code: "",
  message: null,
  field: null,
};

export async function request(
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
