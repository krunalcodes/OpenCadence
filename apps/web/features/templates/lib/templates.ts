import { isRow, rowsOf, textOrNull } from "@/lib/api";
import {
  type TemplateSummary,
  type TemplatesPage,
  toTemplateSummary,
} from "@/lib/templates";

export {
  maxSearchLength,
  type TemplateSummary,
  type TemplatesPage,
  templatePageSize,
  templatesQuery,
  toSearchFilter,
  toTemplateSummary,
  toTemplatesPage,
} from "@/lib/templates";

export type TemplateDocument = Record<string, unknown>;

export type Template = TemplateSummary & {
  document: TemplateDocument | null;
  html: string;
  text: string;
};

export type TemplatesResult =
  | ({ state: "ready" } & TemplatesPage)
  | { state: "failed" };

export type TemplateContent = {
  name: string;
  subject: string;
  previewText: string;
  document: TemplateDocument;
  html: string;
  text: string;
};

export type MergeField = { key: string; label: string };

export const maxNameLength = 120;
export const maxSubjectLength = 998;
export const maxPreviewTextLength = 300;
export const maxHtmlLength = 1_000_000;
export const maxTextLength = 500_000;

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function toTemplate(value: unknown): Template | null {
  const summary = toTemplateSummary(value);
  if (!summary || !isRow(value)) {
    return null;
  }
  return {
    ...summary,
    document: isRow(value.document) ? value.document : null,
    html: text(value.html),
    text: text(value.text),
  };
}

export function searchQuery(search: string) {
  return search ? new URLSearchParams({ search }).toString() : "";
}

export function templatePath(id: string) {
  return `templates/${encodeURIComponent(id)}`;
}

export function toMergeFields(value: unknown): MergeField[] {
  if (!isRow(value)) {
    return [];
  }
  return rowsOf(value.fields).flatMap((item) => {
    const key = textOrNull(item.key);
    return key ? [{ key, label: textOrNull(item.label) ?? key }] : [];
  });
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string) {
  return value.length <= 320 && emailPattern.test(value);
}
