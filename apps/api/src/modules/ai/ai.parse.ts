import type { ReviewIssue } from "./ai.review-rules";

export type SubjectSuggestion = { subject: string; previewText: string };

const MAX_SUBJECT = 69;
const MAX_PREVIEW = 150;
const MAX_AI_ISSUES = 6;

export function stripThinking(text: string) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*<\/think>/i, "")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function topLevelObjects(text: string) {
  const found: Record<string, unknown>[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"' && depth > 0) {
      inString = true;
    } else if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(text.slice(start, index + 1));
          if (isRecord(parsed)) {
            found.push(parsed);
          }
        } catch {
          start = -1;
        }
      }
    }
  }
  return found;
}

export function parseJsonObjects(text: string, requiredKey: string) {
  const results: Record<string, unknown>[] = [];
  for (const object of topLevelObjects(stripThinking(text))) {
    if (requiredKey in object) {
      results.push(object);
      continue;
    }
    for (const value of Object.values(object)) {
      if (Array.isArray(value)) {
        results.push(
          ...value.filter(
            (item): item is Record<string, unknown> =>
              isRecord(item) && requiredKey in item,
          ),
        );
      }
    }
  }
  return results;
}

function oneLine(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function clip(value: string, max: number) {
  const chars = [...value];
  if (chars.length <= max) {
    return value;
  }
  const cut = chars.slice(0, max).join("");
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(
    /[\s,;:.-]+$/,
    "",
  );
}

export function parseSubjects(text: string, count: number) {
  const seen = new Set<string>();
  const suggestions: SubjectSuggestion[] = [];
  for (const object of parseJsonObjects(text, "subject")) {
    const subject = clip(oneLine(object.subject), MAX_SUBJECT);
    const key = subject.toLowerCase();
    if (subject === "" || seen.has(key)) {
      continue;
    }
    seen.add(key);
    suggestions.push({
      subject,
      previewText: clip(
        oneLine(object.previewText ?? object.preview_text ?? object.preview),
        MAX_PREVIEW,
      ),
    });
    if (suggestions.length === count) {
      break;
    }
  }
  return suggestions;
}

function severity(value: unknown): ReviewIssue["severity"] {
  const normalized = oneLine(value).toLowerCase();
  return normalized === "high" || normalized === "low" ? normalized : "medium";
}

export function parseReviewIssues(text: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  for (const object of parseJsonObjects(text, "title")) {
    const title = clip(oneLine(object.title), 120);
    const detail = clip(oneLine(object.detail), 600);
    if (title === "" || detail === "") {
      continue;
    }
    const suggestion = clip(oneLine(object.suggestion), 400);
    issues.push({
      source: "ai",
      severity: severity(object.severity),
      title,
      detail,
      suggestion: suggestion === "" ? null : suggestion,
    });
    if (issues.length === MAX_AI_ISSUES) {
      break;
    }
  }
  return issues;
}
