import {
  IntegrationError,
  type PasswordCredentials,
} from "@workspace/integration-core";
import {
  type ImapClient,
  type ImapMailbox,
  type ImapSmtpContext,
  imapOptions,
} from "./config";
import { toMailError } from "./errors";

export type ImapSession = {
  client: ImapClient;
  credentials: PasswordCredentials;
  isGmail: boolean;
  commandFailure(): IntegrationError;
};

const junkNames = [
  "spam",
  "junk",
  "junk email",
  "junk e-mail",
  "junk mail",
  "bulk mail",
  "bulk",
];

const gmailExtension = "X-GM-EXT-1";

function loggedError(entry: unknown): unknown {
  if (typeof entry !== "object" || entry === null) {
    return undefined;
  }
  const err = (entry as { err?: unknown }).err;
  return err instanceof Error ? err : undefined;
}

async function closeClient(client: ImapClient, connected: boolean) {
  if (!connected) {
    try {
      client.close();
    } catch {}
    return;
  }
  try {
    await client.logout();
  } catch {
    try {
      client.close();
    } catch {}
  }
}

export async function withImap<T>(
  context: ImapSmtpContext,
  credentials: PasswordCredentials,
  run: (session: ImapSession) => Promise<T>,
): Promise<T> {
  let lastFailure: unknown;
  const record = (entry: unknown) => {
    const error = loggedError(entry);
    if (error) {
      lastFailure = error;
    }
  };
  const ignore = () => {};
  let client: ImapClient | undefined;
  let connected = false;
  try {
    client = context.connect(
      imapOptions(context, credentials, {
        trace: ignore,
        debug: ignore,
        info: ignore,
        warn: record,
        error: record,
        fatal: record,
      }),
    );
    client.on("error", (error) => {
      lastFailure = error;
    });
    await client.connect();
    connected = true;
    return await run({
      client,
      credentials,
      isGmail: client.capabilities.has(gmailExtension),
      commandFailure: () => {
        const failure = lastFailure;
        lastFailure = undefined;
        return failure
          ? toMailError("imap", failure, credentials)
          : new IntegrationError(
              "unknown",
              "The IMAP server did not complete the request.",
            );
      },
    });
  } catch (error) {
    throw toMailError("imap", error, credentials);
  } finally {
    if (client) {
      await closeClient(client, connected);
    }
  }
}

function samePath(left: string, right: string) {
  return left === right || left.toLowerCase() === right.toLowerCase();
}

export function isSameMailbox(left: string, right: string) {
  return left.toUpperCase() === "INBOX" || right.toUpperCase() === "INBOX"
    ? left.toUpperCase() === right.toUpperCase()
    : left === right;
}

export function findInbox(mailboxes: ImapMailbox[]): string {
  const inbox =
    mailboxes.find((mailbox) => mailbox.path.toUpperCase() === "INBOX") ??
    mailboxes.find((mailbox) => mailbox.specialUse === "\\Inbox");
  return inbox?.path ?? "INBOX";
}

export function findJunk(mailboxes: ImapMailbox[]): string | null {
  const flagged = mailboxes.find((mailbox) => mailbox.specialUse === "\\Junk");
  if (flagged) {
    return flagged.path;
  }
  for (const name of junkNames) {
    const named =
      mailboxes.find((mailbox) => samePath(mailbox.path, name)) ??
      mailboxes.find((mailbox) => samePath(mailbox.name, name));
    if (named) {
      return named.path;
    }
  }
  return null;
}

export function findAllMail(mailboxes: ImapMailbox[]): string | null {
  return (
    mailboxes.find((mailbox) => mailbox.specialUse === "\\All")?.path ?? null
  );
}

export function normalizeMessageId(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const inner = trimmed.replace(/^<+/, "").replace(/>+$/, "").trim();
  return inner ? `<${inner}>` : undefined;
}
