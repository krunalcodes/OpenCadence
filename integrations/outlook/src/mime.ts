import {
  IntegrationError,
  type MessageAddress,
  type OutboundMessage,
} from "@workspace/integration-core";

export type MimeOptions = {
  messageId: string;
  date: Date;
  boundary: string;
};

const softLineLimit = 78;

const hardLineLimit = 998;

const encodedLineLimit = 76;

const encodedWordOverhead = "=?UTF-8?B??=".length;

const bodyLineLimit = 76;

const foldAfterColumn = 40;

const utf8 = new TextEncoder();

const plainAsciiPattern = /^[\t\u0020-\u007e]*$/;

const headerNamePattern = /^[\u0021-\u0039\u003b-\u007e]+$/;

const atomTextPattern = /^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~ ]+$/;

const addressPattern =
  /^[\u0021\u0023-\u0027\u002a\u002b\u002d-\u0039\u003d\u003f\u0041-\u005a\u005e-\u007e]+@[A-Za-z0-9.-]+$/;

const messageIdPattern = /^<[\u0021-\u003b\u003d\u003f-\u007e]+>$/;

const reservedHeaders = new Set([
  "date",
  "from",
  "sender",
  "to",
  "cc",
  "bcc",
  "reply-to",
  "subject",
  "message-id",
  "in-reply-to",
  "references",
  "mime-version",
  "content-type",
  "content-transfer-encoding",
]);

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function isControl(code: number) {
  return code < 32 || code === 127;
}

function hasControl(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (isControl(code) && code !== 9) {
      return true;
    }
  }
  return false;
}

function singleLine(value: string) {
  let out = "";
  for (const character of value.replace(/[\r\n\t]+/g, " ")) {
    if (!isControl(character.charCodeAt(0))) {
      out += character;
    }
  }
  return out.trim();
}

function invalid(message: string): never {
  throw new IntegrationError("validation", message);
}

function lastLineLength(value: string) {
  const index = value.lastIndexOf("\r\n");
  return index === -1 ? value.length : value.length - index - 2;
}

function firstLineLength(value: string) {
  const index = value.indexOf("\r\n");
  return index === -1 ? value.length : index;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDate(date: Date): string {
  return `${weekdays[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${
    months[date.getUTCMonth()]
  } ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(
    date.getUTCMinutes(),
  )}:${pad(date.getUTCSeconds())} +0000`;
}

export function normalizeMessageId(
  value: string | undefined,
): string | undefined {
  const inner = value?.trim().replace(/^<+/, "").replace(/>+$/, "").trim();
  return inner ? `<${inner}>` : undefined;
}

function requireMessageId(value: string, label: string): string {
  const id = normalizeMessageId(value);
  if (!id || !messageIdPattern.test(id)) {
    return invalid(`The ${label} is not a valid message identifier.`);
  }
  return id;
}

function requireAddress(value: string): string {
  const email = value.trim();
  if (!addressPattern.test(email)) {
    return invalid("An email address on the message is not valid.");
  }
  return email;
}

export function encodeWords(text: string, used: number): string {
  const words: string[] = [];
  let column = used;
  let chunk: number[] = [];
  const capacity = () =>
    Math.floor((encodedLineLimit - column - encodedWordOverhead) / 4) * 3;
  const flush = () => {
    words.push(`=?UTF-8?B?${Buffer.from(chunk).toString("base64")}?=`);
    chunk = [];
    column = 1;
  };
  for (const character of text) {
    const bytes = utf8.encode(character);
    if (chunk.length > 0 && chunk.length + bytes.length > capacity()) {
      flush();
    }
    chunk.push(...bytes);
  }
  if (chunk.length > 0) {
    flush();
  }
  return words.join("\r\n ");
}

function foldWords(name: string, value: string): string {
  let line = `${name}:`;
  const lines: string[] = [];
  for (const word of value.split(" ")) {
    const candidate = `${line} ${word}`;
    if (
      candidate.length > softLineLimit &&
      word !== "" &&
      line.trim() !== `${name}:` &&
      line.trim() !== ""
    ) {
      lines.push(line);
      line = ` ${word}`;
    } else {
      line = candidate;
    }
  }
  lines.push(line.trimEnd());
  if (lines.some((entry) => entry.length > hardLineLimit)) {
    return invalid(`The ${name} header has a line that is too long.`);
  }
  return lines.join("\r\n");
}

export function textHeader(name: string, value: string): string {
  const text = value.trim();
  if (plainAsciiPattern.test(text)) {
    return foldWords(name, text.replaceAll("\t", " "));
  }
  const used = name.length + 2;
  return used > foldAfterColumn
    ? `${name}:\r\n ${encodeWords(text, 1)}`
    : `${name}: ${encodeWords(text, used)}`;
}

function displayName(name: string | undefined, used: number) {
  const clean = name === undefined ? "" : singleLine(name);
  if (!clean) {
    return undefined;
  }
  if (!plainAsciiPattern.test(clean)) {
    return encodeWords(clean, used);
  }
  if (atomTextPattern.test(clean)) {
    return clean;
  }
  return `"${clean.replace(/(["\\])/g, "\\$1")}"`;
}

function formatMailbox(mailbox: MessageAddress, used: number): string {
  const email = requireAddress(mailbox.email);
  const display = displayName(mailbox.name, used);
  if (!display) {
    return email;
  }
  const column = display.includes("\r\n")
    ? lastLineLength(display)
    : used + display.length;
  return column + email.length + 3 > softLineLimit
    ? `${display}\r\n <${email}>`
    : `${display} <${email}>`;
}

export function addressHeader(name: string, mailboxes: MessageAddress[]) {
  let header = `${name}:`;
  mailboxes.forEach((mailbox, index) => {
    if (index > 0) {
      header += ",";
    }
    const used = lastLineLength(header) + 1;
    const inline =
      index === 0 || used <= foldAfterColumn
        ? formatMailbox(mailbox, used)
        : undefined;
    if (
      inline !== undefined &&
      (index === 0 || used + firstLineLength(inline) <= softLineLimit)
    ) {
      header += ` ${inline}`;
    } else {
      header += `\r\n ${formatMailbox(mailbox, 1)}`;
    }
  });
  return header;
}

function identifiersHeader(name: string, ids: string[]) {
  let header = `${name}:`;
  for (const id of ids) {
    header +=
      lastLineLength(header) + id.length + 1 > softLineLimit &&
      header !== `${name}:`
        ? `\r\n ${id}`
        : ` ${id}`;
  }
  return header;
}

function customHeader(name: string, value: string): string | undefined {
  const key = name.trim();
  if (!headerNamePattern.test(key)) {
    return invalid("A custom header has a name that is not valid.");
  }
  if (reservedHeaders.has(key.toLowerCase())) {
    return undefined;
  }
  if (hasControl(value)) {
    return invalid(
      `The ${key} header contains characters that are not allowed.`,
    );
  }
  return textHeader(key, value);
}

function needsEscape(byte: number) {
  return byte === 61 || byte > 126 || (byte < 32 && byte !== 9);
}

export function encodeQuotedPrintable(text: string): string {
  const lines: string[] = [];
  for (const source of text.split("\r\n")) {
    const bytes = utf8.encode(source);
    let line = "";
    bytes.forEach((byte, index) => {
      const trailingSpace =
        (byte === 32 || byte === 9) && index === bytes.length - 1;
      const token =
        needsEscape(byte) || trailingSpace
          ? `=${byte.toString(16).toUpperCase().padStart(2, "0")}`
          : String.fromCharCode(byte);
      if (line.length + token.length > bodyLineLimit - 1) {
        lines.push(`${line}=`);
        line = "";
      }
      line += token;
    });
    lines.push(line);
  }
  return lines.join("\r\n");
}

export function encodeBase64Lines(bytes: Uint8Array): string {
  const encoded = Buffer.from(bytes).toString("base64");
  return (encoded.match(new RegExp(`.{1,${bodyLineLimit}}`, "g")) ?? []).join(
    "\r\n",
  );
}

function bodyPart(subtype: "plain" | "html", content: string): string[] {
  const text = content.replace(/\r\n|\r|\n/g, "\r\n");
  const bytes = utf8.encode(text);
  const escaped = bytes.reduce(
    (count, byte) =>
      count + (needsEscape(byte) && byte !== 13 && byte !== 10 ? 1 : 0),
    0,
  );
  const useBase64 = escaped * 2 > bytes.length;
  return [
    `Content-Type: text/${subtype}; charset=utf-8`,
    `Content-Transfer-Encoding: ${useBase64 ? "base64" : "quoted-printable"}`,
    "",
    useBase64 ? encodeBase64Lines(bytes) : encodeQuotedPrintable(text),
  ];
}

function toMailboxes(addresses: string[] | undefined): MessageAddress[] {
  return (addresses ?? []).map((email) => ({ email }));
}

export function buildMimeMessage(
  message: OutboundMessage,
  options: MimeOptions,
): string {
  const lines: string[] = [
    `Date: ${formatDate(options.date)}`,
    addressHeader("From", [message.from]),
    addressHeader("To", toMailboxes(message.to)),
  ];
  if (message.cc?.length) {
    lines.push(addressHeader("Cc", toMailboxes(message.cc)));
  }
  if (message.bcc?.length) {
    lines.push(addressHeader("Bcc", toMailboxes(message.bcc)));
  }
  if (message.replyTo) {
    lines.push(addressHeader("Reply-To", [{ email: message.replyTo }]));
  }
  lines.push(
    textHeader("Subject", singleLine(message.subject)),
    `Message-ID: ${requireMessageId(options.messageId, "Message-ID")}`,
  );
  if (message.thread?.inReplyTo) {
    lines.push(
      `In-Reply-To: ${requireMessageId(message.thread.inReplyTo, "In-Reply-To header")}`,
    );
  }
  if (message.thread?.references?.length) {
    lines.push(
      identifiersHeader(
        "References",
        message.thread.references.map((id) =>
          requireMessageId(id, "References header"),
        ),
      ),
    );
  }
  lines.push("MIME-Version: 1.0");
  for (const [name, value] of Object.entries(message.headers ?? {})) {
    const header = customHeader(name, value);
    if (header) {
      lines.push(header);
    }
  }

  const parts: string[][] = [];
  if (message.text !== undefined || message.html === undefined) {
    parts.push(bodyPart("plain", message.text ?? ""));
  }
  if (message.html !== undefined) {
    parts.push(bodyPart("html", message.html));
  }
  const [single] = parts;
  if (parts.length === 1 && single) {
    lines.push(...single);
  } else {
    lines.push(
      `Content-Type: multipart/alternative; boundary="${options.boundary}"`,
      "",
    );
    for (const part of parts) {
      lines.push(`--${options.boundary}`, ...part);
    }
    lines.push(`--${options.boundary}--`);
  }
  return `${lines.join("\r\n")}\r\n`;
}
