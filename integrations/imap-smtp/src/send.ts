import {
  type Credentials,
  IntegrationError,
  type OutboundMessage,
  type SendResult,
} from "@workspace/integration-core";
import { type ImapSmtpContext, requirePassword, smtpOptions } from "./config";
import { toMailError } from "./errors";
import { normalizeMessageId } from "./imap";

function resolveMessageId(message: OutboundMessage): string {
  const given = normalizeMessageId(message.messageId);
  if (given) {
    return given;
  }
  const domain = message.from.email.split("@").pop()?.trim() || "localhost";
  return `<${crypto.randomUUID()}@${domain}>`;
}

export async function send(
  context: ImapSmtpContext,
  credentials: Credentials,
  message: OutboundMessage,
): Promise<SendResult> {
  const mailbox = requirePassword(credentials);
  if (message.to.length === 0) {
    throw new IntegrationError("validation", "The message has no recipients.");
  }
  const messageId = resolveMessageId(message);

  let transport: ReturnType<ImapSmtpContext["transport"]> | undefined;
  try {
    transport = context.transport(smtpOptions(context, mailbox));
    await transport.sendMail({
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
    });
  } catch (error) {
    throw toMailError("smtp", error, mailbox);
  } finally {
    transport?.close();
  }
  return { providerMessageId: messageId, messageId };
}
