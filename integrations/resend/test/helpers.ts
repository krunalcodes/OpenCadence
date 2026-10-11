import type { ApiKeyCredentials, FetchLike } from "@workspace/integration-core";
import { createResendAdapter } from "../src/index";

export type RecordedCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

export type FakeReply = {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
};

export const fullKey: ApiKeyCredentials = {
  kind: "api_key",
  apiKey: "re_full_access_key",
};

export function createFakeFetch(reply: FakeReply | Error = {}) {
  const calls: RecordedCall[] = [];
  const fetch: FetchLike = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    if (reply instanceof Error) {
      throw reply;
    }
    const status = reply.status ?? 200;
    return new Response(
      reply.body === undefined ? null : JSON.stringify(reply.body),
      { status, headers: reply.headers },
    );
  };
  return { fetch, calls };
}

export function createAdapter(reply: FakeReply | Error = {}) {
  const fake = createFakeFetch(reply);
  return { adapter: createResendAdapter({ fetch: fake.fetch }), ...fake };
}

export async function captureError(action: () => unknown) {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the action to throw.");
}
