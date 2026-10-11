import "server-only";

import {
  type CampaignFilters,
  type CampaignResult,
  type CampaignsResult,
  campaignPath,
  campaignsQuery,
  type RecipientsPage,
  recipientsQuery,
  toCampaign,
  toCampaignsPage,
  toRecipientsPage,
} from "@/features/campaigns/lib/campaigns";
import { apiRequest } from "@/lib/api-server";
import {
  type AudienceList,
  type AudienceSegment,
  toAudienceLists,
  toAudienceSegments,
} from "@/lib/audience";
import { type SourceChoice, toSourceChoices } from "@/lib/sources";

export async function getCampaigns(
  filters: CampaignFilters,
): Promise<CampaignsResult> {
  const { status, data } = await apiRequest(
    `/campaigns?${campaignsQuery(filters)}`,
  );
  const page = status === 200 ? toCampaignsPage(data) : null;
  return page ? { state: "ready", ...page } : { state: "failed" };
}

export async function getCampaign(id: string): Promise<CampaignResult> {
  const { status, data } = await apiRequest(`/${campaignPath(id)}`);
  if (status === 404 || status === 400) {
    return { state: "missing" };
  }
  const campaign = status === 200 ? toCampaign(data) : null;
  return campaign ? { state: "ready", campaign } : { state: "failed" };
}

export async function getRecipients(
  id: string,
): Promise<RecipientsPage | null> {
  const { status, data } = await apiRequest(
    `/${campaignPath(id)}/recipients?${recipientsQuery(null)}`,
  );
  return status === 200 ? toRecipientsPage(data) : null;
}

export async function getSources(): Promise<SourceChoice[]> {
  const { status, data } = await apiRequest("/sending-sources");
  return status === 200 ? toSourceChoices(data) : [];
}

export async function getAudienceLists(): Promise<AudienceList[]> {
  const { status, data } = await apiRequest("/lists");
  return status === 200 ? toAudienceLists(data) : [];
}

export async function getAudienceSegments(): Promise<AudienceSegment[]> {
  const { status, data } = await apiRequest("/segments");
  return status === 200 ? toAudienceSegments(data) : [];
}
