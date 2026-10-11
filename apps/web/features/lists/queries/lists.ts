import "server-only";

import { type ListsResult, toLists } from "@/features/lists/lib/lists";
import { apiRequest } from "@/lib/api-server";

export async function getLists(): Promise<ListsResult> {
  const { status, data } = await apiRequest("/lists");
  const lists = status === 200 ? toLists(data) : null;
  return lists ? { state: "ready", lists } : { state: "failed" };
}
