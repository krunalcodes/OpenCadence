import type { Metadata } from "next";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { safeRedirect } from "@/lib/redirect";
import { redirectIfSignedIn } from "@/lib/session";

export const metadata: Metadata = {
  title: "Create your account · OpenCadence",
};

type SignUpPageProps = {
  searchParams: Promise<{ redirect?: string | string[] }>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const redirect = safeRedirect((await searchParams).redirect);
  await redirectIfSignedIn(redirect);

  return <SignUpForm redirect={redirect} />;
}
