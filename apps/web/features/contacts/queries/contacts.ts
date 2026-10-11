import "server-only";

import {
  type ContactField,
  type ContactFilters,
  type ContactsResult,
  contactsPath,
  type Option,
  toContactFields,
  toContactsPage,
  toOptions,
} from "@/features/contacts/lib/contacts";
import { apiRequest } from "@/lib/api-server";

export async function getContacts(
  filters: ContactFilters,
): Promise<ContactsResult> {
  const { status, data } = await apiRequest(contactsPath(filters));
  const page = status === 200 ? toContactsPage(data) : null;
  return page ? { state: "ready", ...page } : { state: "failed" };
}

export async function getListOptions(): Promise<Option[]> {
  const { status, data } = await apiRequest("/lists");
  return status === 200 ? toOptions(data, "lists") : [];
}

export async function getTagOptions(): Promise<Option[]> {
  const { status, data } = await apiRequest("/tags");
  return status === 200 ? toOptions(data, "tags") : [];
}

export async function getSegmentOptions(): Promise<Option[]> {
  const { status, data } = await apiRequest("/segments");
  return status === 200 ? toOptions(data, "segments") : [];
}

export async function getContactFields(): Promise<ContactField[] | null> {
  const { status, data } = await apiRequest("/contact-fields");
  return status === 200 ? toContactFields(data) : null;
}
