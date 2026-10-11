import type { DeliveryStatus } from "@workspace/integration-core";
import { normalizeMessageId } from "./mime";

export type HeaderFields = Map<string, string[]>;

type MimePart = { encoding?: string; body: string[] };

const statusPattern = /(?:^|[^\d.])([245]\.\d{1,3}\.\d{1,3})(?![\d.])/;

const addressPattern = /[^\s<>;,"()]+@[^\s<>;,"()]+/;

const messageIdPattern = /<[^<>\s]+>/;

const contentTypePattern = /^content-type:\s*([^;\s]*)/i;

const transferEncodingPattern = /^content-transfer-encoding:\s*([^;\s]+)/i;

const statusTypes = [
  "message/delivery-status",
  "message/global-delivery-status",
];

const originalTypes = [
  "message/rfc822",
  "message/global",
  "text/rfc822-headers",
  "message/rfc822-headers",
  "message/global-headers",
];

export function decodeTransfer(text: string, encoding: string | undefined) {
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

export function parseHeaderGroups(value: string): HeaderFields[] {
  const lines = value
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
    first(parseHeaderGroups(originalHeaders)[0], "message-id")?.match(
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

function findPart(lines: string[], types: string[]): MimePart | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const match = contentTypePattern.exec(lines[index] ?? "");
    if (!match) {
      continue;
    }
    const type = (match[1] || (lines[index + 1] ?? "").trim().split(";")[0])
      ?.trim()
      .toLowerCase();
    if (!type || !types.includes(type)) {
      continue;
    }
    let start = index;
    while (
      start > 0 &&
      (lines[start - 1] ?? "") !== "" &&
      !(lines[start - 1] ?? "").startsWith("--")
    ) {
      start -= 1;
    }
    let end = index;
    while (end < lines.length && (lines[end] ?? "") !== "") {
      end += 1;
    }
    const encoding = lines
      .slice(start, end)
      .map((line) => transferEncodingPattern.exec(line)?.[1])
      .find((value) => value !== undefined);
    const body: string[] = [];
    for (let cursor = end + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor] ?? "";
      if (line.startsWith("--")) {
        break;
      }
      body.push(line);
    }
    return { encoding, body };
  }
  return undefined;
}

export function readDeliveryReport(raw: string): DeliveryStatus | undefined {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const status = findPart(lines, statusTypes);
  if (!status) {
    return undefined;
  }
  const original = findPart(lines, originalTypes);
  const report = parseDeliveryStatus(
    decodeTransfer(status.body.join("\n"), status.encoding),
    original ? decodeTransfer(original.body.join("\n"), original.encoding) : "",
  );
  return Object.keys(report).length > 0 ? report : undefined;
}
