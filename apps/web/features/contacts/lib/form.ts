import {
  type Contact,
  type ContactField,
  type ContactInput,
  type ContactList,
  type CustomValue,
  isEmail,
  type Option,
  type ProfileKey,
  profileKeys,
} from "@/features/contacts/lib/contacts";

export type CustomDraft = string | boolean;

export type ContactDraft = {
  email: string;
  profile: Record<ProfileKey, string>;
  custom: Record<string, CustomDraft>;
  lists: ContactList[];
  tags: Option[];
};

export type DraftProblem = "emailMissing" | "emailInvalid" | "numberInvalid";

export type DraftProblems = Record<string, DraftProblem>;

export type MembershipChanges = {
  added: string[];
  removed: string[];
  statuses: { id: string; status: ContactList["status"] }[];
};

export function customErrorKey(key: string) {
  return `custom:${key}`;
}

function draftOf(field: ContactField, value: CustomValue): CustomDraft {
  if (field.type === "boolean") {
    return value === true;
  }
  if (value === null || typeof value === "boolean") {
    return "";
  }
  if (field.type === "date") {
    return String(value).slice(0, 10);
  }
  return String(value);
}

export function initialDraft(
  contact: Contact | null,
  fields: ContactField[],
): ContactDraft {
  const profile = {} as Record<ProfileKey, string>;
  for (const key of profileKeys) {
    profile[key] = contact?.[key] ?? "";
  }
  const custom: Record<string, CustomDraft> = {};
  for (const field of fields) {
    custom[field.key] = draftOf(field, contact?.fields[field.key] ?? null);
  }
  return {
    email: contact?.email ?? "",
    profile,
    custom,
    lists: contact?.lists ?? [],
    tags: (contact?.tags ?? []).map((tag) => ({
      value: tag.id,
      label: tag.name,
    })),
  };
}

function customValueOf(
  field: ContactField,
  draft: CustomDraft | undefined,
): CustomValue | undefined {
  if (field.type === "boolean") {
    return draft === true;
  }
  const text = typeof draft === "string" ? draft.trim() : "";
  if (text === "") {
    return null;
  }
  if (field.type === "number") {
    const number = Number(text);
    return Number.isFinite(number) ? number : undefined;
  }
  return text;
}

export function buildInput(
  draft: ContactDraft,
  contact: Contact | null,
  fields: ContactField[],
): { input: ContactInput; problems: DraftProblems } {
  const problems: DraftProblems = {};
  const input: ContactInput = {};
  const email = draft.email.trim().toLowerCase();
  if (email === "") {
    problems.email = "emailMissing";
  } else if (!isEmail(email)) {
    problems.email = "emailInvalid";
  } else if (email !== contact?.email) {
    input.email = email;
  }
  for (const key of profileKeys) {
    const value = draft.profile[key].trim() || null;
    if (value !== (contact?.[key] ?? null)) {
      input[key] = value;
    }
  }
  const before = initialDraft(contact, fields);
  const custom: Record<string, CustomValue> = {};
  for (const field of fields) {
    const value = customValueOf(field, draft.custom[field.key]);
    if (value === undefined) {
      problems[customErrorKey(field.key)] = "numberInvalid";
      continue;
    }
    if (value !== customValueOf(field, before.custom[field.key])) {
      custom[field.key] = value;
    }
  }
  if (Object.keys(custom).length > 0) {
    input.fields = custom;
  }
  return { input, problems };
}

export function membershipChanges(
  before: ContactList[],
  after: ContactList[],
): MembershipChanges {
  const original = new Map(before.map((list) => [list.id, list.status]));
  const kept = new Set(after.map((list) => list.id));
  return {
    added: after.filter((list) => !original.has(list.id)).map((l) => l.id),
    removed: before.filter((list) => !kept.has(list.id)).map((l) => l.id),
    statuses: after.flatMap((list) => {
      const status = original.get(list.id);
      return status !== undefined && status !== list.status
        ? [{ id: list.id, status: list.status }]
        : [];
    }),
  };
}

export function tagChanges(before: string[], after: string[]) {
  return {
    added: after.filter((id) => !before.includes(id)),
    removed: before.filter((id) => !after.includes(id)),
  };
}

export function timeZones(current: string | null): Option[] {
  const zones = new Set(Intl.supportedValuesOf("timeZone"));
  zones.add("UTC");
  if (current) {
    zones.add(current);
  }
  return [...zones].sort().map((zone) => ({
    value: zone,
    label: zone.replaceAll("_", " "),
  }));
}
