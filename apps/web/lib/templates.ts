import {
  type ApiResult,
  isRow,
  malformed,
  type Row,
  request,
  rowsOf,
  textOrNull,
} from "@/lib/api";

export type TemplateSummary = {
  id: string;
  name: string;
  subject: string;
  previewText: string;
  createdAt: string;
  updatedAt: string;
};

export type TemplatesPage = {
  templates: TemplateSummary[];
  nextCursor: string | null;
};

export type TemplateChoice = Pick<TemplateSummary, "id" | "name" | "subject">;

export const templatePageSize = 30;
export const maxSearchLength = 200;

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

export async function searchTemplates(
  search: string,
): Promise<ApiResult<TemplateChoice[]>> {
  const result = await request(
    "GET",
    `/templates?${templatesQuery(toSearchFilter(search))}`,
  );
  if (!result.ok) {
    return result;
  }
  const page = toTemplatesPage(result.data);
  return page
    ? {
        ok: true,
        data: page.templates.map(({ id, name, subject }) => ({
          id,
          name,
          subject,
        })),
      }
    : { ok: false, error: malformed };
}
