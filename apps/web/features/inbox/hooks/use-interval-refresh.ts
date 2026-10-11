import { useEffect, useRef } from "react";

export function useIntervalRefresh(delay: number, task: () => Promise<void>) {
  const handler = useRef(task);
  const running = useRef(false);

  useEffect(() => {
    handler.current = task;
  }, [task]);

  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;

    function schedule() {
      window.clearTimeout(timer);
      if (!stopped && !document.hidden) {
        timer = window.setTimeout(tick, delay);
      }
    }

    async function tick() {
      if (!running.current) {
        running.current = true;
        try {
          await handler.current();
        } finally {
          running.current = false;
        }
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
  }, [delay]);
}
