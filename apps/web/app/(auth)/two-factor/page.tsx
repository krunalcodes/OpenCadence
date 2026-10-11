import type { Metadata } from "next";
import { TwoFactorForm } from "@/features/auth/components/two-factor-form";
import { safeRedirect } from "@/lib/redirect";
import { redirectIfSignedIn } from "@/lib/session";

export const metadata: Metadata = {
  title: "Two-factor authentication · OpenCadence",
};

type TwoFactorPageProps = {
  searchParams: Promise<{ redirect?: string | string[] }>;
};

export default async function TwoFactorPage({
  searchParams,
}: TwoFactorPageProps) {
  const redirect = safeRedirect((await searchParams).redirect);
  await redirectIfSignedIn(redirect);

  return <TwoFactorForm redirect={redirect} />;
}
