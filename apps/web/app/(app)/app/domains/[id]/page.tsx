import type { Metadata } from "next";
import { DomainScreen } from "@/features/domains/components/domain-screen";
import { DomainUnavailable } from "@/features/domains/components/domain-unavailable";
import { getDomain } from "@/features/domains/queries/domains";
import { getActiveWorkspace } from "@/lib/session";

type DomainPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Domains · ${workspace.name}` : "Domains",
  };
}

export default async function DomainPage({ params }: DomainPageProps) {
  const { id } = await params;
  const result = await getDomain(id);

  if (result.state !== "ready") {
    return <DomainUnavailable missing={result.state === "missing"} />;
  }

  return <DomainScreen key={result.domain.id} initial={result.domain} />;
}
