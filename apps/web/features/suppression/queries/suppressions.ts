import "server-only";

import {
  type SuppressionFilters,
  type SuppressionsResult,
  suppressionsQuery,
  toSuppressionsPage,
} from "@/features/suppression/lib/suppressions";
import { apiRequest } from "@/lib/api-server";

export async function getSuppressions(
  filters: SuppressionFilters,
): Promise<SuppressionsResult> {
  const { status, data } = await apiRequest(
    `/suppressions?${suppressionsQuery(filters)}`,
  );
  const page = status === 200 ? toSuppressionsPage(data) : null;
  return page ? { state: "ready", ...page } : { state: "failed" };
}
