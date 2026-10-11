export type HtmlToken =
  | { type: "text"; value: string }
  | {
      type: "open";
      name: string;
      attributes: Map<string, string>;
      selfClosing: boolean;
    }
  | { type: "close"; name: string };

export const maxHtmlInputLength = 512 * 1024;

export const imagePlaceholderAttribute = "data-inbox-image";

const maxTokens = 100_000;
const maxAttributes = 64;
const maxDepth = 60;
const maxUrlLength = 2000;
const maxAltLength = 200;
const maxTitleLength = 300;

const rawTextElements = new Set([
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "plaintext",
]);

const droppedWithContent = new Set([
  ...rawTextElements,
  "head",
  "svg",
  "math",
  "object",
  "applet",
  "template",
  "select",
  "datalist",
  "audio",
  "video",
  "canvas",
  "frameset",
  "map",
]);

const foreignRoots = new Set(["svg", "math"]);

export const allowedTags = [
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "code",
  "dd",
  "del",
  "div",
  "dl",
  "dt",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "ins",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
] as const;

export const allowedUrlSchemes = ["http://", "https://", "mailto:", "tel:"];

const allowed = new Set<string>(allowedTags);
const voidTags = new Set(["br", "hr"]);
const directions = new Set(["ltr", "rtl", "auto"]);
const spanAttributes: Record<string, string[]> = {
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
  ol: ["start"],
};

const namedEntities: Record<string, string> = {
  amp: "&",
  AMP: "&",
  lt: "<",
  LT: "<",
  gt: ">",
  GT: ">",
  quot: '"',
  QUOT: '"',
  apos: "'",
  nbsp: " ",
  colon: ":",
  Tab: "\t",
  NewLine: "\n",
  sol: "/",
  bsol: "\\",
  lpar: "(",
  rpar: ")",
  num: "#",
  excl: "!",
  quest: "?",
  equals: "=",
  semi: ";",
  comma: ",",
  period: ".",
  lowbar: "_",
  hyphen: "‐",
  commat: "@",
  percnt: "%",
  plus: "+",
  ast: "*",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  bull: "•",
  middot: "·",
  laquo: "«",
  raquo: "»",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  deg: "°",
  times: "×",
  divide: "÷",
  plusmn: "±",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  sect: "§",
  para: "¶",
  iexcl: "¡",
  iquest: "¿",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  zwnj: "‌",
  zwj: "‍",
  shy: "­",
  rarr: "→",
  larr: "←",
  agrave: "à",
  aacute: "á",
  acirc: "â",
  atilde: "ã",
  auml: "ä",
  aring: "å",
  aelig: "æ",
  ccedil: "ç",
  egrave: "è",
  eacute: "é",
  ecirc: "ê",
  euml: "ë",
  igrave: "ì",
  iacute: "í",
  icirc: "î",
  iuml: "ï",
  ntilde: "ñ",
  ograve: "ò",
  oacute: "ó",
  ocirc: "ô",
  otilde: "õ",
  ouml: "ö",
  oslash: "ø",
  ugrave: "ù",
  uacute: "ú",
  ucirc: "û",
  uuml: "ü",
  szlig: "ß",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  Eacute: "É",
  Ccedil: "Ç",
  Ntilde: "Ñ",
  Aring: "Å",
  Oslash: "Ø",
  AElig: "Æ",
};

const legacyEntities = new Set([
  "amp",
  "AMP",
  "lt",
  "LT",
  "gt",
  "GT",
  "quot",
  "QUOT",
  "nbsp",
  "copy",
  "reg",
]);

function isLetter(code: number) {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isAlphanumeric(code: number) {
  return isLetter(code) || (code >= 48 && code <= 57);
}

function isSpace(code: number) {
  return code === 9 || code === 10 || code === 12 || code === 13 || code === 32;
}

function codePoint(value: number) {
  if (
    !Number.isFinite(value) ||
    value === 0 ||
    value > 0x10ffff ||
    (value >= 0xd800 && value <= 0xdfff)
  ) {
    return "�";
  }
  return String.fromCodePoint(value);
}

export function decodeEntities(value: string) {
  if (!value.includes("&")) {
    return value;
  }
  let out = "";
  let index = 0;
  while (index < value.length) {
    const amp = value.indexOf("&", index);
    if (amp < 0) {
      break;
    }
    out += value.slice(index, amp);
    index = amp + 1;
    if (value.charCodeAt(index) === 35) {
      const hex = (value.charCodeAt(index + 1) | 32) === 120;
      let end = index + (hex ? 2 : 1);
      const start = end;
      while (
        end < value.length &&
        end - start < 8 &&
        (hex
          ? /[0-9a-fA-F]/.test(value.charAt(end))
          : /[0-9]/.test(value.charAt(end)))
      ) {
        end += 1;
      }
      if (end === start) {
        out += "&";
        continue;
      }
      out += codePoint(Number.parseInt(value.slice(start, end), hex ? 16 : 10));
      index = value.charCodeAt(end) === 59 ? end + 1 : end;
      continue;
    }
    let end = index;
    while (
      end < value.length &&
      end - index < 32 &&
      isAlphanumeric(value.charCodeAt(end))
    ) {
      end += 1;
    }
    const name = value.slice(index, end);
    const terminated = value.charCodeAt(end) === 59;
    const known = Object.hasOwn(namedEntities, name)
      ? namedEntities[name]
      : undefined;
    if (known !== undefined && (terminated || legacyEntities.has(name))) {
      out += known;
      index = terminated ? end + 1 : end;
      continue;
    }
    out += "&";
  }
  return out + value.slice(index);
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type ReadTag = {
  name: string;
  attributes: Map<string, string>;
  selfClosing: boolean;
  end: number;
};

function readTag(html: string, start: number): ReadTag | null {
  const length = html.length;
  let index = start;
  while (index < length) {
    const code = html.charCodeAt(index);
    if (isSpace(code) || code === 47 || code === 62) {
      break;
    }
    index += 1;
  }
  const name = html.slice(start, index).toLowerCase();
  const attributes = new Map<string, string>();
  for (;;) {
    while (
      index < length &&
      (isSpace(html.charCodeAt(index)) || html.charCodeAt(index) === 47)
    ) {
      index += 1;
    }
    if (index >= length) {
      return null;
    }
    if (html.charCodeAt(index) === 62) {
      return {
        name,
        attributes,
        selfClosing: html.charCodeAt(index - 1) === 47,
        end: index + 1,
      };
    }
    const nameStart = index;
    index += 1;
    while (index < length) {
      const code = html.charCodeAt(index);
      if (isSpace(code) || code === 47 || code === 62 || code === 61) {
        break;
      }
      index += 1;
    }
    const attribute = html.slice(nameStart, index).toLowerCase();
    while (index < length && isSpace(html.charCodeAt(index))) {
      index += 1;
    }
    let value = "";
    if (html.charCodeAt(index) === 61) {
      index += 1;
      while (index < length && isSpace(html.charCodeAt(index))) {
        index += 1;
      }
      if (index >= length) {
        return null;
      }
      const quote = html.charCodeAt(index);
      if (quote === 34 || quote === 39) {
        const close = html.indexOf(html.charAt(index), index + 1);
        if (close < 0) {
          return null;
        }
        value = html.slice(index + 1, close);
        index = close + 1;
      } else if (quote !== 62) {
        const valueStart = index;
        while (index < length) {
          const code = html.charCodeAt(index);
          if (isSpace(code) || code === 62) {
            break;
          }
          index += 1;
        }
        value = html.slice(valueStart, index);
      }
    }
    if (!attributes.has(attribute) && attributes.size < maxAttributes) {
      attributes.set(attribute, value);
    }
  }
}

function commentEnd(html: string, from: number) {
  if (html.startsWith(">", from)) {
    return from + 1;
  }
  if (html.startsWith("->", from)) {
    return from + 2;
  }
  const plain = html.indexOf("-->", from);
  const bang = html.indexOf("--!>", from);
  if (plain < 0 && bang < 0) {
    return html.length;
  }
  if (bang < 0 || (plain >= 0 && plain < bang)) {
    return plain + 3;
  }
  return bang + 4;
}

function rawTextEnd(html: string, name: string, from: number) {
  const pattern = new RegExp(`</${name}(?=[\\t\\n\\f\\r />])`, "gi");
  pattern.lastIndex = from;
  return pattern.exec(html)?.index ?? -1;
}

export function tokenizeHtml(input: string): HtmlToken[] {
  const html = input.replaceAll("\u0000", "");
  const length = html.length;
  const tokens: HtmlToken[] = [];
  let index = 0;
  let textStart = 0;
  const flush = (end: number) => {
    if (end > textStart) {
      tokens.push({ type: "text", value: html.slice(textStart, end) });
    }
  };
  const skipTo = (position: number) => {
    index = position;
    textStart = position;
  };
  while (index < length && tokens.length < maxTokens) {
    const open = html.indexOf("<", index);
    if (open < 0) {
      break;
    }
    const next = html.charCodeAt(open + 1);
    if (html.startsWith("<!--", open)) {
      flush(open);
      skipTo(commentEnd(html, open + 4));
      continue;
    }
    if (next === 33 || next === 63) {
      flush(open);
      const end = html.indexOf(">", open + 2);
      skipTo(end < 0 ? length : end + 1);
      continue;
    }
    if (next === 47) {
      const after = html.charCodeAt(open + 2);
      if (Number.isNaN(after)) {
        index = open + 1;
        continue;
      }
      flush(open);
      if (isLetter(after)) {
        const tag = readTag(html, open + 2);
        if (!tag) {
          skipTo(length);
          break;
        }
        tokens.push({ type: "close", name: tag.name });
        skipTo(tag.end);
        continue;
      }
      const end = html.indexOf(">", open + 2);
      skipTo(end < 0 ? length : end + 1);
      continue;
    }
    if (isLetter(next)) {
      flush(open);
      const tag = readTag(html, open + 1);
      if (!tag) {
        skipTo(length);
        break;
      }
      tokens.push({
        type: "open",
        name: tag.name,
        attributes: tag.attributes,
        selfClosing: tag.selfClosing,
      });
      skipTo(tag.end);
      if (rawTextElements.has(tag.name)) {
        const end =
          tag.name === "plaintext" ? -1 : rawTextEnd(html, tag.name, index);
        if (end < 0) {
          skipTo(length);
          break;
        }
        skipTo(end);
      }
      continue;
    }
    index = open + 1;
  }
  if (tokens.length >= maxTokens) {
    return tokens;
  }
  flush(length);
  return tokens;
}

export function visibleTokens(html: string): HtmlToken[] {
  const visible: HtmlToken[] = [];
  let dropping: { name: string; depth: number } | null = null;
  for (const token of tokenizeHtml(html.slice(0, maxHtmlInputLength))) {
    if (dropping) {
      if (token.type === "open") {
        if (dropping.name === "head" && token.name === "body") {
          dropping = null;
        } else if (token.name === dropping.name && !token.selfClosing) {
          dropping.depth += 1;
        }
      } else if (token.type === "close" && token.name === dropping.name) {
        dropping.depth -= 1;
        if (dropping.depth <= 0) {
          dropping = null;
        }
      }
      continue;
    }
    if (token.type === "open" && droppedWithContent.has(token.name)) {
      if (!(foreignRoots.has(token.name) && token.selfClosing)) {
        dropping = { name: token.name, depth: 1 };
      }
      continue;
    }
    visible.push(token);
  }
  return visible;
}

function trimControls(value: string) {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 32) {
    start += 1;
  }
  while (end > start && value.charCodeAt(end - 1) <= 32) {
    end -= 1;
  }
  return value.slice(start, end);
}

export function safeUrl(raw: string): string | null {
  const value = trimControls(decodeEntities(raw).replace(/[\t\n\r]/g, ""));
  if (value.length === 0 || value.length > maxUrlLength) {
    return null;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 32 || (code >= 127 && code <= 159)) {
      return null;
    }
  }
  const lower = value.toLowerCase();
  const scheme = allowedUrlSchemes.find((prefix) => lower.startsWith(prefix));
  if (!scheme || value.length === scheme.length) {
    return null;
  }
  return value;
}

function wholeNumber(raw: string | undefined, max: number) {
  const value = decodeEntities(raw ?? "").trim();
  if (!/^\d{1,4}$/.test(value)) {
    return null;
  }
  const number = Number(value);
  return number >= 1 && number <= max ? String(number) : null;
}

function renderAttributes(name: string, attributes: Map<string, string>) {
  const rendered: string[] = [];
  if (name === "a") {
    const url = safeUrl(attributes.get("href") ?? "");
    if (url) {
      rendered.push(
        `href="${escapeHtml(url)}"`,
        'target="_blank"',
        'rel="noopener noreferrer nofollow"',
      );
    }
    const title = decodeEntities(attributes.get("title") ?? "").trim();
    if (title) {
      rendered.push(`title="${escapeHtml(title.slice(0, maxTitleLength))}"`);
    }
  }
  for (const attribute of spanAttributes[name] ?? []) {
    const value = wholeNumber(attributes.get(attribute), 1000);
    if (value) {
      rendered.push(`${attribute}="${value}"`);
    }
  }
  const direction = decodeEntities(attributes.get("dir") ?? "")
    .trim()
    .toLowerCase();
  if (directions.has(direction)) {
    rendered.push(`dir="${direction}"`);
  }
  return rendered.length > 0 ? ` ${rendered.join(" ")}` : "";
}

export function imageAlt(attributes: Map<string, string>) {
  return decodeEntities(attributes.get("alt") ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxAltLength);
}

export function sanitizeHtml(input: string): string {
  const out: string[] = [];
  const stack: string[] = [];
  const closeTo = (position: number) => {
    while (stack.length > position) {
      out.push(`</${stack.pop()}>`);
    }
  };
  for (const token of visibleTokens(input)) {
    if (token.type === "text") {
      out.push(escapeHtml(decodeEntities(token.value)));
      continue;
    }
    if (token.type === "close") {
      const position = allowed.has(token.name)
        ? stack.lastIndexOf(token.name)
        : -1;
      if (position >= 0) {
        closeTo(position);
      }
      continue;
    }
    if (token.name === "img") {
      const alt = imageAlt(token.attributes);
      if (alt) {
        out.push(
          `<span ${imagePlaceholderAttribute}="">${escapeHtml(alt)}</span>`,
        );
      }
      continue;
    }
    if (!allowed.has(token.name)) {
      continue;
    }
    if (voidTags.has(token.name)) {
      out.push(`<${token.name}>`);
      continue;
    }
    if (token.name === "a") {
      const position = stack.lastIndexOf("a");
      if (position >= 0) {
        closeTo(position);
      }
    }
    if (stack.length >= maxDepth) {
      continue;
    }
    out.push(
      `<${token.name}${renderAttributes(token.name, token.attributes)}>`,
    );
    stack.push(token.name);
  }
  closeTo(0);
  return out.join("");
}

const blockTags = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "caption",
  "center",
  "dd",
  "div",
  "dl",
  "dt",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tr",
  "ul",
]);

const spacedTags = new Set([
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ol",
  "p",
  "pre",
  "table",
  "ul",
]);

const voidElements = new Set([
  "area",
  "base",
  "col",
  "embed",
  "hr",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const quoteClassPattern =
  /(^|\s)(gmail_quote|yahoo_quoted|moz-cite-prefix)(\s|$)/i;

function isQuote(name: string, attributes: Map<string, string>) {
  return (
    name === "blockquote" ||
    (name === "div" && quoteClassPattern.test(attributes.get("class") ?? ""))
  );
}

export function htmlToText(input: string): string {
  const lines: string[] = [];
  const stack: { name: string; quote: boolean }[] = [];
  let current = "";
  let quoteDepth = 0;
  let preDepth = 0;
  const flush = () => {
    const line = current.replace(/[ \t]+$/, "");
    if (line !== "") {
      lines.push(`${"> ".repeat(Math.min(quoteDepth, 8))}${line}`);
    }
    current = "";
  };
  const blank = () => {
    flush();
    if (lines.length > 0 && lines.at(-1) !== "") {
      lines.push("");
    }
  };
  const boundary = (name: string) => {
    if (spacedTags.has(name)) {
      blank();
    } else {
      flush();
    }
  };
  for (const token of visibleTokens(input)) {
    if (token.type === "text") {
      const text = decodeEntities(token.value);
      if (preDepth > 0) {
        const [first = "", ...rest] = text.replace(/\r\n?/g, "\n").split("\n");
        current += first;
        for (const line of rest) {
          flush();
          current = line;
        }
        continue;
      }
      const collapsed = text.replace(/[ \t\n\f\r]+/g, " ");
      current += current === "" ? collapsed.replace(/^ /, "") : collapsed;
      continue;
    }
    if (token.type === "open") {
      if (token.name === "br") {
        flush();
        continue;
      }
      if (token.name === "img") {
        const alt = imageAlt(token.attributes);
        current += alt ? `[${alt}]` : "";
        continue;
      }
      if (blockTags.has(token.name)) {
        boundary(token.name);
      }
      if (token.name === "td" || token.name === "th") {
        current += current === "" || current.endsWith(" ") ? "" : " ";
      }
      if (token.name === "li") {
        current = "- ";
      }
      const quote = isQuote(token.name, token.attributes);
      if (!voidElements.has(token.name) && stack.length < maxDepth * 4) {
        stack.push({ name: token.name, quote });
        quoteDepth += quote ? 1 : 0;
        preDepth += token.name === "pre" ? 1 : 0;
      }
      continue;
    }
    if (blockTags.has(token.name)) {
      boundary(token.name);
    }
    let position = -1;
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (stack[index]?.name === token.name) {
        position = index;
        break;
      }
    }
    if (position < 0) {
      continue;
    }
    for (const entry of stack.splice(position)) {
      quoteDepth -= entry.quote ? 1 : 0;
      preDepth -= entry.name === "pre" ? 1 : 0;
    }
  }
  flush();
  while (lines.length > 0 && lines.at(-1) === "") {
    lines.pop();
  }
  return lines.join("\n");
}
