import type { Metadata } from "next";
import { FormsScreen } from "@/features/forms/components/forms-screen";
import { getForms } from "@/features/forms/queries/forms";
import { getActiveWorkspace } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Forms · ${workspace.name}` : "Forms",
  };
}

export default async function FormsPage() {
  const result = await getForms();
  return <FormsScreen result={result} />;
}
