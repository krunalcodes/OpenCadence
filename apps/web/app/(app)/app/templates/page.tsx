import type { Metadata } from "next";
import { TemplatesScreen } from "@/features/templates/components/templates-screen";
import { toSearchFilter } from "@/features/templates/lib/templates";
import { getTemplates } from "@/features/templates/queries/templates";
import { getActiveWorkspace } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Templates · ${workspace.name}` : "Templates",
  };
}

type TemplatesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) || null;
}

export default async function TemplatesPage({
  searchParams,
}: TemplatesPageProps) {
  const params = await searchParams;
  const search = toSearchFilter(first(params.search));
  const result = await getTemplates(search);
  return <TemplatesScreen result={result} search={search} />;
}
