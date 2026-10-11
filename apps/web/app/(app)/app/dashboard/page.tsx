import type { Metadata } from "next";
import { cookies } from "next/headers";
import { OverviewScreen } from "@/features/overview/components/overview-screen";
import { TimezoneSetup } from "@/features/overview/components/timezone-setup";
import {
  fallbackTimezone,
  timezoneCookie,
  toOverviewRange,
  toTimezone,
} from "@/features/overview/lib/overview";
import { getOverview } from "@/features/overview/queries/overview";
import { getActiveWorkspace, requireSession } from "@/lib/session";
import { getWarmupSummary } from "@/lib/warmup-summary";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return { title: workspace ? `Overview · ${workspace.name}` : "Overview" };
}

type OverviewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) || null;
}

export default async function OverviewPage({
  searchParams,
}: OverviewPageProps) {
  const [params, store, { user }] = await Promise.all([
    searchParams,
    cookies(),
    requireSession(),
  ]);
  const saved = store.get(timezoneCookie)?.value;
  if (saved === undefined) {
    return <TimezoneSetup />;
  }
  const range = toOverviewRange(first(params.range));
  const timezone = toTimezone(saved) ?? fallbackTimezone;
  const [result, warmup] = await Promise.all([
    getOverview(range, timezone),
    getWarmupSummary(),
  ]);
  const firstName = user.name.trim().split(/\s+/)[0] ?? "";

  return (
    <OverviewScreen
      firstName={firstName}
      range={range}
      timezone={timezone}
      result={result}
      warmup={warmup}
    />
  );
}
