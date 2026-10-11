import type { Metadata } from "next";
import { ImportsScreen } from "@/features/imports/components/imports-screen";
import { copy } from "@/features/imports/lib/copy";
import {
  getImportCatalog,
  getImports,
} from "@/features/imports/queries/imports";
import { getActiveWorkspace } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `${copy.metaTitle} · ${workspace.name}` : copy.metaTitle,
  };
}

export default async function ImportContactsPage() {
  const [imports, catalog] = await Promise.all([
    getImports(),
    getImportCatalog(),
  ]);
  return <ImportsScreen imports={imports} catalog={catalog} />;
}
