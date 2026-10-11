import { useCallback, useEffect, useRef, useState } from "react";
import type { Campaign } from "@/features/campaigns/lib/campaigns";
import { fetchCampaign } from "@/features/campaigns/queries/client";
import type { ApiResult } from "@/lib/api";

export function useCampaignRefresh(
  id: string,
  interval: number | null,
  onResult: (result: ApiResult<Campaign>) => void,
) {
  const [refreshing, setRefreshing] = useState(false);
  const loading = useRef(false);
  const mounted = useRef(true);
  const handler = useRef(onResult);

  useEffect(() => {
    handler.current = onResult;
  }, [onResult]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (manual: boolean) => {
      if (loading.current) {
        return;
      }
      loading.current = true;
      if (manual) {
        setRefreshing(true);
      }
      const result = await fetchCampaign(id);
      loading.current = false;
      if (!mounted.current) {
        return;
      }
      if (manual) {
        setRefreshing(false);
      }
      handler.current(result);
    },
    [id],
  );

  useEffect(() => {
    if (interval === null) {
      return;
    }
    const delay = interval;
    let timer: number | undefined;
    let stopped = false;

    function schedule() {
      window.clearTimeout(timer);
      if (!stopped && !document.hidden) {
        timer = window.setTimeout(tick, delay);
      }
    }

    async function tick() {
      await run(false);
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
  }, [interval, run]);

  return { refreshing, refresh: () => void run(true) };
}
