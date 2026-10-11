import { describe, expect, it } from "vitest";
import {
  decodeClickTarget,
  messageToken,
  verifyClickSignature,
} from "../tracking/tokens";
import { type PrepareEmailInput, prepareEmail } from "./prepare-email";

const secret = Buffer.alloc(32, 9);
const messageId = "0198c1de-7a10-7c3e-9f00-0123456789ab";
const token = messageToken(messageId, secret);
const baseUrl = "https://mail.example.com/api/v1";
const unsubscribeUrl = `${baseUrl}/t/u/${token}`;
const pixelPattern = new RegExp(
  `<img src="${baseUrl}/t/o/${token}\\.gif" width="1" height="1" alt="" style="[^"]*">`,
);
const trackedPattern = new RegExp(
  `${baseUrl}/t/c/${token}\\?u=([A-Za-z0-9_-]+)&amp;s=([A-Za-z0-9_-]+)`,
  "g",
);

function prepare(overrides: Partial<PrepareEmailInput>) {
  return prepareEmail({
    html: null,
    text: null,
    variables: {},
    messageToken: token,
    baseUrl,
    secret,
    trackOpens: false,
    trackClicks: false,
    unsubscribe: false,
    ...overrides,
  });
}

function html(source: string, overrides: Partial<PrepareEmailInput> = {}) {
  const result = prepare({ html: source, ...overrides }).html;
  if (result === null) {
    throw new Error("Expected html.");
  }
  return result;
}

function clicks(source: string, overrides: Partial<PrepareEmailInput> = {}) {
  return html(source, { trackClicks: true, ...overrides });
}

function targets(output: string) {
  const found: string[] = [];
  for (const match of output.matchAll(trackedPattern)) {
    const url = decodeClickTarget(match[1] ?? "");
    if (url === null) {
      throw new Error("A tracked link did not decode.");
    }
    expect(verifyClickSignature(messageId, url, match[2] ?? "", secret)).toBe(
      true,
    );
    found.push(url);
  }
  return found;
}

function untrack(output: string, encode: (url: string) => string) {
  return output.replace(trackedPattern, (_match, target: string) =>
    encode(decodeClickTarget(target) ?? ""),
  );
}

const ampersands = (url: string) => url.replaceAll("&", "&amp;");

describe("prepareEmail with everything off", () => {
  it("returns html and text untouched", () => {
    const source = `<!doctype html><html><body><p>Hi</p><a href="https://example.com/?a=1&b=2">Go</a></body></html>`;
    expect(prepare({ html: source, text: "Hi" })).toEqual({
      html: source,
      text: "Hi",
      headers: {},
    });
  });

  it("keeps null parts null", () => {
    expect(prepare({})).toEqual({ html: null, text: null, headers: {} });
    expect(prepare({ text: "a", unsubscribe: true }).html).toBeNull();
    expect(prepare({ html: "a", unsubscribe: true }).text).toBeNull();
  });

  it("passes caller headers through", () => {
    expect(prepare({ headers: { "X-Campaign": "1" } }).headers).toEqual({
      "X-Campaign": "1",
    });
  });

  it("returns malformed html byte for byte", () => {
    const inputs = [
      "<",
      "<a href=",
      '<a href="https://example.com',
      "<a href='https://example.com>Go</a>",
      "<!-- never closed <a href='https://example.com'>x</a>",
      "<style>a{color:red}",
      "</a></a><a><a>",
      "<p>1 < 2 && 3 > 2</p>",
      "<A HREF=HTTPS://EXAMPLE.COM>X</A>",
      "\u0000<a\u0000href=x>",
      '<a href="x"y="z">q</a>',
      "<a href=x / >q</a>",
      "<table><tr><td>a<td>b</table>",
      "plain text with no tags at all",
      "",
    ];
    for (const source of inputs) {
      expect(html(source), source).toBe(source);
    }
  });
});

describe("merge tags in html", () => {
  it("escapes values in text", () => {
    expect(
      html("<p>Hi {{first_name}}, from {{company|us}}</p>", {
        variables: { first_name: `<b>"Ada" & 'co'</b>` },
      }),
    ).toBe(
      "<p>Hi &lt;b&gt;&quot;Ada&quot; &amp; &#39;co&#39;&lt;/b&gt;, from us</p>",
    );
  });

  it("escapes values in ordinary attributes", () => {
    expect(
      html(`<img alt="{{first_name}}" title='{{first_name}}'>`, {
        variables: { first_name: `a" onerror="x' y` },
      }),
    ).toBe(
      `<img alt="a&quot; onerror=&quot;x&#39; y" title='a&quot; onerror=&quot;x&#39; y'>`,
    );
  });

  it("quotes an unquoted attribute that holds a merge tag", () => {
    expect(
      html("<img alt={{first_name}} width=10>", {
        variables: { first_name: "x onerror=alert(1)" },
      }),
    ).toBe(`<img alt="x onerror=alert(1)" width=10>`);
    expect(
      html("<a href={{link}}>Go</a>", {
        variables: { link: "https://example.com/a b" },
      }),
    ).toBe(`<a href="https://example.com/a b">Go</a>`);
  });

  it("puts a whole href value in as it is, escaped for html only", () => {
    expect(
      html(`<a href="{{ link }}">Go</a><a href=' {{link}} '>Go</a>`, {
        variables: { link: "https://example.com/p?a=1&b=x y#top" },
      }),
    ).toBe(
      `<a href="https://example.com/p?a=1&amp;b=x y#top">Go</a><a href=' https://example.com/p?a=1&amp;b=x y#top '>Go</a>`,
    );
  });

  it("url encodes a value that is only part of an href", () => {
    expect(
      html(
        `<a href="https://example.com/u/{{ first_name }}?e={{email}}&c={{company|none}}">Go</a>`,
        { variables: { first_name: "A/da ?", email: "a+b@example.com" } },
      ),
    ).toBe(
      `<a href="https://example.com/u/A%2Fda%20%3F?e=a%2Bb@example.com&c=none">Go</a>`,
    );
  });

  it("keeps the at sign in a mailto address", () => {
    expect(
      html(`<a href="mailto:{{email}}?subject=Hi {{first_name}}">Write</a>`, {
        variables: { email: "ada@example.com", first_name: "A&B" },
      }),
    ).toBe(`<a href="mailto:ada@example.com?subject=Hi A%26B">Write</a>`);
  });

  it("keeps an address value that starts an href", () => {
    expect(
      html(`<a href="{{brand.website}}/pricing?ref={{email}}">Go</a>`, {
        variables: {
          "brand.website": "https://acme.example",
          email: "a@b.co",
        },
      }),
    ).toBe(`<a href="https://acme.example/pricing?ref=a@b.co">Go</a>`);
  });

  it("drops a script address that arrives through a whole href value", () => {
    for (const link of [
      "javascript:alert(1)",
      " JavaScript:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html,<script>1</script>",
      "vbscript:x",
    ]) {
      expect(
        html(`<a href="{{link}}">Go</a>`, { variables: { link } }),
        link,
      ).toBe(`<a href="">Go</a>`);
    }
  });

  it("escapes values inside comments, style and title", () => {
    const value = "--></style></title><script>x</script>";
    const output = html(
      "<title>{{v}}</title><style>/* {{v}} */</style><!-- {{v}} --><p>ok</p>",
      { variables: { v: value } },
    );
    const escaped =
      "--&gt;&lt;/style&gt;&lt;/title&gt;&lt;script&gt;x&lt;/script&gt;";
    expect(output).toBe(
      `<title>${escaped}</title><style>/* ${escaped} */</style><!-- ${escaped} --><p>ok</p>`,
    );
  });

  it("renders nothing for a merge tag used as a tag or attribute name", () => {
    expect(
      html("<{{v}}>a</{{v}}><p {{v}} class=x {{v}}=1>b</p>", {
        variables: { v: "script" },
      }),
    ).toBe("<>a</><p  class=x =1>b</p>");
  });

  it("does not let a fallback that holds markup change the structure", () => {
    expect(
      html(`<p title="{{a|"x">}}">{{b|<b>bold</b>}}</p>`, { variables: {} }),
    ).toBe(`<p title="&quot;x&quot;&gt;">&lt;b&gt;bold&lt;/b&gt;</p>`);
  });

  it("does not render tags that arrive inside a value", () => {
    expect(
      html("<p>{{first_name}}</p>", {
        variables: { first_name: "{{email}}", email: "a@example.com" },
      }),
    ).toBe("<p>{{email}}</p>");
  });

  it("leaves text that is not a merge tag alone", () => {
    const source = "<p>{{ Not A Tag }} { x } {{a.b.c}} }}{{</p>";
    expect(html(source, { variables: { a: "1" } })).toBe(source);
  });

  it("renders merge tags in the text part without escaping", () => {
    expect(
      prepare({
        text: "Hi {{first_name|there}} <{{email}}>",
        variables: { first_name: "A & B", email: "a@example.com" },
      }).text,
    ).toBe("Hi A & B <a@example.com>");
  });
});

describe("unsubscribe", () => {
  it("adds the one click headers", () => {
    expect(prepare({ unsubscribe: true }).headers).toEqual({
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("replaces a caller header of the same name in any case", () => {
    expect(
      prepare({
        unsubscribe: true,
        headers: { "list-unsubscribe": "<mailto:x@example.com>", "X-A": "1" },
      }).headers,
    ).toEqual({
      "X-A": "1",
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("fills the unsubscribe_url merge tag and adds no footer", () => {
    const output = html(
      `<body><p>Hi</p><a href="{{ unsubscribe_url }}">Unsubscribe</a></body>`,
      { unsubscribe: true, variables: { unsubscribe_url: "#" } },
    );
    expect(output).toBe(
      `<body><p>Hi</p><a href="${unsubscribeUrl}">Unsubscribe</a></body>`,
    );
  });

  it("finds the link whatever the quoting and case", () => {
    for (const source of [
      "<A HREF={{unsubscribe_url}}>Stop</A>",
      "<a class=x href='{{unsubscribe_url}}'>Stop</a>",
      `<a href=" {{unsubscribe_url}} ">Stop</a>`,
    ]) {
      const output = html(source, { unsubscribe: true });
      expect(output.split(unsubscribeUrl)).toHaveLength(2);
    }
  });

  it("appends a footer before the end of the body when there is no link", () => {
    const output = html("<html><body><p>Hi</p></body></html>", {
      unsubscribe: true,
    });
    expect(output).toMatch(
      new RegExp(
        `^<html><body><p>Hi</p><p style="[^"]*"><a href="${unsubscribeUrl}" style="[^"]*">Unsubscribe</a></p></body></html>$`,
      ),
    );
  });

  it("appends the footer at the end when there is no body tag", () => {
    const output = html("<p>Hi</p>", { unsubscribe: true });
    expect(output.startsWith("<p>Hi</p><p style=")).toBe(true);
    expect(output.endsWith("Unsubscribe</a></p>")).toBe(true);
  });

  it("does not count a link inside a comment or style as an unsubscribe link", () => {
    const output = html(
      `<!-- <a href="{{unsubscribe_url}}">x</a> --><style>/* <a href="{{unsubscribe_url}}"> */</style><p>Hi</p>`,
      { unsubscribe: true },
    );
    expect(output.endsWith("Unsubscribe</a></p>")).toBe(true);
  });

  it("uses the label it is given, escaped", () => {
    expect(
      html("<p>Hi</p>", {
        unsubscribe: true,
        unsubscribeLabel: "Se désabonner <",
      }),
    ).toContain(">Se désabonner &lt;</a>");
  });

  it("adds the address to the text part once", () => {
    expect(prepare({ text: "Hello\n", unsubscribe: true }).text).toBe(
      `Hello\n\nUnsubscribe: ${unsubscribeUrl}\n`,
    );
    expect(
      prepare({ text: "Stop: {{unsubscribe_url}}", unsubscribe: true }).text,
    ).toBe(`Stop: ${unsubscribeUrl}`);
    expect(prepare({ text: "", unsubscribe: true }).text).toBe(
      `Unsubscribe: ${unsubscribeUrl}\n`,
    );
  });

  it("never rewrites the unsubscribe link for click tracking", () => {
    const output = clicks(
      `<a href="{{unsubscribe_url}}">Unsubscribe</a><a href="https://example.com">Site</a>`,
      { unsubscribe: true },
    );
    expect(output).toContain(`<a href="${unsubscribeUrl}">Unsubscribe</a>`);
    expect(targets(output)).toEqual(["https://example.com"]);
  });

  it("does not rewrite the footer link it adds", () => {
    const output = clicks("<p>Hi</p>", { unsubscribe: true });
    expect(targets(output)).toEqual([]);
    expect(output).toContain(`href="${unsubscribeUrl}"`);
  });
});

describe("click tracking", () => {
  it("rewrites http and https links and keeps everything else", () => {
    const source = `<p>Read <a class="x" href="https://example.com/a?b=1&amp;c=2#d" target="_blank">this</a> and <a href='http://example.org/'>that</a>.</p>`;
    const output = clicks(source);
    expect(targets(output)).toEqual([
      "https://example.com/a?b=1&c=2#d",
      "http://example.org/",
    ]);
    expect(untrack(output, ampersands)).toBe(source);
  });

  it("handles unquoted, single quoted and upper case forms", () => {
    const output = clicks(
      `<A HREF=https://example.com/one>1</A><a HrEf='HTTPS://EXAMPLE.COM/two'>2</a><a href = "https://example.com/three" >3</a>`,
    );
    expect(targets(output)).toEqual([
      "https://example.com/one",
      "HTTPS://EXAMPLE.COM/two",
      "https://example.com/three",
    ]);
    expect(output).toMatch(
      /^<A HREF="https:\/\/mail[^"]+">1<\/A><a HrEf='https:\/\/mail[^']+'>2<\/a><a href = "https:\/\/mail[^"]+" >3<\/a>$/,
    );
  });

  it("decodes entities in the address before signing it", () => {
    expect(
      targets(
        clicks(
          `<a href="https://example.com/?a=1&amp;b=2&#38;c=3&#x26;d=4&e=5&quot;">x</a>`,
        ),
      ),
    ).toEqual([`https://example.com/?a=1&b=2&c=3&d=4&e=5"`]);
  });

  it("leaves a link alone when its entities are ambiguous", () => {
    for (const source of [
      `<a href="https://example.com/?a=1&copy;=2">x</a>`,
      `<a href="https://example.com/?a=1&reg">x</a>`,
      `<a href="https://example.com/?a=1&not/">x</a>`,
      `<a href="https://example.com/?a=1&#38">x</a>`,
      `<a href="https://example.com/?a=1&#0;">x</a>`,
      `<a href="https://example.com/?a=1&#x80;">x</a>`,
      `<a href="https://example.com/?a=1&#xD800;">x</a>`,
    ]) {
      expect(clicks(source), source).toBe(source);
    }
  });

  it("keeps surrounding whitespace out of the signed address", () => {
    expect(
      targets(clicks(`<a href="  https://example.com/a \n">x</a>`)),
    ).toEqual(["https://example.com/a"]);
  });

  it("leaves mailto, tel, anchors, relative and other schemes alone", () => {
    const source = [
      `<a href="mailto:a@example.com">a</a>`,
      `<a href="tel:+15550100">b</a>`,
      `<a href="#top">c</a>`,
      `<a href="/pricing">d</a>`,
      `<a href="//example.com/x">e</a>`,
      `<a href="ftp://example.com/x">f</a>`,
      `<a href="javascript:void(0)">g</a>`,
      `<a href="">h</a>`,
      `<a href>i</a>`,
      `<a name="x">j</a>`,
      `<a href="https://">k</a>`,
      `<a href="http:example.com">l</a>`,
      `<a href="sms:+15550100">m</a>`,
    ].join("");
    expect(clicks(source)).toBe(source);
  });

  it("leaves a link whose visible text is itself an address", () => {
    const source = [
      `<a href="https://example.com/a">https://example.com/a</a>`,
      `<a href="https://example.com/a"> www.example.com </a>`,
      `<a href="https://example.com/a"><b>example.com</b>/pricing</a>`,
      `<a href="https://example.com/a">HTTP://EXAMPLE.COM</a>`,
      `<a href="https://example.com/?a=1&amp;b=2">https://example.com/?a=1&amp;b=2</a>`,
      `<a href="https://example.com/a">shop.example.co.uk</a>`,
    ].join("");
    expect(clicks(source)).toBe(source);
  });

  it("still rewrites links whose text only mentions an address", () => {
    expect(
      targets(
        clicks(
          `<a href="https://example.com/1">Visit example.com today</a><a href="https://example.com/2"><img src="https://example.com/i.png" alt="example.com"></a><a href="https://example.com/3">e.g.</a><a href="https://example.com/4">v1.2</a>`,
        ),
      ),
    ).toEqual([
      "https://example.com/1",
      "https://example.com/2",
      "https://example.com/3",
      "https://example.com/4",
    ]);
  });

  it("ignores links inside comments, style, script, title and textarea", () => {
    const source = `<!-- <a href="https://example.com/1">x</a> --><style>a[href="https://example.com/2"]{} /* <a href="https://example.com/3">x</a> */</style><script>var s = '<a href="https://example.com/4">x</a>';</script><title><a href="https://example.com/5">x</a></title><textarea><a href="https://example.com/6">x</a></textarea><!--[if mso]><a href="https://example.com/7">x</a><![endif]-->`;
    expect(clicks(source)).toBe(source);
  });

  it("ignores an address that only looks like an href", () => {
    const source = `<p title='<a href="https://example.com/1">'>a</p><a data-href="https://example.com/2" title="href=https://example.com/3">b</a><link href="https://example.com/4"><area href="https://example.com/5"><img src="https://example.com/6"><abbr href="https://example.com/7">c</abbr>`;
    expect(clicks(source)).toBe(source);
  });

  it("uses the first href when a tag has two", () => {
    const output = clicks(
      `<a href="https://example.com/1" href="https://example.com/2">x</a>`,
    );
    expect(targets(output)).toEqual(["https://example.com/1"]);
    expect(output).toContain(`href="https://example.com/2"`);
  });

  it("rewrites links that come from merge tags", () => {
    const output = clicks(
      `<a href="{{link}}">Go</a><a href="https://example.com/u?e={{email}}">Go</a>`,
      {
        variables: {
          link: "https://example.com/p?a=1&b=2",
          email: "a+b@example.com",
        },
      },
    );
    expect(targets(output)).toEqual([
      "https://example.com/p?a=1&b=2",
      "https://example.com/u?e=a%2Bb@example.com",
    ]);
  });

  it("does not rewrite a link twice", () => {
    const once = clicks(`<a href="https://example.com/a">x</a>`);
    expect(clicks(once)).toBe(once);
  });

  it("leaves links alone when the address is too long or does not parse", () => {
    const long = `<a href="https://example.com/${"a".repeat(2100)}">x</a>`;
    expect(clicks(long)).toBe(long);
    const bad = `<a href="https://exa mple.com/">x</a><a href="http://[::1">x</a>`;
    expect(clicks(bad)).toBe(bad);
  });

  it("copes with links that are never closed", () => {
    const source = `<a href="https://example.com/1">one<a href="https://example.com/2">https://example.com/2`;
    expect(targets(clicks(source))).toEqual(["https://example.com/1"]);
  });

  it("keeps non ASCII addresses exactly", () => {
    const url = "https://example.com/café?q=☃&x=😀";
    expect(targets(clicks(`<a href="${ampersands(url)}">x</a>`))).toEqual([
      url,
    ]);
  });

  it("does not rewrite the text part", () => {
    expect(
      prepare({ text: "Go to https://example.com/a", trackClicks: true }).text,
    ).toBe("Go to https://example.com/a");
  });

  it("does nothing when the message token is not valid", () => {
    const source = `<body><a href="https://example.com/a">x</a></body>`;
    expect(
      html(source, {
        trackClicks: true,
        trackOpens: true,
        messageToken: "not-a-token",
      }),
    ).toBe(source);
  });
});

describe("open tracking", () => {
  it("puts the pixel before the end of the body", () => {
    const output = html("<html><body><p>Hi</p></body></html>", {
      trackOpens: true,
    });
    expect(output.startsWith("<html><body><p>Hi</p><img ")).toBe(true);
    expect(output.endsWith("></body></html>")).toBe(true);
    expect(output).toMatch(pixelPattern);
  });

  it("uses the last closing body tag, in any case", () => {
    const output = html("<BODY><!-- </body> --><p>a</p></BODY >\n", {
      trackOpens: true,
    });
    expect(output).toMatch(
      /^<BODY><!-- <\/body> --><p>a<\/p><img [^>]+><\/BODY >\n$/,
    );
  });

  it("appends the pixel when there is no body tag", () => {
    const output = html("<p>Hi</p>", { trackOpens: true });
    expect(output.replace(pixelPattern, "")).toBe("<p>Hi</p>");
    expect(output.endsWith(">")).toBe(true);
  });

  it("puts the footer before the pixel", () => {
    const output = html("<body><p>Hi</p></body>", {
      trackOpens: true,
      unsubscribe: true,
    });
    expect(output).toMatch(
      /^<body><p>Hi<\/p><p style="[^"]*"><a href="[^"]*" style="[^"]*">Unsubscribe<\/a><\/p><img [^>]+><\/body>$/,
    );
  });

  it("strips trailing slashes from the base address", () => {
    expect(
      html("<p>Hi</p>", { trackOpens: true, baseUrl: `${baseUrl}//` }),
    ).toMatch(pixelPattern);
  });
});

describe("preview text", () => {
  it("adds a hidden line after the body tag", () => {
    const output = html(
      `<html><head></head><body class="x"><p>Hi</p></body></html>`,
      {
        previewText: "Big <news> for {{first_name|you}}",
        variables: { first_name: "A&B" },
      },
    );
    expect(output).toMatch(
      /^<html><head><\/head><body class="x"><div style="display:none[^"]*">Big &lt;news&gt; for A&amp;B<\/div><p>Hi<\/p><\/body><\/html>$/,
    );
  });

  it("goes after the head, the html tag or the doctype when there is no body", () => {
    expect(
      html("<!DOCTYPE html><html><head><title>t</title></head><p>Hi</p>", {
        previewText: "p",
      }),
    ).toMatch(/<\/head><div [^>]+>p<\/div><p>Hi<\/p>$/);
    expect(html("<!doctype html><p>Hi</p>", { previewText: "p" })).toMatch(
      /^<!doctype html><div [^>]+>p<\/div><p>Hi<\/p>$/,
    );
    expect(html("<p>Hi</p>", { previewText: "p" })).toMatch(
      /^<div [^>]+>p<\/div><p>Hi<\/p>$/,
    );
  });

  it("adds nothing for an empty preview", () => {
    expect(html("<p>Hi</p>", { previewText: "  " })).toBe("<p>Hi</p>");
  });
});

describe("prepareEmail never throws and never loses content", () => {
  const pieces = [
    "<",
    ">",
    "</",
    "/>",
    "=",
    '"',
    "'",
    " ",
    "\n",
    "a",
    "<a ",
    "</a>",
    "href",
    "HREF=",
    '<a href="https://example.com/y?a=1&amp;b=2">',
    "<a href=http://example.org/z>",
    "<A class=x HREF='https://example.com/q'>",
    "https://example.com/x?a=1&b=2",
    "http://example.org",
    "mailto:a@example.com",
    "&amp;",
    "&",
    "&#38;",
    "&copy;",
    "<!--",
    "-->",
    "<style>",
    "</style>",
    "<script>",
    "</script>",
    "<body>",
    "</body>",
    "<p>",
    "text",
    "é😀",
    "\u0000",
    "{{",
    "}}",
    "{{first_name}}",
    "{{ link }}",
    "{{unsubscribe_url}}",
    '{{x|<b>"}}',
    "|",
  ];

  function generate(seed: number, withTags: boolean) {
    let state = seed;
    const random = () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state;
    };
    const usable = withTags
      ? pieces
      : pieces.filter((piece) => !piece.includes("{") && !piece.includes("}"));
    let output = "";
    const size = random() % 40;
    for (let index = 0; index < size; index += 1) {
      output += usable[random() % usable.length];
    }
    return output;
  }

  it("returns generated html unchanged when every feature is off", () => {
    for (let seed = 1; seed <= 4000; seed += 1) {
      const source = generate(seed, false);
      expect(html(source), JSON.stringify(source)).toBe(source);
    }
  });

  it("changes only link addresses when click tracking is on", () => {
    let rewritten = 0;
    for (let seed = 1; seed <= 4000; seed += 1) {
      const source = generate(seed, false);
      const output = clicks(source);
      const links = targets(output);
      rewritten += links.length;
      for (const link of links) {
        expect(/^https?:\/\//i.test(link), JSON.stringify(source)).toBe(true);
        expect(URL.canParse(link)).toBe(true);
      }
      const comparable = (value: string) =>
        value
          .replaceAll("&amp;", "&")
          .replaceAll("&#38;", "&")
          .replaceAll('"', "")
          .replaceAll(/\s+/g, "");
      expect(
        comparable(untrack(output, (url) => url)),
        JSON.stringify(source),
      ).toBe(comparable(source));
    }
    expect(rewritten).toBeGreaterThan(50);
  });

  it("does not throw with every feature on and merge tags present", () => {
    for (let seed = 1; seed <= 4000; seed += 1) {
      const source = generate(seed, true);
      const result = prepare({
        html: source,
        text: source,
        previewText: source,
        variables: {
          first_name: `<i>"A"</i>`,
          link: "https://example.com/?q=1&r=2",
        },
        trackOpens: true,
        trackClicks: true,
        unsubscribe: true,
      });
      expect(typeof result.html).toBe("string");
      expect(typeof result.text).toBe("string");
      expect(result.html).toMatch(pixelPattern);
      expect(result.html).toContain(unsubscribeUrl);
      expect(result.text).toContain(unsubscribeUrl);
    }
  });

  it("does not throw on wrong input types", () => {
    const result = prepareEmail({
      html: 42,
      text: undefined,
      previewText: null,
      variables: null,
      messageToken: null,
      baseUrl: undefined,
      secret,
      trackOpens: true,
      trackClicks: true,
      unsubscribe: true,
      headers: null,
    } as unknown as PrepareEmailInput);
    expect(result.html).toBeNull();
    expect(result.text).toBeNull();
  });

  it("keeps a value with replacement patterns literal", () => {
    expect(
      html("<p>{{first_name}}</p>", { variables: { first_name: "$& $1 $$" } }),
    ).toBe("<p>$&amp; $1 $$</p>");
  });
});

describe("prepareEmail on large input", () => {
  const size = 400_000;
  const cases: [string, string][] = [
    ["open angle brackets", "<".repeat(size)],
    ["unclosed tags", "<a ".repeat(size / 3)],
    ["unclosed quoted attributes", `<a href="`.repeat(size / 9)],
    ["unclosed links", `<a href=https://example.com/x>`.repeat(size / 30)],
    [
      "links with long text",
      `<a href="https://example.com/x">${"word ".repeat(2000)}</a>`.repeat(40),
    ],
    ["unclosed comments", "<!--".repeat(size / 4)],
    ["unclosed style blocks", "<style></".repeat(size / 9)],
    [
      "ampersands in an href",
      `<a href="https://example.com/?${"&".repeat(size)}">x</a>`,
    ],
    [
      "entities in an href",
      `<a href="https://example.com/?${"&amp;a=1".repeat(size / 8)}">x</a>`,
    ],
    ["open merge braces", "{{".repeat(size / 2)],
    ["unfinished merge tags", "{{a|".repeat(size / 4)],
    ["merge tags with long spaces", `{{a${" ".repeat(2000)}`.repeat(200)],
    ["many merge tags", "<p>{{first_name|x}}</p>".repeat(size / 23)],
    [
      "many attributes",
      `<a ${"x=y ".repeat(size / 4)}href="https://example.com/">z</a>`,
    ],
    ["equals signs", `<a ${"=".repeat(size)}>`],
    ["slashes", `<a ${"/".repeat(size)}>`],
    ["closing tags", "</a>".repeat(size / 4)],
    [
      "a real looking document",
      `<html><body>${`<table><tr><td style="padding:0"><a href="https://example.com/p?id=1&amp;x=2" style="color:#000">Read more</a> <img src="https://example.com/i.png" alt=""></td></tr></table>`.repeat(4000)}</body></html>`,
    ],
  ];

  for (const [name, source] of cases) {
    it(`stays fast with ${name}`, () => {
      const started = performance.now();
      const result = prepare({
        html: source,
        text: source,
        variables: { first_name: "Ada", a: "b" },
        trackOpens: true,
        trackClicks: true,
        unsubscribe: true,
      });
      const elapsed = performance.now() - started;
      expect(typeof result.html).toBe("string");
      expect(result.html?.length ?? 0).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(1500);
    });
  }
});
