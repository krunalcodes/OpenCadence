import type { Metadata } from "next";
import { SuppressionScreen } from "@/features/suppression/components/suppression-screen";
import {
  toReasonFilter,
  toSearchFilter,
} from "@/features/suppression/lib/suppressions";
import { getSuppressions } from "@/features/suppression/queries/suppressions";
import { getActiveWorkspace } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace
      ? `Suppression list · ${workspace.name}`
      : "Suppression list",
  };
}

type SuppressionsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) || null;
}

export default async function SuppressionsPage({
  searchParams,
}: SuppressionsPageProps) {
  const params = await searchParams;
  const filters = {
    reason: toReasonFilter(first(params.reason)),
    search: toSearchFilter(first(params.search)),
  };
  const result = await getSuppressions(filters);
  return <SuppressionScreen result={result} filters={filters} />;
}
