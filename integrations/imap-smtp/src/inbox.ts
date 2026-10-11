import {
  type Credentials,
  type InboxAction,
  type InboxActionResult,
  type InboxFolder,
  type InboxMessage,
  type InboxMessageRef,
  type InboxSearch,
  type InboxSupport,
  IntegrationError,
  type MessageAddress,
} from "@workspace/integration-core";
import type { FetchQueryObject } from "imapflow";
import {
  type ImapFetchedMessage,
  type ImapSmtpContext,
  requirePassword,
} from "./config";
import { messageGoneError } from "./errors";
import {
  findAllMail,
  findInbox,
  findJunk,
  type ImapSession,
  isSameMailbox,
  normalizeMessageId,
  withImap,
} from "./imap";

type EnvelopeAddress = { name?: string; address?: string };

type Location = { uid: number; folder: string };

const dayMs = 24 * 60 * 60 * 1000;

const candidateLimit = 5;

const alreadyExistsPattern = /already exists|mailbox exists|folder exists/i;

function toAddress(entry: EnvelopeAddress): MessageAddress | undefined {
  if (!entry.address) {
    return undefined;
  }
  return entry.name
    ? { email: entry.address, name: entry.name }
    : { email: entry.address };
}

function toAddresses(entries: EnvelopeAddress[] | undefined) {
  return (entries ?? [])
    .map(toAddress)
    .filter((address): address is MessageAddress => address !== undefined);
}

function parseReferences(headers: Buffer | undefined): string[] {
  if (!headers) {
    return [];
  }
  const unfolded = headers.toString("utf8").replace(/\r?\n[ \t]+/g, " ");
  const line = unfolded
    .split(/\r?\n/)
    .find((entry) => entry.toLowerCase().startsWith("references:"));
  return line?.match(/<[^<>\s]+>/g) ?? [];
}

function toDate(value: Date | string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toInboxMessage(
  message: ImapFetchedMessage,
  folder: string,
  place: { inbox: boolean; junk: boolean; isGmail: boolean },
): InboxMessage {
  const flags = message.flags ?? new Set<string>();
  const labels = place.isGmail ? message.labels : undefined;
  return {
    providerMessageId: String(message.uid),
    folder,
    messageId: normalizeMessageId(message.envelope?.messageId),
    inReplyTo: normalizeMessageId(message.envelope?.inReplyTo),
    references: parseReferences(message.headers),
    from: toAddresses(message.envelope?.from)[0],
    to: toAddresses(message.envelope?.to),
    subject: message.envelope?.subject,
    receivedAt:
      toDate(message.internalDate) ??
      toDate(message.envelope?.date) ??
      new Date(),
    flags: {
      isSpam: place.junk,
      isUnread: !flags.has("\\Seen"),
      isInInbox: place.inbox || labels?.has("\\Inbox") === true,
      isStarred: flags.has("\\Flagged"),
      ...(labels ? { isImportant: labels.has("\\Important") } : {}),
    },
  };
}

async function searchUids(
  session: ImapSession,
  messageId: string,
  since?: Date,
): Promise<number[]> {
  const uids = await session.client.search(
    since
      ? { header: { "Message-ID": messageId }, since }
      : { header: { "Message-ID": messageId } },
    { uid: true },
  );
  if (!uids) {
    throw session.commandFailure();
  }
  return [...uids].sort((left, right) => right - left);
}

async function findIn(
  session: ImapSession,
  folder: string,
  messageId: string,
  since: Date,
): Promise<ImapFetchedMessage | null> {
  await session.client.mailboxOpen(folder, { readOnly: true });
  const uids = await searchUids(session, messageId, since);
  const query: FetchQueryObject = {
    uid: true,
    flags: true,
    envelope: true,
    internalDate: true,
    headers: ["references"],
    ...(session.isGmail ? { labels: true } : {}),
  };
  for (const uid of uids.slice(0, candidateLimit)) {
    const message = await session.client.fetchOne(String(uid), query, {
      uid: true,
    });
    if (!message) {
      continue;
    }
    const found = normalizeMessageId(message.envelope?.messageId);
    if (!found || found === messageId) {
      return message;
    }
  }
  return null;
}

async function search(
  context: ImapSmtpContext,
  credentials: Credentials,
  query: InboxSearch,
): Promise<InboxMessage | null> {
  const mailbox = requirePassword(credentials);
  const messageId = normalizeMessageId(query.messageId);
  if (!messageId) {
    throw new IntegrationError(
      "validation",
      "A Message-ID is needed to find the message.",
    );
  }
  const since = new Date(query.since.getTime() - dayMs);

  return withImap(context, mailbox, async (session) => {
    const mailboxes = await session.client.list();
    const inbox = findInbox(mailboxes);
    const junk = findJunk(mailboxes);
    const allMail = session.isGmail ? findAllMail(mailboxes) : null;
    const folders = [
      inbox,
      ...(query.includeSpam && junk ? [junk] : []),
      ...(allMail ? [allMail] : []),
    ];
    for (const folder of folders) {
      const message = await findIn(session, folder, messageId, since);
      if (message) {
        return toInboxMessage(message, folder, {
          inbox: folder === inbox,
          junk: folder === junk,
          isGmail: session.isGmail,
        });
      }
    }
    return null;
  });
}

async function openForChanges(session: ImapSession, folder: string) {
  try {
    await session.client.mailboxOpen(folder);
  } catch (error) {
    const source =
      typeof error === "object" && error !== null
        ? (error as Record<string, unknown>)
        : {};
    if (
      source.mailboxMissing === true ||
      source.serverResponseCode === "NONEXISTENT"
    ) {
      throw messageGoneError();
    }
    throw error;
  }
}

async function move(
  session: ImapSession,
  from: Location,
  destination: string,
  messageId: string | undefined,
): Promise<Location> {
  const result = await session.client.messageMove(
    String(from.uid),
    destination,
    { uid: true },
  );
  if (!result) {
    throw session.commandFailure();
  }
  const folder = result.destination || destination;
  await session.client.mailboxOpen(folder);
  const mapped = result.uidMap?.get(from.uid);
  if (mapped !== undefined) {
    return { uid: mapped, folder };
  }
  const uids = messageId ? await searchUids(session, messageId) : [];
  const uid = uids[0];
  if (uid === undefined) {
    throw new IntegrationError(
      "unknown",
      "The message was moved but could not be found in its new folder.",
    );
  }
  return { uid, folder };
}

async function addFlags(
  session: ImapSession,
  location: Location,
  flags: string[],
  useLabels = false,
) {
  const applied = await session.client.messageFlagsAdd(
    String(location.uid),
    flags,
    useLabels ? { uid: true, useLabels: true } : { uid: true },
  );
  if (!applied) {
    throw session.commandFailure();
  }
}

async function applyActions(
  context: ImapSmtpContext,
  credentials: Credentials,
  ref: InboxMessageRef,
  actions: InboxAction[],
): Promise<InboxActionResult> {
  const mailbox = requirePassword(credentials);
  const uid = Number(ref.providerMessageId);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw messageGoneError();
  }
  const wants = (type: InboxAction["type"]) =>
    actions.some((action) => action.type === type);
  const target = actions.findLast((action) => action.type === "fileUnder");

  return withImap(context, mailbox, async (session) => {
    const mailboxes = await session.client.list();
    const inbox = findInbox(mailboxes);
    const junk = findJunk(mailboxes);
    const unsupported: InboxAction["type"][] = [];
    let location: Location = { uid, folder: ref.folder || inbox };

    await openForChanges(session, location.folder);
    const message = await session.client.fetchOne(
      String(uid),
      { uid: true, envelope: true },
      { uid: true },
    );
    if (!message) {
      throw messageGoneError();
    }
    const messageId = normalizeMessageId(message.envelope?.messageId);

    if (wants("notSpam") && junk && isSameMailbox(location.folder, junk)) {
      location = await move(session, location, inbox, messageId);
    }
    if (wants("markRead")) {
      await addFlags(session, location, ["\\Seen"]);
    }
    if (wants("star")) {
      await addFlags(session, location, ["\\Flagged"]);
    }
    if (wants("markImportant")) {
      if (session.isGmail) {
        await addFlags(session, location, ["\\Important"], true);
      } else {
        unsupported.push("markImportant");
      }
    }
    if (
      target?.type === "fileUnder" &&
      !isSameMailbox(location.folder, target.folder.providerFolderId)
    ) {
      location = await move(
        session,
        location,
        target.folder.providerFolderId,
        messageId,
      );
    }

    return {
      ref: {
        providerMessageId: String(location.uid),
        ...(ref.providerThreadId
          ? { providerThreadId: ref.providerThreadId }
          : {}),
        folder: location.folder,
      },
      unsupported,
    };
  });
}

function isAlreadyExists(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const source = error as Record<string, unknown>;
  if (source.serverResponseCode === "ALREADYEXISTS") {
    return true;
  }
  return [source.responseText, source.response, source.message].some(
    (text) => typeof text === "string" && alreadyExistsPattern.test(text),
  );
}

async function ensureFolder(
  context: ImapSmtpContext,
  credentials: Credentials,
  name: string,
): Promise<InboxFolder> {
  const mailbox = requirePassword(credentials);
  const wanted = name.trim();
  if (!wanted) {
    throw new IntegrationError("validation", "The folder needs a name.");
  }
  return withImap(context, mailbox, async (session) => {
    try {
      const created = await session.client.mailboxCreate(wanted);
      return { providerFolderId: created?.path || wanted, name: wanted };
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw error;
      }
    }
    const mailboxes = await session.client.list();
    const existing =
      mailboxes.find((entry) => entry.path === wanted) ??
      mailboxes.find((entry) => entry.name === wanted);
    return { providerFolderId: existing?.path ?? wanted, name: wanted };
  });
}

export function createInbox(context: ImapSmtpContext): InboxSupport {
  return {
    search: (credentials, query) => search(context, credentials, query),
    applyActions: (credentials, ref, actions) =>
      applyActions(context, credentials, ref, actions),
    ensureFolder: (credentials, name) =>
      ensureFolder(context, credentials, name),
  };
}
