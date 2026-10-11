import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { redirectIfSignedIn } from "@/lib/session";

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
  await redirectIfSignedIn();
  const { token, error } = await searchParams;

  return (
    <ResetPasswordForm
      token={typeof token === "string" && token !== "" ? token : null}
      linkInvalid={Boolean(error)}
    />
  );
}
