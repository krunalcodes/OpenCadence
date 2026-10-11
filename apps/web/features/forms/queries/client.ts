import {
  type Form,
  formPath,
  type SubmissionStatus,
  type SubmissionsPage,
  submissionsQuery,
  toForm,
  toSubmissionsPage,
} from "@/features/forms/lib/forms";
import {
  type ApiError,
  type ApiResult,
  isRow,
  malformed,
  type Row,
  request,
  rowsOf,
  textOrNull,
  toApiError,
} from "@/lib/api";

export type FormAction = "publish" | "unpublish" | "archive";

export type FormProblem = {
  code: string;
  field: string | null;
  message: string | null;
};

export type FormResponse =
  | { ok: true; data: Form }
  | { ok: false; error: ApiError; problems: FormProblem[] };

function toProblems(body: unknown, error: ApiError): FormProblem[] {
  if (error.code !== "form_not_ready") {
    return [];
  }
  const problems = rowsOf(isRow(body) ? body.problems : null).flatMap(
    (item) => {
      const code = textOrNull(item.code);
      return code
        ? [
            {
              code,
              field: textOrNull(item.field),
              message: textOrNull(item.message),
            },
          ]
        : [];
    },
  );
  return problems.length > 0
    ? problems
    : [{ code: error.code, field: error.field, message: error.message }];
}

async function send(
  method: "POST" | "PATCH",
  path: string,
  body?: Row,
): Promise<FormResponse> {
  try {
    const response = await fetch(`/api/v1${path}`, {
      method,
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = toApiError(response.status, data);
      return { ok: false, error, problems: toProblems(data, error) };
    }
    const form = toForm(data);
    return form
      ? { ok: true, data: form }
      : { ok: false, error: malformed, problems: [] };
  } catch {
    return { ok: false, error: toApiError(0, null), problems: [] };
  }
}

export async function createForm(name: string) {
  return send("POST", "/forms", { name });
}

export async function updateForm(id: string, changes: Row) {
  return send("PATCH", `/${formPath(id)}`, changes);
}

export async function runFormAction(id: string, action: FormAction) {
  return send("POST", `/${formPath(id)}/${action}`);
}

export async function deleteForm(id: string) {
  return request("DELETE", `/${formPath(id)}`);
}

export async function fetchSubmissions(
  id: string,
  status: SubmissionStatus | null,
  cursor: string | null,
): Promise<ApiResult<SubmissionsPage>> {
  const result = await request(
    "GET",
    `/${formPath(id)}/submissions?${submissionsQuery(status, cursor)}`,
  );
  if (!result.ok) {
    return result;
  }
  const page = toSubmissionsPage(result.data);
  return page ? { ok: true, data: page } : { ok: false, error: malformed };
}
