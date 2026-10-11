import type { Metadata } from "next";
import { SignUpForm } from "@/features/auth/components/sign-up-form";

export const metadata: Metadata = {
  title: "Create your account · OpenCadence",
};

export default function SignUpPage() {
  return (
    <>
      <h1 className="font-semibold text-2xl text-foreground leading-[1.2] tracking-[-0.025em]">
        Create your account
      </h1>
      <p className="mt-2 mb-7 text-[13px] text-muted-foreground leading-normal">
        Add your details and name your first workspace.
      </p>
      <SignUpForm />
    </>
  );
}
