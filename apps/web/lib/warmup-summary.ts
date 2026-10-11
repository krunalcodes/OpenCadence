import "server-only";

import { cache } from "react";
import { apiRequest } from "@/lib/api-server";

export type WarmupSummary = {
  active: number;
  warming: number;
  todaySent: number;
  todayTarget: number;
  earliestDay: number | null;
  readyAfterDays: number;
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
      earliestDay: null,
      readyAfterDays: 14,
    };
    for (const item of mailboxes) {
      const mailbox = item as Record<string, unknown>;
      if (mailbox.status !== "warming" && mailbox.status !== "ready") {
        continue;
      }
      summary.active += 1;
      if (mailbox.status === "warming") {
        summary.warming += 1;
        const day = count(mailbox.day);
        if (day > 0) {
          summary.earliestDay =
            summary.earliestDay === null
              ? day
              : Math.min(summary.earliestDay, day);
        }
        summary.readyAfterDays =
          count(mailbox.readyAfterDays) || summary.readyAfterDays;
      }
      summary.todaySent += count(mailbox.todaySent);
      summary.todayTarget += count(mailbox.todayTarget);
    }
    return summary;
  },
);
