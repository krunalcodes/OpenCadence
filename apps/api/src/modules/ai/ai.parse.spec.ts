import { parseReviewIssues, parseSubjects, stripThinking } from "./ai.parse";
import { prime, skipThinking, startAt } from "./ai.stream";

async function* from(chunks: string[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function collect(source: AsyncIterable<string>) {
  let text = "";
  for await (const chunk of source) {
    text += chunk;
  }
  return text;
}

describe("parseSubjects", () => {
  it("reads JSON lines", () => {
    expect(
      parseSubjects(
        '{"subject": "A faster editor", "previewText": "See what changed"}\n{"subject": "Your editor got quicker", "previewText": "Three updates"}',
        5,
      ),
    ).toEqual([
      { subject: "A faster editor", previewText: "See what changed" },
      { subject: "Your editor got quicker", previewText: "Three updates" },
    ]);
  });

  it("tolerates fences, prose, numbering, arrays and wrappers", () => {
    const fenced =
      'Here you go:\n```json\n1. {"subject": "One", "previewText": "First"},\n- {"subject": "Two", "preview": "Second"}\n```\nHope that helps!';
    expect(parseSubjects(fenced, 5)).toEqual([
      { subject: "One", previewText: "First" },
      { subject: "Two", previewText: "Second" },
    ]);
    expect(
      parseSubjects(
        '[{"subject":"One"},{"subject":"Two","preview_text":"B"}]',
        5,
      ),
    ).toEqual([
      { subject: "One", previewText: "" },
      { subject: "Two", previewText: "B" },
    ]);
    expect(
      parseSubjects('{"suggestions":[{"subject":"One","previewText":"A"}]}', 5),
    ).toEqual([{ subject: "One", previewText: "A" }]);
  });

  it("keeps merge tags and braces inside strings", () => {
    expect(
      parseSubjects(
        '{"subject": "Hi {{ first_name | there }}, a note", "previewText": "With a } brace and a \\"quote\\""}',
        5,
      ),
    ).toEqual([
      {
        subject: "Hi {{ first_name | there }}, a note",
        previewText: 'With a } brace and a "quote"',
      },
    ]);
  });

  it("drops reasoning, blanks and duplicates, and respects the count", () => {
    const output =
      '<think>{"subject": "Not this one"}</think>\n{"subject": "One"}\n{"subject": "  "}\n{"subject": "one"}\n{"subject": 7}\n{"subject": "Two"}\n{"subject": "Three"}';
    expect(parseSubjects(output, 2).map((item) => item.subject)).toEqual([
      "One",
      "Two",
    ]);
  });

  it("keeps subjects under 70 characters", () => {
    const [long] = parseSubjects(
      `{"subject": "${"word ".repeat(30).trim()}"}`,
      1,
    );
    expect(long?.subject.length).toBeLessThan(70);
    expect(long?.subject.endsWith("word")).toBe(true);
  });

  it("returns nothing for output with no JSON", () => {
    expect(parseSubjects("I cannot help with that.", 5)).toEqual([]);
    expect(parseSubjects('{"subject": "broken', 5)).toEqual([]);
  });
});

describe("parseReviewIssues", () => {
  it("reads issues and normalises their fields", () => {
    expect(
      parseReviewIssues(
        '{"severity": "HIGH", "title": "Misleading claim", "detail": "The opening promises a result.", "suggestion": "State what is true."}\n{"severity": "urgent", "title": "Wordy", "detail": "The second paragraph repeats the first.", "suggestion": null}\n{"title": "No detail"}',
      ),
    ).toEqual([
      {
        source: "ai",
        severity: "high",
        title: "Misleading claim",
        detail: "The opening promises a result.",
        suggestion: "State what is true.",
      },
      {
        source: "ai",
        severity: "medium",
        title: "Wordy",
        detail: "The second paragraph repeats the first.",
        suggestion: null,
      },
    ]);
  });

  it("returns at most six issues and nothing for empty output", () => {
    const line = (index: number) =>
      `{"severity":"low","title":"Issue ${index}","detail":"Detail ${index}"}`;
    expect(
      parseReviewIssues(
        Array.from({ length: 9 }, (_, i) => line(i)).join("\n"),
      ),
    ).toHaveLength(6);
    expect(parseReviewIssues("")).toEqual([]);
  });
});

describe("stripThinking", () => {
  it("removes closed and unopened reasoning blocks", () => {
    expect(stripThinking("<think>plan</think>\nAnswer")).toBe("Answer");
    expect(stripThinking("plan without an opening tag</think>Answer")).toBe(
      "Answer",
    );
    expect(stripThinking("Answer")).toBe("Answer");
  });
});

describe("stream helpers", () => {
  it("starts a draft at the subject tag, across chunk boundaries", async () => {
    expect(
      await collect(
        startAt(
          from([
            "Sure! Here is ",
            "the email:\n<sub",
            "ject>Hi</subject>",
            "\n<body>x</body>",
          ]),
          "<subject>",
        ),
      ),
    ).toBe("<subject>Hi</subject>\n<body>x</body>");
  });

  it("passes the text through when the marker never appears", async () => {
    expect(await collect(startAt(from(["plain ", "text"]), "<subject>"))).toBe(
      "plain text",
    );
  });

  it("skips a leading reasoning block", async () => {
    expect(
      await collect(
        skipThinking(
          from([
            "<thi",
            "nk>let me ",
            "see</th",
            "ink>\n\nShorter text",
            " here",
          ]),
        ),
      ),
    ).toBe("Shorter text here");
    expect(await collect(skipThinking(from(["Short", "er text"])))).toBe(
      "Shorter text",
    );
    expect(await collect(skipThinking(from(["<", "3 this"])))).toBe("<3 this");
    expect(await collect(skipThinking(from(["<think>never ends"])))).toBe("");
  });

  it("primes a stream on its first text and reports an empty one", async () => {
    const primed = await prime(from(["", "a", "b"]));
    expect(primed?.first).toBe("a");
    expect(primed ? await collect(primed.rest) : null).toBe("b");
    expect(await prime(from(["", ""]))).toBeNull();
  });

  it("surfaces an error raised before the first text", async () => {
    async function* failing(): AsyncGenerator<string> {
      yield "";
      throw new Error("boom");
    }
    await expect(prime(failing())).rejects.toThrow("boom");
  });
});
