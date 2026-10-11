import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { BrandSettings } from "@/features/settings/components/brand/brand-settings";
import { WorkspaceUnavailable } from "@/features/settings/components/workspace-unavailable";
import { brandCopy } from "@/features/settings/lib/brand-copy";
import { loadBrand } from "@/lib/brand-server";
import { getActiveWorkspace, requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: brandCopy.metaTitle,
};

export default async function BrandSettingsPage() {
  await requireSession();
  const [workspace, brand] = await Promise.all([
    getActiveWorkspace(),
    loadBrand(),
  ]);

  return (
    <>
      <PageHeader title={brandCopy.title} description={brandCopy.description} />
      {workspace ? (
        <BrandSettings
          key={workspace.id}
          brand={brand}
          workspaceName={workspace.name}
        />
      ) : (
        <WorkspaceUnavailable />
      )}
    </>
  );
}
