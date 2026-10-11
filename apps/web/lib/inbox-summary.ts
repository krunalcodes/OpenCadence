import "server-only";

import { cache } from "react";
import { apiRequest } from "@/lib/api-server";

export type InboxSummary = { unreadCount: number };

export const getInboxSummary = cache(async (): Promise<InboxSummary | null> => {
  const { status, data } = await apiRequest("/inbox/summary");
  const unreadCount =
    status === 200 && typeof data === "object" && data !== null
      ? (data as { unreadCount?: unknown }).unreadCount
      : null;
  return typeof unreadCount === "number" && Number.isFinite(unreadCount)
    ? { unreadCount }
    : null;
});
