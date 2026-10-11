import {
  escapeHtml,
  findMergeTags,
  type MergeTag,
  mergeTagValue,
  renderMergeTags,
} from "../merge-tags/merge-tags";
import { readMessageToken, trackedClickUrl } from "../tracking/tokens";
import { decodeAttributeValue, decodeText } from "./entities";
import {
  type HtmlAttribute,
  type HtmlToken,
  tokenizeHtml,
} from "./html-tokens";

export type PrepareEmailInput = {
  html: string | null;
  text: string | null;
  previewText?: string;
  variables: Record<string, string>;
  messageToken: string;
  baseUrl: string;
  secret: Buffer;
  trackOpens: boolean;
  trackClicks: boolean;
  unsubscribe: boolean;
  headers?: Record<string, string>;
  unsubscribeLabel?: string;
};

export type PreparedEmail = {
  html: string | null;
  text: string | null;
  headers: Record<string, string>;
};

type Edit = { start: number; end: number; replacement: string };

type Context = {
  variables: Record<string, string>;
  baseUrl: string;
  messageToken: string;
  messageId: string | null;
  secret: Buffer;
  unsubscribeUrl: string | null;
  unsubscribeLabel: string;
  previewText: string;
  trackOpens: boolean;
  trackClicks: boolean;
};

const defaultUnsubscribeLabel = "Unsubscribe";
const maxTrackedUrlLength = 2000;
const maxVisibleUrlLength = 2048;

const urlAttributes = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "background",
  "poster",
  "cite",
]);

const unsafeSchemePattern = /^(?:javascript|vbscript|data):/i;
const absoluteHttpPattern = /^https?:\/\//i;
const visibleUrlPattern =
  /^(?:(?:https?:\/\/|www\.)\S+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:[/?#]\S*)?)$/i;

const preheaderStyle =
  "display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:transparent;mso-hide:all";
const footerStyle =
  "margin:24px 0 0;padding:0 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280;text-align:center";
const footerLinkStyle = "color:#6b7280;text-decoration:underline";
const pixelStyle =
  "display:block;border:0;outline:none;width:1px;height:1px;overflow:hidden";

function applyEdits(source: string, edits: Edit[]) {
  if (edits.length === 0) {
    return source;
  }
  const ordered = edits
    .map((edit, index) => ({ edit, index }))
    .sort((a, b) => a.edit.start - b.edit.start || a.index - b.index);
  const parts: string[] = [];
  let position = 0;
  for (const { edit } of ordered) {
    if (edit.start < position) {
      continue;
    }
    parts.push(source.slice(position, edit.start), edit.replacement);
    position = edit.end;
  }
  parts.push(source.slice(position));
  return parts.join("");
}

function maskMergeTags(template: string, tags: MergeTag[]) {
  const parts: string[] = [];
  let position = 0;
  for (const tag of tags) {
    parts.push(
      template.slice(position, tag.start),
      "x".repeat(tag.end - tag.start),
    );
    position = tag.end;
  }
  parts.push(template.slice(position));
  return parts.join("");
}

function withoutControlsAndSpaces(value: string) {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 32) {
      output += value.charAt(index);
    }
  }
  return output;
}

function safeUrlValue(value: string) {
  const trimmed = value.trim();
  return unsafeSchemePattern.test(withoutControlsAndSpaces(trimmed))
    ? ""
    : trimmed;
}

function encodeUrlPart(value: string) {
  try {
    return encodeURIComponent(value).replaceAll("%40", "@");
  } catch {
    return "";
  }
}

function renderAttribute(
  template: string,
  attribute: HtmlAttribute,
  tags: MergeTag[],
  variables: Record<string, string>,
): Edit {
  const isUrl = urlAttributes.has(attribute.name);
  const first = tags[0];
  const last = tags[tags.length - 1];
  const whole =
    isUrl &&
    tags.length === 1 &&
    first !== undefined &&
    last !== undefined &&
    template.slice(attribute.valueStart, first.start).trim() === "" &&
    template.slice(last.end, attribute.valueEnd).trim() === "";
  const quoted = attribute.quote !== "";
  const literal = (text: string) =>
    quoted ? text : text.replaceAll('"', "&quot;");

  const parts: string[] = [];
  let position = attribute.valueStart;
  for (const [index, tag] of tags.entries()) {
    const before = template.slice(position, tag.start);
    const value = mergeTagValue(tag, variables);
    let rendered = value;
    if (whole) {
      rendered = safeUrlValue(value);
    } else if (isUrl) {
      const leads =
        index === 0 &&
        template.slice(attribute.valueStart, tag.start).trim() === "";
      rendered =
        leads && absoluteHttpPattern.test(value.trim())
          ? value.trim()
          : encodeUrlPart(value);
    }
    parts.push(literal(before), escapeHtml(rendered));
    position = tag.end;
  }
  parts.push(literal(template.slice(position, attribute.valueEnd)));
  const value = parts.join("");
  return {
    start: attribute.valueStart,
    end: attribute.valueEnd,
    replacement: quoted ? value : `"${value}"`,
  };
}

function renderTemplate(template: string, variables: Record<string, string>) {
  const tags = findMergeTags(template);
  if (tags.length === 0) {
    return template;
  }
  const tokens = tokenizeHtml(maskMergeTags(template, tags));
  const edits: Edit[] = [];
  let tagIndex = 0;

  for (const token of tokens) {
    const inside: MergeTag[] = [];
    while (tagIndex < tags.length) {
      const tag = tags[tagIndex];
      if (tag === undefined || tag.start >= token.end) {
        break;
      }
      inside.push(tag);
      tagIndex += 1;
    }
    if (inside.length === 0) {
      continue;
    }

    if (token.type === "end") {
      for (const tag of inside) {
        edits.push({ start: tag.start, end: tag.end, replacement: "" });
      }
      continue;
    }

    if (token.type !== "start") {
      for (const tag of inside) {
        edits.push({
          start: tag.start,
          end: tag.end,
          replacement: escapeHtml(mergeTagValue(tag, variables)),
        });
      }
      continue;
    }

    let attributeIndex = 0;
    let pending: MergeTag[] = [];
    let pendingAttribute: HtmlAttribute | null = null;
    const flush = () => {
      if (pendingAttribute && pending.length > 0) {
        edits.push(
          renderAttribute(template, pendingAttribute, pending, variables),
        );
      }
      pending = [];
      pendingAttribute = null;
    };
    for (const tag of inside) {
      while (attributeIndex < token.attributes.length) {
        const candidate = token.attributes[attributeIndex];
        if (candidate === undefined || candidate.end > tag.start) {
          break;
        }
        attributeIndex += 1;
      }
      const attribute = token.attributes[attributeIndex];
      if (
        attribute !== undefined &&
        attribute.valueStart !== -1 &&
        tag.start >= attribute.valueStart &&
        tag.end <= attribute.valueEnd
      ) {
        if (pendingAttribute !== attribute) {
          flush();
          pendingAttribute = attribute;
        }
        pending.push(tag);
      } else {
        flush();
        edits.push({ start: tag.start, end: tag.end, replacement: "" });
      }
    }
    flush();
  }

  return applyEdits(template, edits);
}

function isAsciiSpace(code: number) {
  return code === 32 || code === 9 || code === 10 || code === 12 || code === 13;
}

function trimAscii(value: string) {
  let start = 0;
  let end = value.length;
  while (start < end && isAsciiSpace(value.charCodeAt(start))) {
    start += 1;
  }
  while (end > start && isAsciiSpace(value.charCodeAt(end - 1))) {
    end -= 1;
  }
  return value.slice(start, end);
}

function hrefOf(html: string, token: HtmlToken) {
  if (token.type !== "start") {
    return null;
  }
  const attribute = token.attributes.find((item) => item.name === "href");
  if (!attribute || attribute.valueStart === -1) {
    return null;
  }
  const decoded = decodeAttributeValue(
    html.slice(attribute.valueStart, attribute.valueEnd),
  );
  return { attribute, url: decoded === null ? null : trimAscii(decoded) };
}

function visibleText(html: string, tokens: HtmlToken[], from: number) {
  let text = "";
  for (let index = from; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) {
      break;
    }
    if (
      (token.type === "end" || token.type === "start") &&
      token.name === "a"
    ) {
      break;
    }
    if (token.type === "text") {
      if (text.length + (token.end - token.start) > maxVisibleUrlLength * 4) {
        return null;
      }
      text += html.slice(token.start, token.end);
    }
  }
  return decodeText(text).trim();
}

function looksLikeUrl(text: string | null) {
  return (
    text !== null &&
    text.length > 0 &&
    text.length <= maxVisibleUrlLength &&
    visibleUrlPattern.test(text)
  );
}

function canTrack(url: string, context: Context) {
  return (
    context.messageId !== null &&
    url.length <= maxTrackedUrlLength &&
    absoluteHttpPattern.test(url) &&
    !url.startsWith(`${context.baseUrl}/t/`) &&
    URL.canParse(url)
  );
}

function finishHtml(html: string, context: Context) {
  const tokens = tokenizeHtml(html);
  const edits: Edit[] = [];
  let hasUnsubscribeLink = false;
  let doctypeEnd: number | null = null;
  let htmlOpenEnd: number | null = null;
  let headCloseEnd: number | null = null;
  let bodyOpenEnd: number | null = null;
  let bodyCloseStart: number | null = null;
  let htmlCloseStart: number | null = null;

  for (const [index, token] of tokens.entries()) {
    if (token.type === "markup") {
      if (
        doctypeEnd === null &&
        html.slice(token.start, token.start + 9).toLowerCase() === "<!doctype"
      ) {
        doctypeEnd = token.end;
      }
      continue;
    }
    if (token.type === "end") {
      if (token.name === "body") {
        bodyCloseStart = token.start;
      } else if (token.name === "html") {
        htmlCloseStart = token.start;
      } else if (token.name === "head" && headCloseEnd === null) {
        headCloseEnd = token.end;
      }
      continue;
    }
    if (token.type !== "start") {
      continue;
    }
    if (token.name === "body" && bodyOpenEnd === null) {
      bodyOpenEnd = token.end;
    } else if (token.name === "html" && htmlOpenEnd === null) {
      htmlOpenEnd = token.end;
    }
    if (token.name !== "a") {
      continue;
    }
    const href = hrefOf(html, token);
    if (!href || href.url === null) {
      continue;
    }
    if (
      context.unsubscribeUrl !== null &&
      href.url === context.unsubscribeUrl
    ) {
      hasUnsubscribeLink = true;
      continue;
    }
    if (
      !context.trackClicks ||
      context.messageId === null ||
      !canTrack(href.url, context) ||
      looksLikeUrl(visibleText(html, tokens, index + 1))
    ) {
      continue;
    }
    const tracked = escapeHtml(
      trackedClickUrl({
        baseUrl: context.baseUrl,
        messageToken: context.messageToken,
        messageId: context.messageId,
        url: href.url,
        secret: context.secret,
      }),
    );
    edits.push({
      start: href.attribute.valueStart,
      end: href.attribute.valueEnd,
      replacement: href.attribute.quote === "" ? `"${tracked}"` : tracked,
    });
  }

  const top = bodyOpenEnd ?? headCloseEnd ?? htmlOpenEnd ?? doctypeEnd ?? 0;
  let bottom = html.length;
  if (bodyCloseStart !== null && bodyCloseStart >= top) {
    bottom = bodyCloseStart;
  } else if (htmlCloseStart !== null && htmlCloseStart >= top) {
    bottom = htmlCloseStart;
  }

  if (context.previewText !== "") {
    edits.push({
      start: top,
      end: top,
      replacement: preheader(context.previewText),
    });
  }
  const tail =
    (context.unsubscribeUrl !== null && !hasUnsubscribeLink
      ? unsubscribeFooter(context.unsubscribeUrl, context.unsubscribeLabel)
      : "") + (context.trackOpens ? openPixel(context) : "");
  if (tail !== "") {
    edits.push({ start: bottom, end: bottom, replacement: tail });
  }
  return applyEdits(html, edits);
}

function preheader(text: string) {
  return `<div style="${preheaderStyle}">${escapeHtml(text)}</div>`;
}

function unsubscribeFooter(url: string, label: string) {
  return `<p style="${footerStyle}"><a href="${escapeHtml(url)}" style="${footerLinkStyle}">${escapeHtml(label)}</a></p>`;
}

function openPixel(context: Context) {
  const source = escapeHtml(
    `${context.baseUrl}/t/o/${context.messageToken}.gif`,
  );
  return `<img src="${source}" width="1" height="1" alt="" style="${pixelStyle}">`;
}

function fallbackHtml(html: string, context: Context) {
  const rendered = renderMergeTags(html, context.variables, {
    escape: "html",
  });
  const footer =
    context.unsubscribeUrl !== null &&
    !rendered.includes(escapeHtml(context.unsubscribeUrl))
      ? unsubscribeFooter(context.unsubscribeUrl, context.unsubscribeLabel)
      : "";
  return (
    (context.previewText !== "" ? preheader(context.previewText) : "") +
    rendered +
    footer +
    (context.trackOpens ? openPixel(context) : "")
  );
}

function prepareHtml(html: string, context: Context) {
  try {
    return finishHtml(renderTemplate(html, context.variables), context);
  } catch {
    try {
      return fallbackHtml(html, context);
    } catch {
      return html;
    }
  }
}

function prepareText(text: string, context: Context) {
  try {
    const rendered = renderMergeTags(text, context.variables);
    if (
      context.unsubscribeUrl === null ||
      rendered.includes(context.unsubscribeUrl)
    ) {
      return rendered;
    }
    const gap = rendered.trim() === "" ? "" : `${rendered.trimEnd()}\n\n`;
    return `${gap}${context.unsubscribeLabel}: ${context.unsubscribeUrl}\n`;
  } catch {
    return text;
  }
}

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function withoutHeader(headers: Record<string, string>, name: string) {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      delete headers[key];
    }
  }
}

export function prepareEmail(input: PrepareEmailInput): PreparedEmail {
  const baseUrl = safeString(input.baseUrl).replace(/\/+$/, "");
  const token = safeString(input.messageToken);
  const unsubscribeUrl = input.unsubscribe ? `${baseUrl}/t/u/${token}` : null;
  const variables: Record<string, string> = { ...(input.variables ?? {}) };
  if (unsubscribeUrl !== null) {
    variables.unsubscribe_url = unsubscribeUrl;
  }

  const headers: Record<string, string> = { ...(input.headers ?? {}) };
  if (unsubscribeUrl !== null) {
    withoutHeader(headers, "List-Unsubscribe");
    withoutHeader(headers, "List-Unsubscribe-Post");
    headers["List-Unsubscribe"] = `<${unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  let messageId: string | null = null;
  try {
    messageId = readMessageToken(token, input.secret);
  } catch {
    messageId = null;
  }

  let previewText = "";
  try {
    previewText = renderMergeTags(
      safeString(input.previewText),
      variables,
    ).trim();
  } catch {
    previewText = "";
  }

  const context: Context = {
    variables,
    baseUrl,
    messageToken: token,
    messageId,
    secret: input.secret,
    unsubscribeUrl,
    unsubscribeLabel:
      safeString(input.unsubscribeLabel).trim() || defaultUnsubscribeLabel,
    previewText,
    trackOpens: Boolean(input.trackOpens) && messageId !== null,
    trackClicks: Boolean(input.trackClicks) && messageId !== null,
  };

  return {
    html:
      typeof input.html === "string" ? prepareHtml(input.html, context) : null,
    text:
      typeof input.text === "string" ? prepareText(input.text, context) : null,
    headers,
  };
}
