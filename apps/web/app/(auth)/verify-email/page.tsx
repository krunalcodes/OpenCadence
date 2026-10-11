import type { Metadata } from "next";
import { VerifyEmail } from "@/features/auth/components/verify-email";

export const metadata: Metadata = {
  title: "Verify your email · OpenCadence",
  referrer: "no-referrer",
};

type VerifyEmailPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const { token } = await searchParams;

  return (
    <VerifyEmail
      token={typeof token === "string" && token !== "" ? token : null}
    />
  );
}
