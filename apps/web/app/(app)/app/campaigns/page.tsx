import type { Metadata } from "next";
import { CampaignsScreen } from "@/features/campaigns/components/campaigns-screen";
import {
  toCampaignStatus,
  toSearchFilter,
} from "@/features/campaigns/lib/campaigns";
import { getCampaigns } from "@/features/campaigns/queries/campaigns";
import { loadBrand } from "@/lib/brand-server";
import { getActiveWorkspace } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Campaigns · ${workspace.name}` : "Campaigns",
  };
}

type CampaignsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) || null;
}

export default async function CampaignsPage({
  searchParams,
}: CampaignsPageProps) {
  const params = await searchParams;
  const filters = {
    status: toCampaignStatus(first(params.status)),
    search: toSearchFilter(first(params.search)),
  };
  const [result, brand, workspace] = await Promise.all([
    getCampaigns(filters),
    loadBrand(),
    getActiveWorkspace(),
  ]);
  return (
    <CampaignsScreen
      result={result}
      filters={filters}
      brandName={brand?.brandName || workspace?.name || ""}
    />
  );
}
