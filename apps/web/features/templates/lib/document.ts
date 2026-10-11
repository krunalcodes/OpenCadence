import { extendTheme, type ThemeConfig } from "@react-email/editor/plugins";
import { copy } from "@/features/templates/lib/copy";
import { type Brand, fontStack } from "@/lib/brand";

const columnTypes: Record<number, string> = {
  2: "two-columns",
  3: "three-columns",
  4: "four-columns",
};

const removedTags =
  "script,style,iframe,object,embed,link,meta,base,form,input,textarea,select,noscript,svg,video,audio";

const hexColor = /^#[0-9a-f]{6}$/i;

function readableOn(background: string) {
  if (!hexColor.test(background)) {
    return "#ffffff";
  }
  const channel = (start: number) => {
    const value = Number.parseInt(background.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.45 ? "#14201b" : "#ffffff";
}

export function brandTheme(brand: Brand | null): ThemeConfig {
  if (!brand) {
    return extendTheme("basic", {
      body: { paddingTop: "32px", paddingBottom: "32px" },
      container: {
        paddingTop: "32px",
        paddingRight: "32px",
        paddingBottom: "32px",
        paddingLeft: "32px",
      },
    });
  }
  return extendTheme("basic", {
    body: {
      backgroundColor: brand.backgroundColor,
      fontFamily: fontStack(brand.fontFamily),
      paddingTop: "32px",
      paddingRight: "16px",
      paddingBottom: "32px",
      paddingLeft: "16px",
    },
    container: {
      backgroundColor: brand.contentColor,
      color: brand.textColor,
      paddingTop: "32px",
      paddingRight: "32px",
      paddingBottom: "32px",
      paddingLeft: "32px",
      borderRadius: "8px",
    },
    link: { color: brand.primaryColor },
    button: {
      backgroundColor: brand.primaryColor,
      color: readableOn(brand.primaryColor),
      borderRadius: "6px",
    },
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function starterHtml(brand: Brand | null) {
  const text = copy.editor.starter;
  const parts: string[] = [];
  const logo = brand?.logo;
  if (logo && isHttpUrl(logo.url)) {
    const width = Math.min(logo.width ?? 140, 180);
    parts.push(
      `<img src="${escapeHtml(logo.url)}" alt="${escapeHtml(text.logoAlt(brand?.brandName ?? ""))}" width="${width}" alignment="left" />`,
    );
  }
  parts.push(`<h1>${escapeHtml(text.heading)}</h1>`);
  parts.push(`<p>${escapeHtml(text.body)}</p>`);
  parts.push("<hr />");
  parts.push(
    `<p style="font-size: 12px; line-height: 1.6; color: #6b7280;">{{brand.name}}<br />{{brand.address}}<br /><a href="{{unsubscribe_url}}">${escapeHtml(text.unsubscribe)}</a></p>`,
  );
  return parts.join("");
}

export function importedHtml(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const element of Array.from(
    parsed.body.querySelectorAll(
      '[data-skip-in-text="true"],span.preheader,script,style',
    ),
  )) {
    element.remove();
  }
  return parsed.body.innerHTML.trim();
}

function unwrap(element: Element) {
  const parent = element.parentNode;
  if (!parent) {
    return;
  }
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

function isUnsafeUrl(value: string) {
  const url = value.trim().toLowerCase();
  return (
    url.startsWith("javascript:") ||
    url.startsWith("vbscript:") ||
    url.startsWith("data:")
  );
}

function sanitize(root: HTMLElement) {
  for (const element of Array.from(root.querySelectorAll(removedTags))) {
    element.remove();
  }
  for (const element of Array.from(root.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attribute.name);
        continue;
      }
      if ((name === "href" || name === "src") && isUnsafeUrl(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  for (const image of Array.from(root.querySelectorAll("img"))) {
    if (!image.getAttribute("src")) {
      image.remove();
    }
  }
}

function alignmentOf(element: Element | null) {
  if (!(element instanceof HTMLElement)) {
    return null;
  }
  const value = element.getAttribute("align") || element.style.textAlign;
  return value === "center" || value === "right" || value === "left"
    ? value
    : null;
}

function convertButtons(root: HTMLElement) {
  for (const anchor of Array.from(root.querySelectorAll("a[data-button]"))) {
    const label = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
    if (label === "") {
      anchor.remove();
      continue;
    }
    const parent = anchor.parentElement;
    const alignment = alignmentOf(anchor) ?? alignmentOf(parent);
    anchor.textContent = label;
    anchor.removeAttribute("data-button");
    anchor.removeAttribute("style");
    anchor.removeAttribute("target");
    anchor.setAttribute("data-id", "react-email-button");
    anchor.setAttribute("class", "button");
    if (!anchor.getAttribute("href")) {
      anchor.setAttribute("href", "#");
    }
    if (alignment) {
      anchor.setAttribute("alignment", alignment);
    }
    if (!parent || parent === root) {
      continue;
    }
    const inline = ["P", "H1", "H2", "H3", "SPAN", "STRONG", "EM", "U"];
    let holder: Element = anchor;
    while (
      holder.parentElement &&
      holder.parentElement !== root &&
      inline.includes(holder.parentElement.tagName)
    ) {
      holder = holder.parentElement;
    }
    if (holder === anchor) {
      continue;
    }
    holder.parentNode?.insertBefore(anchor, holder.nextSibling);
    if (
      (holder.textContent ?? "").trim() === "" &&
      !holder.querySelector("img")
    ) {
      holder.remove();
    }
  }
}

function convertColumns(root: HTMLElement) {
  const blocks = Array.from(root.querySelectorAll("div[data-columns]"));
  for (const block of blocks.reverse()) {
    const columns = Array.from(block.children).filter(
      (child) => child.tagName === "DIV" && child.hasAttribute("data-column"),
    );
    const type = columnTypes[columns.length];
    const nested = block.parentElement?.closest("[data-type$='-columns']");
    if (!type || columns.length !== block.children.length || nested) {
      for (const column of columns) {
        unwrap(column);
      }
      unwrap(block);
      continue;
    }
    for (const attribute of Array.from(block.attributes)) {
      block.removeAttribute(attribute.name);
    }
    block.setAttribute("data-type", type);
    for (const column of columns) {
      for (const attribute of Array.from(column.attributes)) {
        column.removeAttribute(attribute.name);
      }
      column.setAttribute("data-type", "column");
      if (column.children.length === 0) {
        const paragraph = root.ownerDocument.createElement("p");
        paragraph.textContent = column.textContent ?? "";
        column.replaceChildren(paragraph);
      }
    }
  }
}

function unwrapPlainDivs(root: HTMLElement) {
  for (const div of Array.from(root.querySelectorAll("div:not([data-type])"))) {
    unwrap(div);
  }
}

export function aiHtmlToEditorHtml(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const root = parsed.body;
  sanitize(root);
  convertButtons(root);
  convertColumns(root);
  unwrapPlainDivs(root);
  return root.innerHTML.trim();
}

const aiAttributes: Record<string, string[]> = {
  A: ["href", "data-button"],
  IMG: ["src", "alt", "width", "height"],
  DIV: ["data-columns", "data-column"],
};

export function editorHtmlToAiHtml(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const root = parsed.body;
  for (const element of Array.from(
    root.querySelectorAll('div[data-type="globalContent"]'),
  )) {
    element.remove();
  }
  for (const anchor of Array.from(
    root.querySelectorAll('a[data-id="react-email-button"]'),
  )) {
    const href =
      anchor.getAttribute("data-href") || anchor.getAttribute("href") || "#";
    anchor.setAttribute("href", href);
    anchor.setAttribute("data-button", "true");
    const parent = anchor.parentElement;
    if (
      parent &&
      parent !== root &&
      parent.tagName === "DIV" &&
      parent.children.length === 1
    ) {
      parent.replaceWith(anchor);
    }
  }
  for (const block of Array.from(
    root.querySelectorAll("div[data-type$='-columns']"),
  )) {
    block.setAttribute("data-columns", String(block.children.length));
    for (const column of Array.from(block.children)) {
      column.setAttribute("data-column", "");
    }
  }
  for (const element of Array.from(root.querySelectorAll("*"))) {
    const allowed = aiAttributes[element.tagName] ?? [];
    for (const attribute of Array.from(element.attributes)) {
      if (!allowed.includes(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  for (const element of Array.from(
    root.querySelectorAll(
      "div:not([data-columns]):not([data-column]),section,span",
    ),
  )) {
    unwrap(element);
  }
  return root.innerHTML.trim();
}

export function htmlToPlainText(html: string) {
  return html
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/div|hr)[^>]*>/gi, "\n")
    .replace(/<[^>]*>?/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function previewDocument(html: string) {
  const base = '<base target="_blank" />';
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (head) => `${head}${base}`);
  }
  return `<!doctype html><html><head>${base}<meta charset="utf-8" /></head><body>${html}</body></html>`;
}

export function draftPreviewDocument(body: string, brand: Brand | null) {
  const font = fontStack(brand?.fontFamily ?? "system");
  const link = brand?.primaryColor ?? "#0f5c4d";
  const button = readableOn(link);
  const styles = `body{margin:0;padding:20px;font-family:${font};font-size:14px;line-height:1.55;color:${brand?.textColor ?? "#14201b"};background:${brand?.contentColor ?? "#ffffff"}}h1{font-size:26px;line-height:1.3;margin:0 0 12px}h2{font-size:20px;margin:16px 0 8px}h3{font-size:16px;margin:16px 0 8px}p{margin:0 0 12px}a{color:${link}}img{max-width:100%;height:auto}hr{border:0;border-top:1px solid #e3e7e0;margin:20px 0}blockquote{margin:0 0 12px;padding-left:12px;border-left:3px solid #e3e7e0}a[data-id="react-email-button"]{display:inline-block;padding:9px 16px;border-radius:6px;background:${link};color:${button};text-decoration:none;font-weight:500;margin:4px 0 12px}[data-type$="-columns"]{display:flex;gap:16px}[data-type="column"]{flex:1;min-width:0}`;
  return `<!doctype html><html><head><base target="_blank" /><meta charset="utf-8" /><style>${styles}</style></head><body>${body}</body></html>`;
}

export type InlineNode = { type: "text"; text: string } | { type: "hardBreak" };

export function textToInlineNodes(value: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, index) => {
    if (index > 0) {
      nodes.push({ type: "hardBreak" });
    }
    if (line !== "") {
      nodes.push({ type: "text", text: line });
    }
  });
  return nodes;
}
