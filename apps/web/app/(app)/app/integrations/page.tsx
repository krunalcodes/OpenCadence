import type { Metadata } from "next";
import { IntegrationsScreen } from "@/features/integrations/components/integrations-screen";
import { getSendingSources } from "@/features/integrations/queries/sources";
import { getActiveWorkspace } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Sources · ${workspace.name}` : "Sources",
  };
}

type IntegrationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) || null;
}

export default async function IntegrationsPage({
  searchParams,
}: IntegrationsPageProps) {
  const [params, result] = await Promise.all([
    searchParams,
    getSendingSources(),
  ]);
  return (
    <IntegrationsScreen
      result={result}
      notice={{
        connected: first(params.connected),
        connectError: first(params.connect_error),
      }}
    />
  );
}
