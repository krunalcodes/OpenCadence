import type { Metadata } from "next";
import { SignInForm } from "@/features/auth/components/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in · OpenCadence",
};

export default function SignInPage() {
  return (
    <>
      <h1 className="font-semibold text-2xl text-foreground leading-[1.2] tracking-[-0.025em]">
        Sign in
      </h1>
      <p className="mt-2 mb-7 text-[13px] text-muted-foreground leading-normal">
        Use the email address for your OpenCadence account.
      </p>
      <SignInForm />
    </>
  );
}
