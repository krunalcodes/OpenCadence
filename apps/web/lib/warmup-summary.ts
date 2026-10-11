import "server-only";

import { cache } from "react";
import { apiRequest } from "@/lib/api-server";

export type WarmupSummary = {
  active: number;
  warming: number;
  todaySent: number;
  todayTarget: number;
};

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export const getWarmupSummary = cache(
  async (): Promise<WarmupSummary | null> => {
    const { status, data } = await apiRequest("/warmup");
    const mailboxes =
      status === 200 && typeof data === "object" && data !== null
        ? (data as { mailboxes?: unknown }).mailboxes
        : null;
    if (!Array.isArray(mailboxes)) {
      return null;
    }
    const summary: WarmupSummary = {
      active: 0,
      warming: 0,
      todaySent: 0,
      todayTarget: 0,
    };
    for (const item of mailboxes) {
      const mailbox = item as Record<string, unknown>;
      if (mailbox.status !== "warming" && mailbox.status !== "ready") {
        continue;
      }
      summary.active += 1;
      summary.warming += mailbox.status === "warming" ? 1 : 0;
      summary.todaySent += count(mailbox.todaySent);
      summary.todayTarget += count(mailbox.todayTarget);
    }
    return summary;
  },
);
