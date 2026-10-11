import type {
  FetchLike,
  IntegrationError,
  OAuthCredentials,
} from "@workspace/integration-core";
import { expect } from "vitest";

export type RecordedCall = {
  url: string;
  method: string;
  headers: Headers;
  body: string;
};

export type FakeReply =
  | {
      status?: number;
      body?: unknown;
      text?: string;
      headers?: Record<string, string>;
    }
  | Error;

export type Responder = (call: RecordedCall, index: number) => FakeReply;

export function createFakeFetch(source: FakeReply[] | Responder) {
  const calls: RecordedCall[] = [];
  const queue = Array.isArray(source) ? [...source] : [];
  let active = 0;
  const stats = { peak: 0 };
  const fetch: FetchLike = async (input, init) => {
    const call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : "",
    };
    calls.push(call);
    active += 1;
    stats.peak = Math.max(stats.peak, active);
    await new Promise((resolve) => setTimeout(resolve, 0));
    active -= 1;
    const reply = Array.isArray(source)
      ? queue.shift()
      : source(call, calls.length - 1);
    if (!reply) {
      throw new Error(`Unexpected request to ${call.url}`);
    }
    if (reply instanceof Error) {
      throw reply;
    }
    if (reply.text !== undefined) {
      return new Response(reply.text, {
        status: reply.status ?? 200,
        headers: { "content-type": "text/plain", ...reply.headers },
      });
    }
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json", ...reply.headers },
    });
  };
  return { fetch, calls, stats };
}

export function callAt(calls: RecordedCall[], index: number): RecordedCall {
  const call = calls[index];
  if (!call) {
    throw new Error(`No request at index ${index}`);
  }
  return call;
}

export const clientConfig = {
  clientId: "11112222-bbbb-3333-cccc-4444dddd5555",
  clientSecret: "client-secret-value",
};

export const sendCredentials: OAuthCredentials = {
  kind: "oauth2",
  refreshToken: "refresh-token-value",
  accessToken: "access-token-value",
  scopes: ["openid", "email", "User.Read", "Mail.Send"],
};

export const inboxCredentials: OAuthCredentials = {
  ...sendCredentials,
  scopes: [...sendCredentials.scopes, "Mail.Read"],
};

export const secrets = [
  clientConfig.clientSecret,
  "refresh-token-value",
  "access-token-value",
];

export function graphError(
  status: number,
  code: string,
  message = "Something went wrong.",
  headers?: Record<string, string>,
): FakeReply {
  return { status, body: { error: { code, message } }, headers };
}

export function tokenError(
  status: number,
  error: string,
  errorCodes: number[] = [],
  headers?: Record<string, string>,
): FakeReply {
  return {
    status,
    headers,
    body: {
      error,
      error_description: `AADSTS${errorCodes[0] ?? 0}: Sign-in failed.\r\nTrace ID: 0000aaaa\r\nCorrelation ID: aaaa0000`,
      error_codes: errorCodes,
    },
  };
}

export async function captureError(
  run: () => Promise<unknown>,
): Promise<IntegrationError> {
  try {
    await run();
  } catch (error) {
    return error as IntegrationError;
  }
  throw new Error("Expected the call to fail");
}

export function expectNoSecrets(error: IntegrationError, extra: string[] = []) {
  const text = JSON.stringify({
    message: error.message,
    providerMessage: error.providerMessage,
    providerCode: error.providerCode,
    cause: String(error.cause ?? ""),
  });
  for (const secret of [...secrets, ...extra]) {
    expect(text).not.toContain(secret);
  }
}
