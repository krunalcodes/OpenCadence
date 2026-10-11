import {
  type Review,
  type Suggestion,
  toReview,
  toSuggestions,
} from "@/features/templates/lib/ai";
import {
  type Template,
  type TemplateContent,
  type TemplatesPage,
  templatePath,
  templatesQuery,
  toTemplate,
  toTemplatesPage,
} from "@/features/templates/lib/templates";
import { type ApiResult, isRow, malformed, request } from "@/lib/api";

function toTemplateResult(result: ApiResult<unknown>): ApiResult<Template> {
  if (!result.ok) {
    return result;
  }
  const template = toTemplate(result.data);
  return template
    ? { ok: true, data: template }
    : { ok: false, error: malformed };
}

export async function fetchTemplates(
  search: string,
  cursor: string,
): Promise<ApiResult<TemplatesPage>> {
  const result = await request(
    "GET",
    `/templates?${templatesQuery(search, cursor)}`,
  );
  if (!result.ok) {
    return result;
  }
  const page = toTemplatesPage(result.data);
  return page ? { ok: true, data: page } : { ok: false, error: malformed };
}

export async function createTemplate(name: string) {
  return toTemplateResult(await request("POST", "/templates", { name }));
}

export async function renameTemplate(id: string, name: string) {
  return toTemplateResult(
    await request("PATCH", `/${templatePath(id)}`, { name }),
  );
}

export async function saveTemplate(id: string, content: TemplateContent) {
  return toTemplateResult(
    await request("PATCH", `/${templatePath(id)}`, content),
  );
}

export async function duplicateTemplate(id: string) {
  return toTemplateResult(
    await request("POST", `/${templatePath(id)}/duplicate`),
  );
}

export async function deleteTemplate(id: string) {
  return request("DELETE", `/${templatePath(id)}`);
}

export async function sendTestEmail(input: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  sourceId: string | null;
}): Promise<ApiResult<{ suppressed: boolean }>> {
  const result = await request("POST", "/templates/test", {
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.from ? { from: input.from } : {}),
  });
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    data: {
      suppressed: isRow(result.data) && result.data.suppressed === true,
    },
  };
}

export async function suggestSubjects(input: {
  html: string;
  text: string;
  current: string;
  count: number;
}): Promise<ApiResult<Suggestion[]>> {
  const result = await request("POST", "/ai/subjects", {
    html: input.html,
    text: input.text,
    count: input.count,
    ...(input.current ? { current: input.current } : {}),
  });
  if (!result.ok) {
    return result;
  }
  const suggestions = toSuggestions(result.data);
  return suggestions
    ? { ok: true, data: suggestions }
    : { ok: false, error: malformed };
}

export async function reviewEmail(input: {
  subject: string;
  previewText: string;
  html: string;
}): Promise<ApiResult<Review>> {
  const result = await request("POST", "/ai/review", {
    subject: input.subject,
    html: input.html,
    ...(input.previewText ? { previewText: input.previewText } : {}),
  });
  if (!result.ok) {
    return result;
  }
  const review = toReview(result.data);
  return review ? { ok: true, data: review } : { ok: false, error: malformed };
}
