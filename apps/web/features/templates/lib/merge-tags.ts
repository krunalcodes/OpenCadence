import type { Option } from "@/components/product/option";
import { copy } from "@/features/templates/lib/copy";
import type { MergeField } from "@/features/templates/lib/templates";

export const contactMergeKeys = [
  "first_name",
  "last_name",
  "email",
  "company",
  "job_title",
  "phone",
  "city",
  "country",
] as const;

export const brandMergeKeys = [
  "brand.name",
  "brand.address",
  "brand.website",
] as const;

export const unsubscribeKey = "unsubscribe_url";

export const preferencesKey = "preferences_url";

const keyPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/;

const tagPattern =
  /\{\{\s*([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?)\s*(?:\|([^{}]*))?\}\}/g;

export const maxFallbackLength = 120;

export function mergeTagOptions(fields: MergeField[]): Option[] {
  const text = copy.mergeTags;
  const label = (key: string) => text.labels[key] ?? key;
  return [
    ...contactMergeKeys.map((key) => ({
      value: key,
      label: text.option(text.groups.contact, label(key)),
    })),
    ...fields
      .map((field) => ({ key: `fields.${field.key}`, label: field.label }))
      .filter((field) => keyPattern.test(field.key))
      .map((field) => ({
        value: field.key,
        label: text.option(text.groups.field, field.label),
      })),
    ...brandMergeKeys.map((key) => ({
      value: key,
      label: text.option(text.groups.brand, label(key)),
    })),
    {
      value: unsubscribeKey,
      label: text.option(text.groups.system, label(unsubscribeKey)),
    },
    {
      value: preferencesKey,
      label: text.option(text.groups.system, label(preferencesKey)),
    },
  ];
}

export function mergeTagKeys(fields: MergeField[]) {
  return mergeTagOptions(fields).map((option) => option.value);
}

export function formatMergeTag(key: string, fallback: string) {
  const clean = fallback.replace(/[{}|]/g, "").trim();
  return clean === "" ? `{{${key}}}` : `{{${key} | ${clean}}}`;
}

export type SampleBrand = {
  name: string;
  address: string;
  website: string;
};

const sampleContact: Record<string, string> = {
  email: "alex.morgan@example.com",
  first_name: "Alex",
  last_name: "Morgan",
  company: "Example Co",
  job_title: "Marketing lead",
  phone: "+1 555 0100",
  city: "Lisbon",
  country: "Portugal",
};

export function sampleValues(
  brand: SampleBrand,
  fields: MergeField[],
): Record<string, string> {
  const values: Record<string, string> = {
    ...sampleContact,
    "brand.name": brand.name,
    "brand.address": brand.address,
    "brand.website": brand.website,
    [unsubscribeKey]: "#",
    [preferencesKey]: "#",
  };
  for (const field of fields) {
    values[`fields.${field.key}`] = "";
  }
  return values;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderSample(
  input: string,
  values: Record<string, string>,
  mode: "html" | "text",
) {
  return input.replace(tagPattern, (_match, key: string, fallback?: string) => {
    const value = values[key];
    const shown =
      value !== undefined && value !== "" ? value : (fallback ?? "").trim();
    if (mode === "text") {
      return shown;
    }
    return value !== undefined && value !== "" ? escapeHtml(shown) : shown;
  });
}
