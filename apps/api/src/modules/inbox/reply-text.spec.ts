import {
  baseSubject,
  isRfcMessageId,
  isSyntheticMessageId,
  maxStoredTextLength,
  replySubject,
  safeContent,
  snippetOf,
  syntheticMessageId,
  trimQuotedHistory,
} from "./reply-text";

describe("trimQuotedHistory", () => {
  it("cuts at the line that introduces the quoted message", () => {
    expect(
      trimQuotedHistory(
        "Thursday works for me.\n\nGrace\n\nOn Mon, 12 Oct 2026 at 09:14, Ada Lovelace <ada@example.com> wrote:\n> Are you free on Thursday?\n> Ada",
      ),
    ).toBe("Thursday works for me.\n\nGrace");
  });

  it("recognises the introduction when the mail client wrapped it onto two lines", () => {
    expect(
      trimQuotedHistory(
        "Yes please.\n\nOn Mon, 12 Oct 2026 at 09:14, Ada Lovelace\n<ada@example.com> wrote:\n\n> Shall I send the contract?",
      ),
    ).toBe("Yes please.");
  });

  it("recognises other languages and the original message divider", () => {
    expect(
      trimQuotedHistory(
        "Merci.\n\nLe lun. 12 oct. 2026 à 09:14, Ada <ada@example.com> a écrit :\n> Bonjour",
      ),
    ).toBe("Merci.");
    expect(
      trimQuotedHistory(
        "Danke.\n\nAm 12.10.2026 um 09:14 schrieb Ada <ada@example.com>:\n> Hallo",
      ),
    ).toBe("Danke.");
    expect(
      trimQuotedHistory(
        "Fine by me.\n\n-----Original Message-----\nFrom: Ada\nSubject: Hello",
      ),
    ).toBe("Fine by me.");
  });

  it("cuts at a header block and at a long divider, as desktop clients write them", () => {
    expect(
      trimQuotedHistory(
        "Let's do it.\n\nFrom: Ada Lovelace <ada@example.com>\nSent: Monday, October 12, 2026 9:14 AM\nTo: Grace\nSubject: Hello\n\nAre you free?",
      ),
    ).toBe("Let's do it.");
    expect(
      trimQuotedHistory(
        "Agreed.\n________________________________\nFrom: Ada\nSent: Monday",
      ),
    ).toBe("Agreed.");
  });

  it("keeps a sentence that only looks like a header or an introduction", () => {
    const text =
      "From: what I can tell, this works.\nOn Thursday we wrote: nothing.\nOne more line.";
    expect(trimQuotedHistory(text)).toBe(text);
  });

  it("drops quoted lines between the person's own lines", () => {
    expect(
      trimQuotedHistory(
        "> Are you free on Thursday?\nYes.\n> And Friday?\nNo.\n\n\n\nGrace",
      ),
    ).toBe("Yes.\nNo.\n\nGrace");
  });

  it("returns the whole text when trimming would leave nothing", () => {
    expect(trimQuotedHistory("> only a quote\n> and another")).toBe(
      "> only a quote\n> and another",
    );
    expect(trimQuotedHistory("  \r\n ")).toBe("");
  });
});

describe("snippetOf", () => {
  it("is the first words of the reply on one line", () => {
    expect(
      snippetOf(
        "Thursday works.\r\n\r\n  See you   then.\n\nOn Mon, Ada wrote:\n> x",
      ),
    ).toBe("Thursday works. See you then.");
  });

  it("is capped without cutting a character in half", () => {
    const snippet = snippetOf(`${"a".repeat(199)}\u{1F600}b`);
    expect(Array.from(snippet)).toHaveLength(200);
    expect(snippet.endsWith("\u{1F600}")).toBe(true);
  });
});

describe("subjects", () => {
  it("adds one reply prefix whatever was there before", () => {
    expect(replySubject("Quick question")).toBe("Re: Quick question");
    expect(replySubject("Re: Quick question")).toBe("Re: Quick question");
    expect(replySubject("RE: re: AW:  Quick\n question")).toBe(
      "Re: Quick question",
    );
    expect(replySubject("Re[2]: Quick question")).toBe("Re: Quick question");
    expect(replySubject("")).toBe("Re:");
    expect(baseSubject("Regarding lunch")).toBe("Regarding lunch");
    expect(replySubject("x".repeat(900))).toHaveLength(500);
  });
});

describe("safeContent", () => {
  it("sanitises the HTML and keeps the text that came with it", () => {
    expect(
      safeContent({
        text: "Plain version\r\n",
        html: '<p onclick="x()">Rich <script>alert(1)</script>version</p>',
      }),
    ).toEqual({ text: "Plain version", html: "<p>Rich version</p>" });
  });

  it("derives the text from the HTML when there is no text part", () => {
    expect(
      safeContent({
        text: "  ",
        html: "<div>Hello<br>there</div><img src='https://t.example/p.gif'>",
      }),
    ).toEqual({ text: "Hello\nthere", html: "<div>Hello<br>there</div>" });
  });

  it("returns nothing for empty input and for HTML with nothing left in it", () => {
    expect(safeContent({})).toEqual({ text: null, html: null });
    expect(
      safeContent({ html: "<script>alert(1)</script><style>a{}</style> " }),
    ).toEqual({ text: null, html: null });
  });

  it("caps the stored text", () => {
    const { text } = safeContent({
      text: "x".repeat(maxStoredTextLength + 10),
    });
    expect(text).toHaveLength(maxStoredTextLength);
  });
});

describe("message ids", () => {
  it("accepts one bracketed id and nothing that could break out of a header", () => {
    expect(isRfcMessageId("<abc.123@customer.test>")).toBe(true);
    for (const value of [
      undefined,
      null,
      "",
      "abc@customer.test",
      "<a@b> <c@d>",
      "<a@b>\r\nBcc: eve@evil.test",
      "<a\r\nBcc: eve@evil.test@b>",
      "<a b@c>",
      '<a"b@c>',
      "<<a@b>>",
      `<${"a".repeat(301)}@b>`,
    ]) {
      expect(isRfcMessageId(value)).toBe(false);
    }
  });

  it("tells the ids it made up from real ones", () => {
    const made = syntheticMessageId("abc123", "source-1");
    expect(isRfcMessageId(made)).toBe(true);
    expect(isSyntheticMessageId(made)).toBe(true);
    expect(isSyntheticMessageId("<abc@customer.test>")).toBe(false);
    expect(isSyntheticMessageId(null)).toBe(false);
  });
});
