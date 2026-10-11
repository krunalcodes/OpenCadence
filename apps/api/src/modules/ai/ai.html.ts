export type HtmlLink = { href: string; text: string };
export type HtmlImage = { src: string; alt: string | null };

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const code =
        body[1]?.toLowerCase() === "x"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return entities[body.toLowerCase()] ?? match;
  });
}

function attribute(tag: string, name: string) {
  const match = new RegExp(
    `\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    "i",
  ).exec(tag);
  if (!match) {
    return new RegExp(`\\s${name}(?=[\\s/>])`, "i").test(tag) ? "" : null;
  }
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? "");
}

function withoutHiddenContent(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, " ");
}

export function htmlToText(html: string) {
  return decodeEntities(
    withoutHiddenContent(html)
      .replace(/<(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|table|ul|ol)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function findLinks(html: string): HtmlLink[] {
  const links: HtmlLink[] = [];
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  for (const match of withoutHiddenContent(html).matchAll(pattern)) {
    const href = attribute(`<a${match[1] ?? ""}>`, "href");
    if (href !== null) {
      links.push({ href: href.trim(), text: htmlToText(match[2] ?? "") });
    }
  }
  return links;
}

export function findImages(html: string): HtmlImage[] {
  const images: HtmlImage[] = [];
  for (const match of withoutHiddenContent(html).matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    images.push({
      src: attribute(tag, "src") ?? "",
      alt: attribute(tag, "alt"),
    });
  }
  return images;
}
