import { domainToASCII } from "node:url";
import {
  IntegrationError,
  type MessageAddress,
} from "@workspace/integration-core";

export type MimeInput = {
  from: MessageAddress;
  to: string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  headers?: Array<[string, string]>;
  date: Date;
  boundary: string;
};

const crlf = "\r\n";

const softLineLength = 78;

const hardLineLength = 998;

const encodedWordBytes = 45;

const encodedWordOverhead = 12;

const quotedPrintableLineLength = 75;

const headerNamePattern = /^[!-9;-~]+$/;

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

function invalid(message: string) {
  return new IntegrationError("validation", message);
}

export function isPrintableAscii(value: string) {
  return /^[\x20-\x7e]*$/.test(value);
}

export function singleLine(value: string) {
  let result = "";
  for (const character of value.replace(/[\r\n\t]+/g, " ")) {
    const code = character.charCodeAt(0);
    if (code >= 32 && code !== 127) {
      result += character;
    }
  }
  return result.trim();
}

export function toAsciiAddress(email: string) {
  const address = email.trim();
  const at = address.lastIndexOf("@");
  const local = address.slice(0, at);
  const domain = at === -1 ? "" : domainToASCII(address.slice(at + 1));
  if (
    at <= 0 ||
    !domain ||
    !/^[\x21-\x7e]+$/.test(local) ||
    /[<>,;]/.test(local)
  ) {
    throw invalid(
      "An email address is not valid. Amazon SES accepts ASCII in the part before the @ sign only.",
    );
  }
  return `${local}@${domain}`;
}

function encodedWordChunks(value: string, firstBudget: number) {
  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  let budget = firstBudget;
  for (const character of value) {
    const bytes = Buffer.byteLength(character, "utf8");
    if (currentBytes + bytes > budget && current) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
      budget = encodedWordBytes;
    }
    current += character;
    currentBytes += bytes;
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

export function encodeWords(value: string, firstBudget = encodedWordBytes) {
  return encodedWordChunks(value, firstBudget).map(
    (chunk) => `=?UTF-8?B?${Buffer.from(chunk, "utf8").toString("base64")}?=`,
  );
}

function firstWordBudget(prefixLength: number) {
  const available = softLineLength - 2 - prefixLength - encodedWordOverhead;
  return Math.min(encodedWordBytes, Math.floor(available / 4) * 3);
}

export function foldHeader(line: string) {
  const words = line.split(" ");
  const lines: string[] = [];
  let current = words[0] ?? "";
  for (const word of words.slice(1)) {
    if (
      current.length + 1 + word.length > softLineLength &&
      current.trim() !== ""
    ) {
      lines.push(current);
      current = ` ${word}`;
    } else {
      current += ` ${word}`;
    }
  }
  lines.push(current);
  if (lines.some((entry) => entry.length > hardLineLength)) {
    throw invalid("A header is too long to send.");
  }
  return lines.join(crlf);
}

export function formatDisplayName(name: string | undefined) {
  const cleaned = singleLine(name ?? "");
  if (!cleaned) {
    return "";
  }
  if (!isPrintableAscii(cleaned)) {
    return encodeWords(cleaned).join(" ");
  }
  if (/[()<>[\]:;@\\,."]/.test(cleaned)) {
    return `"${cleaned.replace(/(["\\])/g, "\\$1")}"`;
  }
  return cleaned;
}

export function formatAddress({ email, name }: MessageAddress) {
  const address = toAsciiAddress(email);
  const display = formatDisplayName(name);
  return display ? `${display} <${address}>` : address;
}

export function formatMessageId(value: string) {
  const cleaned = singleLine(value).replace(/\s+/g, "");
  if (!cleaned || !isPrintableAscii(cleaned)) {
    throw invalid("A message ID is not valid.");
  }
  const inner = cleaned.replace(/^</, "").replace(/>$/, "");
  return `<${inner}>`;
}

export function formatDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${weekdays[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${
    months[date.getUTCMonth()]
  } ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(
    date.getUTCMinutes(),
  )}:${pad(date.getUTCSeconds())} +0000`;
}

export function unstructuredHeader(name: string, value: string) {
  if (!headerNamePattern.test(name)) {
    throw invalid("A custom header name is not valid.");
  }
  const cleaned = singleLine(value);
  if (isPrintableAscii(cleaned)) {
    return foldHeader(`${name}: ${cleaned}`);
  }
  const budget = firstWordBudget(name.length + 2);
  if (budget < 3) {
    return [`${name}:`, ...encodeWords(cleaned).map((word) => ` ${word}`)].join(
      crlf,
    );
  }
  const [first, ...rest] = encodeWords(cleaned, budget);
  return [`${name}: ${first}`, ...rest.map((word) => ` ${word}`)].join(crlf);
}

export function quotedPrintable(input: string) {
  return input
    .replace(/\r\n|\r|\n/g, "\n")
    .split("\n")
    .map((line) => {
      const bytes = Buffer.from(line, "utf8");
      let encoded = "";
      let current = "";
      bytes.forEach((byte, index) => {
        const isLast = index === bytes.length - 1;
        const isSpace = byte === 0x20 || byte === 0x09;
        const literal =
          byte !== 0x3d &&
          ((byte >= 0x21 && byte <= 0x7e) || (isSpace && !isLast));
        const token = literal
          ? String.fromCharCode(byte)
          : `=${byte.toString(16).toUpperCase().padStart(2, "0")}`;
        if (current.length + token.length > quotedPrintableLineLength) {
          encoded += `${current}=${crlf}`;
          current = "";
        }
        current += token;
      });
      return encoded + current;
    })
    .join(crlf);
}

function bodyPart(type: "plain" | "html", content: string) {
  return [
    `Content-Type: text/${type}; charset=UTF-8`,
    "Content-Transfer-Encoding: quoted-printable",
    "",
    quotedPrintable(content),
  ].join(crlf);
}

function addressList(name: string, addresses: string[]) {
  return foldHeader(`${name}: ${addresses.map(toAsciiAddress).join(", ")}`);
}

export function buildMime(input: MimeInput) {
  if (input.html === undefined && input.text === undefined) {
    throw invalid("An email needs an HTML body or a text body.");
  }
  const lines = [
    `Date: ${formatDate(input.date)}`,
    foldHeader(`From: ${formatAddress(input.from)}`),
  ];
  if (input.to.length > 0) {
    lines.push(addressList("To", input.to));
  }
  if (input.cc?.length) {
    lines.push(addressList("Cc", input.cc));
  }
  if (input.replyTo) {
    lines.push(addressList("Reply-To", [input.replyTo]));
  }
  lines.push(unstructuredHeader("Subject", input.subject));
  if (input.messageId) {
    lines.push(`Message-ID: ${formatMessageId(input.messageId)}`);
  }
  if (input.inReplyTo) {
    lines.push(`In-Reply-To: ${formatMessageId(input.inReplyTo)}`);
  }
  if (input.references?.length) {
    lines.push(
      foldHeader(
        `References: ${input.references.map(formatMessageId).join(" ")}`,
      ),
    );
  }
  for (const [name, value] of input.headers ?? []) {
    lines.push(unstructuredHeader(name, value));
  }
  lines.push("MIME-Version: 1.0");

  if (input.html !== undefined && input.text !== undefined) {
    lines.push(
      `Content-Type: multipart/alternative; boundary="${input.boundary}"`,
      "",
      `--${input.boundary}`,
      bodyPart("plain", input.text),
      `--${input.boundary}`,
      bodyPart("html", input.html),
      `--${input.boundary}--`,
      "",
    );
    return lines.join(crlf);
  }
  lines.push(
    input.html !== undefined
      ? bodyPart("html", input.html)
      : bodyPart("plain", input.text ?? ""),
    "",
  );
  return lines.join(crlf);
}
