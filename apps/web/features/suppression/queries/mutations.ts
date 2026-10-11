import {
  type AddReason,
  type AddResult,
  type SuppressionFilters,
  type SuppressionsPage,
  suppressionsQuery,
  toAddResult,
  toSuppressionsPage,
} from "@/features/suppression/lib/suppressions";
import { type ApiResult, malformed, request } from "@/lib/api";

export async function fetchSuppressions(
  filters: SuppressionFilters,
  cursor: string,
): Promise<ApiResult<SuppressionsPage>> {
  const result = await request(
    "GET",
    `/suppressions?${suppressionsQuery(filters, cursor)}`,
  );
  if (!result.ok) {
    return result;
  }
  const page = toSuppressionsPage(result.data);
  return page ? { ok: true, data: page } : { ok: false, error: malformed };
}

export async function addSuppressions(input: {
  emails: string[];
  reason: AddReason;
  note?: string;
}): Promise<ApiResult<AddResult>> {
  const result = await request("POST", "/suppressions", input);
  if (!result.ok) {
    return result;
  }
  const added = toAddResult(result.data);
  return added ? { ok: true, data: added } : { ok: false, error: malformed };
}

export async function removeSuppression(id: string) {
  return request("DELETE", `/suppressions/${encodeURIComponent(id)}`);
}
