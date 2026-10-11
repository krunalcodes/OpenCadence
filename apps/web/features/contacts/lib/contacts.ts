import type { Option } from "@/components/product/option";
import { isRow, type Row, rowsOf, textOrNull, textsOf } from "@/lib/api";

export type CustomValue = string | number | boolean | null;

export type ContactOrigin = "manual" | "import" | "api" | "form";

export type SuppressedReason =
  | "unsubscribed"
  | "bounced"
  | "complained"
  | "manual";

export type MembershipStatus = "subscribed" | "unsubscribed";

export type ContactTag = { id: string; name: string };

export type ContactList = {
  id: string;
  name: string;
  status: MembershipStatus;
};

export type Contact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  fields: Record<string, CustomValue>;
  origin: ContactOrigin;
  tags: ContactTag[];
  lists: ContactList[];
  suppressed: SuppressedReason | null;
  createdAt: string;
  updatedAt: string;
};

export const profileKeys = [
  "firstName",
  "lastName",
  "company",
  "jobTitle",
  "phone",
  "city",
  "country",
  "timezone",
] as const;

export type ProfileKey = (typeof profileKeys)[number];

export type ContactInput = { email?: string } & Partial<
  Record<ProfileKey, string | null>
> & { fields?: Record<string, CustomValue> };

export type FieldType = "text" | "number" | "date" | "boolean" | "select";

export type ContactField = {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  options: string[] | null;
  position: number;
};

export type { Option } from "@/components/product/option";

export type ContactsPage = { contacts: Contact[]; nextCursor: string | null };

export type ContactsResult =
  | ({ state: "ready" } & ContactsPage)
  | { state: "failed" };

export type ContactFilters = {
  search: string;
  listId: string | null;
  tagId: string | null;
  segmentId: string | null;
};

export type BulkAction =
  | "delete"
  | "add_tags"
  | "remove_tags"
  | "add_to_lists"
  | "remove_from_lists";

export const contactPageSize = 50;
export const maxSearchLength = 200;
export const maxEmailLength = 320;
export const maxProfileLength = 200;
export const maxCustomTextLength = 1000;
export const maxTagLength = 50;
export const maxFieldLabelLength = 80;
export const maxFieldKeyLength = 40;
export const maxFields = 100;
export const maxFieldOptions = 100;
export const bulkChunkSize = 1000;

export const fieldTypes: FieldType[] = [
  "text",
  "number",
  "date",
  "boolean",
  "select",
];

const origins: ContactOrigin[] = ["manual", "import", "api", "form"];

const suppressedReasons: SuppressedReason[] = [
  "bounced",
  "complained",
  "unsubscribed",
  "manual",
];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fieldKeyPattern = /^[a-z][a-z0-9_]*$/;

export function isEmail(value: string) {
  return value.length <= maxEmailLength && emailPattern.test(value);
}

export function isFieldKey(value: string) {
  return value.length <= maxFieldKeyLength && fieldKeyPattern.test(value);
}

export function fieldKeyFromLabel(label: string) {
  return label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[_0-9]+|_+$/g, "")
    .slice(0, maxFieldKeyLength)
    .replace(/_+$/g, "");
}

export function fullName(contact: Contact) {
  return [contact.firstName, contact.lastName]
    .filter((part) => part !== null)
    .join(" ");
}

function toCustomValues(value: unknown): Record<string, CustomValue> {
  if (!isRow(value)) {
    return {};
  }
  const values: Record<string, CustomValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      values[key] = item;
    }
  }
  return values;
}

function toNamed(value: Row): ContactTag | null {
  const id = textOrNull(value.id);
  const name = textOrNull(value.name);
  return id && name ? { id, name } : null;
}

export function toContact(value: unknown): Contact | null {
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
    firstName: textOrNull(value.firstName),
    lastName: textOrNull(value.lastName),
    company: textOrNull(value.company),
    jobTitle: textOrNull(value.jobTitle),
    phone: textOrNull(value.phone),
    city: textOrNull(value.city),
    country: textOrNull(value.country),
    timezone: textOrNull(value.timezone),
    fields: toCustomValues(value.fields),
    origin: origins.find((origin) => origin === value.origin) ?? "manual",
    tags: rowsOf(value.tags).flatMap((item) => {
      const tag = toNamed(item);
      return tag ? [tag] : [];
    }),
    lists: rowsOf(value.lists).flatMap((item) => {
      const list = toNamed(item);
      return list
        ? [
            {
              ...list,
              status:
                item.status === "unsubscribed"
                  ? ("unsubscribed" as const)
                  : ("subscribed" as const),
            },
          ]
        : [];
    }),
    suppressed:
      suppressedReasons.find((reason) => reason === value.suppressed) ?? null,
    createdAt: textOrNull(value.createdAt) ?? "",
    updatedAt: textOrNull(value.updatedAt) ?? "",
  };
}

export function toContactsPage(value: unknown): ContactsPage | null {
  if (!isRow(value) || !Array.isArray(value.contacts)) {
    return null;
  }
  return {
    contacts: value.contacts.flatMap((item) => {
      const contact = toContact(item);
      return contact ? [contact] : [];
    }),
    nextCursor: textOrNull(value.nextCursor),
  };
}

export function toContactField(value: unknown): ContactField | null {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  const key = textOrNull(value.key);
  const type = fieldTypes.find((item) => item === value.type);
  if (!id || !key || !type) {
    return null;
  }
  return {
    id,
    key,
    label: textOrNull(value.label) ?? key,
    type,
    options: type === "select" ? textsOf(value.options) : null,
    position: typeof value.position === "number" ? value.position : 0,
  };
}

export function toContactFields(value: unknown): ContactField[] | null {
  if (!isRow(value) || !Array.isArray(value.fields)) {
    return null;
  }
  return value.fields.flatMap((item) => {
    const field = toContactField(item);
    return field ? [field] : [];
  });
}

export function toOption(value: unknown): Option | null {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  const name = textOrNull(value.name);
  return id && name ? { value: id, label: name } : null;
}

export function toOptions(
  value: unknown,
  key: "lists" | "tags" | "segments",
): Option[] {
  if (!isRow(value)) {
    return [];
  }
  return rowsOf(value[key]).flatMap((item) => {
    const option = toOption(item);
    return option ? [option] : [];
  });
}

export function toCount(value: unknown, key: "count" | "affected") {
  if (!isRow(value)) {
    return null;
  }
  const count = value[key];
  return typeof count === "number" && Number.isFinite(count) ? count : null;
}

export { sameOption } from "@/components/product/option";

export function hasFilters(filters: ContactFilters) {
  return (
    filters.search !== "" ||
    filters.listId !== null ||
    filters.tagId !== null ||
    filters.segmentId !== null
  );
}

export function filtersSearch(filters: ContactFilters) {
  const params = new URLSearchParams();
  if (filters.segmentId) {
    params.set("segmentId", filters.segmentId);
    return params.toString();
  }
  if (filters.search !== "") {
    params.set("search", filters.search);
  }
  if (filters.listId) {
    params.set("listId", filters.listId);
  }
  if (filters.tagId) {
    params.set("tagId", filters.tagId);
  }
  return params.toString();
}

export function contactsPath(filters: ContactFilters, cursor?: string | null) {
  const params = new URLSearchParams();
  if (!filters.segmentId) {
    if (filters.search !== "") {
      params.set("search", filters.search);
    }
    if (filters.listId) {
      params.set("listId", filters.listId);
    }
    if (filters.tagId) {
      params.set("tagId", filters.tagId);
    }
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  params.set("limit", String(contactPageSize));
  const base = filters.segmentId
    ? `/segments/${encodeURIComponent(filters.segmentId)}/contacts`
    : "/contacts";
  return `${base}?${params.toString()}`;
}

export function countBody(filters: ContactFilters): Row {
  const body: Row = {};
  if (filters.search !== "") {
    body.search = filters.search;
  }
  if (filters.listId) {
    body.listId = filters.listId;
  }
  if (filters.tagId) {
    body.tagId = filters.tagId;
  }
  return body;
}

export function toFilters(params: {
  search: string | null;
  listId: string | null;
  tagId: string | null;
  segmentId: string | null;
}): ContactFilters {
  if (params.segmentId) {
    return {
      search: "",
      listId: null,
      tagId: null,
      segmentId: params.segmentId,
    };
  }
  return {
    search: (params.search ?? "").trim().slice(0, maxSearchLength),
    listId: params.listId,
    tagId: params.tagId,
    segmentId: null,
  };
}

export function chunksOf<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
