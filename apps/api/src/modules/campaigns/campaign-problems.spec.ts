import {
  hasUnsubscribeTag,
  knownMergeKeys,
  mergeTagProblems,
  unknownMergeTags,
} from "./campaign-problems";

describe("unknownMergeTags", () => {
  const known = knownMergeKeys(["plan", "seats"]);

  it("accepts contact, custom field, brand and unsubscribe tags", () => {
    expect(
      unknownMergeTags(
        [
          "Hi {{first_name|there}} at {{ company }}",
          "{{fields.plan}} {{fields.seats}} {{brand.name}} {{brand.address}} {{brand.website}}",
          '<a href="{{unsubscribe_url}}">Stop</a> {{email}}',
        ],
        known,
      ),
    ).toEqual([]);
  });

  it("lists each unknown tag once, sorted", () => {
    expect(
      unknownMergeTags(
        ["{{nickname}} {{fields.tier}}", "{{nickname|you}} {{brand.slogan}}"],
        known,
      ),
    ).toEqual(["brand.slogan", "fields.tier", "nickname"]);
  });

  it("does not treat a custom field key as a top level tag", () => {
    expect(unknownMergeTags(["{{plan}}"], known)).toEqual(["plan"]);
  });
});

describe("mergeTagProblems", () => {
  const base = {
    subject: "Hello {{first_name}}",
    previewText: "",
    html: "<p>{{fields.plan}}</p>",
    text: "",
    fieldKeys: ["plan"],
  };

  it("finds nothing in a clean campaign", () => {
    expect(mergeTagProblems(base)).toEqual([]);
  });

  it("reports the subject and the body separately", () => {
    const problems = mergeTagProblems({
      ...base,
      previewText: "For {{nickname}}",
      text: "Your {{fields.tier}} plan",
    });
    expect(problems.map((problem) => [problem.field, problem.code])).toEqual([
      ["subject", "unknown_merge_tag"],
      ["template", "unknown_merge_tag"],
    ]);
    expect(problems.every((problem) => problem.severity === "error")).toBe(
      true,
    );
    expect(problems[0]?.message).toContain("{{nickname}}");
    expect(problems[1]?.message).toContain("{{fields.tier}}");
  });

  it("names five tags and counts the rest", () => {
    const [problem] = mergeTagProblems({
      ...base,
      html: "{{a}}{{b}}{{c}}{{d}}{{e}}{{f}}{{g}}",
    });
    expect(problem?.message).toContain(
      "{{a}}, {{b}}, {{c}}, {{d}}, {{e}} and 2 more",
    );
  });
});

describe("hasUnsubscribeTag", () => {
  it("looks for the unsubscribe merge tag", () => {
    expect(hasUnsubscribeTag('<a href="{{ unsubscribe_url }}">x</a>')).toBe(
      true,
    );
    expect(hasUnsubscribeTag('<a href="https://example.com">x</a>')).toBe(
      false,
    );
  });
});
