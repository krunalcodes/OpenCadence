import "server-only";

import {
  type InboxFilters,
  isId,
  type ThreadResult,
  type ThreadsResult,
  threadPath,
  threadsQuery,
  toThreadDetail,
  toThreadsPage,
} from "@/features/inbox/lib/inbox";
import { apiRequest } from "@/lib/api-server";
import { type SourceChoice, toSourceChoices } from "@/lib/sources";

export async function getThreads(
  filters: InboxFilters,
): Promise<ThreadsResult> {
  const { status, data } = await apiRequest(
    `/inbox/threads?${threadsQuery(filters)}`,
  );
  const page = status === 200 ? toThreadsPage(data) : null;
  return page ? { state: "ready", ...page } : { state: "failed" };
}

export async function getThread(id: string): Promise<ThreadResult> {
  if (!isId(id)) {
    return { state: "missing" };
  }
  const { status, data } = await apiRequest(threadPath(id));
  if (status === 404 || status === 400) {
    return { state: "missing" };
  }
  const thread = status === 200 ? toThreadDetail(data) : null;
  return thread ? { state: "ready", thread } : { state: "failed" };
}

export async function getSources(): Promise<SourceChoice[]> {
  const { status, data } = await apiRequest("/sending-sources");
  return status === 200 ? toSourceChoices(data) : [];
}
