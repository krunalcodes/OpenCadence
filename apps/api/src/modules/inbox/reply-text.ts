import { htmlToText, sanitizeHtml } from "./html-sanitizer";

export const maxStoredTextLength = 200_000;
export const maxStoredHtmlLength = 400_000;
export const maxSubjectLength = 500;
export const snippetLength = 200;

const rfcMessageIdPattern = /^<[^<>\s"\\]{1,300}>$/;
const syntheticIdSuffix = ".inbox.invalid>";

export function isRfcMessageId(value: string | null | undefined) {
  return typeof value === "string" && rfcMessageIdPattern.test(value);
}

export function syntheticMessageId(key: string, sourceId: string) {
  return `<${key}@${sourceId}${syntheticIdSuffix}`;
}

export function isSyntheticMessageId(value: string | null | undefined) {
  return typeof value === "string" && value.endsWith(syntheticIdSuffix);
}

const historyMarkers = [
  /^-{2,}\s*original message\s*-{2,}$/i,
  /^-{2,}\s*forwarded message\s*-{2,}$/i,
  /^-{2,}\s*reply above this line\s*-{2,}$/i,
  /^_{10,}$/,
  /^on\b.{1,400}\bwrote:$/i,
  /^le\b.{1,400}\ba écrit\s*:$/i,
  /^am\b.{1,400}\bschrieb\b.{0,200}:$/i,
  /^el\b.{1,400}\bescribió\s*:$/i,
  /^op\b.{1,400}\bschreef\b.{0,200}:$/i,
  /^il\b.{1,400}\bha scritto\s*:$/i,
];

const wrappedOpeners = /^(on|le|am|el|op|il)\b/i;
const headerLine = /^(from|von|de|van|da)\s?:\s?\S/i;
const headerFollowers =
  /^(sent|date|to|subject|cc|gesendet|datum|an|betreff|envoyé|objet|à)\s?:/i;
const replyPrefix = /^\s*((re|aw|sv|vs|antw|rif|r|odp)(\[\d+\])?\s*:\s*)+/i;

function isHistoryStart(lines: string[], index: number) {
  const line = lines[index]?.trim() ?? "";
  if (line === "") {
    return false;
  }
  if (historyMarkers.some((marker) => marker.test(line))) {
    return true;
  }
  if (wrappedOpeners.test(line)) {
    const joined = `${line} ${lines[index + 1]?.trim() ?? ""}`;
    if (historyMarkers.some((marker) => marker.test(joined))) {
      return true;
    }
  }
  if (headerLine.test(line)) {
    return lines
      .slice(index + 1, index + 4)
      .some((next) => headerFollowers.test(next.trim()));
  }
  return false;
}

export function trimQuotedHistory(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (isHistoryStart(lines, index)) {
      break;
    }
    if (!/^\s*>/.test(lines[index] ?? "")) {
      kept.push(lines[index] ?? "");
    }
  }
  const trimmed = kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return trimmed === "" ? text.trim() : trimmed;
}

export function snippetOf(text: string, length = snippetLength): string {
  const flat = trimQuotedHistory(text).replace(/\s+/g, " ").trim();
  return Array.from(flat).slice(0, length).join("");
}

export function baseSubject(subject: string): string {
  return subject.replace(/\s+/g, " ").replace(replyPrefix, "").trim();
}

export function replySubject(subject: string): string {
  return `Re: ${baseSubject(subject)}`.trim().slice(0, maxSubjectLength);
}

export function normalizeText(text: string): string {
  return text
    .replaceAll("\u0000", "")
    .replace(/\r\n?/g, "\n")
    .slice(0, maxStoredTextLength)
    .trim();
}

export function safeContent(input: {
  text?: string | null;
  html?: string | null;
}): { text: string | null; html: string | null } {
  const sanitized = input.html ? sanitizeHtml(input.html) : "";
  const html =
    sanitized.trim() !== "" && sanitized.length <= maxStoredHtmlLength
      ? sanitized
      : null;
  const given = input.text ? normalizeText(input.text) : "";
  const derived =
    given === "" && input.html ? normalizeText(htmlToText(input.html)) : given;
  return { text: derived === "" ? null : derived, html };
}
