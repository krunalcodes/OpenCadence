import type { Option } from "@/components/product/option";
import { isRow, type Row, rowsOf, textOrNull } from "@/lib/api";

export type TemplateSummary = {
  id: string;
  name: string;
  subject: string;
  previewText: string;
  createdAt: string;
  updatedAt: string;
};

export type TemplateDocument = Record<string, unknown>;

export type Template = TemplateSummary & {
  document: TemplateDocument | null;
  html: string;
  text: string;
};

export type TemplatesPage = {
  templates: TemplateSummary[];
  nextCursor: string | null;
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

export const templatePageSize = 30;
export const maxSearchLength = 200;
export const maxNameLength = 120;
export const maxSubjectLength = 998;
export const maxPreviewTextLength = 300;
export const maxHtmlLength = 1_000_000;
export const maxTextLength = 500_000;

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function toTemplateSummary(value: unknown): TemplateSummary | null {
  if (!isRow(value)) {
    return null;
  }
  const row: Row = value;
  const id = textOrNull(row.id);
  const name = textOrNull(row.name);
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    subject: text(row.subject),
    previewText: text(row.previewText),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
  };
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

export function toTemplatesPage(value: unknown): TemplatesPage | null {
  if (!isRow(value) || !Array.isArray(value.items)) {
    return null;
  }
  return {
    templates: rowsOf(value.items).flatMap((item) => {
      const template = toTemplateSummary(item);
      return template ? [template] : [];
    }),
    nextCursor: textOrNull(value.nextCursor),
  };
}

export function toSearchFilter(value: string | null) {
  return (value ?? "").trim().slice(0, maxSearchLength);
}

export function templatesQuery(search: string, cursor?: string | null) {
  const params = new URLSearchParams();
  if (search) {
    params.set("search", search);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  params.set("limit", String(templatePageSize));
  return params.toString();
}

export function searchQuery(search: string) {
  return search ? new URLSearchParams({ search }).toString() : "";
}

export function templatePath(id: string) {
  return `templates/${encodeURIComponent(id)}`;
}

export function toSourceOptions(value: unknown): Option[] {
  if (!isRow(value)) {
    return [];
  }
  return rowsOf(value.sources).flatMap((item) => {
    const id = textOrNull(item.id);
    if (!id) {
      return [];
    }
    const name = textOrNull(item.name);
    const email = textOrNull(item.email);
    const label =
      name && email && name !== email
        ? `${name} (${email})`
        : (name ?? email ?? textOrNull(item.integrationType) ?? id);
    return [{ value: id, label }];
  });
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
