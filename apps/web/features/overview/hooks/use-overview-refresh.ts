import { useEffect, useRef } from "react";
import {
  type Overview,
  type OverviewRangeId,
  refreshIntervalMs,
} from "@/features/overview/lib/overview";
import { fetchOverview } from "@/features/overview/queries/client";

export function useOverviewRefresh(
  range: OverviewRangeId,
  timezone: string,
  onFresh: (overview: Overview) => void,
) {
  const handler = useRef(onFresh);

  useEffect(() => {
    handler.current = onFresh;
  }, [onFresh]);

  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    let loading = false;

    function schedule() {
      window.clearTimeout(timer);
      if (!stopped && !document.hidden) {
        timer = window.setTimeout(tick, refreshIntervalMs);
      }
    }

    async function tick() {
      if (loading) {
        return;
      }
      loading = true;
      const result = await fetchOverview(range, timezone);
      loading = false;
      if (stopped) {
        return;
      }
      if (result.ok) {
        handler.current(result.data);
      }
      schedule();
    }

    function handleVisibility() {
      window.clearTimeout(timer);
      if (!document.hidden) {
        void tick();
      }
    }

    schedule();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [range, timezone]);
}
