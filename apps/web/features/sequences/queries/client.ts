import type { FromDraftStep } from "@/features/sequences/lib/ai";
import {
  type Enrollment,
  type EnrollmentAction,
  type EnrollmentDetail,
  type EnrollmentFilters,
  type EnrollmentsPage,
  type EnrollResult,
  enrollmentsQuery,
  toEnrollment,
  toEnrollmentDetail,
  toEnrollmentsPage,
  toEnrollResult,
} from "@/features/sequences/lib/enrollments";
import {
  type Check,
  type Layout,
  type Sequence,
  type SequenceFilters,
  type SequenceSettings,
  type SequencesPage,
  sequencePath,
  sequencesQuery,
  toCheck,
  toSequence,
  toSequencesPage,
} from "@/features/sequences/lib/sequences";
import type { StepInput } from "@/features/sequences/lib/steps";
import { type ApiResult, isRow, malformed, type Row, request } from "@/lib/api";
import type { Audience } from "@/lib/audience";

function toSequenceResult(result: ApiResult<unknown>): ApiResult<Sequence> {
  if (!result.ok) {
    return result;
  }
  const sequence = toSequence(result.data);
  return sequence
    ? { ok: true, data: sequence }
    : { ok: false, error: malformed };
}

function toEnrollmentResult(result: ApiResult<unknown>): ApiResult<Enrollment> {
  if (!result.ok) {
    return result;
  }
  const enrollment = toEnrollment(result.data);
  return enrollment
    ? { ok: true, data: enrollment }
    : { ok: false, error: malformed };
}

export async function fetchSequences(
  filters: SequenceFilters,
  cursor: string,
): Promise<ApiResult<SequencesPage>> {
  const result = await request(
    "GET",
    `/sequences?${sequencesQuery(filters, cursor)}`,
  );
  if (!result.ok) {
    return result;
  }
  const page = toSequencesPage(result.data);
  return page ? { ok: true, data: page } : { ok: false, error: malformed };
}

export async function fetchSequence(id: string) {
  return toSequenceResult(await request("GET", `/${sequencePath(id)}`));
}

export async function createSequence(name: string, timezone: string | null) {
  const zoned = timezone
    ? await request("POST", "/sequences", { name, timezone })
    : null;
  if (zoned && (zoned.ok || zoned.error.field !== "timezone")) {
    return toSequenceResult(zoned);
  }
  return toSequenceResult(await request("POST", "/sequences", { name }));
}

export async function createSequenceFromDraft(
  name: string,
  steps: FromDraftStep[],
) {
  return toSequenceResult(
    await request("POST", "/sequences/from-draft", { name, steps }),
  );
}

export async function updateSequence(
  id: string,
  patch: Partial<SequenceSettings> & { layout?: Layout | null },
) {
  return toSequenceResult(
    await request("PATCH", `/${sequencePath(id)}`, patch as Row),
  );
}

export async function duplicateSequence(id: string) {
  return toSequenceResult(
    await request("POST", `/${sequencePath(id)}/duplicate`),
  );
}

export async function deleteSequence(id: string) {
  return request("DELETE", `/${sequencePath(id)}`);
}

export async function saveSteps(id: string, steps: StepInput[]) {
  return toSequenceResult(
    await request("PUT", `/${sequencePath(id)}/steps`, { steps }),
  );
}

export async function changeSequenceStatus(
  id: string,
  action: "activate" | "pause" | "archive",
) {
  return toSequenceResult(
    await request("POST", `/${sequencePath(id)}/${action}`),
  );
}

export async function checkSequence(id: string): Promise<ApiResult<Check>> {
  const result = await request("GET", `/${sequencePath(id)}/check`);
  if (!result.ok) {
    return result;
  }
  const check = toCheck(result.data);
  return check ? { ok: true, data: check } : { ok: false, error: malformed };
}

export async function fetchEnrollments(
  id: string,
  filters: EnrollmentFilters,
  cursor?: string | null,
): Promise<ApiResult<EnrollmentsPage>> {
  const result = await request(
    "GET",
    `/${sequencePath(id)}/enrollments?${enrollmentsQuery(filters, cursor)}`,
  );
  if (!result.ok) {
    return result;
  }
  const page = toEnrollmentsPage(result.data);
  return page ? { ok: true, data: page } : { ok: false, error: malformed };
}

export async function fetchEnrollment(
  id: string,
  enrollmentId: string,
): Promise<ApiResult<EnrollmentDetail>> {
  const result = await request(
    "GET",
    `/${sequencePath(id)}/enrollments/${encodeURIComponent(enrollmentId)}`,
  );
  if (!result.ok) {
    return result;
  }
  const detail = toEnrollmentDetail(result.data);
  return detail ? { ok: true, data: detail } : { ok: false, error: malformed };
}

export async function enrollAudience(
  id: string,
  audience: Audience,
): Promise<ApiResult<EnrollResult>> {
  const result = await request("POST", `/${sequencePath(id)}/enrollments`, {
    audience,
  });
  if (!result.ok) {
    return result;
  }
  const enrolled = toEnrollResult(result.data);
  return enrolled
    ? { ok: true, data: enrolled }
    : { ok: false, error: malformed };
}

export async function changeEnrollment(
  id: string,
  enrollmentId: string,
  action: EnrollmentAction,
) {
  return toEnrollmentResult(
    await request(
      "POST",
      `/${sequencePath(id)}/enrollments/${encodeURIComponent(enrollmentId)}/${action}`,
    ),
  );
}

export async function fetchTemplateHtml(
  templateId: string,
): Promise<ApiResult<{ html: string; subject: string }>> {
  const result = await request(
    "GET",
    `/templates/${encodeURIComponent(templateId)}`,
  );
  if (!result.ok) {
    return result;
  }
  return isRow(result.data) && typeof result.data.html === "string"
    ? {
        ok: true,
        data: {
          html: result.data.html,
          subject:
            typeof result.data.subject === "string" ? result.data.subject : "",
        },
      }
    : { ok: false, error: malformed };
}
