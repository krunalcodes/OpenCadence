import type { Metadata } from "next";
import { SequencesScreen } from "@/features/sequences/components/sequences-screen";
import {
  toSearchFilter,
  toStatusFilter,
} from "@/features/sequences/lib/sequences";
import { getSequences } from "@/features/sequences/queries/sequences";
import { loadAiSettings } from "@/lib/ai-server";
import { getActiveWorkspace } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Sequences · ${workspace.name}` : "Sequences",
  };
}

type SequencesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) || null;
}

export default async function SequencesPage({
  searchParams,
}: SequencesPageProps) {
  const params = await searchParams;
  const filters = {
    status: toStatusFilter(first(params.status)),
    search: toSearchFilter(first(params.search)),
  };
  const [result, ai] = await Promise.all([
    getSequences(filters),
    loadAiSettings(),
  ]);
  return (
    <SequencesScreen
      result={result}
      filters={filters}
      aiConfigured={ai?.configured === true}
    />
  );
}
