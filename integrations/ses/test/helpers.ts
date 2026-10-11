import type {
  AccessKeyCredentials,
  FetchLike,
} from "@workspace/integration-core";
import {
  createSesAdapter,
  type SesAdapterConfig,
  type SesCommand,
} from "../src/index";

export type RecordedCommand = {
  name: string;
  input: Record<string, unknown>;
};

export type Reply = unknown | ((input: Record<string, unknown>) => unknown);

export type RecordedFetch = {
  url: string;
  method: string;
  redirect?: string;
};

export type FetchReply = { status?: number; body?: string } | Error;

export const accessKey: AccessKeyCredentials = {
  kind: "access_key",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  region: "eu-west-1",
};

export function awsError(
  name: string,
  message: string,
  status: number,
  headers: Record<string, string> = {},
) {
  return Object.assign(new Error(message), {
    name,
    $fault: status >= 500 ? "server" : "client",
    $metadata: { httpStatusCode: status, attempts: 1 },
    $response: { statusCode: status, headers },
  });
}

export function networkError(code: string) {
  return Object.assign(new Error(`getaddrinfo ${code}`), {
    code,
    $metadata: { attempts: 1 },
  });
}

export function createFakeClient(replies: Record<string, Reply> = {}) {
  const commands: RecordedCommand[] = [];
  const credentials: AccessKeyCredentials[] = [];
  const createClient = (used: AccessKeyCredentials) => {
    credentials.push(used);
    return {
      send: async (command: SesCommand) => {
        const name = command.constructor.name;
        const input = command.input as Record<string, unknown>;
        commands.push({ name, input });
        const reply = replies[name];
        const value = typeof reply === "function" ? reply(input) : reply;
        if (value instanceof Error) {
          throw value;
        }
        return value ?? {};
      },
    };
  };
  return { createClient, commands, credentials };
}

export function createFakeFetch(replies: Record<string, FetchReply> = {}) {
  const calls: RecordedFetch[] = [];
  const fetch: FetchLike = async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      redirect: init?.redirect,
    });
    const reply = replies[url] ?? { status: 404, body: "" };
    if (reply instanceof Error) {
      throw reply;
    }
    return new Response(reply.body ?? "", { status: reply.status ?? 200 });
  };
  return { fetch, calls };
}

export function createAdapter(
  replies: Record<string, Reply> = {},
  config: SesAdapterConfig = {},
) {
  const fake = createFakeClient(replies);
  return {
    adapter: createSesAdapter({ createClient: fake.createClient, ...config }),
    ...fake,
  };
}

export async function captureError(action: () => unknown) {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the action to throw.");
}
