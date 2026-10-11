"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { OverviewSkeleton } from "@/features/overview/components/overview-skeleton";
import { saveTimezone } from "@/features/overview/lib/actions";
import { fallbackTimezone, toTimezone } from "@/features/overview/lib/overview";

function browserTimezone() {
  try {
    return (
      toTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone) ??
      fallbackTimezone
    );
  } catch {
    return fallbackTimezone;
  }
}

export function useTimezoneSync(saved: string | null) {
  const router = useRouter();

  useEffect(() => {
    const current = browserTimezone();
    if (current === saved) {
      return;
    }
    let cancelled = false;
    void saveTimezone(current).then(() => {
      if (!cancelled) {
        router.refresh();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [saved, router]);
}

export function TimezoneSetup() {
  useTimezoneSync(null);
  return <OverviewSkeleton />;
}
