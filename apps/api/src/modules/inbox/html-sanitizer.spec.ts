import {
  allowedTags,
  decodeEntities,
  htmlToText,
  safeUrl,
  sanitizeHtml,
  tokenizeHtml,
} from "./html-sanitizer";

function tagsIn(html: string) {
  return [...html.matchAll(/<\/?([a-zA-Z][^\s>/]*)/g)].map((match) =>
    (match[1] ?? "").toLowerCase(),
  );
}

function attributesIn(html: string) {
  return [...html.matchAll(/<[a-zA-Z][^>]*>/g)].flatMap((match) =>
    [...match[0].matchAll(/\s([a-zA-Z-]+)=/g)].map((found) => found[1] ?? ""),
  );
}

const permittedAttributes = [
  "href",
  "target",
  "rel",
  "title",
  "colspan",
  "rowspan",
  "start",
  "dir",
  "data-inbox-image",
];

function expectInert(output: string) {
  for (const tag of tagsIn(output)) {
    expect(allowedTags as readonly string[]).toContain(tag);
  }
  for (const attribute of attributesIn(output)) {
    expect(permittedAttributes).toContain(attribute);
  }
  for (const href of output.matchAll(/href="([^"]*)"/g)) {
    expect(href[1]).toMatch(/^(https?:\/\/|mailto:|tel:)/);
  }
  expect(output).not.toMatch(/<\s*(script|style|img|iframe|svg|math|form)/i);
}

describe("sanitizeHtml", () => {
  it("keeps ordinary reply markup and makes links open safely", () => {
    const output = sanitizeHtml(
      '<div dir="ltr"><p>Hi <b>Ada</b>,<br>Thursday <i>works</i>. See <a href="https://customer.example/agenda?a=1&amp;b=2" title="The agenda">the agenda</a>.</p><ul><li>One</li><li>Two</li></ul><blockquote>Earlier</blockquote></div>',
    );
    expect(output).toBe(
      '<div dir="ltr"><p>Hi <b>Ada</b>,<br>Thursday <i>works</i>. See <a href="https://customer.example/agenda?a=1&amp;b=2" target="_blank" rel="noopener noreferrer nofollow" title="The agenda">the agenda</a>.</p><ul><li>One</li><li>Two</li></ul><blockquote>Earlier</blockquote></div>',
    );
  });

  it("removes scripts and styles with everything inside them", () => {
    const output = sanitizeHtml(
      '<p>Before</p><script>alert("x")</script><style>p{color:red}</style><SCRIPT SRC=https://evil.example/x.js></SCRIPT><p>After</p>',
    );
    expect(output).toBe("<p>Before</p><p>After</p>");
  });

  it("is not fooled by a closing tag inside a script or by a script that never closes", () => {
    expect(
      sanitizeHtml('<script>var a = "</scriptx>"; alert(1)</script >ok'),
    ).toBe("ok");
    expect(sanitizeHtml("<p>shown</p><script>alert(1)<p>hidden</p>")).toBe(
      "<p>shown</p>",
    );
    expect(sanitizeHtml("<p>shown</p><style>p{}</styl")).toBe("<p>shown</p>");
    expect(sanitizeHtml("a<plaintext></plaintext><b>x</b>")).toBe("a");
  });

  it("drops every event handler and every attribute it does not know", () => {
    const output = sanitizeHtml(
      '<p onclick="alert(1)" ONMOUSEOVER=alert(2) id="x" class="y" data-x="1" style="color:red" contenteditable>text</p><a href="https://ok.example" onclick="steal()" style="position:fixed" download ping="https://evil.example">link</a><div onload=alert(1)>',
    );
    expect(output).toBe(
      '<p>text</p><a href="https://ok.example" target="_blank" rel="noopener noreferrer nofollow">link</a><div></div>',
    );
    expectInert(output);
  });

  it("drops style attributes, including ones that load a URL or run an expression", () => {
    const output = sanitizeHtml(
      "<div style=\"background:url('https://evil.example/t.gif')\"><span STYLE='width:expression(alert(1))'>a</span><td style=\"behavior:url(x.htc)\">b</td></div>",
    );
    expect(output).toBe("<div><span>a</span><td>b</td></div>");
  });

  it("removes javascript, data, vbscript, file and relative links but keeps their text", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "\u0001javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "//evil.example/x",
      "/relative",
      "evil.example",
      "ftp://evil.example",
      "blob:https://evil.example/1",
      "cid:part1",
      "https://",
      "",
    ]) {
      const output = sanitizeHtml(`<a href="${href}">click</a>`);
      expect(output).toBe("<a>click</a>");
    }
  });

  it("decodes entity-encoded schemes before judging the link", () => {
    for (const href of [
      "&#106;avascript:alert(1)",
      "&#x6A;avascript:alert(1)",
      "&#X6a&#x61vascript:alert(1)",
      "&#0000106avascript:alert(1)",
      "javascript&colon;alert(1)",
      "java&Tab;script:alert(1)",
      "java&NewLine;script&colon;alert(1)",
      "&#1;javascript:alert(1)",
      "jav&#x09;ascript:alert(1)",
      "&#32;javascript:alert(1)",
      "d&#97;ta:text/html,x",
    ]) {
      expect(sanitizeHtml(`<a href="${href}">click</a>`)).toBe("<a>click</a>");
      expect(sanitizeHtml(`<a href='${href}'>click</a>`)).toBe("<a>click</a>");
      expect(sanitizeHtml(`<a href=${href}>click</a>`)).toBe("<a>click</a>");
    }
  });

  it("writes the link it judged, so nothing can be decoded a second time", () => {
    expect(
      sanitizeHtml(
        '<a href="https://ok.example/?q=&amp;#106;avascript:">x</a>',
      ),
    ).toBe(
      '<a href="https://ok.example/?q=&amp;#106;avascript:" target="_blank" rel="noopener noreferrer nofollow">x</a>',
    );
    expect(
      sanitizeHtml('<a href="https://ok.example/&quot;onclick=&quot;a">x</a>'),
    ).toBe(
      '<a href="https://ok.example/&quot;onclick=&quot;a" target="_blank" rel="noopener noreferrer nofollow">x</a>',
    );
    expect(sanitizeHtml('<a href="https://ok.example/\'>">x</a>')).toBe(
      '<a href="https://ok.example/&#39;&gt;" target="_blank" rel="noopener noreferrer nofollow">x</a>',
    );
  });

  it("keeps http, https, mailto and tel links", () => {
    for (const href of [
      "http://customer.example",
      "HTTPS://customer.example/path?x=1#y",
      "mailto:grace@customer.example",
      "tel:+15551234567",
    ]) {
      expect(sanitizeHtml(`<a href="${href}">x</a>`)).toContain(
        `href="${href}"`,
      );
    }
  });

  it("removes SVG and MathML with their content", () => {
    const output = sanitizeHtml(
      '<p>a</p><svg onload="alert(1)"><script>alert(1)</script><a xlink:href="javascript:alert(1)"><text>x</text></a><svg><g/></svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg><p>b</p><math><mi xlink:href="javascript:alert(1)">x</mi><annotation-xml encoding="text/html"><img src=x onerror=alert(1)></annotation-xml></math><p>c</p>',
    );
    expect(output).toBe("<p>a</p><p>b</p><p>c</p>");
  });

  it("fails closed on SVG and MathML that never close, and on known parser-confusion payloads", () => {
    expect(sanitizeHtml("<p>a</p><svg><p>b</p>")).toBe("<p>a</p>");
    for (const payload of [
      '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
      '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src=1 onerror=alert(1)&gt;">',
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
      "<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>",
      "<textarea><img src=x onerror=alert(1)></textarea><title><img src=x onerror=alert(1)></title>",
      "<xmp><img src=x onerror=alert(1)></xmp><iframe><img src=x onerror=alert(1)></iframe>",
      "<select><option><img src=x onerror=alert(1)></select><template><img src=x onerror=alert(1)></template>",
      "<!--><img src=x onerror=alert(1)>-->",
      "<!---><img src=x onerror=alert(1)>-->",
      "<!-- --!><img src=x onerror=alert(1)>",
      "<![CDATA[<img src=x onerror=alert(1)>]]>",
      '<?xml version="1.0"?><img src=x onerror=alert(1)>',
      "</ img src=x onerror=alert(1)>",
      "<img/src=x/onerror=alert(1)>",
      "<img src=x onerror=alert(1)//",
      '<a href="https://ok.example" onclick=alert(1)//>x',
      "<p <script>alert(1)</script>>text",
      "<<script>alert(1)//<</script>",
      "<scr<script>ipt>alert(1)</scr</script>ipt>",
      '<a href=https://ok.example"onmouseover="alert(1)>x</a>',
      '<div title="x"onclick="alert(1)">x</div>',
      "<b title='x' onclick=alert(1) x='>y</b>",
    ]) {
      expectInert(sanitizeHtml(payload));
    }
  });

  it("removes base, meta refresh, link, forms, frames, objects and embeds", () => {
    const output = sanitizeHtml(
      '<base href="https://evil.example/"><meta http-equiv="refresh" content="0;url=https://evil.example"><link rel="stylesheet" href="https://evil.example/x.css"><form action="https://evil.example" method="post"><input name="password" type="password"><button formaction="https://evil.example">Send</button><textarea>typed</textarea><select><option>one</option></select></form><iframe src="https://evil.example"></iframe><object data="x.swf"><param name="a" value="b">inside</object><embed src="x.swf"><frameset><frame src="x"></frameset><applet code="X">inside</applet><p>kept</p>',
    );
    expect(output).toBe("Send<p>kept</p>");
  });

  it("drops the head but keeps the body, even when the head never closes", () => {
    expect(
      sanitizeHtml(
        "<html><head><title>T</title><style>a{}</style></head><body><p>Hi</p></body></html>",
      ),
    ).toBe("<p>Hi</p>");
    expect(
      sanitizeHtml("<html><head><meta charset=utf-8><body><p>Hi</p>"),
    ).toBe("<p>Hi</p>");
  });

  it("never emits an image: a remote, embedded or inline image becomes its alt text", () => {
    const output = sanitizeHtml(
      '<p><img src="https://tracker.example/open.gif?id=42" width="1" height="1"><img src="https://customer.example/logo.png" alt="Acme &amp; Co logo" onerror="alert(1)"><IMG SRC="data:image/png;base64,AAAA" ALT="chart"><img src="cid:part1" alt=""><img srcset="https://tracker.example/a.png 2x" alt=\'"><script>alert(1)</script>\'></p>',
    );
    expect(output).toBe(
      '<p><span data-inbox-image="">Acme &amp; Co logo</span><span data-inbox-image="">chart</span><span data-inbox-image="">&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;</span></p>',
    );
    expect(output).not.toMatch(/tracker|src=|srcset|https:/);
  });

  it("removes other ways to load something remote", () => {
    const output = sanitizeHtml(
      '<table background="https://tracker.example/bg.gif"><tr><td background="https://tracker.example/c.gif">x</td></tr></table><video poster="https://tracker.example/p.jpg" src="https://tracker.example/v.mp4">v</video><audio src="https://tracker.example/a.mp3"></audio><picture><source srcset="https://tracker.example/s.png"><img src="https://tracker.example/i.png"></picture><input type="image" src="https://tracker.example/i.gif"><body background="https://tracker.example/b.gif">',
    );
    expect(output).toBe("<table><tr><td>x</td></tr></table>");
  });

  it("escapes text, so encoded markup stays text", () => {
    expect(sanitizeHtml("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(sanitizeHtml("&#60;img src=x onerror=alert(1)&#62;")).toBe(
      "&lt;img src=x onerror=alert(1)&gt;",
    );
    expect(sanitizeHtml("1 < 2 && 3 > 2, \"quoted\" & 'single'")).toBe(
      "1 &lt; 2 &amp;&amp; 3 &gt; 2, &quot;quoted&quot; &amp; &#39;single&#39;",
    );
    expect(sanitizeHtml("caf&eacute; &copy; &nosuchentity; &amp;lt;")).toBe(
      "café © &amp;nosuchentity; &amp;lt;",
    );
  });

  it("handles mixed case, odd spacing and unquoted attributes", () => {
    expect(
      sanitizeHtml(
        "<P\n>one</P><A\tHREF = https://ok.example/a  TITLE=t>two</A\n><BR/><Td ColSpan=2 rowspan='3'>x</tD>",
      ),
    ).toBe(
      '<p>one</p><a href="https://ok.example/a" target="_blank" rel="noopener noreferrer nofollow" title="t">two</a><br><td colspan="2" rowspan="3">x</td>',
    );
  });

  it("drops a tag that is cut off and closes whatever was left open", () => {
    expect(sanitizeHtml("<p>one<b>two")).toBe("<p>one<b>two</b></p>");
    expect(sanitizeHtml('<p>one</p><a href="https://ok.example')).toBe(
      "<p>one</p>",
    );
    expect(sanitizeHtml("<p>one</p><img src=x onerror=alert(1)")).toBe(
      "<p>one</p>",
    );
    expect(sanitizeHtml("</b></i>text</p>")).toBe("text");
    expect(sanitizeHtml("<b><i>x</b>y</i>")).toBe("<b><i>x</i></b>y");
    expect(sanitizeHtml("a < b and c<")).toBe("a &lt; b and c&lt;");
    expect(sanitizeHtml("a </")).toBe("a &lt;/");
  });

  it("does not nest links and ignores a second copy of an attribute", () => {
    expect(
      sanitizeHtml(
        '<a href="https://a.example">one<a href="https://b.example">two</a></a>',
      ),
    ).toBe(
      '<a href="https://a.example" target="_blank" rel="noopener noreferrer nofollow">one</a><a href="https://b.example" target="_blank" rel="noopener noreferrer nofollow">two</a>',
    );
    expect(
      sanitizeHtml(
        '<a href="javascript:alert(1)" href="https://ok.example">x</a>',
      ),
    ).toBe("<a>x</a>");
  });

  it("removes NUL bytes that would hide a tag name", () => {
    expectInert(sanitizeHtml("<scr\u0000ipt>alert(1)</scr\u0000ipt>"));
    expect(sanitizeHtml("<scr\u0000ipt>alert(1)</scr\u0000ipt>ok")).toBe("ok");
    expect(sanitizeHtml('<a href="java\u0000script:alert(1)">x</a>')).toBe(
      "<a>x</a>",
    );
  });

  it("only accepts small whole numbers and known directions", () => {
    expect(
      sanitizeHtml(
        '<td colspan="2;x" rowspan="0">a</td><ol start="5"><li dir="RTL">b</li></ol><p dir="sideways">c</p><td colspan="99999">d</td>',
      ),
    ).toBe(
      '<td>a</td><ol start="5"><li dir="rtl">b</li></ol><p>c</p><td>d</td>',
    );
  });

  it("stays bounded on hostile sizes", () => {
    const deep = sanitizeHtml(`${"<div>".repeat(5000)}x`);
    expect(tagsIn(deep).filter((tag) => tag === "div").length).toBe(120);
    const wide = sanitizeHtml(`<p ${"a=b ".repeat(5000)}>x</p>`);
    expect(wide).toBe("<p>x</p>");
    const started = Date.now();
    sanitizeHtml(`${"<".repeat(200_000)}${"<script>".repeat(20_000)}`);
    sanitizeHtml("<a href='".repeat(50_000));
    sanitizeHtml("&#x".repeat(100_000));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(sanitizeHtml("x".repeat(600_000)).length).toBe(512 * 1024);
  });

  it("is stable when run on its own output", () => {
    const once = sanitizeHtml(
      '<div><p>Hi &amp; bye <a href="https://ok.example/?a=1&b=2">x</a><img src=x alt="A < B"></p><table><tr><td colspan=2>c</td></tr></table></div>',
    );
    const twice = sanitizeHtml(once);
    expect(twice).toBe(once.replace(' data-inbox-image=""', ""));
  });
});

describe("tokenizeHtml", () => {
  it("splits text, tags and attributes and lower-cases names", () => {
    const tokens = tokenizeHtml('a<B CLASS="x" hidden>b</B><!-- c -->d');
    expect(tokens).toEqual([
      { type: "text", value: "a" },
      {
        type: "open",
        name: "b",
        attributes: new Map([
          ["class", "x"],
          ["hidden", ""],
        ]),
        selfClosing: false,
      },
      { type: "text", value: "b" },
      { type: "close", name: "b" },
      { type: "text", value: "d" },
    ]);
  });

  it("keeps a greater-than sign inside a quoted attribute in the tag", () => {
    expect(tokenizeHtml('<a title="1 > 0" href=x>y')).toEqual([
      {
        type: "open",
        name: "a",
        attributes: new Map([
          ["title", "1 > 0"],
          ["href", "x"],
        ]),
        selfClosing: false,
      },
      { type: "text", value: "y" },
    ]);
  });
});

describe("decodeEntities and safeUrl", () => {
  it("decodes numeric and named references with or without a semicolon", () => {
    expect(decodeEntities("&#65;&#x42;&#67&amp;&amp&lt;&nbsp;&copy")).toBe(
      "ABC&&< ©",
    );
    expect(decodeEntities("&#0;&#xD800;&#x110000;&#;&#x;&;& &colon")).toBe(
      "���&#;&#x;&;& &colon",
    );
  });

  it("returns the cleaned link or null", () => {
    expect(safeUrl("  https://ok.example/a b")).toBeNull();
    expect(safeUrl(" \thttps://ok.example/a\n")).toBe("https://ok.example/a");
    expect(safeUrl(`https://ok.example/${"a".repeat(3000)}`)).toBeNull();
    expect(safeUrl("mailto:")).toBeNull();
  });
});

describe("htmlToText", () => {
  it("turns blocks into lines, lists into dashes and images into their alt text", () => {
    expect(
      htmlToText(
        '<div><p>Hi   Ada,</p><p>Thursday works.<br>See you <b>then</b>.</p><ul><li>One</li><li>Two</li></ul><img src="https://x.example/a.png" alt="Signature"><script>alert(1)</script><style>p{}</style></div>',
      ),
    ).toBe(
      "Hi Ada,\n\nThursday works.\nSee you then.\n\n- One\n- Two\n\n[Signature]",
    );
  });

  it("marks quoted history so it can be trimmed", () => {
    expect(
      htmlToText(
        '<div>Sounds good.</div><div class="gmail_quote"><div>On Mon, Ada wrote:</div><blockquote>Are you free?<br>Thanks</blockquote></div><p>PS</p>',
      ),
    ).toBe(
      "Sounds good.\n> On Mon, Ada wrote:\n\n> > Are you free?\n> > Thanks\n\nPS",
    );
  });

  it("decodes entities, keeps preformatted lines and separates table cells", () => {
    expect(
      htmlToText(
        "<p>a &amp; b &lt;c&gt;</p><pre>x\n  y</pre><table><tr><td>1</td><td>2</td></tr><tr><td>3</td></tr></table>",
      ),
    ).toBe("a & b <c>\n\nx\n  y\n\n1 2\n3");
  });
});
