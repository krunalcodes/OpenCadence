import "server-only";

import { cache } from "react";
import {
  type EventFilters,
  type EventsResult,
  eventsQuery,
  type SourcesResult,
  toEventsPage,
  toSourcesList,
} from "@/features/integrations/lib/sources";
import { apiRequest } from "@/lib/api-server";

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
