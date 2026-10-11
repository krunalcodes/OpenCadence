import type { Metadata } from "next";
import { DomainsScreen } from "@/features/domains/components/domains-screen";
import { getDomains } from "@/features/domains/queries/domains";
import { getActiveWorkspace } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Domains · ${workspace.name}` : "Domains",
  };
}

export default async function DomainsPage() {
  const result = await getDomains();
  return <DomainsScreen result={result} />;
}
