import type { Metadata } from "next";
import { OverviewScreen } from "@/features/overview/components/overview-screen";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { sampleUser } from "@/lib/sample-data";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return { title: `Overview · ${workspace.name}` };
}

export default function OverviewPage() {
  const firstName = sampleUser.name.split(" ")[0] ?? sampleUser.name;

  return <OverviewScreen firstName={firstName} />;
}
