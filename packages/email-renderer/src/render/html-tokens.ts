export type HtmlAttribute = {
  name: string;
  start: number;
  end: number;
  valueStart: number;
  valueEnd: number;
  quote: '"' | "'" | "";
};

export type HtmlToken =
  | { type: "text" | "comment" | "raw" | "markup"; start: number; end: number }
  | {
      type: "start";
      start: number;
      end: number;
      name: string;
      attributes: HtmlAttribute[];
    }
  | { type: "end"; start: number; end: number; name: string };

const TAB = 9;
const LINE_FEED = 10;
const FORM_FEED = 12;
const CARRIAGE_RETURN = 13;
const SPACE = 32;
const BANG = 33;
const DOUBLE_QUOTE = 34;
const SINGLE_QUOTE = 39;
const SLASH = 47;
const EQUALS = 61;
const GREATER_THAN = 62;
const QUESTION = 63;

const rawTextElements = new Set([
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
]);

function isLetter(code: number) {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isSpace(code: number) {
  return (
    code === SPACE ||
    code === TAB ||
    code === LINE_FEED ||
    code === FORM_FEED ||
    code === CARRIAGE_RETURN
  );
}

function isNameEnd(code: number) {
  return isSpace(code) || code === SLASH || code === GREATER_THAN;
}

function readName(html: string, from: number) {
  let position = from;
  while (position < html.length && !isNameEnd(html.charCodeAt(position))) {
    position += 1;
  }
  return position;
}

function readStartTag(html: string, open: number): HtmlToken {
  const length = html.length;
  const nameEnd = readName(html, open + 1);
  const name = html.slice(open + 1, nameEnd).toLowerCase();
  const attributes: HtmlAttribute[] = [];
  let position = nameEnd;

  while (true) {
    while (position < length) {
      const code = html.charCodeAt(position);
      if (!isSpace(code) && code !== SLASH) {
        break;
      }
      position += 1;
    }
    if (position >= length) {
      return { type: "start", start: open, end: length, name, attributes };
    }
    if (html.charCodeAt(position) === GREATER_THAN) {
      return {
        type: "start",
        start: open,
        end: position + 1,
        name,
        attributes,
      };
    }

    const start = position;
    position += 1;
    while (position < length) {
      const code = html.charCodeAt(position);
      if (isNameEnd(code) || code === EQUALS) {
        break;
      }
      position += 1;
    }
    const attributeName = html.slice(start, position).toLowerCase();

    let cursor = position;
    while (cursor < length && isSpace(html.charCodeAt(cursor))) {
      cursor += 1;
    }
    if (cursor >= length || html.charCodeAt(cursor) !== EQUALS) {
      attributes.push({
        name: attributeName,
        start,
        end: position,
        valueStart: -1,
        valueEnd: -1,
        quote: "",
      });
      continue;
    }

    cursor += 1;
    while (cursor < length && isSpace(html.charCodeAt(cursor))) {
      cursor += 1;
    }
    const first = cursor < length ? html.charCodeAt(cursor) : Number.NaN;
    if (first === DOUBLE_QUOTE || first === SINGLE_QUOTE) {
      const quote = first === DOUBLE_QUOTE ? '"' : "'";
      const close = html.indexOf(quote, cursor + 1);
      const valueEnd = close === -1 ? length : close;
      const end = close === -1 ? length : close + 1;
      attributes.push({
        name: attributeName,
        start,
        end,
        valueStart: cursor + 1,
        valueEnd,
        quote,
      });
      position = end;
      continue;
    }

    let valueEnd = cursor;
    while (valueEnd < length) {
      const code = html.charCodeAt(valueEnd);
      if (isSpace(code) || code === GREATER_THAN) {
        break;
      }
      valueEnd += 1;
    }
    attributes.push({
      name: attributeName,
      start,
      end: valueEnd,
      valueStart: cursor,
      valueEnd,
      quote: "",
    });
    position = valueEnd;
  }
}

function findRawEnd(html: string, from: number, name: string) {
  let position = from;
  while (true) {
    const index = html.indexOf("</", position);
    if (index === -1) {
      return html.length;
    }
    const nameEnd = index + 2 + name.length;
    if (html.slice(index + 2, nameEnd).toLowerCase() === name) {
      if (nameEnd >= html.length || isNameEnd(html.charCodeAt(nameEnd))) {
        return index;
      }
    }
    position = index + 2;
  }
}

function closeAfter(html: string, from: number) {
  const close = html.indexOf(">", from);
  return close === -1 ? html.length : close + 1;
}

function commentEnd(html: string, open: number) {
  const from = open + 4;
  if (html.charCodeAt(from) === GREATER_THAN) {
    return from + 1;
  }
  if (html.startsWith("->", from)) {
    return from + 2;
  }
  const close = html.indexOf("-->", from);
  return close === -1 ? html.length : close + 3;
}

export function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  const length = html.length;
  let position = 0;
  let textStart = 0;

  const flushText = (end: number) => {
    if (end > textStart) {
      tokens.push({ type: "text", start: textStart, end });
    }
  };

  while (position < length) {
    const open = html.indexOf("<", position);
    if (open === -1) {
      break;
    }
    const next = open + 1 < length ? html.charCodeAt(open + 1) : Number.NaN;

    if (isLetter(next)) {
      flushText(open);
      const tag = readStartTag(html, open);
      tokens.push(tag);
      position = tag.end;
      if (tag.type === "start" && tag.name === "plaintext") {
        if (length > position) {
          tokens.push({ type: "raw", start: position, end: length });
        }
        position = length;
      } else if (tag.type === "start" && rawTextElements.has(tag.name)) {
        const end = findRawEnd(html, position, tag.name);
        if (end > position) {
          tokens.push({ type: "raw", start: position, end });
        }
        position = end;
      }
      textStart = position;
      continue;
    }

    if (
      next === SLASH &&
      open + 2 < length &&
      isLetter(html.charCodeAt(open + 2))
    ) {
      flushText(open);
      const nameEnd = readName(html, open + 2);
      const end = closeAfter(html, nameEnd);
      tokens.push({
        type: "end",
        start: open,
        end,
        name: html.slice(open + 2, nameEnd).toLowerCase(),
      });
      position = end;
      textStart = position;
      continue;
    }

    if (html.startsWith("<!--", open)) {
      flushText(open);
      const end = commentEnd(html, open);
      tokens.push({ type: "comment", start: open, end });
      position = end;
      textStart = position;
      continue;
    }

    if (next === BANG || next === QUESTION || next === SLASH) {
      flushText(open);
      const end = closeAfter(html, open + 2);
      tokens.push({ type: "markup", start: open, end });
      position = end;
      textStart = position;
      continue;
    }

    position = open + 1;
  }

  flushText(length);
  return tokens;
}
