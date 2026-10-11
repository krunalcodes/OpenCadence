import type {
  Credentials,
  MessageAddress,
  ReceivedContent,
} from "@workspace/integration-core";
import type { MessageStructureObject } from "imapflow";
import {
  type ImapFetchedMessage,
  type ImapSmtpContext,
  requirePassword,
} from "./config";
import { type ImapSession, withImap } from "./imap";

export type BodyPart = {
  key: string;
  encoding?: string;
  charset?: string;
};

export type BodyParts = { text?: BodyPart; html?: BodyPart };

export const bodyPartLimit = 256 * 1024;

const inboxPath = "INBOX";

const maxStructureNodes = 200;

const maxStructureDepth = 12;

const maxSubjectLength = 998;

const maxRecipients = 50;

const refPattern = /^(\d{1,20}):(\d{1,10})$/;

const fileNameKeys = ["filename", "filename*", "name", "name*"];

export function receivedRef(uidValidity: string, uid: number) {
  return `${uidValidity}:${uid}`;
}

export function parseReceivedRef(ref: string) {
  const match = refPattern.exec(ref);
  const uid = Number(match?.[2]);
  if (!match?.[1] || !Number.isSafeInteger(uid) || uid <= 0) {
    return null;
  }
  return { uidValidity: match[1], uid };
}

function parameter(
  parameters: Record<string, string> | undefined,
  names: string[],
) {
  for (const [name, value] of Object.entries(parameters ?? {})) {
    if (names.includes(name.toLowerCase()) && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return undefined;
}

function isAttachment(node: MessageStructureObject) {
  return (
    node.disposition?.trim().toLowerCase() === "attachment" ||
    parameter(node.dispositionParameters, fileNameKeys) !== undefined ||
    parameter(node.parameters, fileNameKeys) !== undefined
  );
}

export function selectBodyParts(
  structure: MessageStructureObject | undefined,
): BodyParts {
  const chosen: BodyParts = {};
  let visited = 0;
  const walk = (node: MessageStructureObject, depth: number) => {
    visited += 1;
    if (visited > maxStructureNodes || depth > maxStructureDepth) {
      return;
    }
    const type = String(node.type ?? "").toLowerCase();
    if (type.startsWith("multipart/")) {
      for (const child of node.childNodes ?? []) {
        walk(child, depth + 1);
      }
      return;
    }
    if (isAttachment(node)) {
      return;
    }
    const slot =
      type === "text/plain" ? "text" : type === "text/html" ? "html" : null;
    if (!slot || chosen[slot]) {
      return;
    }
    chosen[slot] = {
      key: node.part ?? "1",
      ...(node.encoding ? { encoding: node.encoding } : {}),
      ...(parameter(node.parameters, ["charset"])
        ? { charset: parameter(node.parameters, ["charset"]) }
        : {}),
    };
  };
  if (structure) {
    walk(structure, 0);
  }
  return chosen;
}

function decodeBase64(value: Buffer) {
  const clean = value.toString("latin1").replace(/[^A-Za-z0-9+/]/g, "");
  return Buffer.from(
    clean.length % 4 === 1 ? clean.slice(0, -1) : clean,
    "base64",
  );
}

function hexValue(code: number) {
  if (code >= 48 && code <= 57) {
    return code - 48;
  }
  if (code >= 65 && code <= 70) {
    return code - 55;
  }
  if (code >= 97 && code <= 102) {
    return code - 87;
  }
  return -1;
}

function decodeQuotedPrintable(value: Buffer) {
  const out = Buffer.alloc(value.length);
  let length = 0;
  let index = 0;
  while (index < value.length) {
    const byte = value[index] ?? 0;
    if (byte !== 61) {
      out[length] = byte;
      length += 1;
      index += 1;
      continue;
    }
    let next = index + 1;
    while (value[next] === 32 || value[next] === 9) {
      next += 1;
    }
    if (value[next] === 13 && value[next + 1] === 10) {
      index = next + 2;
      continue;
    }
    if (value[next] === 10) {
      index = next + 1;
      continue;
    }
    if (next >= value.length || index + 2 >= value.length) {
      break;
    }
    const high = hexValue(value[index + 1] ?? 0);
    const low = hexValue(value[index + 2] ?? 0);
    if (high >= 0 && low >= 0) {
      out[length] = high * 16 + low;
      length += 1;
      index += 3;
      continue;
    }
    out[length] = byte;
    length += 1;
    index += 1;
  }
  return out.subarray(0, length);
}

export function decodeTransferBytes(
  value: Buffer,
  encoding: string | undefined,
) {
  const kind = encoding?.trim().toLowerCase();
  if (kind === "base64") {
    return decodeBase64(value);
  }
  if (kind === "quoted-printable") {
    return decodeQuotedPrintable(value);
  }
  return value;
}

function decodeWith(label: string, bytes: Buffer, fatal: boolean) {
  try {
    return new TextDecoder(label, { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

export function decodeCharset(bytes: Buffer, charset: string | undefined) {
  const label = charset
    ?.trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase();
  const named = label ? decodeWith(label, bytes, false) : null;
  return (
    named ??
    decodeWith("utf-8", bytes, true) ??
    decodeWith("windows-1252", bytes, false) ??
    bytes.toString("latin1")
  );
}

export function decodeBody(
  value: Buffer,
  part: Pick<BodyPart, "encoding" | "charset">,
  limit = bodyPartLimit,
) {
  const truncated = value.length >= limit;
  const text = decodeCharset(
    decodeTransferBytes(value.subarray(0, limit), part.encoding),
    part.charset,
  ).replaceAll("\u0000", "");
  return truncated ? text.replace(/�+$/, "") : text;
}

function isRefusedCommand(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const status = (error as { responseStatus?: unknown }).responseStatus;
  return status === "NO" || status === "BAD";
}

function toDate(value: Date | string | undefined) {
  if (value === undefined) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sender(message: ImapFetchedMessage): MessageAddress | null {
  const entry = message.envelope?.from?.find((item) => item.address);
  if (!entry?.address) {
    return null;
  }
  const name = entry.name?.trim();
  return name ? { email: entry.address, name } : { email: entry.address };
}

async function readBodies(session: ImapSession, uid: number, parts: BodyParts) {
  const wanted = [parts.text, parts.html].filter(
    (part): part is BodyPart => part !== undefined,
  );
  if (wanted.length === 0) {
    return { text: null, html: null };
  }
  let fetched: ImapFetchedMessage | false | undefined;
  try {
    fetched = await session.client.fetchOne(
      String(uid),
      {
        uid: true,
        bodyParts: wanted.map((part) => ({
          key: part.key,
          start: 0,
          maxLength: bodyPartLimit,
        })),
      },
      { uid: true },
    );
  } catch (error) {
    if (isRefusedCommand(error)) {
      return { text: null, html: null };
    }
    throw error;
  }
  const read = (part: BodyPart | undefined) => {
    const value =
      part && fetched ? fetched.bodyParts?.get(part.key.toLowerCase()) : null;
    return part && value ? decodeBody(value, part) : null;
  };
  return { text: read(parts.text), html: read(parts.html) };
}

export async function fetchReceived(
  context: ImapSmtpContext,
  credentials: Credentials,
  ref: string,
): Promise<ReceivedContent | null> {
  const mailbox = requirePassword(credentials);
  const target = parseReceivedRef(ref);
  if (!target) {
    return null;
  }
  return withImap(context, mailbox, async (session) => {
    const opened = await session.client.mailboxOpen(inboxPath, {
      readOnly: true,
    });
    if (String(opened?.uidValidity ?? "") !== target.uidValidity) {
      return null;
    }
    const message = await session.client.fetchOne(
      String(target.uid),
      { uid: true, envelope: true, internalDate: true, bodyStructure: true },
      { uid: true },
    );
    if (!message) {
      return null;
    }
    const bodies = await readBodies(
      session,
      target.uid,
      selectBodyParts(message.bodyStructure),
    );
    return {
      subject: (message.envelope?.subject ?? "").slice(0, maxSubjectLength),
      text: bodies.text,
      html: bodies.html,
      from: sender(message),
      to: (message.envelope?.to ?? [])
        .map((entry) => entry.address)
        .filter((address): address is string => Boolean(address))
        .slice(0, maxRecipients),
      date: toDate(message.envelope?.date) ?? toDate(message.internalDate),
    };
  });
}
