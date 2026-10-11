import type { Metadata } from "next";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { safeRedirect } from "@/lib/redirect";
import { redirectIfSignedIn } from "@/lib/session";

export const metadata: Metadata = {
  title: "Sign in · OpenCadence",
};

type SignInPageProps = {
  searchParams: Promise<{ redirect?: string | string[] }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const redirect = safeRedirect((await searchParams).redirect);
  await redirectIfSignedIn(redirect);

  return <SignInForm redirect={redirect} />;
}
