import type { Metadata } from "next";
import { SequenceScreen } from "@/features/sequences/components/sequence-screen";
import { SequenceUnavailable } from "@/features/sequences/components/sequence-unavailable";
import { toTab } from "@/features/sequences/lib/sequences";
import {
  getAudienceLists,
  getAudienceSegments,
  getSequence,
  getSources,
} from "@/features/sequences/queries/sequences";
import { getActiveWorkspace } from "@/lib/session";

type SequencePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Sequences · ${workspace.name}` : "Sequences",
  };
}

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) || null;
}

export default async function SequencePage({
  params,
  searchParams,
}: SequencePageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [result, sources, lists, segments] = await Promise.all([
    getSequence(id),
    getSources(),
    getAudienceLists(),
    getAudienceSegments(),
  ]);

  if (result.state !== "ready") {
    return <SequenceUnavailable />;
  }

  return (
    <SequenceScreen
      key={result.sequence.id}
      sequence={result.sequence}
      tab={toTab(first(query.tab))}
      sources={sources}
      lists={lists}
      segments={segments}
    />
  );
}
