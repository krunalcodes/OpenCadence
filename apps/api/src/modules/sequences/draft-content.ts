const allowedTags = new Set(["p", "br", "a", "strong", "em", "ul", "li"]);

const renamedTags: Record<string, string> = {
  b: "strong",
  i: "em",
  ol: "ul",
  div: "p",
  blockquote: "p",
  h1: "p",
  h2: "p",
  h3: "p",
  h4: "p",
  h5: "p",
  h6: "p",
};

const removedWithContent = new Set([
  "script",
  "style",
  "head",
  "title",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
  "svg",
  "math",
  "textarea",
  "select",
]);

const namedEntities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  colon: ":",
  tab: "\t",
  newline: "\n",
};

const maxDepth = 32;
const emptyElementPasses = 4;

const tokenPattern =
  /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">]){0,1000})>|<|[^<]+/g;

function decodeEntities(value: string) {
  return value.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);?/gi,
    (match, body: string) => {
      if (body.startsWith("#")) {
        const code =
          body[1]?.toLowerCase() === "x"
            ? Number.parseInt(body.slice(2), 16)
            : Number.parseInt(body.slice(1), 10);
        return Number.isInteger(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      return namedEntities[body.toLowerCase()] ?? match;
    },
  );
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function hrefOf(attributes: string) {
  const match = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(
    attributes,
  );
  return match
    ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? "").trim()
    : null;
}

function safeHref(href: string | null) {
  if (href === null) {
    return null;
  }
  if (/^\{\{[^{}]*\}\}$/.test(href) || href === "#") {
    return href;
  }
  const compact = href.replace(/\s/g, "");
  return /^(https?:\/\/|mailto:)[^<>"`]+$/i.test(compact) ? compact : null;
}

function skipElement(html: string, from: number, tag: string) {
  const closing = new RegExp(`</${tag}\\s*>`, "gi");
  closing.lastIndex = from;
  return closing.exec(html) ? closing.lastIndex : html.length;
}

export function sanitizeOutreachHtml(html: string) {
  const output: string[] = [];
  const open: string[] = [];
  let droppedLinks = 0;

  const closeThrough = (tag: string) => {
    while (open.length > 0) {
      const last = open.pop();
      output.push(`</${last}>`);
      if (last === tag) {
        return;
      }
    }
  };
  const isOpenSince = (tag: string, boundary: string) => {
    for (let index = open.length - 1; index >= 0; index -= 1) {
      if (open[index] === tag) {
        return true;
      }
      if (open[index] === boundary) {
        return false;
      }
    }
    return false;
  };
  const push = (tag: string, markup = `<${tag}>`) => {
    open.push(tag);
    output.push(markup);
  };

  tokenPattern.lastIndex = 0;
  let token = tokenPattern.exec(html);
  for (; token; token = tokenPattern.exec(html)) {
    const [raw, slash, name, attributes] = token;
    if (name === undefined) {
      if (raw === "<") {
        output.push("&lt;");
      } else if (!raw.startsWith("<!--")) {
        output.push(raw.replace(/>/g, "&gt;"));
      }
      continue;
    }
    const original = name.toLowerCase();
    const closing = slash === "/";
    if (removedWithContent.has(original)) {
      if (!closing && !/\/\s*$/.test(attributes ?? "")) {
        tokenPattern.lastIndex = skipElement(
          html,
          tokenPattern.lastIndex,
          original,
        );
      }
      continue;
    }
    const tag = renamedTags[original] ?? original;
    if (!allowedTags.has(tag)) {
      continue;
    }
    if (tag === "br") {
      output.push("<br>");
      continue;
    }
    if (closing) {
      if (tag === "a" && !open.includes("a") && droppedLinks > 0) {
        droppedLinks -= 1;
      } else if (open.includes(tag)) {
        closeThrough(tag);
      }
      continue;
    }
    if (open.length >= maxDepth) {
      if (tag === "a") {
        droppedLinks += 1;
      }
      continue;
    }
    if (tag === "a") {
      const href = safeHref(hrefOf(attributes ?? ""));
      if (href === null) {
        droppedLinks += 1;
        continue;
      }
      if (open.includes("a")) {
        closeThrough("a");
      }
      push("a", `<a href="${escapeAttribute(href)}">`);
      continue;
    }
    if (tag === "p") {
      if (isOpenSince("p", "li")) {
        closeThrough("p");
      }
    } else if (tag === "ul") {
      if (isOpenSince("p", "li")) {
        closeThrough("p");
      }
    } else if (tag === "li") {
      if (isOpenSince("li", "ul")) {
        closeThrough("li");
      } else if (!open.includes("ul")) {
        if (open.includes("p")) {
          closeThrough("p");
        }
        push("ul");
      }
    }
    push(tag);
  }
  while (open.length > 0) {
    output.push(`</${open.pop()}>`);
  }
  let result = output.join("");
  for (let pass = 0; pass < emptyElementPasses; pass += 1) {
    result = result.replace(
      /<(p|a|strong|em|li|ul)(?: href="[^"]*")?>\s*<\/\1>/g,
      "",
    );
  }
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

function linkText(href: string, label: string) {
  const text = label.replace(/<[^>]+>/g, "").trim();
  const url = decodeEntities(href).trim();
  const target = url.replace(/^mailto:/i, "");
  if (target === "" || target === "#") {
    return text;
  }
  if (
    text === "" ||
    decodeEntities(text) === target ||
    decodeEntities(text) === url
  ) {
    return target;
  }
  return `${text} (${target})`;
}

export function outreachHtmlToText(html: string) {
  return decodeEntities(
    sanitizeOutreachHtml(html)
      .replace(/\s+/g, " ")
      .replace(/<a href="([^"]*)">(.*?)<\/a>/g, (_match, href, label) =>
        linkText(href, label),
      )
      .replace(/<li>\s*<p>/g, "<li>")
      .replace(/<\/p>\s*<\/li>/g, "</li>")
      .replace(/<br>/g, "\n")
      .replace(/<li>/g, "\n- ")
      .replace(/<\/li>/g, "")
      .replace(/<\/?(p|ul)>/g, "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
