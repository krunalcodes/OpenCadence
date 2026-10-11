import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type Credentials,
  IntegrationError,
  isIntegrationError,
  type ProviderEvent,
  type ProviderEventType,
  type WebhookRegistration,
  type WebhookRequest,
  type WebhookSupport,
} from "@workspace/integration-core";
import {
  type ResolvedResendConfig,
  webhookEvents,
  webhookToleranceSeconds,
} from "./config";
import { unexpectedResponseError } from "./errors";
import { apiKeyFrom, isRecord, optionalString, resendRequest } from "./http";

const secretPrefix = "whsec_";

const eventTypes: Record<string, ProviderEventType> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
  "email.opened": "opened",
  "email.clicked": "clicked",
};

function invalidSignature() {
  return new IntegrationError(
    "invalid_credentials",
    "The webhook signature is not valid.",
  );
}

function header(headers: WebhookRequest["headers"], name: string) {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name && value) {
      return value;
    }
  }
  return undefined;
}

function secretBytes(signingSecret: string) {
  const encoded = signingSecret.startsWith(secretPrefix)
    ? signingSecret.slice(secretPrefix.length)
    : signingSecret;
  return Buffer.from(encoded, "base64");
}

function matchesSignature(expected: Buffer, signatureHeader: string) {
  let matched = false;
  for (const entry of signatureHeader.split(" ")) {
    const separator = entry.indexOf(",");
    if (separator === -1 || entry.slice(0, separator) !== "v1") {
      continue;
    }
    const candidate = Buffer.from(entry.slice(separator + 1), "base64");
    if (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    ) {
      matched = true;
    }
  }
  return matched;
}

function verifySignature(request: WebhookRequest) {
  const id = header(request.headers, "svix-id");
  const timestamp = header(request.headers, "svix-timestamp");
  const signature = header(request.headers, "svix-signature");
  const secret = secretBytes(request.signingSecret);
  if (!id || !timestamp || !signature || secret.length === 0) {
    throw invalidSignature();
  }

  const expected = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${request.rawBody}`)
    .digest();
  if (!matchesSignature(expected, signature)) {
    throw invalidSignature();
  }

  const seconds = Number(timestamp);
  if (
    !Number.isFinite(seconds) ||
    Math.abs(Date.now() / 1000 - seconds) > webhookToleranceSeconds
  ) {
    throw new IntegrationError(
      "invalid_credentials",
      "The webhook timestamp is too far from the current time.",
    );
  }
  return { id, receivedAt: new Date(seconds * 1000) };
}

function toRecipients(value: unknown) {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string");
  }
  return [];
}

function toOccurredAt(value: unknown, fallback: Date) {
  if (typeof value !== "string") {
    return fallback;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function parseWebhook(request: WebhookRequest): ProviderEvent {
  const { id, receivedAt } = verifySignature(request);

  let payload: unknown;
  try {
    payload = JSON.parse(request.rawBody);
  } catch {
    payload = undefined;
  }
  if (!isRecord(payload)) {
    throw new IntegrationError(
      "validation",
      "The webhook payload is not valid JSON.",
    );
  }

  const data = isRecord(payload.data) ? payload.data : {};
  const rawType = optionalString(payload.type) ?? "";
  const bounce = isRecord(data.bounce) ? data.bounce : undefined;
  const failed = isRecord(data.failed) ? data.failed : {};
  const suppressed = isRecord(data.suppressed) ? data.suppressed : {};

  return {
    id,
    type: eventTypes[rawType] ?? "other",
    rawType,
    occurredAt: toOccurredAt(payload.created_at, receivedAt),
    providerMessageId: optionalString(data.email_id),
    recipients: toRecipients(data.to),
    bounce: bounce && {
      permanent: bounce.type === "Permanent",
      type: optionalString(bounce.type),
      subType: optionalString(bounce.subType),
      message: optionalString(bounce.message),
    },
    reason: optionalString(failed.reason) ?? optionalString(suppressed.message),
  };
}

async function register(
  config: ResolvedResendConfig,
  credentials: Credentials,
  url: string,
): Promise<WebhookRegistration> {
  const response = await resendRequest(config, apiKeyFrom(credentials), {
    method: "POST",
    path: "/webhooks",
    body: { endpoint: url, events: [...webhookEvents] },
  });
  const body = isRecord(response.body) ? response.body : {};
  const externalId = optionalString(body.id);
  const signingSecret = optionalString(body.signing_secret);
  if (!externalId || !signingSecret) {
    throw unexpectedResponseError(response.status);
  }
  return { externalId, signingSecret };
}

async function unregister(
  config: ResolvedResendConfig,
  credentials: Credentials,
  externalId: string,
) {
  try {
    await resendRequest(config, apiKeyFrom(credentials), {
      method: "DELETE",
      path: `/webhooks/${encodeURIComponent(externalId)}`,
    });
  } catch (error) {
    if (isIntegrationError(error) && error.providerStatus === 404) {
      return;
    }
    throw error;
  }
}

export function createWebhookSupport(
  config: ResolvedResendConfig,
): WebhookSupport {
  return {
    register: (credentials, url) => register(config, credentials, url),
    unregister: (credentials, externalId) =>
      unregister(config, credentials, externalId),
    parse: parseWebhook,
  };
}
