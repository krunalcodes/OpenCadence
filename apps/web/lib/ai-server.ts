import "server-only";

import { cache } from "react";
import { type AiSettings, parseAiSettings } from "@/lib/ai";
import { apiRequest } from "@/lib/api-server";

export const loadAiSettings = cache(async (): Promise<AiSettings | null> => {
  const { status, data } = await apiRequest("/ai/settings");
  return status === 200 ? parseAiSettings(data) : null;
});
