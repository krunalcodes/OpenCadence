import type { Metadata } from "next";
import { ListsScreen } from "@/features/lists/components/lists-screen";
import { getLists } from "@/features/lists/queries/lists";
import { getActiveWorkspace } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Lists · ${workspace.name}` : "Lists",
  };
}

export default async function ListsPage() {
  const result = await getLists();
  return <ListsScreen result={result} />;
}
