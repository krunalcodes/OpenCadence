import { useCallback, useRef, useState } from "react";
import {
  maxCountRequests,
  type SegmentCount,
} from "@/features/segments/lib/segments";
import { fetchSegmentCount } from "@/features/segments/queries/client";

type Job = { key: string; id: string };

export function useSegmentCounts() {
  const [counts, setCounts] = useState<Record<string, SegmentCount>>({});
  const queue = useRef<Job[]>([]);
  const known = useRef(new Set<string>());
  const active = useRef(0);

  const pump = useCallback(() => {
    while (active.current < maxCountRequests) {
      const job = queue.current.shift();
      if (!job) {
        return;
      }
      active.current += 1;
      void fetchSegmentCount(job.id).then((result) => {
        active.current -= 1;
        const next: SegmentCount = result.ok
          ? { state: "ready", count: result.data }
          : result.error.code === "segment_invalid"
            ? { state: "invalid", message: result.error.message }
            : { state: "failed" };
        setCounts((current) => ({ ...current, [job.key]: next }));
        pump();
      });
    }
  }, []);

  const request = useCallback(
    (key: string, id: string) => {
      if (known.current.has(key)) {
        return;
      }
      known.current.add(key);
      queue.current.push({ key, id });
      pump();
    },
    [pump],
  );

  return { counts, request };
}
