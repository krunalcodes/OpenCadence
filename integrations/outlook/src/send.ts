import {
  type Credentials,
  IntegrationError,
  type OutboundMessage,
  type SendResult,
} from "@workspace/integration-core";
import { endpoints, type OutlookContext } from "./config";
import { graphApiError } from "./errors";
import { request, requireAccessToken } from "./http";
import { buildMimeMessage, normalizeMessageId } from "./mime";

function resolveMessageId(message: OutboundMessage): string {
  const given = normalizeMessageId(message.messageId);
  if (given) {
    return given;
  }
  const domain = message.from.email.split("@").pop()?.trim() || "localhost";
  return `<${crypto.randomUUID()}@${domain}>`;
}

export async function send(
  context: OutlookContext,
  credentials: Credentials,
  message: OutboundMessage,
): Promise<SendResult> {
  const accessToken = requireAccessToken(credentials);
  if (message.to.length === 0) {
    throw new IntegrationError("validation", "The message has no recipients.");
  }
  const messageId = resolveMessageId(message);
  const mime = buildMimeMessage(message, {
    messageId,
    date: new Date(),
    boundary: `=_${crypto.randomUUID().replaceAll("-", "")}`,
  });
  const response = await request(context.fetch, endpoints.sendMail, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "text/plain",
    },
    body: Buffer.from(mime, "utf8").toString("base64"),
  });
  if (!response.ok) {
    throw await graphApiError(response);
  }
  return { providerMessageId: messageId, messageId };
}
