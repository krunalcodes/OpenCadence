import {
  countOf,
  isRow,
  type Row,
  rowsOf,
  textOrNull,
  textsOf,
} from "@/lib/api";

export type FormStatus = "draft" | "published" | "archived";

export const formStatuses: FormStatus[] = ["draft", "published", "archived"];

export type FieldKind =
  | "email"
  | "text"
  | "tel"
  | "number"
  | "date"
  | "boolean"
  | "select";

export const fieldKinds: FieldKind[] = [
  "email",
  "text",
  "tel",
  "number",
  "date",
  "boolean",
  "select",
];

export type FormField = {
  key: string;
  label: string;
  required: boolean;
  type: FieldKind;
  options: string[];
};

export type StoredField = { key: string; label: string; required: boolean };

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

export type FormBrand = {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  backgroundColor: string;
  contentColor: string;
  textColor: string;
  fontFamily: string;
};

export type FormListRef = { id: string; name: string };

export type FormSummary = {
  id: string;
  name: string;
  status: FormStatus;
  publicId: string;
  url: string;
  doubleOptIn: boolean;
  lists: FormListRef[];
  submissionCount: number;
  confirmedCount: number;
  createdAt: string;
  updatedAt: string;
};

export type FormEmbed = { url: string; iframe: string; html: string };

export type Form = FormSummary & {
  fields: FormField[];
  settings: FormSettings;
  source: { id: string; name: string } | null;
  embed: FormEmbed;
};

export type SubmissionStatus =
  | "pending"
  | "confirmed"
  | "subscribed"
  | "rejected";

export const submissionStatuses: SubmissionStatus[] = [
  "pending",
  "confirmed",
  "subscribed",
  "rejected",
];

export type Submission = {
  id: string;
  email: string;
  data: Record<string, string>;
  status: SubmissionStatus;
  contactId: string | null;
  createdAt: string;
  confirmedAt: string | null;
};

export type SubmissionsPage = {
  items: Submission[];
  nextCursor: string | null;
};

export type FormsResult =
  | { state: "ready"; forms: FormSummary[] }
  | { state: "failed" };

export type FormResult =
  | { state: "ready"; form: Form }
  | { state: "missing" }
  | { state: "failed" };

export type FieldChoice = {
  key: string;
  label: string;
  type: FieldKind;
  options: string[];
};

export const emailFieldKey = "email";
export const customFieldPrefix = "fields.";
export const standardFieldKeys = [
  "first_name",
  "last_name",
  "company",
  "job_title",
  "phone",
  "city",
  "country",
] as const;

export const maxFields = 12;
export const maxNameLength = 120;
export const maxLabelLength = 80;
export const maxUrlLength = 2000;
export const submissionPageSize = 50;

export const settingLimits = {
  title: 120,
  description: 500,
  buttonLabel: 40,
  consentText: 500,
  successTitle: 120,
  successMessage: 500,
  confirmSubject: 150,
} as const;

export type SettingKey = keyof typeof settingLimits;

export const settingKeys = Object.keys(settingLimits) as SettingKey[];

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function kindOf(key: string, value: unknown): FieldKind {
  if (key === emailFieldKey) {
    return "email";
  }
  const kind = fieldKinds.find((item) => item === value);
  if (kind && kind !== "email") {
    return kind;
  }
  return key === "phone" ? "tel" : "text";
}

export function toFormFields(value: unknown): FormField[] {
  return rowsOf(value).flatMap((item) => {
    const key = textOrNull(item.key);
    return key
      ? [
          {
            key,
            label: text(item.label),
            required: item.required === true || key === emailFieldKey,
            type: kindOf(key, item.type),
            options: textsOf(item.options),
          },
        ]
      : [];
  });
}

export function toFormSettings(value: unknown): FormSettings {
  const row: Row = isRow(value) ? value : {};
  return {
    title: text(row.title),
    description: text(row.description),
    buttonLabel: text(row.buttonLabel),
    consentText: text(row.consentText),
    successTitle: text(row.successTitle),
    successMessage: text(row.successMessage),
    redirectUrl: textOrNull(row.redirectUrl),
    confirmSubject: text(row.confirmSubject),
    fromEmail: textOrNull(row.fromEmail),
  };
}

function toListRefs(value: unknown): FormListRef[] {
  return rowsOf(value).flatMap((item) => {
    const id = textOrNull(item.id);
    return id ? [{ id, name: textOrNull(item.name) ?? id }] : [];
  });
}

export function toFormSummary(value: unknown): FormSummary | null {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  const publicId = textOrNull(value.publicId);
  if (!id || !publicId) {
    return null;
  }
  return {
    id,
    name: text(value.name),
    status: formStatuses.find((status) => status === value.status) ?? "draft",
    publicId,
    url: text(value.url),
    doubleOptIn: value.doubleOptIn !== false,
    lists: toListRefs(value.lists),
    submissionCount: countOf(value.submissionCount),
    confirmedCount: countOf(value.confirmedCount),
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
  };
}

export function toForm(value: unknown): Form | null {
  const summary = toFormSummary(value);
  if (!summary || !isRow(value)) {
    return null;
  }
  const source = isRow(value.source) ? value.source : null;
  const sourceId = source ? textOrNull(source.id) : null;
  const embed: Row = isRow(value.embed) ? value.embed : {};
  return {
    ...summary,
    fields: toFormFields(value.fields),
    settings: toFormSettings(value.settings),
    source:
      source && sourceId
        ? { id: sourceId, name: textOrNull(source.name) ?? sourceId }
        : null,
    embed: {
      url: text(embed.url) || summary.url,
      iframe: text(embed.iframe),
      html: text(embed.html),
    },
  };
}

export function toForms(value: unknown): FormSummary[] | null {
  if (!isRow(value) || !Array.isArray(value.forms)) {
    return null;
  }
  return rowsOf(value.forms).flatMap((item) => {
    const form = toFormSummary(item);
    return form ? [form] : [];
  });
}

function toData(value: unknown): Record<string, string> {
  if (!isRow(value)) {
    return {};
  }
  const data: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && item !== "") {
      data[key] = item;
    } else if (typeof item === "number" || typeof item === "boolean") {
      data[key] = String(item);
    }
  }
  return data;
}

export function toSubmission(value: unknown): Submission | null {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  const email = textOrNull(value.email);
  if (!id || !email) {
    return null;
  }
  return {
    id,
    email,
    data: toData(value.data),
    status:
      submissionStatuses.find((status) => status === value.status) ?? "pending",
    contactId: textOrNull(value.contactId),
    createdAt: text(value.createdAt),
    confirmedAt: textOrNull(value.confirmedAt),
  };
}

export function toSubmissionsPage(value: unknown): SubmissionsPage | null {
  if (!isRow(value) || !Array.isArray(value.items)) {
    return null;
  }
  return {
    items: rowsOf(value.items).flatMap((item) => {
      const submission = toSubmission(item);
      return submission ? [submission] : [];
    }),
    nextCursor: textOrNull(value.nextCursor),
  };
}

export function toCustomChoices(value: unknown): FieldChoice[] {
  if (!isRow(value)) {
    return [];
  }
  return rowsOf(value.fields).flatMap((item) => {
    const key = textOrNull(item.key);
    return key
      ? [
          {
            key: `${customFieldPrefix}${key}`,
            label: textOrNull(item.label) ?? key,
            type: kindOf(`${customFieldPrefix}${key}`, item.type),
            options: textsOf(item.options),
          },
        ]
      : [];
  });
}

export function formPath(id: string) {
  return `forms/${encodeURIComponent(id)}`;
}

export function submissionsQuery(
  status: SubmissionStatus | null,
  cursor: string | null,
) {
  const params = new URLSearchParams({ limit: String(submissionPageSize) });
  if (status) {
    params.set("status", status);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  return params.toString();
}

export function confirmedRate(form: FormSummary) {
  if (form.submissionCount === 0) {
    return null;
  }
  return Math.min(1, form.confirmedCount / form.submissionCount);
}

export function isWebUrl(value: string) {
  if (value.length > maxUrlLength || /\s/.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export type FormDraft = {
  name: string;
  listIds: string[];
  doubleOptIn: boolean;
  fields: FormField[];
  settings: Record<SettingKey, string>;
  redirectUrl: string;
  fromEmail: string;
  sourceId: string | null;
};

export type DraftKey =
  | "name"
  | "listIds"
  | "doubleOptIn"
  | "fields"
  | "settings"
  | "sourceId";

export const draftKeys: DraftKey[] = [
  "name",
  "listIds",
  "doubleOptIn",
  "fields",
  "settings",
  "sourceId",
];

export type DraftPayload = {
  name: string;
  listIds: string[];
  doubleOptIn: boolean;
  fields: StoredField[];
  settings: FormSettings;
  sourceId: string | null;
};

export function draftOf(form: Form): FormDraft {
  return {
    name: form.name,
    listIds: form.lists.map((list) => list.id),
    doubleOptIn: form.doubleOptIn,
    fields: withEmailFirst(form.fields),
    settings: {
      title: form.settings.title,
      description: form.settings.description,
      buttonLabel: form.settings.buttonLabel,
      consentText: form.settings.consentText,
      successTitle: form.settings.successTitle,
      successMessage: form.settings.successMessage,
      confirmSubject: form.settings.confirmSubject,
    },
    redirectUrl: form.settings.redirectUrl ?? "",
    fromEmail: form.settings.fromEmail ?? "",
    sourceId: form.source?.id ?? null,
  };
}

export function withEmailFirst(fields: FormField[]): FormField[] {
  const email = fields.find((field) => field.key === emailFieldKey);
  return [
    {
      key: emailFieldKey,
      label: email?.label ?? "",
      required: true,
      type: "email",
      options: [],
    },
    ...fields.filter((field) => field.key !== emailFieldKey),
  ];
}

export function draftSettings(draft: FormDraft): FormSettings {
  const redirectUrl = draft.redirectUrl.trim();
  const fromEmail = draft.fromEmail.trim();
  return {
    title: draft.settings.title.trim(),
    description: draft.settings.description.trim(),
    buttonLabel: draft.settings.buttonLabel.trim(),
    consentText: draft.settings.consentText.trim(),
    successTitle: draft.settings.successTitle.trim(),
    successMessage: draft.settings.successMessage.trim(),
    redirectUrl: redirectUrl === "" ? null : redirectUrl,
    confirmSubject: draft.settings.confirmSubject.trim(),
    fromEmail: fromEmail === "" ? null : fromEmail,
  };
}

export function draftPayload(draft: FormDraft): DraftPayload {
  return {
    name: draft.name.trim().replace(/\s+/g, " "),
    listIds: draft.listIds,
    doubleOptIn: draft.doubleOptIn,
    fields: draft.fields.map((field) => ({
      key: field.key,
      label: field.label.trim(),
      required: field.key === emailFieldKey ? true : field.required,
    })),
    settings: draftSettings(draft),
    sourceId: draft.sourceId,
  };
}

export function changedPayload(
  saved: DraftPayload,
  next: DraftPayload,
  skip: DraftKey[],
): Row {
  const changed: Row = {};
  for (const key of draftKeys) {
    if (
      !skip.includes(key) &&
      JSON.stringify(saved[key]) !== JSON.stringify(next[key])
    ) {
      changed[key] = next[key];
    }
  }
  return changed;
}

export function moveField(
  fields: FormField[],
  key: string,
  direction: -1 | 1,
): FormField[] {
  const index = fields.findIndex((field) => field.key === key);
  const target = index + direction;
  if (index < 1 || target < 1 || target >= fields.length) {
    return fields;
  }
  const next = [...fields];
  const [moved] = next.splice(index, 1);
  if (!moved) {
    return fields;
  }
  next.splice(target, 0, moved);
  return next;
}
