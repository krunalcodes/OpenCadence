import { type ApiError, type Row, toApiError } from "@/lib/api";

const trailer = /\s*<error>\s*([a-z_]*)\s*<\/error>\s*$/;

export function splitTrailer(raw: string): {
  text: string;
  code: string | null;
} {
  const match = trailer.exec(raw);
  if (!match) {
    return { text: raw, code: null };
  }
  return { text: raw.slice(0, match.index), code: match[1] || "unknown" };
}

export type StreamResult =
  | { state: "done"; text: string }
  | { state: "aborted"; text: string }
  | { state: "failed"; text: string; error: ApiError };

export async function streamAi(
  path: string,
  body: Row,
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<StreamResult> {
  let text = "";
  try {
    const response = await fetch(`/api/v1${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    });
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      return {
        state: "failed",
        text,
        error: toApiError(response.status, data),
      };
    }
    if (!response.body) {
      text = await response.text();
      onText(text);
      return { state: "done", text };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      text += decoder.decode(value, { stream: true });
      onText(text);
    }
    text += decoder.decode();
    onText(text);
    return { state: "done", text };
  } catch {
    if (signal.aborted) {
      return { state: "aborted", text };
    }
    return { state: "failed", text, error: toApiError(0, null) };
  }
}
