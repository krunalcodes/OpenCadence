import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Set a new password · OpenCadence",
  referrer: "no-referrer",
};

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string | string[];
    error?: string | string[];
  }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const { token, error } = await searchParams;
  const resetToken = typeof token === "string" && token !== "" ? token : null;
  const signedIn = (await getSession()) !== null;
  if (signedIn && !resetToken) {
    redirect("/app");
  }

  return (
    <ResetPasswordForm
      token={resetToken}
      linkInvalid={Boolean(error)}
      signedIn={signedIn}
    />
  );
}
