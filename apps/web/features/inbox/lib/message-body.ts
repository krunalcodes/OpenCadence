export const frameSandbox = "allow-popups allow-popups-to-escape-sandbox";

export const maxBodyHeight = 420;
export const maxExpandedHeight = 6000;

const minBodyHeight = 44;
const lineHeight = 20.15;
const characterWidth = 6.5;
const framePadding = 4;

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
const quotedLine = /^\s*>/;
const linkPattern = /https?:\/\/[^\s<>"']+/g;
const trailingPunctuation = /[.,;:!?)\]]+$/;

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
    return historyMarkers.some((marker) => marker.test(joined));
  }
  return false;
}

export type SplitText = { visible: string; quoted: string | null };

export function splitQuoted(text: string): SplitText {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let cut = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    if (isHistoryStart(lines, index)) {
      cut = index;
      break;
    }
  }
  if (cut === lines.length) {
    let end = lines.length;
    while (end > 0 && (lines[end - 1] ?? "").trim() === "") {
      end -= 1;
    }
    let start = end;
    while (start > 0 && quotedLine.test(lines[start - 1] ?? "")) {
      start -= 1;
    }
    if (start < end) {
      cut = start;
    }
  }
  const visible = lines.slice(0, cut).join("\n").trim();
  const quoted = lines.slice(cut).join("\n").trim();
  if (visible === "" || quoted === "") {
    return { visible: text.trim(), quoted: null };
  }
  return { visible, quoted };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeCssString(value: string) {
  return Array.from(value)
    .map((character) =>
      /[a-zA-Z0-9 ]/.test(character)
        ? character
        : `\\${(character.codePointAt(0) ?? 32).toString(16)} `,
    )
    .join("");
}

function linkify(line: string) {
  let out = "";
  let position = 0;
  for (const match of line.matchAll(linkPattern)) {
    const found = match[0];
    const url = found.replace(trailingPunctuation, "");
    const start = match.index ?? 0;
    out += escapeHtml(line.slice(position, start));
    out += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(url)}</a>`;
    out += escapeHtml(found.slice(url.length));
    position = start + found.length;
  }
  return out + escapeHtml(line.slice(position));
}

function textMarkup(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const rendered = lines.map((line) =>
    quotedLine.test(line)
      ? `<span class="quoted">${linkify(line)}</span>`
      : linkify(line),
  );
  return `<div class="text">${rendered.join("\n")}</div>`;
}

function frameStyles(imageLabel: string) {
  return [
    "html{color-scheme:light}",
    'body{margin:0;padding:2px 1px;background:#FFFFFF;color:#14201B;font:400 13px/1.55 "Inter Variable",Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-wrap:anywhere;-webkit-text-size-adjust:100%}',
    "a{color:#0F5C4D;text-decoration:underline;text-underline-offset:2px}",
    "a:hover{color:#0B4A3E}",
    "a:focus-visible{outline:2px solid #0F5C4D;outline-offset:2px;border-radius:4px}",
    "p{margin:0 0 8px}",
    "ul,ol{margin:0 0 8px;padding-left:20px}",
    "li{margin:2px 0}",
    "h1,h2,h3,h4,h5,h6{margin:12px 0 6px;font-weight:600;line-height:1.4;letter-spacing:-0.005em}",
    "h1{font-size:15px}",
    "h2{font-size:14px}",
    "h3,h4,h5,h6{font-size:13px}",
    "b,strong{font-weight:600}",
    "small{font-size:12px;color:#56635C}",
    "blockquote{margin:8px 0;padding:0 0 0 12px;border-left:2px solid #E3E7E0;color:#56635C}",
    "hr{border:0;border-top:1px solid #E3E7E0;margin:12px 0}",
    "pre,code{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}",
    "pre{margin:0 0 8px;padding:8px 10px;white-space:pre-wrap;background:#F4F6F2;border:1px solid #EEF1EB;border-radius:8px}",
    "table{max-width:100%;border-collapse:collapse}",
    "td,th{padding:4px 8px 4px 0;vertical-align:top;text-align:left;font-weight:400}",
    "th{font-weight:600}",
    "body>:first-child{margin-top:0}",
    "body>:last-child{margin-bottom:0}",
    ".text{white-space:pre-wrap}",
    ".quoted{color:#85918A}",
    "span[data-inbox-image]{display:inline-block;max-width:100%;margin:1px 2px 1px 0;padding:1px 7px;border-radius:6px;background:#EEF1EB;color:#56635C;font-size:12px;font-weight:500;line-height:18px;vertical-align:baseline}",
    `span[data-inbox-image]::before{content:"${escapeCssString(imageLabel)} ";color:#85918A;font-weight:400}`,
  ].join("");
}

function frameDocument(body: string, imageLabel: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><meta name="referrer" content="no-referrer"><base target="_blank"><style>${frameStyles(imageLabel)}</style></head><body>${body}</body></html>`;
}

export function textDocument(text: string, imageLabel: string) {
  return frameDocument(textMarkup(text), imageLabel);
}

export function htmlDocument(html: string, imageLabel: string) {
  return frameDocument(html, imageLabel);
}

function heightOfLines(text: string, width: number) {
  const perLine = Math.max(20, Math.floor(width / characterWidth));
  let lines = 0;
  for (const line of text.split("\n")) {
    lines += Math.max(1, Math.ceil(Array.from(line).length / perLine));
  }
  return lines * lineHeight + framePadding;
}

export function estimateTextHeight(text: string, width: number) {
  return Math.max(minBodyHeight, Math.ceil(heightOfLines(text, width)));
}

export function estimateHtmlHeight(html: string, width: number) {
  const flat = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|blockquote|pre|table|ul|ol)>/gi, "\n\n")
    .replace(/<\/(div|li|tr|dd|dt|caption)>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return Math.max(minBodyHeight, Math.ceil(heightOfLines(flat, width) * 1.12));
}
