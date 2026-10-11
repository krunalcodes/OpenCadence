import "server-only";

import { cache } from "react";
import {
  type EmailFilters,
  type EmailsResult,
  emailsQuery,
  type SourceOption,
  toEmailsPage,
  toSourceOptions,
} from "@/features/transactional/lib/emails";
import { apiRequest } from "@/lib/api-server";

export async function getEmails(filters: EmailFilters): Promise<EmailsResult> {
  const { status, data } = await apiRequest(`/emails?${emailsQuery(filters)}`);
  const page = status === 200 ? toEmailsPage(data) : null;
  return page ? { state: "ready", ...page } : { state: "failed" };
}

export const getEmailSources = cache(async (): Promise<SourceOption[]> => {
  const { status, data } = await apiRequest("/sending-sources");
  return status === 200 ? toSourceOptions(data) : [];
});

export function getApiDocsUrl() {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    return null;
  }
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}/docs`;
  } catch {
    return null;
  }
}
