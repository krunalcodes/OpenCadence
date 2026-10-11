import type { Metadata } from "next";
import { WarmupScreen } from "@/features/warmup/components/warmup-screen";
import { getWarmup } from "@/features/warmup/queries/warmup";
import { getActiveWorkspace } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Warm-up · ${workspace.name}` : "Warm-up",
  };
}

export default async function WarmupPage() {
  const result = await getWarmup();
  return <WarmupScreen result={result} />;
}
