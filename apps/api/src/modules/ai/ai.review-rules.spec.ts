import { findImages, findLinks, htmlToText } from "./ai.html";
import { type ReviewInput, runReviewRules } from "./ai.review-rules";

const paragraph =
  "<p>We shipped a faster editor this month, and here is what changed for your team and how to try it today.</p>";
const footer =
  '<hr><p>You get this because you signed up. {{ brand.name }}, {{ brand.address }}. <a href="{{ unsubscribe_url }}">Unsubscribe</a></p>';

function review(overrides: Partial<ReviewInput> = {}) {
  return runReviewRules({
    subject: "A faster editor is here",
    previewText: null,
    html: `<h1>A faster editor</h1>${paragraph}${paragraph}${footer}`,
    brandHasPostalAddress: true,
    ...overrides,
  });
}

function titles(overrides: Partial<ReviewInput> = {}) {
  return review(overrides).map((issue) => issue.title);
}

describe("html helpers", () => {
  it("turns html into text and drops hidden content", () => {
    expect(
      htmlToText(
        "<style>p{color:red}</style><!-- note --><h1>Hi &amp; welcome</h1><p>One<br>two&nbsp;three</p><script>alert(1)</script>",
      ),
    ).toBe("Hi & welcome\nOne\ntwo three");
  });

  it("finds links with any quoting", () => {
    expect(
      findLinks(
        `<a href="https://a.example/x?a=1&amp;b=2">A <strong>one</strong></a><a class=x href='{{ unsubscribe_url }}'>Out</a><a href=https://c.example>C</a><a name="top">anchor</a>`,
      ),
    ).toEqual([
      { href: "https://a.example/x?a=1&b=2", text: "A one" },
      { href: "{{ unsubscribe_url }}", text: "Out" },
      { href: "https://c.example", text: "C" },
    ]);
  });

  it("tells a missing alt from an empty one", () => {
    expect(
      findImages(
        '<img src="a.png"><img src="b.png" alt=""><img alt="A chart" src="c.png"/><img src="d.png" alt>',
      ),
    ).toEqual([
      { src: "a.png", alt: null },
      { src: "b.png", alt: "" },
      { src: "c.png", alt: "A chart" },
      { src: "d.png", alt: "" },
    ]);
  });
});

describe("runReviewRules", () => {
  it("finds nothing wrong with a clean email", () => {
    expect(review()).toEqual([]);
  });

  it("marks every issue as coming from the rules", () => {
    const issues = review({ subject: "", html: "<p>Hi</p>" });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.source === "rules")).toBe(true);
  });

  it("flags a missing subject as high", () => {
    expect(review({ subject: "   " })).toContainEqual(
      expect.objectContaining({
        severity: "high",
        title: "The subject is missing",
      }),
    );
  });

  it("flags long and very long subjects", () => {
    expect(titles({ subject: "a".repeat(60) })).toEqual([]);
    expect(titles({ subject: "a".repeat(61) })).toEqual([
      "The subject may be cut off",
    ]);
    expect(titles({ subject: "a".repeat(91) })).toEqual([
      "The subject is very long",
    ]);
  });

  it("flags capitals and heavy punctuation in the subject", () => {
    expect(titles({ subject: "HUGE SALE TODAY ONLY" })).toEqual([
      "The subject is mostly capital letters",
    ]);
    expect(titles({ subject: "Sale ends today!!" })).toEqual([
      "The subject has heavy punctuation",
    ]);
    expect(titles({ subject: "Ready? Set? Go!" })).toEqual([
      "The subject has heavy punctuation",
    ]);
    expect(titles({ subject: "Ready for the API update?" })).toEqual([]);
    expect(titles({ subject: "Hi {{ FIRST | THERE }}, news" })).toEqual([]);
  });

  it("requires the unsubscribe merge tag inside a link address", () => {
    const missing = "There is no unsubscribe link";
    expect(titles({ html: `${paragraph}${paragraph}` })).toContain(missing);
    expect(
      titles({
        html: `${paragraph}${paragraph}<p>Unsubscribe: {{ unsubscribe_url }}</p>`,
      }),
    ).toContain(missing);
    expect(
      titles({
        html: `${paragraph}${paragraph}<a href="https://example.com/unsubscribe">Unsubscribe</a>`,
      }),
    ).toContain(missing);
    expect(
      titles({
        html: `${paragraph}${paragraph}<a href='{{unsubscribe_url}}'>Stop</a>`,
      }),
    ).not.toContain(missing);
  });

  it("flags a brand without a postal address", () => {
    expect(titles({ brandHasPostalAddress: false })).toEqual([
      "The brand has no postal address",
    ]);
  });

  it("counts images without alt text", () => {
    const html = `${paragraph}${paragraph}${paragraph}<img src="https://cdn.example.com/a.png"><img src="https://cdn.example.com/b.png" alt="">${footer}`;
    expect(titles({ html })).toEqual(["An image has no alt text"]);
    expect(
      titles({ html: `${html}<img src="https://cdn.example.com/c.png">` }),
    ).toContain("2 images have no alt text");
  });

  it("flags image-heavy and image-only emails", () => {
    expect(
      titles({
        html: `<img src="https://cdn.example.com/a.png" alt="Sale"><a href="{{ unsubscribe_url }}">Out</a>`,
      }),
    ).toEqual(["The email is only an image"]);
    expect(
      titles({
        html: `<p>A short line of text about the sale.</p><img src="https://cdn.example.com/a.png" alt="One"><img src="https://cdn.example.com/b.png" alt="Two">${footer}`,
      }),
    ).toEqual(["The email is image-heavy"]);
  });

  it("flags many and too many links", () => {
    const links = (count: number) =>
      Array.from(
        { length: count },
        (_, index) =>
          `<p><a href="https://example.com/${index}">Story number ${index} with a descriptive title</a></p>`,
      ).join("");
    expect(titles({ html: `${links(15)}${footer}` })).toEqual([]);
    expect(titles({ html: `${links(16)}${footer}` })).toEqual([
      "There are many links",
    ]);
    expect(titles({ html: `${links(26)}${footer}` })).toEqual([
      "There are too many links",
    ]);
  });

  it("flags link text that shows a different address", () => {
    const mismatch = "A link shows one address and opens another";
    const wrap = (anchor: string) =>
      `${paragraph}${paragraph}<p>${anchor}</p>${footer}`;
    expect(
      titles({
        html: wrap(
          '<a href="https://evil.example.net/login">www.mybank.com</a>',
        ),
      }),
    ).toEqual([mismatch]);
    expect(
      titles({
        html: wrap(
          '<a href="https://tracking.example.org/c/1">https://example.com/pricing</a>',
        ),
      }),
    ).toEqual([mismatch]);
    expect(
      titles({
        html: wrap('<a href="https://www.example.com/pricing">example.com</a>'),
      }),
    ).toEqual([]);
    expect(
      titles({
        html: wrap('<a href="https://app.example.com/x">example.com</a>'),
      }),
    ).toEqual([]);
    expect(
      titles({
        html: wrap('<a href="https://example.com/x">See the pricing page</a>'),
      }),
    ).toEqual([]);
  });

  it("flags link shorteners once per domain", () => {
    const issues = review({
      html: `${paragraph}${paragraph}<p><a href="https://bit.ly/abc">Read the guide</a> <a href="https://bit.ly/def">See the demo</a> <a href="https://www.tinyurl.com/x">Watch</a></p>${footer}`,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: "medium",
      title: "A link uses a URL shortener",
    });
    expect(issues[0]?.detail).toContain("bit.ly, tinyurl.com");
  });

  it("flags html over 102 KB", () => {
    const big = `${paragraph.repeat(1100)}${footer}`;
    expect(Buffer.byteLength(big)).toBeGreaterThan(102 * 1024);
    expect(titles({ html: big })).toEqual([
      "The email is large enough to be clipped",
    ]);
  });
});
