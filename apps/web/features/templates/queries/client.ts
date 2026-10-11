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
import {
  type ApiError,
  type ApiResult,
  isRow,
  malformed,
  type Row,
  request,
  toApiError,
} from "@/lib/api";

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

export type StreamResult =
  | { state: "done"; text: string }
  | { state: "aborted"; text: string }
  | { state: "failed"; text: string; error: ApiError };

export async function streamAi(
  path: "/ai/draft" | "/ai/rewrite",
  body: Row,
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<StreamResult> {
  let text = "";
  try {
    const response = await fetch(`/api/v1${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    });
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      return {
        state: "failed",
        text,
        error: toApiError(response.status, data),
      };
    }
    if (!response.body) {
      text = await response.text();
      onText(text);
      return { state: "done", text };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      text += decoder.decode(value, { stream: true });
      onText(text);
    }
    text += decoder.decode();
    onText(text);
    return { state: "done", text };
  } catch {
    if (signal.aborted) {
      return { state: "aborted", text };
    }
    return { state: "failed", text, error: toApiError(0, null) };
  }
}
