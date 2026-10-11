import type { schema } from "@workspace/db";
import {
  isValidEmail,
  normalizeEmail,
} from "../suppression/suppression.service";
import { honeypotField, renderTokenField } from "./forms.constants";

export type StoredField = schema.FormField;
export type StoredSettings = schema.FormSettings & {
  fromEmail?: string | null;
};

export type FieldKind =
  | "email"
  | "text"
  | "tel"
  | "number"
  | "date"
  | "boolean"
  | "select";

export type FormField = {
  key: string;
  label: string;
  required: boolean;
  type: FieldKind;
  options: string[] | null;
};

export type CatalogField = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "select";
  options: string[] | null;
};

export type FormSettings = {
  title: string;
  description: string;
  buttonLabel: string;
  consentText: string;
  successTitle: string;
  successMessage: string;
  redirectUrl: string | null;
  confirmSubject: string;
  fromEmail: string | null;
};

export type ContactColumn =
  | "firstName"
  | "lastName"
  | "company"
  | "jobTitle"
  | "phone"
  | "city"
  | "country";

export type SubmissionContact = {
  email: string;
  fields?: Record<string, string | number | boolean>;
} & Partial<Record<ContactColumn, string>>;

export class FormInputError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
  }
}

export const maxFormFields = 12;
export const maxNameLength = 120;
export const maxLabelLength = 80;
export const maxValueLength = 500;
export const customFieldPrefix = "fields.";

const maxBodyEntries = 64;
const maxKeyLength = 80;
const maxUrlLength = 2000;

const contactFields: Record<
  string,
  { column: ContactColumn; label: string; kind: FieldKind; max: number }
> = {
  first_name: {
    column: "firstName",
    label: "First name",
    kind: "text",
    max: 255,
  },
  last_name: { column: "lastName", label: "Last name", kind: "text", max: 255 },
  company: { column: "company", label: "Company", kind: "text", max: 255 },
  job_title: { column: "jobTitle", label: "Job title", kind: "text", max: 255 },
  phone: { column: "phone", label: "Phone", kind: "tel", max: 50 },
  city: { column: "city", label: "City", kind: "text", max: 255 },
  country: { column: "country", label: "Country", kind: "text", max: 100 },
};

const emailField: FormField = {
  key: "email",
  label: "Email",
  required: true,
  type: "email",
  options: null,
};

const bodyAliases: Record<string, string> = {
  firstName: "first_name",
  lastName: "last_name",
  jobTitle: "job_title",
  renderToken: renderTokenField,
};

const lineSettings = {
  title: { label: "the title", max: 120 },
  buttonLabel: { label: "the button label", max: 40 },
  successTitle: { label: "the success title", max: 120 },
  confirmSubject: { label: "the confirmation subject", max: 150 },
} as const;

const blockSettings = {
  description: { label: "the description", max: 500 },
  consentText: { label: "the consent text", max: 500 },
  successMessage: { label: "the success message", max: 500 },
} as const;

type TextSetting = keyof typeof lineSettings | keyof typeof blockSettings;

const sharedDefaults = {
  title: "Subscribe to our newsletter",
  description: "",
  buttonLabel: "Subscribe",
  consentText:
    "You agree to receive emails from us. You can unsubscribe at any time.",
  confirmSubject: "Confirm your subscription",
};

const successDefaults = {
  doubleOptIn: {
    successTitle: "Check your inbox",
    successMessage:
      "We sent you an email. Open it and confirm your address to finish subscribing.",
  },
  singleOptIn: {
    successTitle: "You are subscribed",
    successMessage: "Thank you for subscribing.",
  },
};

const trueWords = new Set(["true", "yes", "y", "1", "on"]);
const falseWords = new Set(["false", "no", "n", "0", "off"]);
const numberPattern = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDate(value: string) {
  if (!datePattern.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function defaultSettings(doubleOptIn: boolean) {
  return {
    ...sharedDefaults,
    ...(doubleOptIn
      ? successDefaults.doubleOptIn
      : successDefaults.singleOptIn),
  };
}

function isDefault(key: TextSetting, value: string) {
  return (
    value === "" ||
    value === defaultSettings(true)[key] ||
    value === defaultSettings(false)[key]
  );
}

export function resolveSettings(
  stored: StoredSettings,
  doubleOptIn: boolean,
): FormSettings {
  const defaults = defaultSettings(doubleOptIn);
  const text = (key: TextSetting) => {
    const value = stored[key];
    return typeof value === "string" && value.trim() !== ""
      ? value
      : defaults[key];
  };
  return {
    title: text("title"),
    description: text("description"),
    buttonLabel: text("buttonLabel"),
    consentText: text("consentText"),
    successTitle: text("successTitle"),
    successMessage: text("successMessage"),
    redirectUrl: safeRedirectUrl(stored.redirectUrl),
    confirmSubject: text("confirmSubject"),
    fromEmail:
      typeof stored.fromEmail === "string" && isValidEmail(stored.fromEmail)
        ? normalizeEmail(stored.fromEmail)
        : null,
  };
}

export function safeRedirectUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > maxUrlLength ||
    !URL.canParse(value)
  ) {
    return null;
  }
  const url = new URL(value);
  return url.protocol === "http:" || url.protocol === "https:"
    ? url.href
    : null;
}

export function parseName(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new FormInputError("Give the form a name.", "name");
  }
  const name = value.replace(/\s+/g, " ").trim();
  if (name.length > maxNameLength) {
    throw new FormInputError(
      `Keep the name to ${maxNameLength} characters or fewer.`,
      "name",
    );
  }
  return name;
}

export function parseSettings(
  value: unknown,
  current: StoredSettings,
): StoredSettings {
  if (!isRecord(value)) {
    throw new FormInputError("settings must be an object.", "settings");
  }
  const next: StoredSettings = { ...current };
  const setText = (
    key: TextSetting,
    max: number,
    label: string,
    line: boolean,
  ) => {
    const raw = value[key];
    if (raw === undefined) {
      return;
    }
    if (raw !== null && typeof raw !== "string") {
      throw new FormInputError(`${key} must be text.`, `settings.${key}`);
    }
    const text = line
      ? (raw ?? "").replace(/\s+/g, " ").trim()
      : (raw ?? "").replace(/\r\n?/g, "\n").trim();
    if (text.length > max) {
      throw new FormInputError(
        `Keep ${label} to ${max} characters or fewer.`,
        `settings.${key}`,
      );
    }
    if (isDefault(key, text)) {
      delete next[key];
    } else {
      next[key] = text;
    }
  };
  for (const [key, rule] of Object.entries(lineSettings)) {
    setText(key as TextSetting, rule.max, rule.label, true);
  }
  for (const [key, rule] of Object.entries(blockSettings)) {
    setText(key as TextSetting, rule.max, rule.label, false);
  }

  if (value.redirectUrl !== undefined) {
    const raw = value.redirectUrl;
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
      delete next.redirectUrl;
    } else {
      const url = typeof raw === "string" ? safeRedirectUrl(raw.trim()) : null;
      if (url === null) {
        throw new FormInputError(
          "The redirect address must start with http:// or https:// and be 2,000 characters or fewer.",
          "settings.redirectUrl",
        );
      }
      next.redirectUrl = url;
    }
  }

  if (value.fromEmail !== undefined) {
    const raw = value.fromEmail;
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
      delete next.fromEmail;
    } else if (typeof raw !== "string" || !isValidEmail(raw)) {
      throw new FormInputError(
        "The From address is not a valid email address.",
        "settings.fromEmail",
      );
    } else {
      next.fromEmail = normalizeEmail(raw);
    }
  }
  return next;
}

function describeField(
  key: string,
  catalog: Map<string, CatalogField>,
): Omit<FormField, "required"> | null {
  if (key === emailField.key) {
    return emailField;
  }
  const contact = Object.hasOwn(contactFields, key) ? contactFields[key] : null;
  if (contact) {
    return { key, label: contact.label, type: contact.kind, options: null };
  }
  if (!key.startsWith(customFieldPrefix)) {
    return null;
  }
  const custom = catalog.get(key.slice(customFieldPrefix.length));
  return custom
    ? {
        key,
        label: custom.label,
        type: custom.type,
        options: custom.type === "select" ? (custom.options ?? []) : null,
      }
    : null;
}

export function parseFields(
  value: unknown,
  catalog: Map<string, CatalogField>,
): StoredField[] {
  if (!Array.isArray(value)) {
    throw new FormInputError("fields must be a list of form fields.", "fields");
  }
  if (value.length > maxFormFields) {
    throw new FormInputError(
      `A form can have up to ${maxFormFields} fields.`,
      "fields",
    );
  }
  const fields: StoredField[] = [];
  const seen = new Set<string>([emailField.key]);
  let emailLabel = emailField.label;
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.key !== "string") {
      throw new FormInputError(
        "Every field needs a key, a label and whether it is required.",
        "fields",
      );
    }
    const known = describeField(entry.key, catalog);
    if (!known) {
      throw new FormInputError(
        `"${entry.key.slice(0, 60)}" is not a contact property or a custom field in this workspace.`,
        "fields",
      );
    }
    if (entry.label !== undefined && typeof entry.label !== "string") {
      throw new FormInputError("A field label must be text.", "fields");
    }
    const label =
      (entry.label ?? "").replace(/\s+/g, " ").trim() || known.label;
    if (label.length > maxLabelLength) {
      throw new FormInputError(
        `Keep each field label to ${maxLabelLength} characters or fewer.`,
        "fields",
      );
    }
    if (entry.required !== undefined && typeof entry.required !== "boolean") {
      throw new FormInputError(
        "required must be true or false for every field.",
        "fields",
      );
    }
    if (known.key === emailField.key) {
      emailLabel = label;
      continue;
    }
    if (seen.has(known.key)) {
      throw new FormInputError(
        `The field "${label}" is on the form more than once.`,
        "fields",
      );
    }
    seen.add(known.key);
    fields.push({ key: known.key, label, required: entry.required === true });
  }
  if (fields.length + 1 > maxFormFields) {
    throw new FormInputError(
      `A form can have up to ${maxFormFields} fields, counting the email address.`,
      "fields",
    );
  }
  return [
    { key: emailField.key, label: emailLabel, required: true },
    ...fields,
  ];
}

export function resolveFields(
  stored: StoredField[],
  catalog: Map<string, CatalogField>,
): FormField[] {
  const fields: FormField[] = [];
  const seen = new Set<string>([emailField.key]);
  let emailLabel = emailField.label;
  for (const entry of Array.isArray(stored) ? stored : []) {
    if (!isRecord(entry) || typeof entry.key !== "string") {
      continue;
    }
    const label =
      typeof entry.label === "string" && entry.label.trim() !== ""
        ? entry.label.trim().slice(0, maxLabelLength)
        : null;
    if (entry.key === emailField.key) {
      emailLabel = label ?? emailLabel;
      continue;
    }
    const known = describeField(entry.key, catalog);
    if (!known || seen.has(known.key)) {
      continue;
    }
    seen.add(known.key);
    fields.push({
      ...known,
      label: label ?? known.label,
      required: entry.required === true,
    });
  }
  return [{ ...emailField, label: emailLabel }, ...fields].slice(
    0,
    maxFormFields,
  );
}

function scalar(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

export function flattenBody(body: unknown): Map<string, string> {
  const values = new Map<string, string>();
  if (!isRecord(body)) {
    return values;
  }
  const put = (key: string, value: unknown) => {
    const name = Object.hasOwn(bodyAliases, key) ? bodyAliases[key] : key;
    const text = scalar(value);
    if (
      name === undefined ||
      text === null ||
      name.length > maxKeyLength ||
      values.has(name) ||
      values.size >= maxBodyEntries
    ) {
      return;
    }
    values.set(name, text);
  };
  for (const [key, value] of Object.entries(body).slice(0, maxBodyEntries)) {
    if ((key === "fields" || key === "data") && isRecord(value)) {
      for (const [inner, nested] of Object.entries(value).slice(
        0,
        maxBodyEntries,
      )) {
        put(key === "fields" ? `${customFieldPrefix}${inner}` : inner, nested);
      }
    } else {
      put(key, value);
    }
  }
  return values;
}

export function parseFormBody(raw: Buffer, contentType: string | undefined) {
  const text = raw.toString("utf8");
  const type = (contentType ?? "").toLowerCase();
  const json =
    type.includes("application/json") ||
    (!type.includes("application/x-www-form-urlencoded") &&
      text.trimStart().startsWith("{"));
  if (json) {
    try {
      return { json: true, values: flattenBody(JSON.parse(text)) };
    } catch {
      return { json: true, values: new Map<string, string>() };
    }
  }
  const values = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(text)) {
    if (values.size >= maxBodyEntries) {
      break;
    }
    if (key.length <= maxKeyLength && !values.has(key)) {
      values.set(key, value);
    }
  }
  return { json: false, values };
}

export function isHoneypotFilled(values: Map<string, string>) {
  return (values.get(honeypotField) ?? "").trim() !== "";
}

function withoutControlCharacters(value: string) {
  let clean = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      code === 9 ||
      code === 10 ||
      code === 13 ||
      (code >= 32 && code !== 127)
    ) {
      clean += character;
    }
  }
  return clean;
}

function normalizeValue(field: FormField, raw: string): string {
  const max = Object.hasOwn(contactFields, field.key)
    ? (contactFields[field.key]?.max ?? maxValueLength)
    : maxValueLength;
  if (raw.length > max) {
    throw new FormInputError(
      `Keep ${field.label} to ${max} characters or fewer.`,
      field.key,
    );
  }
  switch (field.type) {
    case "number":
      if (!numberPattern.test(raw) || !Number.isFinite(Number(raw))) {
        throw new FormInputError(`${field.label} must be a number.`, field.key);
      }
      return String(Number(raw));
    case "date":
      if (!isDate(raw)) {
        throw new FormInputError(
          `${field.label} must be a date written as YYYY-MM-DD.`,
          field.key,
        );
      }
      return raw;
    case "boolean": {
      const word = raw.toLowerCase();
      if (trueWords.has(word)) {
        return "true";
      }
      if (falseWords.has(word)) {
        return "false";
      }
      throw new FormInputError(`${field.label} must be yes or no.`, field.key);
    }
    case "select": {
      const options = field.options ?? [];
      const option =
        options.find((entry) => entry === raw) ??
        options.find((entry) => entry.toLowerCase() === raw.toLowerCase());
      if (option === undefined) {
        throw new FormInputError(
          `Choose one of the options for ${field.label}.`,
          field.key,
        );
      }
      return option;
    }
    default:
      return withoutControlCharacters(raw);
  }
}

export function parseSubmission(
  values: Map<string, string>,
  fields: FormField[],
): { email: string; data: Record<string, string> } {
  const rawEmail = (values.get("email") ?? "").trim();
  if (rawEmail === "") {
    throw new FormInputError("Enter your email address.", "email");
  }
  if (!isValidEmail(rawEmail)) {
    throw new FormInputError(
      "That email address does not look right. Check it and try again.",
      "email",
    );
  }
  const data: Record<string, string> = {};
  for (const field of fields) {
    if (field.key === "email") {
      continue;
    }
    const raw = (values.get(field.key) ?? "").trim();
    const value = raw === "" ? "" : normalizeValue(field, raw);
    if (value === "" || (field.type === "boolean" && value === "false")) {
      if (field.required) {
        throw new FormInputError(`${field.label} is required.`, field.key);
      }
      if (value === "") {
        continue;
      }
    }
    data[field.key] = value;
  }
  return { email: normalizeEmail(rawEmail), data };
}

export function submissionContact(
  email: string,
  data: Record<string, string>,
  fields: FormField[],
  scope: "all" | "columns" | "email" = "all",
): SubmissionContact {
  const contact: SubmissionContact = { email };
  if (scope === "email") {
    return contact;
  }
  const custom: Record<string, string | number | boolean> = {};
  for (const field of fields) {
    const value = Object.hasOwn(data, field.key) ? data[field.key] : undefined;
    if (value === undefined || value === "") {
      continue;
    }
    const column = Object.hasOwn(contactFields, field.key)
      ? contactFields[field.key]?.column
      : undefined;
    if (column) {
      contact[column] = value;
    } else if (field.key.startsWith(customFieldPrefix) && scope === "all") {
      custom[field.key.slice(customFieldPrefix.length)] =
        field.type === "number"
          ? Number(value)
          : field.type === "boolean"
            ? value === "true"
            : value;
    }
  }
  if (Object.keys(custom).length > 0) {
    contact.fields = custom;
  }
  return contact;
}
