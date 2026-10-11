import {
  toMailbox,
  type WarmupMailbox,
  type WarmupUpdate,
} from "@/features/warmup/lib/warmup";
import { type ApiResult, malformed, request } from "@/lib/api";

export async function updateWarmup(
  sourceId: string,
  input: WarmupUpdate,
): Promise<ApiResult<WarmupMailbox>> {
  const result = await request(
    "PUT",
    `/warmup/${encodeURIComponent(sourceId)}`,
    input,
  );
  if (!result.ok) {
    return result;
  }
  const mailbox = toMailbox(result.data);
  return mailbox
    ? { ok: true, data: mailbox }
    : { ok: false, error: malformed };
}
