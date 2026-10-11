import {
  type Credentials,
  type DeliveryStatus,
  IntegrationError,
  type ReceivedCursor,
  type ReceivedHeaderName,
  type ReceivedMessage,
  type ReceivedPage,
  type ReceivedQuery,
  receivedHeaderNames,
} from "@workspace/integration-core";
import type { FetchQueryObject, MessageStructureObject } from "imapflow";
import {
  type ImapFetchedMessage,
  type ImapSmtpContext,
  requirePassword,
} from "./config";
import { receivedRef } from "./content";
import {
  decodeTransfer,
  type HeaderFields,
  parseDeliveryStatus,
  parseHeaders,
} from "./delivery-status";
import { type ImapSession, normalizeMessageId, withImap } from "./imap";

type Cursor = { uidValidity: string; lastUid: number };

type ReportParts = {
  status: MessageStructureObject & { part: string };
  original?: { key: string; encoding?: string };
};

const inboxPath = "INBOX";

const dayMs = 24 * 60 * 60 * 1000;

const maxPageSize = 200;

const maxHeaderValueLength = 512;

const maxReferences = 100;

const reportPartLimit = 32 * 1024;

const statusTypes = [
  "message/delivery-status",
  "message/global-delivery-status",
];

const embeddedTypes = ["message/rfc822", "message/global"];

const headerOnlyTypes = [
  "text/rfc822-headers",
  "message/rfc822-headers",
  "message/global-headers",
];

const reportPattern = /^\s*multipart\/report\b/i;

const deliveryReportPattern = /report-type\s*=\s*"?\s*delivery-status/i;

const fetchQuery: FetchQueryObject = {
  uid: true,
  envelope: true,
  internalDate: true,
  bodyStructure: true,
  headers: ["references", ...receivedHeaderNames],
};

function readCursor(state: ReceivedCursor | null): Cursor | null {
  if (!state) {
    return null;
  }
  const { uidValidity, lastUid } = state;
  if (
    typeof uidValidity !== "string" ||
    uidValidity === "" ||
    typeof lastUid !== "number" ||
    !Number.isSafeInteger(lastUid) ||
    lastUid < 0
  ) {
    return null;
  }
  return { uidValidity, lastUid };
}

function toDate(value: Date | string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function searchUids(
  session: ImapSession,
  query: { since: Date } | { uid: string },
) {
  const uids = await session.client.search(query, { uid: true });
  if (!uids) {
    throw session.commandFailure();
  }
  return [...new Set(uids)]
    .filter((uid) => Number.isSafeInteger(uid) && uid > 0)
    .sort((left, right) => left - right);
}

async function highestUid(session: ImapSession, uidNext: number | undefined) {
  if (uidNext !== undefined && Number.isSafeInteger(uidNext) && uidNext > 0) {
    return uidNext - 1;
  }
  return (await searchUids(session, { uid: "*" })).at(-1) ?? 0;
}

function isDeliveryReport(
  contentType: string | undefined,
  structure: MessageStructureObject | undefined,
) {
  if (contentType !== undefined) {
    return (
      reportPattern.test(contentType) && deliveryReportPattern.test(contentType)
    );
  }
  return (
    structure?.type === "multipart/report" &&
    Object.entries(structure.parameters ?? {}).some(
      ([name, value]) =>
        name.toLowerCase() === "report-type" &&
        String(value).trim().toLowerCase() === "delivery-status",
    )
  );
}

function findReportParts(
  structure: MessageStructureObject | undefined,
): ReportParts | null {
  let status: ReportParts["status"] | undefined;
  let original: ReportParts["original"];
  const pending = structure ? [structure] : [];
  for (let visited = 0; pending.length > 0 && visited < 50; visited += 1) {
    const node = pending.shift();
    if (!node) {
      break;
    }
    const type = String(node.type ?? "").toLowerCase();
    const part = node.part;
    if (part && !status && statusTypes.includes(type)) {
      status = { ...node, part };
    } else if (part && !original && embeddedTypes.includes(type)) {
      original = { key: `${part}.HEADER` };
    } else if (part && !original && headerOnlyTypes.includes(type)) {
      original = { key: part, encoding: node.encoding };
    } else if (type.startsWith("multipart/")) {
      pending.push(...(node.childNodes ?? []));
    }
  }
  return status ? { status, original } : null;
}

function isRefusedCommand(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const status = (error as { responseStatus?: unknown }).responseStatus;
  return status === "NO" || status === "BAD";
}

async function readDeliveryStatus(
  session: ImapSession,
  message: ImapFetchedMessage,
): Promise<DeliveryStatus | undefined> {
  const parts = findReportParts(message.bodyStructure);
  if (!parts) {
    return undefined;
  }
  let fetched: ImapFetchedMessage | false | undefined;
  try {
    fetched = await session.client.fetchOne(
      String(message.uid),
      {
        uid: true,
        bodyParts: [
          { key: parts.status.part, start: 0, maxLength: reportPartLimit },
          ...(parts.original
            ? [
                {
                  key: parts.original.key,
                  start: 0,
                  maxLength: reportPartLimit,
                },
              ]
            : []),
        ],
      },
      { uid: true },
    );
  } catch (error) {
    if (isRefusedCommand(error)) {
      return undefined;
    }
    throw error;
  }
  if (!fetched) {
    return undefined;
  }
  const part = (key: string) =>
    fetched.bodyParts?.get(key.toLowerCase())?.subarray(0, reportPartLimit);
  const report = parseDeliveryStatus(
    decodeTransfer(part(parts.status.part), parts.status.encoding),
    parts.original
      ? decodeTransfer(part(parts.original.key), parts.original.encoding)
      : "",
  );
  return Object.keys(report).length > 0 ? report : undefined;
}

function pickHeaders(fields: HeaderFields) {
  const headers: Partial<Record<ReceivedHeaderName, string>> = {};
  for (const name of receivedHeaderNames) {
    const value = fields.get(name)?.[0];
    if (value !== undefined) {
      headers[name] = value.slice(0, maxHeaderValueLength);
    }
  }
  return headers;
}

function toReceived(
  message: ImapFetchedMessage,
  fields: HeaderFields,
  deliveryStatus: DeliveryStatus | undefined,
  uidValidity: string,
): ReceivedMessage {
  const messageId = normalizeMessageId(message.envelope?.messageId);
  const inReplyTo = normalizeMessageId(
    message.envelope?.inReplyTo?.match(/<[^<>\s]+>/)?.[0] ??
      message.envelope?.inReplyTo,
  );
  const from = message.envelope?.from?.find((entry) => entry.address)?.address;
  return {
    ref: receivedRef(uidValidity, message.uid),
    ...(messageId ? { messageId } : {}),
    ...(inReplyTo ? { inReplyTo } : {}),
    references: (fields.get("references") ?? [])
      .flatMap((value) => value.match(/<[^<>\s]+>/g) ?? [])
      .slice(-maxReferences),
    ...(from ? { from: { email: from } } : {}),
    receivedAt:
      toDate(message.internalDate) ??
      toDate(message.envelope?.date) ??
      new Date(),
    headers: pickHeaders(fields),
    ...(deliveryStatus ? { deliveryStatus } : {}),
  };
}

export async function listReceived(
  context: ImapSmtpContext,
  credentials: Credentials,
  input: ReceivedQuery,
): Promise<ReceivedPage> {
  const mailbox = requirePassword(credentials);
  const limit = Math.min(
    Math.max(Number.isFinite(input.limit) ? Math.floor(input.limit) : 1, 1),
    maxPageSize,
  );

  return withImap(context, mailbox, async (session) => {
    const opened = await session.client.mailboxOpen(inboxPath, {
      readOnly: true,
    });
    if (opened?.uidValidity === undefined || opened.uidValidity === null) {
      throw new IntegrationError(
        "unknown",
        "The IMAP server did not say which version of the inbox it is serving.",
      );
    }
    const uidValidity = String(opened.uidValidity);
    const saved = readCursor(input.state);
    const cursor = saved?.uidValidity === uidValidity ? saved : null;

    const found = cursor
      ? (await searchUids(session, { uid: `${cursor.lastUid + 1}:*` })).filter(
          (uid) => uid > cursor.lastUid,
        )
      : await searchUids(session, {
          since: new Date(input.since.getTime() - dayMs),
        });
    const page = found.slice(0, limit);
    const lastUid =
      page.at(-1) ??
      cursor?.lastUid ??
      (await highestUid(session, opened.uidNext));

    const fetched =
      page.length > 0
        ? await session.client.fetchAll(page.join(","), fetchQuery, {
            uid: true,
          })
        : [];
    const wanted = new Set(page);
    const messages: ReceivedMessage[] = [];
    for (const message of [...fetched].sort(
      (left, right) => left.uid - right.uid,
    )) {
      if (!wanted.delete(message.uid)) {
        continue;
      }
      const arrived = toDate(message.internalDate);
      if (!cursor && arrived && arrived.getTime() < input.since.getTime()) {
        continue;
      }
      const fields = parseHeaders(message.headers);
      const deliveryStatus = isDeliveryReport(
        fields.get("content-type")?.[0],
        message.bodyStructure,
      )
        ? await readDeliveryStatus(session, message)
        : undefined;
      messages.push(toReceived(message, fields, deliveryStatus, uidValidity));
    }

    return {
      messages,
      state: { uidValidity, lastUid },
      more: found.length > page.length,
    };
  });
}
