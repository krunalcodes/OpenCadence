import type { Metadata } from "next";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { redirectIfSignedIn } from "@/lib/session";

export const metadata: Metadata = {
  title: "Create your account · OpenCadence",
};

export default async function SignUpPage() {
  await redirectIfSignedIn();

  return <SignUpForm />;
}
