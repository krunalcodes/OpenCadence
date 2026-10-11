import type { Metadata } from "next";
import {
  type UnsubscribeOutcome,
  UnsubscribeView,
} from "@/features/unsubscribe/components/unsubscribe-view";
import { copy } from "@/features/unsubscribe/lib/copy";
import {
  readDetails,
  type UnsubscribeFailure,
} from "@/features/unsubscribe/lib/unsubscribe-api";

export const metadata: Metadata = {
  title: copy.metaTitle,
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

type UnsubscribePageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const outcomes: UnsubscribeOutcome[] = ["list", "all", "again"];
const failures: UnsubscribeFailure[] = ["invalid", "busy", "offline"];

function one<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly (T | null)[],
) {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : null;
}

export default async function UnsubscribePage({
  params,
  searchParams,
}: UnsubscribePageProps) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const result = await readDetails(token);
  return (
    <UnsubscribeView
      token={token}
      result={result}
      outcome={one<NonNullable<UnsubscribeOutcome>>(query.done, outcomes)}
      failed={one<UnsubscribeFailure>(query.failed, failures)}
    />
  );
}
