import {
  generateIdentifier,
  greetings,
  identifierFirstWords,
  identifierSecondWords,
  openerBodies,
  openerSubjects,
  replyBodies,
  replySubject,
  seededRandom,
  signOffs,
  TemplateWarmupContentGenerator,
  withIdentifier,
} from "./warmup.content";

const forbidden = /https?:|www\.|\{|\}|\[|\]|<|>|%s/i;
const longDash = String.fromCharCode(8212);

function sentences(text: string) {
  return text.split(/(?<=[.?!])\s+/).filter(Boolean).length;
}

describe("warm-up content library", () => {
  it("has enough subjects, bodies, replies and words", () => {
    expect(openerSubjects.length).toBeGreaterThanOrEqual(25);
    expect(openerBodies.length).toBe(openerSubjects.length);
    expect(replyBodies.length).toBeGreaterThanOrEqual(15);
    expect(identifierFirstWords.length).toBeGreaterThanOrEqual(60);
    expect(identifierSecondWords.length).toBeGreaterThanOrEqual(60);
  });

  it("has no repeated entries", () => {
    for (const list of [
      openerSubjects,
      openerBodies,
      replyBodies,
      greetings,
      signOffs,
      identifierFirstWords,
      identifierSecondWords,
    ]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it("keeps every body short, plain and free of links or placeholders", () => {
    for (const body of openerBodies) {
      expect(sentences(body)).toBeGreaterThanOrEqual(2);
      expect(sentences(body)).toBeLessThanOrEqual(4);
    }
    for (const text of [
      ...openerSubjects,
      ...openerBodies,
      ...replyBodies,
      ...greetings,
      ...signOffs,
    ]) {
      expect(text).not.toMatch(forbidden);
      expect(text.includes(longDash)).toBe(false);
      expect(text.trim()).toBe(text);
    }
  });

  it("uses single lower-case words for identifiers", () => {
    for (const word of [...identifierFirstWords, ...identifierSecondWords]) {
      expect(word).toMatch(/^[a-z]+$/);
    }
  });
});

describe("template warm-up content", () => {
  const generator = new TemplateWarmupContentGenerator();

  it("writes the same opener for the same seed", () => {
    expect(generator.opener({ seed: "message-1" })).toEqual(
      generator.opener({ seed: "message-1" }),
    );
  });

  it("builds an opener from a greeting, a body and a sign-off", () => {
    const opener = generator.opener({ seed: "message-2" });
    const [greeting, body, signOff] = opener.text.split("\n\n");
    expect(greetings).toContain(greeting);
    expect(openerBodies).toContain(body);
    expect(signOffs).toContain(signOff);
    expect(openerSubjects.indexOf(opener.subject)).toBe(
      openerBodies.indexOf(body ?? ""),
    );
  });

  it("rarely repeats itself", () => {
    const texts = new Set<string>();
    const subjects = new Set<string>();
    for (let index = 0; index < 400; index += 1) {
      const opener = generator.opener({ seed: `seed-${index}` });
      texts.add(opener.text);
      subjects.add(opener.subject);
    }
    expect(subjects.size).toBe(openerSubjects.length);
    expect(texts.size).toBeGreaterThan(250);
  });

  it("replies under the original subject without stacking prefixes", () => {
    const reply = generator.reply({ seed: "reply-1", subject: "Short update" });
    expect(reply.subject).toBe("Re: Short update");
    const [greeting, body, signOff] = reply.text.split("\n\n");
    expect(greetings).toContain(greeting);
    expect(replyBodies).toContain(body);
    expect(signOffs).toContain(signOff);
    expect(replySubject("Re: Short update")).toBe("Re: Short update");
    expect(replySubject("RE: Short update")).toBe("RE: Short update");
  });

  it("ends every body with the identifier on its own line", () => {
    const text = withIdentifier(
      generator.opener({ seed: "message-3" }).text,
      "amber-lantern",
    );
    expect(text.split("\n").at(-1)).toBe("amber-lantern");
    expect(text.split("\n").at(-2)).toBe("");
  });
});

describe("warm-up identifiers", () => {
  it("joins one word from each list", () => {
    expect(generateIdentifier(() => 0)).toBe(
      `${identifierFirstWords[0]}-${identifierSecondWords[0]}`,
    );
    for (let index = 0; index < 200; index += 1) {
      const [first, second, ...rest] = generateIdentifier(Math.random).split(
        "-",
      );
      expect(identifierFirstWords).toContain(first);
      expect(identifierSecondWords).toContain(second);
      expect(rest).toHaveLength(0);
    }
  });

  it("gives a repeatable sequence for a seed", () => {
    const first = seededRandom("abc");
    const second = seededRandom("abc");
    const other = seededRandom("abd");
    const values = [first(), first(), first()];
    expect([second(), second(), second()]).toEqual(values);
    expect([other(), other(), other()]).not.toEqual(values);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
