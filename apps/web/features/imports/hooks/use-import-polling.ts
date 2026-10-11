import { useEffect, useEffectEvent, useState } from "react";
import { type Import, pollInterval } from "@/features/imports/lib/imports";
import { fetchImport } from "@/features/imports/queries/client";

export function useImportPolling(
  ids: string[],
  onUpdate: (item: Import) => void,
) {
  const key = ids.join(",");
  const [failing, setFailing] = useState(false);
  const report = useEffectEvent(onUpdate);

  useEffect(() => {
    if (key === "") {
      return;
    }
    const watched = key.split(",");
    let timer: number | undefined;
    let stopped = false;
    let loading = false;

    function schedule() {
      window.clearTimeout(timer);
      if (!stopped && !document.hidden) {
        timer = window.setTimeout(poll, pollInterval);
      }
    }

    async function poll() {
      if (loading || stopped) {
        return;
      }
      loading = true;
      const results = await Promise.all(watched.map(fetchImport));
      loading = false;
      if (stopped) {
        return;
      }
      setFailing(results.some((result) => !result.ok));
      for (const result of results) {
        if (result.ok) {
          report(result.data);
        }
      }
      schedule();
    }

    function handleVisibility() {
      window.clearTimeout(timer);
      if (!document.hidden) {
        void poll();
      }
    }

    schedule();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [key]);

  return key !== "" && failing;
}
