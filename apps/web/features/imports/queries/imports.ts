import "server-only";

import {
  type CatalogResult,
  type ImportsResult,
  toFieldOptions,
  toImports,
  toOptionList,
} from "@/features/imports/lib/imports";
import { apiRequest } from "@/lib/api-server";

export async function getImports(): Promise<ImportsResult> {
  const { status, data } = await apiRequest("/imports");
  const imports = status === 200 ? toImports(data) : null;
  return imports ? { state: "ready", imports } : { state: "failed" };
}

export async function getImportCatalog(): Promise<CatalogResult> {
  const [lists, tags, fields] = await Promise.all([
    apiRequest("/lists"),
    apiRequest("/tags"),
    apiRequest("/contact-fields"),
  ]);
  const listOptions =
    lists.status === 200 ? toOptionList(lists.data, "lists") : null;
  const tagOptions =
    tags.status === 200 ? toOptionList(tags.data, "tags") : null;
  const fieldOptions =
    fields.status === 200 ? toFieldOptions(fields.data) : null;
  return listOptions && tagOptions && fieldOptions
    ? {
        state: "ready",
        lists: listOptions,
        tags: tagOptions,
        fields: fieldOptions,
      }
    : { state: "failed" };
}
