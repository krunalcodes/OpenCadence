import "server-only";

import { toOverview, type WarmupResult } from "@/features/warmup/lib/warmup";
import { apiRequest } from "@/lib/api-server";

export async function getWarmup(): Promise<WarmupResult> {
  const { status, data } = await apiRequest("/warmup");
  const overview = status === 200 ? toOverview(data) : null;
  return overview ? { state: "ready", ...overview } : { state: "failed" };
}
