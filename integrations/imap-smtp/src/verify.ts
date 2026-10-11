import type { Credentials, VerifyResult } from "@workspace/integration-core";
import { type ImapSmtpContext, requirePassword, smtpOptions } from "./config";
import { toMailError } from "./errors";
import { findJunk, withImap } from "./imap";

const addressPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export async function verify(
  context: ImapSmtpContext,
  credentials: Credentials,
): Promise<VerifyResult> {
  const mailbox = requirePassword(credentials);

  let transport: ReturnType<ImapSmtpContext["transport"]> | undefined;
  try {
    transport = context.transport(smtpOptions(context, mailbox));
    await transport.verify();
  } catch (error) {
    throw toMailError("smtp", error, mailbox);
  } finally {
    transport?.close();
  }

  const inbox = await withImap(context, mailbox, async (session) => ({
    spamFolder: findJunk(await session.client.list()),
    supportsGmailLabels: session.isGmail,
  }));

  const username = mailbox.username.trim();
  return {
    account: addressPattern.test(username) ? { email: username } : {},
    settings: {
      smtpHost: mailbox.smtp.host,
      smtpPort: mailbox.smtp.port,
      imapHost: mailbox.imap.host,
      imapPort: mailbox.imap.port,
      spamFolder: inbox.spamFolder,
      supportsGmailLabels: inbox.supportsGmailLabels,
    },
  };
}
