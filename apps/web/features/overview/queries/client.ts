import {
  type Overview,
  type OverviewRangeId,
  overviewQuery,
  toOverview,
} from "@/features/overview/lib/overview";
import { type ApiResult, malformed, request } from "@/lib/api";

export async function fetchOverview(
  range: OverviewRangeId,
  timezone: string,
): Promise<ApiResult<Overview>> {
  const result = await request(
    "GET",
    `/overview?${overviewQuery(range, timezone)}`,
  );
  if (!result.ok) {
    return result;
  }
  const overview = toOverview(result.data);
  return overview
    ? { ok: true, data: overview }
    : { ok: false, error: malformed };
}
