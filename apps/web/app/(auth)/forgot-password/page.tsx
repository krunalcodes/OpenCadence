import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { redirectIfSignedIn } from "@/lib/session";

export const metadata: Metadata = {
  title: "Reset your password · OpenCadence",
};

export default async function ForgotPasswordPage() {
  await redirectIfSignedIn();

  return <ForgotPasswordForm />;
}
