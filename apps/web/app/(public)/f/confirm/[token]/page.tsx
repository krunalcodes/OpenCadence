import type { Metadata } from "next";
import { ConfirmView } from "@/features/forms/components/confirm-view";
import { copy } from "@/features/forms/lib/copy";
import {
  type ConfirmFailure,
  readConfirmation,
} from "@/features/forms/lib/public-api";

export const metadata: Metadata = {
  title: copy.confirm.metaTitle,
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

type ConfirmPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const failures: ConfirmFailure[] = ["busy", "offline"];

export default async function ConfirmPage({
  params,
  searchParams,
}: ConfirmPageProps) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const result = await readConfirmation(token);
  return (
    <ConfirmView
      token={token}
      result={result}
      justConfirmed={query.done === "confirmed"}
      failed={failures.find((reason) => reason === query.failed) ?? null}
    />
  );
}
