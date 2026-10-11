import type { Metadata } from "next";
import { ContactsScreen } from "@/features/contacts/components/contacts-screen";
import { toFilters } from "@/features/contacts/lib/contacts";
import {
  getContactFields,
  getContacts,
  getListOptions,
  getSegmentOptions,
  getTagOptions,
} from "@/features/contacts/queries/contacts";
import { getActiveWorkspace } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Contacts · ${workspace.name}` : "Contacts",
  };
}

type ContactsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) || null;
}

export default async function ContactsPage({
  searchParams,
}: ContactsPageProps) {
  const params = await searchParams;
  const filters = toFilters({
    search: first(params.search),
    listId: first(params.listId),
    tagId: first(params.tagId),
    segmentId: first(params.segmentId),
  });
  const [result, lists, tags, segments, fields] = await Promise.all([
    getContacts(filters),
    getListOptions(),
    getTagOptions(),
    getSegmentOptions(),
    getContactFields(),
  ]);
  return (
    <ContactsScreen
      result={result}
      filters={filters}
      lists={lists}
      tags={tags}
      segments={segments}
      fields={fields}
    />
  );
}
