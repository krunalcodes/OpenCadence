import type { ApiError, ApiResult } from "@/lib/api";

export const maxParallelChunks = 3;

export const retryDelays = [500, 1500, 4000];

export type SendOutcome =
  | { state: "done" }
  | { state: "cancelled" }
  | { state: "failed"; error: ApiError };

export function chunkCount(length: number, chunkSize: number) {
  return chunkSize > 0 ? Math.ceil(length / chunkSize) : 0;
}

export function chunkAt(text: string, index: number, chunkSize: number) {
  return text.slice(index * chunkSize, (index + 1) * chunkSize);
}

export function isRetryable(error: ApiError) {
  return error.status === 0 || error.status >= 500;
}

function pause(delay: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delay);
  });
}

type SendChunksInput = {
  text: string;
  chunkSize: number;
  send: (index: number, data: string) => Promise<ApiResult<unknown>>;
  onProgress: (sent: number, total: number) => void;
  isCancelled: () => boolean;
  wait?: (delay: number) => Promise<void>;
};

export async function sendChunks({
  text,
  chunkSize,
  send,
  onProgress,
  isCancelled,
  wait = pause,
}: SendChunksInput): Promise<SendOutcome> {
  const total = chunkCount(text.length, chunkSize);
  let next = 0;
  let sent = 0;
  const outcome: { failure: ApiError | null } = { failure: null };

  async function sendOne(index: number) {
    const data = chunkAt(text, index, chunkSize);
    for (let attempt = 0; ; attempt += 1) {
      const result = await send(index, data);
      if (result.ok) {
        return null;
      }
      const delay = retryDelays[attempt];
      if (!isRetryable(result.error) || delay === undefined) {
        return result.error;
      }
      await wait(delay);
      if (isCancelled() || outcome.failure) {
        return null;
      }
    }
  }

  async function worker() {
    while (next < total && !outcome.failure && !isCancelled()) {
      const index = next;
      next += 1;
      const error = await sendOne(index);
      if (error) {
        outcome.failure = outcome.failure ?? error;
        return;
      }
      if (outcome.failure || isCancelled()) {
        return;
      }
      sent += 1;
      onProgress(sent, total);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(maxParallelChunks, total) }, worker),
  );

  if (isCancelled()) {
    return { state: "cancelled" };
  }
  return outcome.failure
    ? { state: "failed", error: outcome.failure }
    : { state: "done" };
}
