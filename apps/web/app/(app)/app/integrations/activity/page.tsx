import type { Metadata } from "next";
import { ActivityScreen } from "@/features/integrations/components/activity-screen";
import { toSeverityFilter } from "@/features/integrations/lib/sources";
import {
  getSendingSources,
  getSourceEvents,
} from "@/features/integrations/queries/sources";
import { getActiveWorkspace } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Activity log · ${workspace.name}` : "Activity log",
  };
}

type ActivityPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) || null;
}

export default async function ActivityPage({
  searchParams,
}: ActivityPageProps) {
  const params = await searchParams;
  const filters = {
    sourceId: first(params.sourceId),
    severity: toSeverityFilter(first(params.severity) ?? undefined),
  };
  const [result, sources] = await Promise.all([
    getSourceEvents(filters),
    getSendingSources(),
  ]);
  return (
    <ActivityScreen
      result={result}
      filters={filters}
      sources={
        sources.state === "ready"
          ? sources.sources.map((source) => ({
              value: source.id,
              label: source.name,
            }))
          : []
      }
    />
  );
}
