import "server-only";

import {
  type DomainResult,
  type DomainsResult,
  toDomain,
  toDomains,
  toSuggestions,
} from "@/features/domains/lib/domains";
import { apiRequest } from "@/lib/api-server";

export async function getDomains(): Promise<DomainsResult> {
  const [list, suggested] = await Promise.all([
    apiRequest("/domains"),
    apiRequest("/domains/suggestions"),
  ]);
  const domains = list.status === 200 ? toDomains(list.data) : null;
  return domains
    ? {
        state: "ready",
        domains,
        suggestions:
          suggested.status === 200 ? toSuggestions(suggested.data) : [],
      }
    : { state: "failed" };
}

export async function getDomain(id: string): Promise<DomainResult> {
  const { status, data } = await apiRequest(
    `/domains/${encodeURIComponent(id)}`,
  );
  if (status === 404) {
    return { state: "missing" };
  }
  const domain = status === 200 ? toDomain(data) : null;
  return domain ? { state: "ready", domain } : { state: "failed" };
}
