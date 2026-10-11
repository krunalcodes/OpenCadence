import { outreachHtmlToText, sanitizeOutreachHtml } from "./draft-content";

describe("sanitizeOutreachHtml", () => {
  it("keeps the allowed outreach tags as written", () => {
    const html =
      '<p>Hi {{ first_name | there }},</p><p>One <strong>bold</strong> and one <em>soft</em> word.<br>Second line.</p><ul><li>First</li><li>Second</li></ul><p><a href="https://example.com/a?b=1&amp;c=2">Our guide</a></p>';
    expect(sanitizeOutreachHtml(html)).toBe(html);
  });

  it("removes scripts, styles and other hidden elements with their content", () => {
    expect(
      sanitizeOutreachHtml(
        '<style>p{color:red}</style><p>Hello</p><script>alert("<p>x</p>")</script><iframe src="https://evil.test"></iframe><svg><a href="https://x.test">x</a></svg><!-- note --><p>Bye</p>',
      ),
    ).toBe("<p>Hello</p><p>Bye</p>");
    expect(sanitizeOutreachHtml("<p>Kept</p><script>never closed")).toBe(
      "<p>Kept</p>",
    );
    expect(sanitizeOutreachHtml("<p>Kept</p><!-- never closed <p>x</p>")).toBe(
      "<p>Kept</p>",
    );
  });

  it("drops every attribute except a safe href", () => {
    expect(
      sanitizeOutreachHtml(
        '<p style="color:red" class="x" onclick="steal()">Hi</p><a href="https://example.com" onmouseover="steal()" target="_blank" style="x">Link</a>',
      ),
    ).toBe('<p>Hi</p><a href="https://example.com">Link</a>');
  });

  it("removes links with script, data and other unsafe addresses and keeps their text", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      " java\tscript:alert(1)",
      "&#106;avascript:alert(1)",
      "&#x6A;avascript:alert(1)",
      "javascript&colon;alert(1)",
      "\u0001javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "//evil.test/path",
      "/relative",
      "",
    ]) {
      expect(sanitizeOutreachHtml(`<p><a href="${href}">Read it</a></p>`)).toBe(
        "<p>Read it</p>",
      );
    }
    expect(sanitizeOutreachHtml("<p><a>No address</a> here</p>")).toBe(
      "<p>No address here</p>",
    );
  });

  it("keeps https, http, mailto and merge tag addresses", () => {
    expect(
      sanitizeOutreachHtml(
        '<a href=\'HTTPS://Example.com/x\'>a</a><a href=http://example.com>b</a><a href="mailto:ada@example.com">c</a><a href="{{ unsubscribe_url }}">d</a>',
      ),
    ).toBe(
      '<a href="HTTPS://Example.com/x">a</a><a href="http://example.com">b</a><a href="mailto:ada@example.com">c</a><a href="{{ unsubscribe_url }}">d</a>',
    );
    expect(
      sanitizeOutreachHtml('<a href="https://x.test/?q=&quot;><b>">t</a>'),
    ).toBe("t");
  });

  it("turns headings and containers into paragraphs and removes layout elements", () => {
    expect(
      sanitizeOutreachHtml(
        '<html><body><h1>Title</h1><div><p>Body</p></div><img src="https://x.test/a.png" alt="A"><table><tr><td>Cell</td></tr></table><b>Bold</b> <i>soft</i><ol><li>One</li></ol><a data-button="true" href="https://example.com">Go</a><hr></body></html>',
      ),
    ).toBe(
      '<p>Title</p><p>Body</p>Cell<strong>Bold</strong> <em>soft</em><ul><li>One</li></ul><a href="https://example.com">Go</a>',
    );
  });

  it("balances what it keeps", () => {
    expect(sanitizeOutreachHtml("<p>One<p>Two <strong>bold")).toBe(
      "<p>One</p><p>Two <strong>bold</strong></p>",
    );
    expect(sanitizeOutreachHtml("<li>Loose</li><li>Items")).toBe(
      "<ul><li>Loose</li><li>Items</li></ul>",
    );
    expect(sanitizeOutreachHtml("</p></ul>Text</strong>")).toBe("Text");
    expect(sanitizeOutreachHtml("<p>Intro<ul><li>Point</li></ul>")).toBe(
      "<p>Intro</p><ul><li>Point</li></ul>",
    );
  });

  it("escapes angle brackets that are not tags", () => {
    expect(sanitizeOutreachHtml("<p>1 < 2 and 3 > 2</p>")).toBe(
      "<p>1 &lt; 2 and 3 &gt; 2</p>",
    );
    expect(sanitizeOutreachHtml('<p>Hi</p><script src="x')).toBe(
      '<p>Hi</p>&lt;script src="x',
    );
    expect(
      sanitizeOutreachHtml("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"),
    ).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });

  it("gives the same result when run twice", () => {
    const once = sanitizeOutreachHtml(
      '<div onclick="x()"><h2>Hello</h2><a href="https://example.com/?a=1&b=2">Link</a><script>x</script> 1 < 2</div>',
    );
    expect(sanitizeOutreachHtml(once)).toBe(once);
  });

  it("stays fast on hostile input", () => {
    const started = Date.now();
    sanitizeOutreachHtml("<a ".repeat(30_000));
    sanitizeOutreachHtml("<strong>".repeat(12_000));
    sanitizeOutreachHtml(`<a "${"<a ".repeat(30_000)}`);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe("outreachHtmlToText", () => {
  it("separates paragraphs with a blank line and keeps line breaks", () => {
    expect(
      outreachHtmlToText(
        "<p>Hi {{ first_name | there }},</p>\n<p>A question about\n   {{ company | your team }}.</p>\n<p>Best,<br>[your name]</p>",
      ),
    ).toBe(
      "Hi {{ first_name | there }},\n\nA question about {{ company | your team }}.\n\nBest,\n[your name]",
    );
  });

  it("writes links as text followed by the address", () => {
    expect(
      outreachHtmlToText(
        '<p>Read <a href="https://example.com/guide?a=1&amp;b=2">our <strong>guide</strong></a> first.</p>',
      ),
    ).toBe("Read our guide (https://example.com/guide?a=1&b=2) first.");
    expect(
      outreachHtmlToText(
        '<p><a href="https://example.com">https://example.com</a></p>',
      ),
    ).toBe("https://example.com");
    expect(
      outreachHtmlToText(
        '<p>Write to <a href="mailto:ada@example.com">Ada</a>.</p>',
      ),
    ).toBe("Write to Ada (ada@example.com).");
    expect(outreachHtmlToText('<p><a href="#">Placeholder</a></p>')).toBe(
      "Placeholder",
    );
    expect(
      outreachHtmlToText('<p><a href="javascript:alert(1)">Unsafe</a></p>'),
    ).toBe("Unsafe");
  });

  it("writes list items as dashes, one per line", () => {
    expect(
      outreachHtmlToText(
        "<p>Three things:</p>\n<ul>\n<li>Faster setup</li>\n<li><p>Fewer bounces</p></li>\n<li>One <em>inbox</em></li>\n</ul>\n<p>Worth a look?</p>",
      ),
    ).toBe(
      "Three things:\n\n- Faster setup\n- Fewer bounces\n- One inbox\n\nWorth a look?",
    );
  });

  it("decodes entities and drops markup that is not allowed", () => {
    expect(
      outreachHtmlToText(
        "<h1>Tom &amp; Ada</h1><script>alert(1)</script><p>5&nbsp;&lt;&nbsp;6 &#8364;</p>",
      ),
    ).toBe("Tom & Ada\n\n5 < 6 €");
    expect(outreachHtmlToText("<script>x</script>  ")).toBe("");
  });
});
