import "server-only";

import {
  type MergeField,
  type Template,
  type TemplatesResult,
  templatePath,
  templatesQuery,
  toMergeFields,
  toTemplate,
  toTemplatesPage,
} from "@/features/templates/lib/templates";
import { apiRequest } from "@/lib/api-server";
import { type SourceChoice, toSourceChoices } from "@/lib/sources";

export async function getTemplates(search: string): Promise<TemplatesResult> {
  const { status, data } = await apiRequest(
    `/templates?${templatesQuery(search)}`,
  );
  const page = status === 200 ? toTemplatesPage(data) : null;
  return page ? { state: "ready", ...page } : { state: "failed" };
}

export type TemplateResult =
  | { state: "ready"; template: Template }
  | { state: "missing" }
  | { state: "failed" };

export async function getTemplate(id: string): Promise<TemplateResult> {
  const { status, data } = await apiRequest(`/${templatePath(id)}`);
  if (status === 404 || status === 400) {
    return { state: "missing" };
  }
  const template = status === 200 ? toTemplate(data) : null;
  return template ? { state: "ready", template } : { state: "failed" };
}

export async function getSources(): Promise<SourceChoice[]> {
  const { status, data } = await apiRequest("/sending-sources");
  return status === 200 ? toSourceChoices(data) : [];
}

export async function getMergeFields(): Promise<MergeField[]> {
  const { status, data } = await apiRequest("/contact-fields");
  return status === 200 ? toMergeFields(data) : [];
}
