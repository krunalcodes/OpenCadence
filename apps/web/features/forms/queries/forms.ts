import "server-only";

import {
  type FieldChoice,
  type FormResult,
  type FormsResult,
  formPath,
  toCustomChoices,
  toForm,
  toForms,
} from "@/features/forms/lib/forms";
import { apiRequest } from "@/lib/api-server";
import { type AudienceList, toAudienceLists } from "@/lib/audience";
import { type SourceChoice, toSourceChoices } from "@/lib/sources";

export async function getForms(): Promise<FormsResult> {
  const { status, data } = await apiRequest("/forms");
  const forms = status === 200 ? toForms(data) : null;
  return forms ? { state: "ready", forms } : { state: "failed" };
}

export async function getForm(id: string): Promise<FormResult> {
  const { status, data } = await apiRequest(`/${formPath(id)}`);
  if (status === 404 || status === 400) {
    return { state: "missing" };
  }
  const form = status === 200 ? toForm(data) : null;
  return form ? { state: "ready", form } : { state: "failed" };
}

export async function getLists(): Promise<AudienceList[]> {
  const { status, data } = await apiRequest("/lists");
  return status === 200 ? toAudienceLists(data) : [];
}

export async function getSources(): Promise<SourceChoice[]> {
  const { status, data } = await apiRequest("/sending-sources");
  return status === 200 ? toSourceChoices(data) : [];
}

export async function getCustomFields(): Promise<FieldChoice[]> {
  const { status, data } = await apiRequest("/contact-fields");
  return status === 200 ? toCustomChoices(data) : [];
}
