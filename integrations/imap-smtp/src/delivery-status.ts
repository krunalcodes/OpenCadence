import type { DeliveryStatus } from "@workspace/integration-core";
import { normalizeMessageId } from "./imap";

export type HeaderFields = Map<string, string[]>;

const statusPattern = /(?:^|[^\d.])([245]\.\d{1,3}\.\d{1,3})(?![\d.])/;

const addressPattern = /[^\s<>;,"()]+@[^\s<>;,"()]+/;

const messageIdPattern = /<[^<>\s]+>/;

function toText(value: Buffer | string | undefined) {
  if (value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : value.toString("utf8");
}

export function decodeTransfer(
  value: Buffer | string | undefined,
  encoding: string | undefined,
) {
  const text = toText(value);
  const kind = encoding?.trim().toLowerCase();
  if (kind === "base64") {
    return Buffer.from(text.replace(/[^A-Za-z0-9+/=]/g, ""), "base64").toString(
      "utf8",
    );
  }
  if (kind === "quoted-printable") {
    return text
      .replace(/=[ \t]*\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_match, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
  }
  return text;
}

export function parseHeaderGroups(
  value: Buffer | string | undefined,
): HeaderFields[] {
  const lines = toText(value)
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]+/g, " ")
    .split("\n");
  const groups: HeaderFields[] = [];
  let current: HeaderFields = new Map();
  for (const line of lines) {
    if (line.trim() === "") {
      if (current.size > 0) {
        groups.push(current);
        current = new Map();
      }
      continue;
    }
    const colon = line.indexOf(":");
    if (colon <= 0) {
      continue;
    }
    const name = line.slice(0, colon).trim().toLowerCase();
    if (name === "" || /\s/.test(name)) {
      continue;
    }
    const field = line
      .slice(colon + 1)
      .replace(/\s+/g, " ")
      .trim();
    current.set(name, [...(current.get(name) ?? []), field]);
  }
  if (current.size > 0) {
    groups.push(current);
  }
  return groups;
}

export function parseHeaders(value: Buffer | string | undefined): HeaderFields {
  return parseHeaderGroups(value)[0] ?? new Map();
}

function first(fields: HeaderFields | undefined, name: string) {
  return fields?.get(name)?.find((entry) => entry !== "");
}

function recipientOf(fields: HeaderFields | undefined) {
  const value =
    first(fields, "final-recipient") ?? first(fields, "original-recipient");
  if (!value) {
    return undefined;
  }
  const address = value.slice(value.indexOf(";") + 1);
  return address.match(addressPattern)?.[0].toLowerCase();
}

export function parseDeliveryStatus(
  report: string,
  originalHeaders: string,
): DeliveryStatus {
  const groups = parseHeaderGroups(report);
  const recipients = groups.filter(
    (group) =>
      group.has("action") ||
      group.has("status") ||
      group.has("final-recipient"),
  );
  const chosen =
    recipients.find((group) =>
      /^failed\b/i.test(first(group, "action") ?? ""),
    ) ?? recipients[0];
  const action = first(chosen, "action")
    ?.match(/^[a-z]+/i)?.[0]
    .toLowerCase();
  const status = first(chosen, "status")?.match(statusPattern)?.[1];
  const failedRecipient = recipientOf(chosen);
  const originalMessageId = normalizeMessageId(
    first(parseHeaders(originalHeaders), "message-id")?.match(
      messageIdPattern,
    )?.[0],
  );
  return {
    ...(action ? { action } : {}),
    ...(status ? { status } : {}),
    ...(originalMessageId ? { originalMessageId } : {}),
    ...(failedRecipient ? { failedRecipient } : {}),
  };
}
