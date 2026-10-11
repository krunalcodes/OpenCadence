import {
  isValidEmail,
  normalizeEmail,
} from "../suppression/suppression.service";
import { isIsoDate } from "./filters/filter.validator";

export type CustomValue = string | number | boolean | null;
export type StoredCustomValue = string | number | boolean;
export type ContactFieldType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "select";

export type ContactFieldDefinition = {
  key: string;
  label: string;
  type: ContactFieldType;
  options: string[] | null;
};

export type ContactTextColumn =
  | "firstName"
  | "lastName"
  | "company"
  | "jobTitle"
  | "phone"
  | "city"
  | "country"
  | "timezone";

export type NormalizedContact = {
  email?: string;
  columns: Partial<Record<ContactTextColumn, string | null>>;
  fieldsToSet: Record<string, StoredCustomValue>;
  fieldsToRemove: string[];
};

export class ContactInputError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
  }
}

export const contactFieldTypes: ContactFieldType[] = [
  "text",
  "number",
  "date",
  "boolean",
  "select",
];

export const maxCustomTextLength = 1000;

const textLimits: Record<ContactTextColumn, { max: number; label: string }> = {
  firstName: { max: 255, label: "first name" },
  lastName: { max: 255, label: "last name" },
  company: { max: 255, label: "company" },
  jobTitle: { max: 255, label: "job title" },
  phone: { max: 50, label: "phone number" },
  city: { max: 255, label: "city" },
  country: { max: 100, label: "country" },
  timezone: { max: 100, label: "time zone" },
};

const textColumnNames = Object.keys(textLimits) as ContactTextColumn[];
const inputKeys = ["email", ...textColumnNames, "fields"];

const timeZones = new Map(
  [...Intl.supportedValuesOf("timeZone"), "UTC"].map((zone) => [
    zone.toLowerCase(),
    zone,
  ]),
);

const fieldKeyPattern = /^[a-z][a-z0-9_]{0,39}$/;
const maxKeyLength = 40;
const reservedFieldKeys = new Set([
  "id",
  "email",
  "first_name",
  "firstname",
  "last_name",
  "lastname",
  "company",
  "job_title",
  "jobtitle",
  "phone",
  "city",
  "country",
  "timezone",
  "fields",
  "origin",
  "tags",
  "lists",
  "suppressed",
  "created_at",
  "createdat",
  "updated_at",
  "updatedat",
  "custom",
  "list",
  "tag",
  "skip",
]);

const trueWords = new Set(["true", "yes", "y", "1"]);
const falseWords = new Set(["false", "no", "n", "0"]);
const numberPattern = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

export function isValidFieldKey(key: string) {
  return fieldKeyPattern.test(key);
}

export function isReservedFieldKey(key: string) {
  return reservedFieldKeys.has(key);
}

export function slugifyFieldLabel(label: string) {
  const slug = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const lettered = /^[a-z]/.test(slug) ? slug : `field_${slug}`;
  return lettered.slice(0, maxKeyLength).replace(/_+$/g, "");
}

export function withKeySuffix(key: string, suffix: number) {
  const tail = `_${suffix}`;
  return `${key.slice(0, maxKeyLength - tail.length).replace(/_+$/g, "")}${tail}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(
  column: ContactTextColumn,
  value: unknown,
): string | null {
  const { max, label } = textLimits[column];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ContactInputError(`The ${label} must be text.`, column);
  }
  const text = value.trim();
  if (text.length === 0) {
    return null;
  }
  if (column === "timezone") {
    const zone = timeZones.get(text.toLowerCase());
    if (!zone) {
      throw new ContactInputError(
        `"${text.slice(0, 60)}" is not a time zone. Use an IANA name such as Europe/Paris.`,
        column,
      );
    }
    return zone;
  }
  if (text.length > max) {
    throw new ContactInputError(
      `Keep the ${label} to ${max} characters or fewer.`,
      column,
    );
  }
  return text;
}

export function coerceCustomValue(
  definition: ContactFieldDefinition,
  value: unknown,
): StoredCustomValue | null {
  const field = `fields.${definition.key}`;
  const { label } = definition;
  if (value === null || value === undefined) {
    return null;
  }
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    throw new ContactInputError(
      `${label} must be text, a number, true or false.`,
      field,
    );
  }
  const text = typeof value === "string" ? value.trim() : "";
  if (typeof value === "string" && text.length === 0) {
    return null;
  }
  switch (definition.type) {
    case "number": {
      const parsed =
        typeof value === "number"
          ? value
          : typeof value === "string" && numberPattern.test(text)
            ? Number(text)
            : Number.NaN;
      if (!Number.isFinite(parsed)) {
        throw new ContactInputError(`${label} must be a number.`, field);
      }
      return parsed;
    }
    case "date":
      if (typeof value !== "string" || !isIsoDate(text)) {
        throw new ContactInputError(
          `${label} must be a date written as YYYY-MM-DD.`,
          field,
        );
      }
      return text;
    case "boolean": {
      if (typeof value === "boolean") {
        return value;
      }
      const word = String(value).trim().toLowerCase();
      if (trueWords.has(word)) {
        return true;
      }
      if (falseWords.has(word)) {
        return false;
      }
      throw new ContactInputError(`${label} must be true or false.`, field);
    }
    case "select": {
      const options = definition.options ?? [];
      const wanted = typeof value === "string" ? text : String(value);
      const option =
        options.find((entry) => entry === wanted) ??
        options.find((entry) => entry.toLowerCase() === wanted.toLowerCase());
      if (option === undefined) {
        throw new ContactInputError(
          `${label} must be one of: ${options.join(", ")}.`,
          field,
        );
      }
      return option;
    }
    default: {
      const stored = typeof value === "string" ? text : String(value);
      if (stored.length > maxCustomTextLength) {
        throw new ContactInputError(
          `Keep ${label} to ${maxCustomTextLength} characters or fewer.`,
          field,
        );
      }
      return stored;
    }
  }
}

export function normalizeContactInput(
  input: unknown,
  catalog: Map<string, ContactFieldDefinition>,
  mode: "create" | "update",
): NormalizedContact {
  if (!isRecord(input)) {
    throw new ContactInputError("Send the contact as an object.", "email");
  }
  for (const key of Object.keys(input)) {
    if (!inputKeys.includes(key)) {
      throw new ContactInputError(
        `"${key.slice(0, 40)}" is not a contact property.`,
        key.slice(0, 40),
      );
    }
  }
  const result: NormalizedContact = {
    columns: {},
    fieldsToSet: {},
    fieldsToRemove: [],
  };

  if (input.email !== undefined || mode === "create") {
    if (typeof input.email !== "string" || input.email.trim().length === 0) {
      throw new ContactInputError("Enter an email address.", "email");
    }
    if (!isValidEmail(input.email)) {
      throw new ContactInputError(
        `"${input.email.trim().slice(0, 100)}" is not a valid email address.`,
        "email",
      );
    }
    result.email = normalizeEmail(input.email);
  }

  for (const column of textColumnNames) {
    if (input[column] !== undefined) {
      result.columns[column] = normalizeText(column, input[column]);
    }
  }

  if (input.fields !== undefined && input.fields !== null) {
    if (!isRecord(input.fields)) {
      throw new ContactInputError(
        "fields must be an object of custom field keys and values.",
        "fields",
      );
    }
    for (const [key, value] of Object.entries(input.fields)) {
      const definition = catalog.get(key);
      if (!definition) {
        throw new ContactInputError(
          `"${key.slice(0, 40)}" is not a custom field in this workspace.`,
          `fields.${key.slice(0, 40)}`,
        );
      }
      const coerced = coerceCustomValue(definition, value);
      if (coerced === null) {
        result.fieldsToRemove.push(key);
      } else {
        result.fieldsToSet[key] = coerced;
      }
    }
  }
  return result;
}

export function visibleFields(
  stored: Record<string, CustomValue>,
  catalog: Map<string, ContactFieldDefinition>,
): Record<string, CustomValue> {
  const visible: Record<string, CustomValue> = {};
  for (const [key, value] of Object.entries(stored)) {
    const definition = catalog.get(key);
    if (!definition || value === null) {
      continue;
    }
    const expected =
      definition.type === "number"
        ? "number"
        : definition.type === "boolean"
          ? "boolean"
          : "string";
    if (typeof value === expected) {
      visible[key] = value;
    }
  }
  return visible;
}
