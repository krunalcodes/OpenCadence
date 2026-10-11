import type { Metadata } from "next";
import { TransactionalScreen } from "@/features/transactional/components/transactional-screen";
import { toStatusFilter } from "@/features/transactional/lib/emails";
import {
  getApiDocsUrl,
  getEmailSources,
  getEmails,
} from "@/features/transactional/queries/emails";
import { getActiveWorkspace } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Transactional · ${workspace.name}` : "Transactional",
  };
}

type TransactionalPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) || null;
}

export default async function TransactionalPage({
  searchParams,
}: TransactionalPageProps) {
  const params = await searchParams;
  const filters = {
    status: toStatusFilter(first(params.status)),
    sourceId: first(params.sourceId),
  };
  const [result, sources] = await Promise.all([
    getEmails(filters),
    getEmailSources(),
  ]);
  return (
    <TransactionalScreen
      result={result}
      filters={filters}
      sources={sources}
      docsUrl={getApiDocsUrl()}
    />
  );
}
