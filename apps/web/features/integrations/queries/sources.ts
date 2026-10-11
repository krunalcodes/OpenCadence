import "server-only";

import { headers } from "next/headers";
import { cache } from "react";
import {
  type EventFilters,
  type EventsResult,
  eventsQuery,
  type SourcesResult,
  toEventsPage,
  toSourcesList,
} from "@/features/integrations/lib/sources";

const apiUrl = (process.env.API_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  "",
);

type ApiResponse = { status: number; data: unknown };

async function apiRequest(path: string): Promise<ApiResponse> {
  const cookie = (await headers()).get("cookie");
  if (!cookie) {
    return { status: 401, data: null };
  }
  try {
    const response = await fetch(`${apiUrl}/v1${path}`, {
      headers: { cookie },
      cache: "no-store",
    });
    const data: unknown = await response.json().catch(() => null);
    return { status: response.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

export const getSendingSources = cache(async (): Promise<SourcesResult> => {
  const { status, data } = await apiRequest("/sending-sources");
  const list = status === 200 ? toSourcesList(data) : null;
  return list ? { state: "ready", ...list } : { state: "failed" };
});

export async function getSourceEvents(
  filters: EventFilters,
): Promise<EventsResult> {
  const { status, data } = await apiRequest(
    `/sending-sources/events?${eventsQuery(filters)}`,
  );
  const page = status === 200 ? toEventsPage(data) : null;
  return page ? { state: "ready", ...page } : { state: "failed" };
}
