import { splitTrailer } from "@/lib/ai-stream";
import { isRow, rowsOf, textOrNull } from "@/lib/api";

export const draftKinds = [
  "newsletter",
  "outreach",
  "announcement",
  "transactional",
] as const;

export type DraftKind = (typeof draftKinds)[number];

export const draftTones = [
  "friendly",
  "professional",
  "direct",
  "playful",
  "formal",
] as const;

export type DraftTone = (typeof draftTones)[number];

export const rewriteActions = [
  "shorten",
  "expand",
  "friendlier",
  "more_formal",
  "fix_grammar",
] as const;

export type RewriteAction = (typeof rewriteActions)[number] | "custom";

export const maxPromptLength = 4000;
export const maxAiHtmlLength = 200_000;
export const maxRewriteLength = 8000;
export const maxInstructionLength = 500;
export const maxContextLength = 8000;
export const maxAiMergeTags = 50;

export type DraftStep = "starting" | "subject" | "preview" | "body";

export type Draft = {
  subject: string;
  preview: string;
  body: string;
  step: DraftStep;
  complete: boolean;
};

export type Suggestion = { subject: string; previewText: string };

export type Severity = "high" | "medium" | "low";

export const severities: Severity[] = ["high", "medium", "low"];

export type ReviewIssue = {
  source: "rules" | "ai";
  severity: Severity;
  title: string;
  detail: string;
  suggestion: string | null;
};

export type Review = { issues: ReviewIssue[]; aiReviewed: boolean };

function withoutPartialTag(value: string) {
  const open = value.lastIndexOf("<");
  return open !== -1 && !value.slice(open).includes(">")
    ? value.slice(0, open)
    : value;
}

function block(raw: string, tag: string) {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = raw.indexOf(open);
  if (start === -1) {
    return { started: false, closed: false, value: "" };
  }
  const from = start + open.length;
  const end =
    tag === "body" ? raw.lastIndexOf(close) : raw.indexOf(close, from);
  if (end === -1 || end < from) {
    return {
      started: true,
      closed: false,
      value: withoutPartialTag(raw.slice(from)),
    };
  }
  return { started: true, closed: true, value: raw.slice(from, end) };
}

function line(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function parseDraft(raw: string): Draft {
  const text = splitTrailer(raw).text;
  const subject = block(text, "subject");
  const preview = block(text, "preview");
  const body = block(text, "body");
  const step: DraftStep = body.started
    ? "body"
    : preview.started
      ? "preview"
      : subject.started
        ? "subject"
        : "starting";
  return {
    subject: line(subject.value),
    preview: line(preview.value),
    body: body.value.trim(),
    step,
    complete: body.closed,
  };
}

export function wordCount(value: string) {
  const words = value.trim().split(/\s+/);
  return words[0] === "" ? 0 : words.length;
}

export function toSuggestions(value: unknown): Suggestion[] | null {
  if (!isRow(value) || !Array.isArray(value.suggestions)) {
    return null;
  }
  return rowsOf(value.suggestions).flatMap((item) => {
    const subject = textOrNull(item.subject);
    return subject
      ? [{ subject, previewText: textOrNull(item.previewText) ?? "" }]
      : [];
  });
}

function toSeverity(value: unknown): Severity {
  return value === "high" || value === "medium" ? value : "low";
}

export function toReview(value: unknown): Review | null {
  if (!isRow(value) || !Array.isArray(value.issues)) {
    return null;
  }
  return {
    issues: rowsOf(value.issues).flatMap((item) => {
      const title = textOrNull(item.title);
      if (!title) {
        return [];
      }
      return [
        {
          source: item.source === "ai" ? ("ai" as const) : ("rules" as const),
          severity: toSeverity(item.severity),
          title,
          detail: textOrNull(item.detail) ?? "",
          suggestion: textOrNull(item.suggestion),
        },
      ];
    }),
    aiReviewed: value.aiReviewed === true,
  };
}
