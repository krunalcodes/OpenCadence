import type { Metadata } from "next";
import { VerifyEmail } from "@/features/auth/components/verify-email";
import { safeRedirect } from "@/lib/redirect";

export const metadata: Metadata = {
  title: "Verify your email · OpenCadence",
  referrer: "no-referrer",
};

type VerifyEmailPageProps = {
  searchParams: Promise<{
    token?: string | string[];
    redirect?: string | string[];
  }>;
};

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const { token, redirect } = await searchParams;

  return (
    <VerifyEmail
      token={typeof token === "string" && token !== "" ? token : null}
      redirect={safeRedirect(redirect)}
    />
  );
}
