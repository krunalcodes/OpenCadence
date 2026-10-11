import { describe, expect, it } from "vitest";
import { type HtmlToken, tokenizeHtml } from "./html-tokens";

function shape(html: string) {
  return tokenizeHtml(html).map((token) => {
    const source = html.slice(token.start, token.end);
    if (token.type === "start") {
      return [
        "start",
        token.name,
        token.attributes.map((attribute) => [
          attribute.name,
          attribute.valueStart === -1
            ? null
            : html.slice(attribute.valueStart, attribute.valueEnd),
          attribute.quote,
        ]),
      ];
    }
    if (token.type === "end") {
      return ["end", token.name];
    }
    return [token.type, source];
  });
}

function covers(html: string, tokens: HtmlToken[]) {
  let position = 0;
  for (const token of tokens) {
    if (token.start !== position || token.end <= token.start) {
      return false;
    }
    position = token.end;
  }
  return position === html.length;
}

describe("tokenizeHtml", () => {
  it("reads tags, text and attributes in every quoting style", () => {
    expect(
      shape(
        `<p class="a b">Hi <A HREF='x' target=_blank disabled>there</A></p>`,
      ),
    ).toEqual([
      ["start", "p", [["class", "a b", '"']]],
      ["text", "Hi "],
      [
        "start",
        "a",
        [
          ["href", "x", "'"],
          ["target", "_blank", ""],
          ["disabled", null, ""],
        ],
      ],
      ["text", "there"],
      ["end", "a"],
      ["end", "p"],
    ]);
  });

  it("allows spaces around the equals sign and a self closing slash", () => {
    expect(shape(`<a href = "x"  title= y /><br/>`)).toEqual([
      [
        "start",
        "a",
        [
          ["href", "x", '"'],
          ["title", "y", ""],
        ],
      ],
      ["start", "br", []],
    ]);
  });

  it("keeps a slash inside an unquoted value", () => {
    expect(shape("<a href=https://example.com/a/>x</a>")[0]).toEqual([
      "start",
      "a",
      [["href", "https://example.com/a/", ""]],
    ]);
  });

  it("does not end a tag at a > inside a quoted value", () => {
    expect(shape(`<a title="a > b" href="x">y</a>`)[0]).toEqual([
      "start",
      "a",
      [
        ["title", "a > b", '"'],
        ["href", "x", '"'],
      ],
    ]);
  });

  it("treats comments, doctype and processing instructions as opaque", () => {
    expect(
      shape(`<!DOCTYPE html><!-- <a href="x">y</a> --><?xml v?><!---->z`),
    ).toEqual([
      ["markup", "<!DOCTYPE html>"],
      ["comment", `<!-- <a href="x">y</a> -->`],
      ["markup", "<?xml v?>"],
      ["comment", "<!---->"],
      ["text", "z"],
    ]);
  });

  it("closes the short comment forms the way browsers do", () => {
    expect(shape("<!-->a<!--->b")).toEqual([
      ["comment", "<!-->"],
      ["text", "a"],
      ["comment", "<!--->"],
      ["text", "b"],
    ]);
  });

  it("does not read tags inside style, script, title and textarea", () => {
    expect(
      shape(
        `<STYLE>a::after{content:"<a href='x'>"}</STYLE><script>if (a</b) {}</script><title><b></title><textarea><a></textarea>`,
      ),
    ).toEqual([
      ["start", "style", []],
      ["raw", `a::after{content:"<a href='x'>"}`],
      ["end", "style"],
      ["start", "script", []],
      ["raw", "if (a</b) {}"],
      ["end", "script"],
      ["start", "title", []],
      ["raw", "<b>"],
      ["end", "title"],
      ["start", "textarea", []],
      ["raw", "<a>"],
      ["end", "textarea"],
    ]);
  });

  it("does not end raw text at a longer tag name", () => {
    expect(shape("<style></styles></style>")).toEqual([
      ["start", "style", []],
      ["raw", "</styles>"],
      ["end", "style"],
    ]);
  });

  it("keeps a lone < and odd closers as text or markup", () => {
    expect(shape("a < b <3 </> </ x> <")).toEqual([
      ["text", "a < b <3 "],
      ["markup", "</>"],
      ["text", " "],
      ["markup", "</ x>"],
      ["text", " <"],
    ]);
  });

  it("covers every character of malformed input", () => {
    const inputs = [
      "",
      "<",
      "<a",
      "<a ",
      "<a href",
      "<a href=",
      '<a href="',
      '<a href="x',
      "<a href='x\"y>z",
      "<a href=x",
      "</",
      "</a",
      "<!--",
      "<!-- a --",
      "<!",
      "<?",
      "<style>a{",
      "<script>",
      "<plaintext><a href=x>",
      "<a =x ==y>",
      '<a "x"=y>',
      "<a\u0000b>",
      "<a/b/c>",
      "😀<b>😀</b>",
    ];
    for (const html of inputs) {
      expect(covers(html, tokenizeHtml(html)), html).toBe(true);
    }
  });

  it("covers every character of generated input", () => {
    const pieces = [
      "<",
      ">",
      "/",
      "=",
      '"',
      "'",
      " ",
      "a",
      "href",
      "!--",
      "-->",
      "style",
      "script",
      "&",
      "\n",
      "{{",
      "}}",
      "?",
      "!",
    ];
    let seed = 12345;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    for (let round = 0; round < 3000; round += 1) {
      let html = "";
      const size = random() % 24;
      for (let index = 0; index < size; index += 1) {
        html += pieces[random() % pieces.length];
      }
      expect(covers(html, tokenizeHtml(html)), JSON.stringify(html)).toBe(true);
    }
  });
});
