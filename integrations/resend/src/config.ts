import type { FetchLike } from "@workspace/integration-core";

export type ResendAdapterConfig = {
  fetch?: FetchLike;
  userAgent?: string;
  baseUrl?: string;
};

export type ResolvedResendConfig = {
  fetch: FetchLike;
  userAgent: string;
  baseUrl: string;
};

export const defaultBaseUrl = "https://api.resend.com";

export const defaultUserAgent = "OpenCadence";

export const apiKeyPrefix = "re_";

export const maxRecipients = 50;

export const maxIdempotencyKeyLength = 256;

export const maxTagLength = 256;

export const webhookToleranceSeconds = 300;

export const webhookEvents = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
] as const;

export function resolveConfig(
  config: ResendAdapterConfig = {},
): ResolvedResendConfig {
  return {
    fetch: config.fetch ?? ((input, init) => globalThis.fetch(input, init)),
    userAgent: config.userAgent ?? defaultUserAgent,
    baseUrl: (config.baseUrl ?? defaultBaseUrl).replace(/\/+$/, ""),
  };
}
