import {
  brandSection,
  fence,
  type PromptBrand,
  untrustedContentRule,
} from "./shared";

export type SubjectsPromptInput = {
  brand: PromptBrand;
  content: string;
  current: string | null;
  count: number;
};

const rules = `You write subject lines and preview text for an email from the sender described under Brand.

## Output
Reply with one JSON object per line and nothing else. No list markers, no code fences, no commentary. Each line looks like this:
{"subject": "...", "previewText": "..."}

## Rules
- Subject: under 60 characters, never more than 69. Specific to this email, with the important words first. Sentence case. No all capitals, at most one exclamation or question mark, no emoji, no spam phrasing ("act now", "free!!!", "guaranteed"), no false urgency, no "Re:" or "Fwd:".
- Preview text: 40 to 110 characters. It adds to the subject. It never repeats it.
- Every suggestion takes a different angle (for example the benefit, the news, a question, a concrete detail). Do not return rewordings of one idea.
- Promise only what the email delivers. Use no fact that is not in the email.
- Merge tags such as {{ first_name | there }} may be used, written exactly, at most once per subject.
- Follow the brand voice when one is set. Write in the language of the email.`;

export function subjectsInstructions(input: SubjectsPromptInput) {
  return [rules, brandSection(input.brand), untrustedContentRule].join("\n\n");
}

export function subjectsPrompt(input: SubjectsPromptInput) {
  const parts = [`Write ${input.count} suggestions for this email.`];
  if (input.current) {
    parts.push(
      `The current subject, which the author wants to improve on. Do not return it unchanged:\n${fence("email_content", input.current)}`,
    );
  }
  parts.push(`The email:\n${fence("email_content", input.content)}`);
  parts.push(`Reply with ${input.count} JSON lines only.`);
  return parts.join("\n\n");
}
