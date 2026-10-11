import {
  brandSection,
  fence,
  type PromptBrand,
  untrustedContentRule,
} from "./shared";

export type RewriteAction =
  | "shorten"
  | "expand"
  | "friendlier"
  | "more_formal"
  | "fix_grammar"
  | "custom";

export type RewritePromptInput = {
  brand: PromptBrand;
  text: string;
  action: RewriteAction;
  instruction: string | null;
  context: string | null;
};

const actions: Record<Exclude<RewriteAction, "custom">, string> = {
  shorten:
    "Make it shorter, by about a third to a half. Keep the meaning, every fact and the call to action. Cut filler first.",
  expand:
    "Make it somewhat longer, up to about twice the length, by adding useful detail that the surrounding text supports. Add no new facts, numbers or promises.",
  friendlier:
    "Make it warmer and more conversational, as one person writing to another. Keep the meaning and roughly the same length. No exclamation marks unless one is already there.",
  more_formal:
    "Make it more formal and professional. Keep the meaning and roughly the same length. No contractions, no slang.",
  fix_grammar:
    "Correct spelling, grammar and punctuation only. Change nothing else: keep the wording, tone and length.",
};

const rules = `You edit one selected passage of an email for the sender described under Brand.

## Output
Reply with the replacement text only. It is pasted straight over the selection.
- Plain text. No HTML, no markdown, no quotation marks around it, no label, no explanation, no alternatives.
- Keep the paragraph breaks of the original unless the task changes them.
- Keep every merge tag (text in double braces such as {{ first_name | there }}) exactly as written, character for character. Never remove one, rename one or replace it with a value.
- Keep every URL exactly as written.
- Keep the language of the selection.
- Add no facts, numbers, names, dates or promises that are not in the selection or the surrounding text.
- Follow the brand voice when one is set, unless the task asks for a different tone.
- If the selection is already right for the task, return it unchanged.`;

export function rewriteInstructions(input: RewritePromptInput) {
  return [rules, brandSection(input.brand), untrustedContentRule].join("\n\n");
}

export function rewritePrompt(input: RewritePromptInput) {
  const task =
    input.action === "custom"
      ? `Apply this change requested by the author, to the wording only: ${input.instruction ?? ""}`
      : actions[input.action];
  const parts = [`Task: ${task}`];
  if (input.context) {
    parts.push(
      `The rest of the email, for context only. Do not rewrite it and do not repeat it:\n${fence("surrounding_text", input.context)}`,
    );
  }
  parts.push(
    `The selection to rewrite:\n${fence("email_content", input.text)}`,
  );
  parts.push("Reply with the replacement text only.");
  return parts.join("\n\n");
}
