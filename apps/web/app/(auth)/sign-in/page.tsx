import type { Metadata } from "next";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { redirectIfSignedIn } from "@/lib/session";

export const metadata: Metadata = {
  title: "Sign in · OpenCadence",
};

export default async function SignInPage() {
  await redirectIfSignedIn();

  return <SignInForm />;
}
