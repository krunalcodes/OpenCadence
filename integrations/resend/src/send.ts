import {
  type Credentials,
  IntegrationError,
  type MessageAddress,
  type OutboundMessage,
  type SendResult,
} from "@workspace/integration-core";
import {
  maxIdempotencyKeyLength,
  maxRecipients,
  maxTagLength,
  type ResolvedResendConfig,
} from "./config";
import { unexpectedResponseError } from "./errors";
import { apiKeyFrom, isRecord, resendRequest } from "./http";

const threadHeaderNames = ["message-id", "in-reply-to", "references"];

function formatAddress({ email, name }: MessageAddress) {
  const cleaned = name?.replace(/[\r\n]+/g, " ").trim();
  if (!cleaned) {
    return email;
  }
  if (/[()<>[\]:;@\\,."]/.test(cleaned)) {
    return `"${cleaned.replace(/(["\\])/g, "\\$1")}" <${email}>`;
  }
  return `${cleaned} <${email}>`;
}

function sanitizeTag(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, maxTagLength);
}

function toTags(tags: Record<string, string> | undefined) {
  const entries = Object.entries(tags ?? {});
  if (entries.length === 0) {
    return undefined;
  }
  return entries.map(([name, value]) => ({
    name: sanitizeTag(name),
    value: sanitizeTag(value),
  }));
}

function toHeaders(message: OutboundMessage) {
  const threading: Record<string, string | undefined> = {
    "Message-ID": message.messageId,
    "In-Reply-To": message.thread?.inReplyTo,
    References: message.thread?.references?.length
      ? message.thread.references.join(" ")
      : undefined,
  };
  const overridden = Object.entries(threading)
    .filter(([, value]) => value !== undefined)
    .map(([name]) => name.toLowerCase());
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(message.headers ?? {})) {
    const lower = name.toLowerCase();
    if (!threadHeaderNames.includes(lower) || !overridden.includes(lower)) {
      headers[name] = value;
    }
  }
  for (const [name, value] of Object.entries(threading)) {
    if (value !== undefined) {
      headers[name] = value;
    }
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function toEmailBody(message: OutboundMessage) {
  return {
    from: formatAddress(message.from),
    to: message.to,
    subject: message.subject,
    cc: message.cc?.length ? message.cc : undefined,
    bcc: message.bcc?.length ? message.bcc : undefined,
    reply_to: message.replyTo,
    html: message.html,
    text: message.text,
    headers: toHeaders(message),
    tags: toTags(message.tags),
  };
}

export async function send(
  config: ResolvedResendConfig,
  credentials: Credentials,
  message: OutboundMessage,
): Promise<SendResult> {
  const apiKey = apiKeyFrom(credentials);
  if (message.to.length === 0 || message.to.length > maxRecipients) {
    throw new IntegrationError(
      "validation",
      `Resend accepts between 1 and ${maxRecipients} recipients per email.`,
    );
  }
  const key = message.idempotencyKey;
  if (
    key !== undefined &&
    (key.length === 0 || key.length > maxIdempotencyKeyLength)
  ) {
    throw new IntegrationError(
      "validation",
      `The idempotency key must be between 1 and ${maxIdempotencyKeyLength} characters.`,
    );
  }

  const response = await resendRequest(config, apiKey, {
    method: "POST",
    path: "/emails",
    body: toEmailBody(message),
    headers: key === undefined ? undefined : { "Idempotency-Key": key },
  });
  const id = isRecord(response.body) ? response.body.id : undefined;
  if (typeof id !== "string" || !id) {
    throw unexpectedResponseError(response.status);
  }
  return { providerMessageId: id, messageId: message.messageId };
}
