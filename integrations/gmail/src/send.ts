import {
  type Credentials,
  IntegrationError,
  type OutboundMessage,
  type SendResult,
} from "@workspace/integration-core";
import MailComposer from "nodemailer/lib/mail-composer";
import { endpoints, type GmailContext } from "./config";
import { gmailApiError } from "./errors";
import { asString, readJson, request } from "./http";

export function requireAccessToken(credentials: Credentials): string {
  if (credentials.kind !== "oauth2") {
    throw new IntegrationError(
      "invalid_credentials",
      "Gmail needs a connected Google account.",
    );
  }
  if (!credentials.accessToken) {
    throw new IntegrationError(
      "auth_expired",
      "The Google access token is missing and must be refreshed.",
    );
  }
  return credentials.accessToken;
}

function resolveMessageId(message: OutboundMessage): string {
  const given = message.messageId?.trim();
  if (given) {
    return given.startsWith("<") ? given : `<${given}>`;
  }
  const domain = message.from.email.split("@").pop() || "localhost";
  return `<${crypto.randomUUID()}@${domain}>`;
}

export async function buildRawMessage(
  message: OutboundMessage,
  messageId: string,
): Promise<string> {
  const node = new MailComposer({
    from: message.from.name
      ? { name: message.from.name, address: message.from.email }
      : message.from.email,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    replyTo: message.replyTo,
    subject: message.subject,
    html: message.html,
    text: message.text,
    headers: message.headers,
    messageId,
    inReplyTo: message.thread?.inReplyTo,
    references: message.thread?.references,
    disableFileAccess: true,
    disableUrlAccess: true,
  }).compile();
  node.keepBcc = true;
  const raw = await node.build();
  return raw.toString("base64url");
}

export async function send(
  context: GmailContext,
  credentials: Credentials,
  message: OutboundMessage,
): Promise<SendResult> {
  const accessToken = requireAccessToken(credentials);
  if (message.to.length === 0) {
    throw new IntegrationError("validation", "The message has no recipients.");
  }
  const messageId = resolveMessageId(message);
  const raw = await buildRawMessage(message, messageId);
  const threadId = message.thread?.providerThreadId;
  const response = await request(context.fetch, endpoints.send, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
  });
  if (!response.ok) {
    throw await gmailApiError(response);
  }
  const body = await readJson(response);
  const providerMessageId = asString(body.id);
  if (!providerMessageId) {
    throw new IntegrationError(
      "unknown",
      "Gmail accepted the message but did not return its id.",
      { providerStatus: response.status },
    );
  }
  return {
    providerMessageId,
    providerThreadId: asString(body.threadId),
    messageId,
  };
}
