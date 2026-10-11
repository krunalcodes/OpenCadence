import {
  type InboxFilters,
  type InboxMessage,
  type Thread,
  type ThreadDetail,
  type ThreadsPage,
  threadPath,
  threadsQuery,
  toMessage,
  toThread,
  toThreadDetail,
  toThreadsPage,
} from "@/features/inbox/lib/inbox";
import { type ApiResult, malformed, request } from "@/lib/api";

function parsed<T>(
  result: ApiResult<unknown>,
  parse: (value: unknown) => T | null,
): ApiResult<T> {
  if (!result.ok) {
    return result;
  }
  const data = parse(result.data);
  return data === null ? { ok: false, error: malformed } : { ok: true, data };
}

export async function fetchThreads(
  filters: InboxFilters,
  cursor?: string | null,
): Promise<ApiResult<ThreadsPage>> {
  return parsed(
    await request("GET", `/inbox/threads?${threadsQuery(filters, cursor)}`),
    toThreadsPage,
  );
}

export async function fetchThread(
  id: string,
): Promise<ApiResult<ThreadDetail>> {
  return parsed(await request("GET", threadPath(id)), toThreadDetail);
}

export type ThreadAction = "read" | "unread" | "close" | "reopen";

export async function updateThread(
  id: string,
  action: ThreadAction,
): Promise<ApiResult<Thread>> {
  return parsed(await request("POST", `${threadPath(id)}/${action}`), toThread);
}

export async function sendReply(
  id: string,
  text: string,
): Promise<ApiResult<InboxMessage>> {
  return parsed(
    await request("POST", `${threadPath(id)}/reply`, { text }),
    toMessage,
  );
}
