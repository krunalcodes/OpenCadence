import type { Metadata } from "next";
import { OverviewScreen } from "@/features/overview/components/overview-screen";
import { getActiveWorkspace, requireSession } from "@/lib/session";
import { getWarmupSummary } from "@/lib/warmup-summary";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return { title: workspace ? `Overview · ${workspace.name}` : "Overview" };
}

export default async function OverviewPage() {
  const [{ user }, warmup] = await Promise.all([
    requireSession(),
    getWarmupSummary(),
  ]);
  const firstName = user.name.trim().split(/\s+/)[0] || user.email;

  return <OverviewScreen firstName={firstName} warmup={warmup} />;
}
