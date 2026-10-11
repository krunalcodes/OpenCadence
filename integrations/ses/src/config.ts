import { SESv2Client } from "@aws-sdk/client-sesv2";
import type {
  AccessKeyCredentials,
  FetchLike,
} from "@workspace/integration-core";

export type SesCommand = { readonly input: object };

export type SesClient = {
  send(command: SesCommand): Promise<unknown>;
};

export type SesClientFactory = (credentials: AccessKeyCredentials) => SesClient;

export type SesAdapterConfig = {
  createClient?: SesClientFactory;
  fetch?: FetchLike;
  userAgent?: string;
  configurationSetName?: string;
  snsToleranceSeconds?: number;
  certificateCacheSeconds?: number;
  now?: () => Date;
};

export type ResolvedSesConfig = {
  createClient: SesClientFactory;
  fetch: FetchLike;
  userAgent: string;
  configurationSetName?: string;
  snsToleranceSeconds: number;
  certificateCacheSeconds: number;
  now: () => Date;
};

export const defaultUserAgent = "OpenCadence";

export const maxRecipients = 50;

export const maxTagLength = 256;

export const maxSimpleHeaders = 15;

export const maxSimpleHeaderNameLength = 126;

export const maxSimpleHeaderValueLength = 995;

export const maxSimpleHeaderLength = 996;

export const identityPageSize = 1000;

export const maxIdentityPages = 10;

export const defaultRetryAfterSeconds = 5;

export const defaultSnsToleranceSeconds = 3600;

export const defaultCertificateCacheSeconds = 86400;

export const maxCachedCertificates = 16;

export const maxCachedClients = 50;

export const configurationSetHeader = "x-ses-configuration-set";

export const configurationSetNamePattern = /^[A-Za-z0-9_-]{1,64}$/;

export const regionPattern = /^[a-z]{2}(-[a-z]+)+-\d+$/;

export const defaultEventDestinationName = "opencadence";

export const defaultEventTypes = [
  "BOUNCE",
  "COMPLAINT",
  "DELIVERY",
  "DELIVERY_DELAY",
  "REJECT",
  "RENDERING_FAILURE",
] as const;

function cachedFactory(factory: SesClientFactory): SesClientFactory {
  const clients = new Map<string, SesClient>();
  return (credentials) => {
    const key = [
      credentials.region,
      credentials.accessKeyId,
      credentials.secretAccessKey,
    ].join("\n");
    const cached = clients.get(key);
    if (cached) {
      return cached;
    }
    const client = factory(credentials);
    if (clients.size >= maxCachedClients) {
      const oldest = clients.keys().next().value;
      if (oldest !== undefined) {
        clients.delete(oldest);
      }
    }
    clients.set(key, client);
    return client;
  };
}

function defaultFactory(userAgent: string): SesClientFactory {
  return (credentials) => {
    const client = new SESv2Client({
      region: credentials.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
      maxAttempts: 1,
      customUserAgent: userAgent,
    });
    return {
      send: (command) =>
        client.send(command as Parameters<SESv2Client["send"]>[0]),
    };
  };
}

export function resolveConfig(
  config: SesAdapterConfig = {},
): ResolvedSesConfig {
  const userAgent = config.userAgent ?? defaultUserAgent;
  return {
    createClient: cachedFactory(
      config.createClient ?? defaultFactory(userAgent),
    ),
    fetch: config.fetch ?? ((input, init) => globalThis.fetch(input, init)),
    userAgent,
    configurationSetName: config.configurationSetName,
    snsToleranceSeconds:
      config.snsToleranceSeconds ?? defaultSnsToleranceSeconds,
    certificateCacheSeconds:
      config.certificateCacheSeconds ?? defaultCertificateCacheSeconds,
    now: config.now ?? (() => new Date()),
  };
}
