import type { Metadata } from "next";
import { SegmentsScreen } from "@/features/segments/components/segments-screen";
import { getSegmentsPage } from "@/features/segments/queries/segments";
import { getActiveWorkspace } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Segments · ${workspace.name}` : "Segments",
  };
}

export default async function SegmentsPage() {
  const result = await getSegmentsPage();
  return <SegmentsScreen result={result} />;
}
