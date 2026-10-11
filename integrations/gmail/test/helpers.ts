import type { FetchLike, OAuthCredentials } from "@workspace/integration-core";

export type RecordedCall = {
  url: string;
  method: string;
  headers: Headers;
  body: string;
};

export type FakeReply =
  | { status?: number; body?: unknown; headers?: Record<string, string> }
  | Error;

export function createFakeFetch(replies: FakeReply[]) {
  const calls: RecordedCall[] = [];
  const queue = [...replies];
  const fetch: FetchLike = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : "",
    });
    const reply = queue.shift();
    if (!reply) {
      throw new Error("Unexpected request");
    }
    if (reply instanceof Error) {
      throw reply;
    }
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json", ...reply.headers },
    });
  };
  return { fetch, calls };
}

export function callAt(calls: RecordedCall[], index: number): RecordedCall {
  const call = calls[index];
  if (!call) {
    throw new Error(`No request at index ${index}`);
  }
  return call;
}

export const clientConfig = {
  clientId: "client-id.apps.googleusercontent.com",
  clientSecret: "client-secret-value",
};

export const sendScope = "https://www.googleapis.com/auth/gmail.send";

export const credentials: OAuthCredentials = {
  kind: "oauth2",
  refreshToken: "refresh-token-value",
  accessToken: "access-token-value",
  scopes: ["openid", "email", sendScope],
};

export function apiError(
  code: number,
  message: string,
  reason?: string,
): { status: number; body: unknown } {
  return {
    status: code,
    body: {
      error: {
        code,
        message,
        errors: reason ? [{ message, domain: "global", reason }] : [],
      },
    },
  };
}
