import {
  type Campaign,
  type CampaignCheck,
  type CampaignFilters,
  type CampaignsPage,
  campaignPath,
  campaignsQuery,
  type RecipientStatus,
  type RecipientsPage,
  recipientsQuery,
  toCampaign,
  toCampaignCheck,
  toCampaignsPage,
  toRecipientsPage,
} from "@/features/campaigns/lib/campaigns";
import { type ApiResult, isRow, malformed, type Row, request } from "@/lib/api";

export type CampaignAction = "pause" | "resume" | "cancel" | "unschedule";

function toCampaignResult(result: ApiResult<unknown>): ApiResult<Campaign> {
  if (!result.ok) {
    return result;
  }
  const campaign = toCampaign(result.data);
  return campaign
    ? { ok: true, data: campaign }
    : { ok: false, error: malformed };
}

export async function fetchCampaigns(
  filters: CampaignFilters,
  cursor: string,
): Promise<ApiResult<CampaignsPage>> {
  const result = await request(
    "GET",
    `/campaigns?${campaignsQuery(filters, cursor)}`,
  );
  if (!result.ok) {
    return result;
  }
  const page = toCampaignsPage(result.data);
  return page ? { ok: true, data: page } : { ok: false, error: malformed };
}

export async function fetchCampaign(id: string) {
  return toCampaignResult(await request("GET", `/${campaignPath(id)}`));
}

export async function createCampaign(name: string, fromName: string) {
  return toCampaignResult(
    await request("POST", "/campaigns", {
      name,
      ...(fromName ? { fromName } : {}),
    }),
  );
}

export async function updateCampaign(id: string, changes: Row) {
  return toCampaignResult(
    await request("PATCH", `/${campaignPath(id)}`, changes),
  );
}

export async function duplicateCampaign(id: string) {
  return toCampaignResult(
    await request("POST", `/${campaignPath(id)}/duplicate`),
  );
}

export async function deleteCampaign(id: string) {
  return request("DELETE", `/${campaignPath(id)}`);
}

export async function fetchCheck(
  id: string,
): Promise<ApiResult<CampaignCheck>> {
  const result = await request("GET", `/${campaignPath(id)}/check`);
  if (!result.ok) {
    return result;
  }
  const check = toCampaignCheck(result.data);
  return check ? { ok: true, data: check } : { ok: false, error: malformed };
}

export async function sendCampaign(id: string, scheduledAt: string | null) {
  return toCampaignResult(
    await request(
      "POST",
      `/${campaignPath(id)}/send`,
      scheduledAt ? { scheduledAt } : {},
    ),
  );
}

export async function runCampaignAction(id: string, action: CampaignAction) {
  return toCampaignResult(
    await request("POST", `/${campaignPath(id)}/${action}`),
  );
}

export async function fetchRecipients(
  id: string,
  status: RecipientStatus | null,
  cursor: string | null,
): Promise<ApiResult<RecipientsPage>> {
  const result = await request(
    "GET",
    `/${campaignPath(id)}/recipients?${recipientsQuery(status, cursor)}`,
  );
  if (!result.ok) {
    return result;
  }
  const page = toRecipientsPage(result.data);
  return page ? { ok: true, data: page } : { ok: false, error: malformed };
}

export async function sendCampaignTest(
  id: string,
  to: string,
): Promise<ApiResult<{ suppressed: boolean }>> {
  const result = await request("POST", `/${campaignPath(id)}/test`, { to });
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    data: {
      suppressed:
        isRow(result.data) &&
        (result.data.suppressed === true ||
          (Array.isArray(result.data.suppressed) &&
            result.data.suppressed.length > 0) ||
          result.data.status === "skipped"),
    },
  };
}

export type TemplateContent = { id: string; name: string; html: string };

export async function fetchTemplateContent(
  id: string,
): Promise<ApiResult<TemplateContent>> {
  const result = await request("GET", `/templates/${encodeURIComponent(id)}`);
  if (!result.ok) {
    return result;
  }
  if (!isRow(result.data) || typeof result.data.html !== "string") {
    return { ok: false, error: malformed };
  }
  return {
    ok: true,
    data: {
      id,
      name: typeof result.data.name === "string" ? result.data.name : "",
      html: result.data.html,
    },
  };
}
