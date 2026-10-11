import {
  type BulkAction,
  bulkChunkSize,
  type Contact,
  type ContactField,
  type ContactFilters,
  type ContactInput,
  type ContactsPage,
  chunksOf,
  contactsPath,
  countBody,
  type FieldType,
  type MembershipStatus,
  type Option,
  toContact,
  toContactField,
  toContactFields,
  toContactsPage,
  toCount,
  toOption,
} from "@/features/contacts/lib/contacts";
import { type ApiResult, malformed, request } from "@/lib/api";

function parsed<T>(
  result: ApiResult<unknown>,
  parse: (value: unknown) => T | null,
): ApiResult<T> {
  if (!result.ok) {
    return result;
  }
  const data = parse(result.data);
  return data === null ? { ok: false, error: malformed } : { ok: true, data };
}

export async function fetchContacts(
  filters: ContactFilters,
  cursor: string,
): Promise<ApiResult<ContactsPage>> {
  return parsed(
    await request("GET", contactsPath(filters, cursor)),
    toContactsPage,
  );
}

export async function fetchContactCount(
  filters: ContactFilters,
): Promise<ApiResult<number>> {
  const result = filters.segmentId
    ? await request(
        "GET",
        `/segments/${encodeURIComponent(filters.segmentId)}/count`,
      )
    : await request("POST", "/contacts/count", countBody(filters));
  return parsed(result, (value) => toCount(value, "count"));
}

export async function createContact(
  input: ContactInput & { email: string; listIds: string[]; tagIds: string[] },
): Promise<ApiResult<Contact>> {
  return parsed(await request("POST", "/contacts", input), toContact);
}

export async function updateContact(
  id: string,
  input: ContactInput,
): Promise<ApiResult<Contact>> {
  return parsed(
    await request("PATCH", `/contacts/${encodeURIComponent(id)}`, input),
    toContact,
  );
}

export async function deleteContact(id: string) {
  return request("DELETE", `/contacts/${encodeURIComponent(id)}`);
}

export async function bulkContacts(input: {
  ids: string[];
  action: BulkAction;
  tagIds?: string[];
  listIds?: string[];
}): Promise<ApiResult<number>> {
  let affected = 0;
  for (const ids of chunksOf(input.ids, bulkChunkSize)) {
    const result = parsed(
      await request("POST", "/contacts/bulk", { ...input, ids }),
      (value) => toCount(value, "affected"),
    );
    if (!result.ok) {
      return result;
    }
    affected += result.data;
  }
  return { ok: true, data: affected };
}

export async function addListMember(listId: string, contactId: string) {
  return request("POST", `/lists/${encodeURIComponent(listId)}/members`, {
    contactIds: [contactId],
  });
}

export async function removeListMember(listId: string, contactId: string) {
  return request(
    "POST",
    `/lists/${encodeURIComponent(listId)}/members/remove`,
    { contactIds: [contactId] },
  );
}

export async function setListMemberStatus(
  listId: string,
  contactId: string,
  status: MembershipStatus,
) {
  return request(
    "PATCH",
    `/lists/${encodeURIComponent(listId)}/members/${encodeURIComponent(contactId)}`,
    { status },
  );
}

export async function createTag(name: string): Promise<ApiResult<Option>> {
  return parsed(await request("POST", "/tags", { name }), toOption);
}

export async function fetchContactFields(): Promise<ApiResult<ContactField[]>> {
  return parsed(await request("GET", "/contact-fields"), toContactFields);
}

export async function createContactField(input: {
  label: string;
  type: FieldType;
  key: string;
  options?: string[];
}): Promise<ApiResult<ContactField>> {
  return parsed(
    await request("POST", "/contact-fields", input),
    toContactField,
  );
}

export async function updateContactField(
  id: string,
  input: { label?: string; options?: string[] },
): Promise<ApiResult<ContactField>> {
  return parsed(
    await request("PATCH", `/contact-fields/${encodeURIComponent(id)}`, input),
    toContactField,
  );
}

export async function deleteContactField(id: string) {
  return request("DELETE", `/contact-fields/${encodeURIComponent(id)}`);
}
