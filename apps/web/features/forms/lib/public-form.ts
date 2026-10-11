import type { CSSProperties, HTMLInputAutoCompleteAttribute } from "react";
import {
  emailFieldKey,
  type FormBrand,
  type FormField,
  type FormSettings,
  toFormFields,
  toFormSettings,
} from "@/features/forms/lib/forms";
import { isRow, textOrNull } from "@/lib/api";
import { brandDefaults, fontStack, isBrandFontFamily } from "@/lib/brand";

export type FormGuard = {
  honeypot: string | null;
  hidden: Record<string, string>;
};

export type PublicForm = {
  name: string;
  brand: FormBrand;
  fields: FormField[];
  settings: FormSettings;
  guard: FormGuard;
};

export type DoneStatus = "pending" | "subscribed";

export const doneStatuses: DoneStatus[] = ["pending", "subscribed"];

export type PublicFailure = "invalid" | "busy" | "offline";

export const publicFailures: PublicFailure[] = ["invalid", "busy", "offline"];

export type FormProblem = { reason: PublicFailure; field: string | null };

export type FormViewMode = "page" | "embed" | "preview";

export const publicIdPattern = /^[a-z0-9]{12,32}$/;
export const fieldKeyPattern = /^[a-z0-9_.-]{1,80}$/i;
export const maxValueLength = 500;
export const maxEmailLength = 320;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string) {
  return value.length <= maxEmailLength && emailPattern.test(value);
}

const hexColor = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/;
const safeFontList = /^[\w\s,'"-]{1,200}$/;

function colorOr(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!hexColor.test(text)) {
    return fallback;
  }
  return text.length === 4
    ? `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`
    : text;
}

export function toFormBrand(value: unknown): FormBrand {
  const row = isRow(value) ? value : {};
  return {
    name: typeof row.name === "string" ? row.name : "",
    logoUrl: textOrNull(row.logoUrl),
    primaryColor: colorOr(row.primaryColor, brandDefaults.primaryColor),
    backgroundColor: colorOr(
      row.backgroundColor,
      brandDefaults.backgroundColor,
    ),
    contentColor: colorOr(row.contentColor, brandDefaults.contentColor),
    textColor: colorOr(row.textColor, brandDefaults.textColor),
    fontFamily:
      textOrNull(row.fontStack) ??
      textOrNull(row.fontFamily) ??
      brandDefaults.fontFamily,
  };
}

function channel(hex: string, start: number) {
  const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  return (
    0.2126 * channel(hex, 1) +
    0.7152 * channel(hex, 3) +
    0.0722 * channel(hex, 5)
  );
}

function contrast(a: string, b: string) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function fontOf(fontFamily: string) {
  if (isBrandFontFamily(fontFamily)) {
    return fontStack(fontFamily);
  }
  return safeFontList.test(fontFamily) ? fontFamily : fontStack("system");
}

const lightInk = "#ffffff";
const darkInk = "#111111";

export function formTheme(brand: FormBrand): CSSProperties {
  const clean = toFormBrand(brand);
  const surface = clean.contentColor;
  const ink =
    contrast(clean.textColor, surface) >= 4.5
      ? clean.textColor
      : contrast(darkInk, surface) >= contrast(lightInk, surface)
        ? darkInk
        : lightInk;
  const onPrimary =
    contrast(lightInk, clean.primaryColor) >=
    contrast(darkInk, clean.primaryColor)
      ? lightInk
      : darkInk;
  const darkSurface = luminance(surface) < 0.3;
  return {
    "--form-page": clean.backgroundColor,
    "--form-surface": surface,
    "--form-ink": ink,
    "--form-primary": clean.primaryColor,
    "--form-on-primary": onPrimary,
    "--form-muted": `color-mix(in srgb, ${ink} 72%, ${surface})`,
    "--form-line": `color-mix(in srgb, ${ink} 46%, ${surface})`,
    "--form-soft": `color-mix(in srgb, ${ink} 14%, ${surface})`,
    "--form-danger": darkSurface ? "#ffb4a8" : "#b42318",
    "--form-danger-soft": darkSurface ? "#5c1a12" : "#fdecea",
    fontFamily: fontOf(clean.fontFamily),
  } as CSSProperties;
}

type InputHints = {
  type: "text" | "email" | "tel" | "number" | "date";
  autoComplete: HTMLInputAutoCompleteAttribute;
  inputMode?: "email" | "tel" | "decimal";
};

const autoCompletes: Record<string, HTMLInputAutoCompleteAttribute> = {
  email: "email",
  first_name: "given-name",
  last_name: "family-name",
  company: "organization",
  job_title: "organization-title",
  phone: "tel",
  city: "address-level2",
  country: "country-name",
};

export function inputHints(field: FormField): InputHints {
  const autoComplete = autoCompletes[field.key] ?? "off";
  switch (field.type) {
    case "email":
      return { type: "email", autoComplete, inputMode: "email" };
    case "tel":
      return { type: "tel", autoComplete, inputMode: "tel" };
    case "number":
      return { type: "number", autoComplete, inputMode: "decimal" };
    case "date":
      return { type: "date", autoComplete };
    default:
      return { type: "text", autoComplete };
  }
}

export function fieldDomId(prefix: string, key: string) {
  return `${prefix}-${key.replace(/[^a-z0-9_-]/gi, "-")}`;
}

function toGuard(value: unknown): FormGuard {
  const row = isRow(value) ? value : {};
  const hidden: Record<string, string> = {};
  const field = textOrNull(row.renderTokenField);
  const token = textOrNull(row.renderToken);
  if (field && token && fieldKeyPattern.test(field)) {
    hidden[field] = token;
  }
  const honeypot = textOrNull(row.honeypotField);
  return {
    honeypot: honeypot && fieldKeyPattern.test(honeypot) ? honeypot : null,
    hidden,
  };
}

export function toPublicForm(value: unknown): PublicForm | null {
  if (!isRow(value) || !Array.isArray(value.fields)) {
    return null;
  }
  const fields = toFormFields(value.fields);
  if (!fields.some((field) => field.key === emailFieldKey)) {
    return null;
  }
  return {
    name: typeof value.name === "string" ? value.name : "",
    brand: toFormBrand(value.brand),
    fields,
    settings: toFormSettings(value.settings),
    guard: toGuard(value.protection),
  };
}
