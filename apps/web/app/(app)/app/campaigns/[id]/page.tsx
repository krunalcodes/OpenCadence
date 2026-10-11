import type { Metadata } from "next";
import { CampaignComposer } from "@/features/campaigns/components/campaign-composer";
import { CampaignResults } from "@/features/campaigns/components/campaign-results";
import { CampaignUnavailable } from "@/features/campaigns/components/campaign-unavailable";
import {
  getAudienceLists,
  getAudienceSegments,
  getCampaign,
  getRecipients,
  getSources,
} from "@/features/campaigns/queries/campaigns";
import { loadBrand } from "@/lib/brand-server";
import { getActiveWorkspace, getSession } from "@/lib/session";

type CampaignPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Campaigns · ${workspace.name}` : "Campaigns",
  };
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { id } = await params;
  const result = await getCampaign(id);

  if (result.state !== "ready") {
    return <CampaignUnavailable />;
  }

  const { campaign } = result;

  if (campaign.status !== "draft") {
    const recipients = await getRecipients(campaign.id);
    return (
      <CampaignResults
        key={`results:${campaign.id}`}
        campaign={campaign}
        recipients={recipients}
      />
    );
  }

  const [brand, sources, lists, segments, workspace, session] =
    await Promise.all([
      loadBrand(),
      getSources(),
      getAudienceLists(),
      getAudienceSegments(),
      getActiveWorkspace(),
      getSession(),
    ]);

  return (
    <CampaignComposer
      key={`composer:${campaign.id}`}
      campaign={campaign}
      brandName={brand?.brandName || workspace?.name || ""}
      userEmail={session?.user.email ?? ""}
      sources={sources}
      lists={lists}
      segments={segments}
    />
  );
}
