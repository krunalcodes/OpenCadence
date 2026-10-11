import "server-only";

import {
  type OverviewRangeId,
  type OverviewResult,
  overviewQuery,
  toOverview,
} from "@/features/overview/lib/overview";
import { apiRequest } from "@/lib/api-server";

export async function getOverview(
  range: OverviewRangeId,
  timezone: string,
): Promise<OverviewResult> {
  const { status, data } = await apiRequest(
    `/overview?${overviewQuery(range, timezone)}`,
  );
  const overview = status === 200 ? toOverview(data) : null;
  return overview ? { state: "ready", overview } : { state: "failed" };
}
