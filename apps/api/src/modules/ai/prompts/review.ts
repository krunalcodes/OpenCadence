import {
  brandSection,
  fence,
  type PromptBrand,
  untrustedContentRule,
} from "./shared";

export type ReviewPromptInput = {
  brand: PromptBrand;
  subject: string;
  previewText: string | null;
  content: string;
};

const rules = `You review the wording of an email before it is sent, for the sender described under Brand. A separate automatic check already covers the technical points (unsubscribe link, postal address, alt text, link count, link shorteners, size, subject length and capitals). Do not report those.

## What to look for
- Wording that spam filters and readers distrust: hype, false urgency, pressure, misleading claims, promises that sound too good, excessive capitals or punctuation in the body.
- A subject or preview text that does not match what the email delivers.
- An unclear or missing call to action, or several competing ones.
- Unclear, wordy, repetitive or confusing sentences. Jargon the reader may not know.
- Spelling and grammar mistakes.
- A tone that does not fit the brand voice.
- Leftover placeholders such as [date], lorem ipsum, or a malformed merge tag.

## Output
Reply with one JSON object per line and nothing else. No code fences, no commentary. Each line looks like this:
{"severity": "high", "title": "...", "detail": "...", "suggestion": "..."}

- severity is "high" (likely to hurt delivery or mislead the reader), "medium" (weakens the email) or "low" (polish).
- title: under 60 characters, names the problem.
- detail: one or two sentences that say where it is and why it matters. Quote at most a few words of the email.
- suggestion: one concrete fix, or null.
- At most 6 issues, most important first. Report only real problems. If the wording is fine, reply with nothing at all.
- Write in the language of the email.`;

export function reviewInstructions(input: ReviewPromptInput) {
  return [rules, brandSection(input.brand), untrustedContentRule].join("\n\n");
}

export function reviewPrompt(input: ReviewPromptInput) {
  return [
    `Subject:\n${fence("email_content", input.subject)}`,
    `Preview text:\n${fence("email_content", input.previewText ?? "")}`,
    `Body:\n${fence("email_content", input.content)}`,
    "Reply with JSON lines only.",
  ].join("\n\n");
}
