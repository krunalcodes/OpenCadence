import type { Metadata } from "next";
import {
  type PreferencesOutcome,
  PreferencesView,
} from "@/features/preferences/components/preferences-view";
import { copy } from "@/features/preferences/lib/copy";
import {
  type PreferencesFailure,
  readPreferences,
} from "@/features/preferences/lib/preferences-api";

export const metadata: Metadata = {
  title: copy.metaTitle,
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

type PreferencesPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const outcomes: NonNullable<PreferencesOutcome>[] = ["saved", "all"];
const failures: PreferencesFailure[] = ["busy", "offline"];

export default async function PreferencesPage({
  params,
  searchParams,
}: PreferencesPageProps) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const result = await readPreferences(token);
  return (
    <PreferencesView
      token={token}
      result={result}
      outcome={outcomes.find((item) => item === query.done) ?? null}
      failed={failures.find((item) => item === query.failed) ?? null}
    />
  );
}
